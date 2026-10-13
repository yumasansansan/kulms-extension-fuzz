// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The places the extension's code runs: its background (a vm context, as its
// service worker has no DOM), a tab of the LMS or of the university's login
// pages (a jsdom window, running the content scripts manifest.json gives that
// URL), and its popup (a jsdom window of popup.html).
//
// A context's IIFEs hand their internals to context.internals[file]
// (source.mjs). The scripts run with Fuzzer, Jazzer.js's global, when it is
// there, which the instrumented code reports its coverage to.
//
// A context fetches the extension's own files (chrome-extension://<id>/...)
// from the checkout, as Chrome serves them: a tab only those that
// web_accessible_resources opens to its page, the background and the popup
// any of them. Everything else goes to its Net.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
const JSDOMParser = new JSDOM("").window.DOMParser;
import { IDBDatabase, IDBFactory } from "fake-indexeddb";
import { loadedSource } from "./source.mjs";
import { EXT, manifest, read } from "./paths.mjs";
import { globToRegExp, matchesPattern } from "./chrome.mjs";
import { record } from "./log.mjs";
import { install as installClock } from "./clock.mjs";
import { Net, response } from "./net.mjs";
import { backtrackingRegExp, costedClass, costedFunction, installCosts } from "./install.mjs";
import { compare, finished, forIn, has, instanceOf, isPaused, key, random, spread, started, step, tracked, trackedCrypto, uncounted } from "./work.mjs";

// jsdom parses a link's URL anew each time its href, host and the like are
// read, as the standard's "reinitialize url" says, and its selector engine
// reads host of each element it climbs from. Its parser, whatwg-url, is
// JavaScript and takes a microsecond or two a character, where Chrome's takes
// nanoseconds: a sidebar link of millions of characters, as the top rung of an
// input makes, kept one input of assignments running for over half an hour,
// its counted work within what linear code does all along. The parse is a
// function of the string, the document's base URL and its encoding, so the
// last few are kept, and each caller gets a copy of the URL record, which a
// link's setters change in place. The work counted is the standard's either
// way (harness/web-costs.mjs).
// parse5, jsdom's HTML parser, joins a low surrogate with a low surrogate
// after it as if the first were a high one, into a code point past U+10FFFF,
// on which its tokenizer throws (String.fromCodePoint). The HTML Standard
// takes each lone surrogate of the input stream as a code point of its own, a
// parse error (surrogate-in-input-stream:
// https://html.spec.whatwg.org/multipage/parsing.html#preprocessing-the-input-stream):
// only a high surrogate is joined with the low one after it, which is what
// the parser here does too. A page, or markup the extension builds, whose
// strings hold lone surrogates then parses as in a browser.
{
  const jsdomRequire = createRequire(createRequire(import.meta.url).resolve("jsdom"));
  const dist = path.dirname(jsdomRequire.resolve("parse5"));
  const { Preprocessor } = await import(pathToFileURL(path.join(dist, "tokenizer", "preprocessor.js")).href);
  const { ERR } = await import(pathToFileURL(path.join(dist, "common", "error-codes.js")).href);
  const joinSurrogates = Preprocessor.prototype._processSurrogate;
  Preprocessor.prototype._processSurrogate = function (cp) {
    if (cp < 0xdc00) return joinSurrogates.call(this, cp);
    this._err(ERR.surrogateInInputStream);
    return cp;
  };
}

// What jsdom lacks of the platform that the HTML Standard defines for a user
// agent without CSS, which jsdom is: HTMLElement's innerText
// (https://html.spec.whatwg.org/multipage/dom.html#the-innertext-idl-attribute).
// Getting it is the element's descendant text content, as the standard has it
// "if the user agent is a non-CSS user agent"; setting it replaces the
// element's children with the rendered text fragment of the value (null as the
// empty string, [LegacyNullToEmptyString]): its runs of text as Text nodes, and
// each line break (CR LF, CR or LF) as a <br>. Chrome renders CSS, and leaves
// out text that is not being rendered; jsdom renders nothing.
export function completePlatform(w) {
  const proto = w.HTMLElement.prototype;
  if (Object.getOwnPropertyDescriptor(proto, "innerText")) return;
  const textContent = Object.getOwnPropertyDescriptor(w.Node.prototype, "textContent").get;
  Object.defineProperty(proto, "innerText", {
    get() {
      return textContent.call(this);
    },
    set(value) {
      const text = value === null ? "" : `${value}`;
      const document = this.ownerDocument;
      const fragment = document.createDocumentFragment();
      let i = 0;
      while (i < text.length) {
        let j = i;
        while (j < text.length && text[j] !== "\n" && text[j] !== "\r") j++;
        if (j > i) fragment.append(document.createTextNode(text.slice(i, j)));
        i = j;
        while (i < text.length && (text[i] === "\n" || text[i] === "\r")) {
          if (text[i] === "\r" && text[i + 1] === "\n") i++;
          i++;
          fragment.append(document.createElement("br"));
        }
      }
      this.replaceChildren(fragment);
    },
    enumerable: true,
    configurable: true,
  });
}

const DocumentImpl = createRequire(import.meta.url)("jsdom/lib/jsdom/living/nodes/Document-impl.js").implementation;
const idlUtils = createRequire(import.meta.url)("jsdom/lib/generated/idl/utils.js");
const FileListIDL = createRequire(import.meta.url)("jsdom/lib/generated/idl/FileList.js");
const encodingParseAURL = DocumentImpl.prototype.encodingParseAURL;
const KEPT_URLS = 8;
const keptURLs = new Map(); // the string parsed → { base, encoding, url }
const copyOfURL = (u) => u && { ...u, host: Array.isArray(u.host) ? [...u.host] : u.host, path: Array.isArray(u.path) ? [...u.path] : u.path };
DocumentImpl.prototype.encodingParseAURL = function (input) {
  const base = this.baseURLSerialized();
  const kept = keptURLs.get(input);
  keptURLs.delete(input);
  if (kept && kept.base === base && kept.encoding === this._encoding) {
    keptURLs.set(input, kept);
    return copyOfURL(kept.url);
  }
  const url = Reflect.apply(encodingParseAURL, this, [input]);
  keptURLs.set(input, { base, encoding: this._encoding, url });
  if (keptURLs.size > KEPT_URLS) keptURLs.delete(keptURLs.keys().next().value);
  return copyOfURL(url);
};

// What the extension's code calls to count its work (harness/work.mjs,
// harness/install.mjs), in each context.
const COUNTING = {
  __kulmsWork: step,
  __kulmsBacktracking: backtrackingRegExp,
  __kulmsCompare: compare,
  __kulmsKey: key,
  __kulmsSpread: spread,
  __kulmsInstanceOf: instanceOf,
  __kulmsIn: has,
  __kulmsForIn: forIn,
};

// The units of a value as IndexedDB keeps it, which its structured clone
// goes through: strings, elements, properties and bytes, at any depth.
function cloneUnits(root) {
  let n = 0;
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const v = stack.pop();
    n++;
    if (typeof v === "string") n += v.length;
    if (v === null || typeof v !== "object" || seen.has(v)) continue;
    seen.add(v);
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) {
      n += v.byteLength;
      continue;
    }
    for (const k of Reflect.ownKeys(v)) {
      n += typeof k === "string" ? k.length : 1;
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (d && "value" in d) stack.push(d.value);
    }
  }
  return n;
}

// What the extension catches and goes on from, in `context` (`target` its
// global object): its catch clauses and rejection handlers hand it on
// (harness/source.mjs), and the promise combinators of its realm hand on the
// rejections of the promises they are given, which all and race let go once
// they have settled, and allSettled and any give back as values. The
// detectors look at it (harness/detectors.mjs).
function watchCatching(context, realm, target) {
  const browser = context.browser;
  target.__kulmsCaught = (error, site) => browser.caughtBy(context, error, site);
  target.__kulmsRejected = (handler, site) => (typeof handler !== "function" ? handler : function (reason) {
    browser.caughtBy(context, reason, site);
    return Reflect.apply(handler, this, [reason]);
  });
  const P = realm.Promise;
  const then = P.prototype.then;
  for (const name of ["all", "allSettled", "any", "race"]) {
    const original = P[name];
    const observed = {
      [name](iterable) {
        if (iterable === null || iterable === undefined || typeof iterable[Symbol.iterator] !== "function") return Reflect.apply(original, this, [iterable]);
        const items = (function* () {
          for (const item of iterable) {
            if (item instanceof P) uncounted(() => Reflect.apply(then, item, [undefined, (reason) => browser.caughtBy(context, reason, `Promise.${name}()`)]));
            yield item;
          }
        })();
        return Reflect.apply(original, this, [items]);
      },
    }[name];
    Object.defineProperty(P, name, { ...Object.getOwnPropertyDescriptor(P, name), value: observed });
  }
}

// Marks in `context.styledByMarkup` each element of window `w` whose style
// attribute markup gave it (innerHTML, outerHTML, insertAdjacentHTML,
// createContextualFragment, DOMParser) or setAttribute(), which a page's CSP
// without 'unsafe-inline' blocks, unlike a style the CSSOM sets: a clone or
// an imported copy of a marked element is marked too. What the harness does
// itself (uncounted()) marks nothing (harness/detectors.mjs).
function watchInlineStyles(context, w) {
  const styled = (context.styledByMarkup = new WeakSet());
  const markTree = (root) => {
    if (root && root.nodeType === 1 && root.hasAttribute("style")) styled.add(root);
    if (root && root.querySelectorAll) for (const el of root.querySelectorAll("[style]")) styled.add(el);
  };
  const markNew = (parent, before) => {
    if (!parent) return;
    for (const n of parent.childNodes) if (!before.has(n)) markTree(n);
  };
  const wrapMethod = (proto, name, around) => {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d || typeof d.value !== "function") return;
    const original = d.value;
    Object.defineProperty(proto, name, { ...d, value: { [name](...args) { return around(this, args, () => Reflect.apply(original, this, args)); } }[name] });
  };
  const wrapSetter = (proto, name, around) => {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d || !d.set) return;
    const set = d.set;
    Object.defineProperty(proto, name, { ...d, set: { [name](v) { around(this, () => Reflect.apply(set, this, [v])); } }[name] });
  };
  const harness = () => isPaused();
  for (const name of ["setAttribute", "setAttributeNS"]) {
    wrapMethod(w.Element.prototype, name, (el, args, call) => {
      const out = call();
      const attr = String(args[name === "setAttribute" ? 0 : 1]).toLowerCase();
      if (!harness() && (attr === "style" || attr.endsWith(":style"))) uncounted(() => styled.add(el));
      return out;
    });
  }
  for (const proto of [w.Element.prototype, w.ShadowRoot.prototype]) {
    wrapSetter(proto, "innerHTML", (node, call) => {
      call();
      if (!harness()) uncounted(() => markTree(node));
    });
  }
  wrapSetter(w.Element.prototype, "outerHTML", (el, call) => {
    const parent = el.parentNode;
    const before = new Set(parent ? parent.childNodes : []);
    call();
    if (!harness()) uncounted(() => markNew(parent, before));
  });
  wrapMethod(w.Element.prototype, "insertAdjacentHTML", (el, args, call) => {
    const where = String(args[0]).toLowerCase();
    const parent = where === "afterbegin" || where === "beforeend" ? el : el.parentNode;
    const before = new Set(parent ? parent.childNodes : []);
    const out = call();
    if (!harness()) uncounted(() => markNew(parent, before));
    return out;
  });
  wrapMethod(w.Range.prototype, "createContextualFragment", (range, args, call) => {
    const fragment = call();
    if (!harness()) uncounted(() => markTree(fragment));
    return fragment;
  });
  wrapMethod(w.DOMParser.prototype, "parseFromString", (parser, args, call) => {
    const doc = call();
    if (!harness()) uncounted(() => markTree(doc));
    return doc;
  });
  // A copy of marked elements is marked where they are: the two trees are
  // walked side by side.
  const copyMarks = (from, to) => {
    if (!from || !to) return;
    if (styled.has(from)) styled.add(to);
    const a = from.childNodes || [];
    const b = to.childNodes || [];
    for (let i = 0; i < a.length && i < b.length; i++) copyMarks(a[i], b[i]);
  };
  wrapMethod(w.Node.prototype, "cloneNode", (node, args, call) => {
    const copy = call();
    uncounted(() => copyMarks(node, copy));
    return copy;
  });
  wrapMethod(w.Document.prototype, "importNode", (doc, args, call) => {
    const copy = call();
    uncounted(() => copyMarks(args[0], copy));
    return copy;
  });
}

// Trusted Types, as Chrome has them, in window `w`: trustedTypes and its
// policies, and TrustedHTML, TrustedScript and TrustedScriptURL. A page whose
// policy of content requires them (require-trusted-types-for 'script')
// refuses a string at each of their sinks unless a default policy makes it
// one; the sinks here take it, and keep in browser.untrusted what the
// extension passed them that was not one (harness/detectors.mjs), so that
// what the extension does next is seen as well. What the harness does itself
// (uncounted()) is not kept.
function watchTrustedTypes(context, w) {
  const browser = context.browser;
  const made = new WeakMap(); // a value of a policy → the string it stands for
  const TOKEN = Symbol("policy");
  const trusted = (name) => {
    const Kind = {
      [name]: class {
        constructor(token, value) {
          if (token !== TOKEN) throw new w.TypeError("Illegal constructor");
          made.set(this, value);
        }
        toString() { return made.get(this); }
        toJSON() { return made.get(this); }
      },
    }[name];
    return Kind;
  };
  const TrustedHTML = trusted("TrustedHTML");
  const TrustedScript = trusted("TrustedScript");
  const TrustedScriptURL = trusted("TrustedScriptURL");
  const KINDS = { html: TrustedHTML, script: TrustedScript, scriptURL: TrustedScriptURL };
  const CREATE = { html: "createHTML", script: "createScript", scriptURL: "createScriptURL" };
  const policy = (name, rules) => {
    const p = { name };
    for (const kind of Object.keys(KINDS)) {
      p[CREATE[kind]] = (input, ...args) => {
        const rule = rules && rules[CREATE[kind]];
        if (typeof rule !== "function") throw new w.TypeError(`Failed to execute '${CREATE[kind]}' on 'TrustedTypePolicy': Policy ${name}'s TrustedTypePolicyOptions did not specify a '${CREATE[kind]}' member.`);
        const out = rule(String(input), ...args);
        return new KINDS[kind](TOKEN, out === undefined || out === null ? "" : String(out));
      };
    }
    return p;
  };
  // A policy is tried as it is made, apart from every input: what its rules
  // make of what an attack would hand them. One that lets it through makes
  // the types a formality, as a default policy does for every string at
  // every sink.
  const PROBES = {
    html: '<img src="x" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe srcdoc="<script>alert(1)</script>"></iframe>',
    script: "alert(1)",
    scriptURL: ["javascript:alert(1)", "https://evil.example/x.js", "data:text/javascript,alert(1)"],
  };
  const tryPolicy = (name, p) => {
    const issues = [];
    if (name === "default") issues.push("named default, which makes every string at every sink a trusted value");
    uncounted(() => {
      const attempt = (kind, input) => {
        try {
          return String(p[CREATE[kind]](input));
        } catch {
          return null; // a rule that refuses it, or none for the kind
        }
      };
      const html = attempt("html", PROBES.html);
      if (html !== null) {
        // Read in a document of the harness's own, apart from the page.
        const doc = new JSDOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html");
        const runs = [...doc.querySelectorAll("*")].some((el) => el.localName === "script" || el.localName === "iframe" ||
          [...el.attributes].some((a) => /^on/i.test(a.name) || (/^(?:href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value.replace(/[\t\n\r]/g, "")))));
        if (runs) issues.push("whose createHTML lets markup that runs script through");
      }
      const script = attempt("script", PROBES.script);
      if (script !== null && script.includes("alert(1)")) issues.push("whose createScript makes script of any text");
      for (const url of PROBES.scriptURL) {
        const out = attempt("scriptURL", url);
        if (out === null) continue;
        let u;
        try {
          u = new URL(out, w.location.href);
        } catch {
          u = null;
        }
        if (u && (u.protocol !== "https:" && u.protocol !== "chrome-extension:" || (u.protocol === "https:" && u.origin === "https://evil.example"))) {
          issues.push(`whose createScriptURL lets ${url.slice(0, 40)} through`);
        }
      }
    });
    for (const issue of issues) browser.untrusted.push({ where: `trustedTypes.createPolicy("${name}") in ${context.kind} ${context.url || ""}`.trim(), issue });
  };
  const factory = {
    defaultPolicy: null,
    createPolicy(name, rules) {
      const p = policy(String(name), rules);
      if (String(name) === "default") {
        if (factory.defaultPolicy) throw new w.TypeError("Failed to execute 'createPolicy' on 'TrustedTypePolicyFactory': Policy with name \"default\" already exists.");
        factory.defaultPolicy = p;
      }
      if (!isPaused()) tryPolicy(String(name), p);
      return p;
    },
    isHTML: (v) => v instanceof TrustedHTML && made.has(v),
    isScript: (v) => v instanceof TrustedScript && made.has(v),
    isScriptURL: (v) => v instanceof TrustedScriptURL && made.has(v),
    emptyHTML: new TrustedHTML(TOKEN, ""),
    emptyScript: new TrustedScript(TOKEN, ""),
  };
  w.trustedTypes = factory;
  w.TrustedHTML = TrustedHTML;
  w.TrustedScript = TrustedScript;
  w.TrustedScriptURL = TrustedScriptURL;
  // What a sink of `kind` takes `value` as: the string a value of a policy
  // stands for; else, through the default policy, if there is one; else the
  // string, kept as what such a page refuses.
  const take = (sink, kind, value) => {
    if (value instanceof KINDS[kind] && made.has(value)) return made.get(value);
    if (isPaused()) return value;
    if (factory.defaultPolicy) return made.get(factory.defaultPolicy[CREATE[kind]](value, kind, sink));
    browser.untrusted.push({ where: `${sink} in ${context.kind} ${context.url || ""}`.trim(), kind, value });
    return value;
  };
  // The kind of a sink an attribute `name` of `el` is, or null.
  const attributeKind = (el, name) => {
    const n = String(name).toLowerCase();
    if (n.startsWith("on")) return "script";
    const tag = el && el.localName;
    if (tag === "script" && (n === "src" || n === "href" || n === "xlink:href")) return "scriptURL";
    if ((tag === "iframe" || tag === "frame") && n === "srcdoc") return "html";
    return null;
  };
  const isScript = (node) => node && node.nodeType === 1 && node.localName === "script";
  const wrapSetter = (proto, name, kindOf) => {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d || !d.set) return;
    const set = d.set;
    Object.defineProperty(proto, name, { ...d, set: { [name](v) {
      const kind = kindOf(this);
      return Reflect.apply(set, this, [kind ? take(`${proto[Symbol.toStringTag] || proto.constructor.name}.${name}`, kind, v) : v]);
    } }[name] });
  };
  const wrapMethod = (proto, name, argsOf) => {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d || typeof d.value !== "function") return;
    const original = d.value;
    Object.defineProperty(proto, name, { ...d, value: { [name](...args) {
      return Reflect.apply(original, this, argsOf(this, args, `${proto.constructor.name}.${name}`));
    } }[name] });
  };
  wrapSetter(w.Element.prototype, "innerHTML", (el) => (isScript(el) ? "script" : "html"));
  wrapSetter(w.ShadowRoot.prototype, "innerHTML", () => "html");
  wrapSetter(w.Element.prototype, "outerHTML", () => "html");
  wrapSetter(w.HTMLIFrameElement.prototype, "srcdoc", () => "html");
  wrapSetter(w.HTMLScriptElement.prototype, "src", () => "scriptURL");
  wrapSetter(w.HTMLScriptElement.prototype, "text", () => "script");
  wrapSetter(w.Node.prototype, "textContent", (node) => (isScript(node) ? "script" : null));
  wrapSetter(w.Node.prototype, "nodeValue", (node) => (node && node.nodeType === 2 ? attributeKind(node.ownerElement, node.name) : null));
  wrapSetter(w.Attr.prototype, "value", (attr) => attributeKind(attr.ownerElement, attr.name));
  wrapMethod(w.Element.prototype, "insertAdjacentHTML", (el, args, sink) => [args[0], take(sink, "html", args[1]), ...args.slice(2)]);
  wrapMethod(w.Range.prototype, "createContextualFragment", (range, args, sink) => [take(sink, "html", args[0]), ...args.slice(1)]);
  wrapMethod(w.DOMParser.prototype, "parseFromString", (parser, args, sink) => [take(sink, "html", args[0]), ...args.slice(1)]);
  for (const name of ["write", "writeln"]) wrapMethod(w.Document.prototype, name, (doc, args, sink) => args.map((a) => take(sink, "html", a)));
  wrapMethod(w.Element.prototype, "setAttribute", (el, args, sink) => {
    const kind = attributeKind(el, args[0]);
    return kind ? [args[0], take(sink, kind, args[1]), ...args.slice(2)] : args;
  });
  wrapMethod(w.Element.prototype, "setAttributeNS", (el, args, sink) => {
    const kind = attributeKind(el, args[1]);
    return kind ? [args[0], args[1], take(sink, kind, args[2]), ...args.slice(3)] : args;
  });
  for (const name of ["setTimeout", "setInterval"]) {
    const original = w[name];
    w[name] = { [name](handler, ...rest) {
      return Reflect.apply(original, this, [typeof handler === "function" ? handler : take(name, "script", handler), ...rest]);
    } }[name];
  }
}

// IndexedDB's requests to open or delete a database, and its transactions,
// are followed until they end (idle() of harness/work.mjs).
function follow(target, events) {
  started();
  let done = false;
  const end = () => {
    if (!done) {
      done = true;
      finished();
    }
  };
  target.addEventListener("success", () => {
    const result = uncounted(() => target.result);
    if (result !== undefined && (typeof result !== "object" || result === null || !("objectStoreNames" in result))) step(1 + uncounted(() => cloneUnits(result)));
  });
  for (const e of events) target.addEventListener(e, end);
  return target;
}
for (const name of ["open", "deleteDatabase"]) {
  const original = IDBFactory.prototype[name];
  IDBFactory.prototype[name] = function (...args) {
    return follow(Reflect.apply(original, this, args), ["success", "error"]);
  };
}
{
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    return follow(Reflect.apply(transaction, this, args), ["complete", "abort"]);
  };
}

const EMPTY_PAGE = "<!doctype html><html><head></head><body></body></html>";
const TYPES = { ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png" };

// A console that keeps what the extension writes instead of printing it.
function quietConsole(context) {
  context.logs = [];
  const keep = (level) => (...args) => record(context.logs, { level, args });
  return { log: keep("log"), info: keep("info"), warn: keep("warn"), error: keep("error"), debug: keep("debug") };
}

function run(context, rel) {
  const { code, file, sites } = loadedSource(rel);
  context.browser.loaded(rel, sites);
  if (context.kind === "background") vm.runInContext(code, context.global, { filename: file });
  else context.evaluate(code + "\n//# sourceURL=" + pathToFileURL(file).href);
}

// Whether `url` matches `glob` of a content script's include_globs or
// exclude_globs: * stands for any characters, ? for one, the rest for itself.
function globMatches(glob, url) {
  return new RegExp("^" + [...glob].map((c) => (c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.+^${}()|[\]\\]/g, "\\$&"))).join("") + "$").test(url);
}

// The scripts manifest.json injects into a frame at `url`, in its order: of
// the content scripts whose matches it is in, and none of whose
// exclude_matches; and, where they are given, one of whose include_globs and
// none of whose exclude_globs.
export function contentScriptsFor(url, topFrame = true) {
  return manifest.content_scripts
    .filter((cs) => (topFrame || cs.all_frames) && cs.matches.some((p) => matchesPattern(p, url)) &&
      !(cs.exclude_matches || []).some((p) => matchesPattern(p, url)) &&
      (!cs.include_globs || cs.include_globs.some((g) => globMatches(g, url))) &&
      !(cs.exclude_globs || []).some((g) => globMatches(g, url)))
    .flatMap((cs) => cs.js || []);
}

function webAccessible(rel, pageUrl) {
  return (manifest.web_accessible_resources || []).some((r) =>
    r.matches.some((p) => matchesPattern(p, pageUrl)) && r.resources.some((g) => globToRegExp(g).test(rel)));
}

function fetchFor(browser, context) {
  const base = `chrome-extension://${browser.id}/`;
  const viaNet = context.net.fetchFor(context);
  const fetch = async (input, init) => {
    const raw = typeof input === "object" && input && "url" in input ? input.url : String(input);
    if (!raw.startsWith(base)) return viaNet(input, init);
    const rel = decodeURIComponent(new URL(raw).pathname.slice(1));
    const file = path.join(EXT, rel);
    const allowed = context.kind !== "tab" || webAccessible(rel, context.url);
    if (!allowed || !file.startsWith(EXT + path.sep) || !fs.existsSync(file)) throw new context.realm.TypeError("Failed to fetch");
    return response(context.realm, raw, { body: fs.readFileSync(file), headers: { "content-type": TYPES[path.extname(rel)] || "application/octet-stream" } });
  };
  return (input, init) => tracked(fetch(input, init));
}

export function openBackground(browser, { net = new Net() } = {}) {
  const context = browser.register({ kind: "background", url: `chrome-extension://${browser.id}/background.js`, net });
  const g = vm.createContext({});
  context.global = g;
  // A vm context's global, seen from outside, holds only what was put on it;
  // its own built-ins (the realm values arrive in) are on its global object,
  // reached from inside.
  context.realm = vm.runInContext("globalThis", g);
  context.indexedDB = browser.indexedDB || (browser.indexedDB = new IDBFactory());
  Object.assign(g, {
    self: g,
    chrome: browser.apiFor(context),
    fetch: fetchFor(browser, context),
    indexedDB: context.indexedDB,
    navigator: { storage: { persist: async () => true, persisted: async () => true } },
    crypto: trackedCrypto,
    // Node's own, which the harness and jsdom use as well: subclasses that
    // count, by the rules of their web interfaces.
    TextEncoder: costedClass(TextEncoder, "TextEncoder"),
    TextDecoder: costedClass(TextDecoder, "TextDecoder"),
    URL: costedClass(URL, "URL"),
    URLSearchParams: costedClass(URLSearchParams, "URLSearchParams"),
    btoa: costedFunction(btoa),
    atob: costedFunction(atob),
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    console: quietConsole(context),
    Fuzzer: globalThis.Fuzzer,
    ...COUNTING,
  });
  context.realm.Math.random = random; // an input's draws, the same on each of its rungs (harness/work.mjs)
  installCosts(context.realm);
  watchCatching(context, context.realm, g);
  context.close = () => browser.unregister(context);
  run(context, "background.js");
  return context;
}

function openWindow(browser, context, html, url, clock = null) {
  const virtualConsole = new VirtualConsole();
  // What a script's code throws and nothing catches, jsdom wraps; the report
  // holds what was thrown, with its stack in the extension's code (or the
  // value itself, undefined too, when it is not an Error).
  virtualConsole.on("jsdomError", (e) => browser.report(context, e.type === "unhandled-exception" && "cause" in e ? e.cause : e, "script"));
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  context.global = w;
  context.realm = w;
  context.window = w;
  context.document = w.document;
  context.internals = {};
  w.chrome = browser.apiFor(context);
  w.fetch = fetchFor(browser, context);
  w.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  // jsdom has no SubtleCrypto, which the TOTP code uses; Node's stands in.
  Object.defineProperty(w, "crypto", { value: trackedCrypto, configurable: true });
  w.Fuzzer = globalThis.Fuzzer;
  Object.assign(w, COUNTING);
  // The harness runs the extension's scripts with the window's own eval, not
  // the counted one: loading a script is not the extension's work.
  context.evaluate = w.eval.bind(w);
  w.Math.random = random; // an input's draws, the same on each of its rungs (harness/work.mjs)
  completePlatform(w);
  installCosts(w, { web: w });
  watchCatching(context, w, w);
  watchInlineStyles(context, w);
  w.__kulmsExpose = (file, internals) => { context.internals[file] = internals; };
  w.console = quietConsole(context);
  // The page's timers do not keep Node running: a test or a fuzz target ends
  // when its own work does, though the extension leaves intervals behind (the
  // assignment panel fetches anew every two minutes). They run as Node's
  // timers, unreferenced, which a script uses as it would a browser's, and
  // stop when the page closes, as a closed tab's do.
  const callable = (f) => (typeof f === "function" ? f : () => w.eval(String(f)));
  const timers = new Set();
  w.setTimeout = (f, ms, ...args) => {
    const t = setTimeout((...a) => {
      timers.delete(t);
      callable(f)(...a);
    }, ms, ...args).unref();
    timers.add(t);
    return t;
  };
  w.setInterval = (f, ms, ...args) => {
    const t = setInterval(callable(f), ms, ...args).unref();
    timers.add(t);
    return t;
  };
  w.clearTimeout = (t) => {
    timers.delete(t);
    clearTimeout(t);
  };
  w.clearInterval = (t) => {
    timers.delete(t);
    clearInterval(t);
  };
  // Or the page has a clock of its own, which the test or the target moves
  // (harness/clock.mjs).
  if (clock) installClock(w, clock, (e) => browser.report(context, e, "timer"));
  watchTrustedTypes(context, w);
  // jsdom has no ResizeObserver, which Chrome has. jsdom lays nothing out, so
  // no size changes; what Chrome does besides is call back once, soon after
  // an element is observed, with its size then, which here is none.
  // jsdom has no DataTransfer nor DragEvent, which Chrome has: a drop hands
  // its files over in them. Their files are a FileList of the window's, which
  // a file input takes.
  w.DataTransfer = class DataTransfer {
    #files = [];
    #data = new Map();
    constructor() {
      this.dropEffect = "none";
      this.effectAllowed = "all";
      const files = this.#files;
      const data = this.#data;
      this.items = {
        add(item, type) {
          if (item instanceof w.File) {
            files.push(item);
            return { kind: "file", type: item.type, getAsFile: () => item };
          }
          if (type === undefined) throw new w.TypeError("Failed to execute 'add' on 'DataTransferItemList': parameter 2 is required when parameter 1 is a string.");
          data.set(String(type).toLowerCase(), String(item));
          return { kind: "string", type: String(type).toLowerCase() };
        },
        clear() {
          files.length = 0;
          data.clear();
        },
        get length() { return files.length + data.size; },
      };
    }
    get files() {
      const list = FileListIDL.create(w, [], {});
      const impl = idlUtils.implForWrapper(list);
      for (const f of this.#files) impl.push(idlUtils.implForWrapper(f));
      return list;
    }
    get types() { return [...this.#data.keys(), ...(this.#files.length ? ["Files"] : [])]; }
    setData(type, value) { this.#data.set(String(type).toLowerCase(), String(value)); }
    getData(type) { return this.#data.get(String(type).toLowerCase()) ?? ""; }
    clearData(type) { if (type === undefined) this.#data.clear(); else this.#data.delete(String(type).toLowerCase()); }
  };
  w.DragEvent = class DragEvent extends w.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      Object.defineProperty(this, "dataTransfer", { value: init.dataTransfer ?? null, enumerable: true });
    }
  };
  w.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      if (typeof callback !== "function") throw new w.TypeError("Failed to construct 'ResizeObserver': parameter 1 is not of type 'Function'.");
      this.callback = callback;
      this.targets = new Set();
    }
    observe(target) {
      if (!(target instanceof w.Element)) throw new w.TypeError("Failed to execute 'observe' on 'ResizeObserver': parameter 1 is not of type 'Element'.");
      if (this.targets.has(target)) return;
      this.targets.add(target);
      const box = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 };
      w.setTimeout(() => {
        if (this.targets.has(target)) this.callback([{ target, contentRect: box, borderBoxSize: [{ inlineSize: 0, blockSize: 0 }], contentBoxSize: [{ inlineSize: 0, blockSize: 0 }] }], this);
      }, 0);
    }
    unobserve(target) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
    }
  };
  context.clock = clock;
  context.close = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    browser.unregister(context);
    w.close();
  };
  return w;
}

// A tab at `url` with the page `html`, running the content scripts the
// manifest gives that URL (or `scripts`, when given), after `prepare(window)`
// has had its turn. A frame of a tab is opened with `frameOf` set to the
// tab's context. Given `clock` (harness/clock.mjs), the page's timers and
// time are its.
export function openTab(browser, { url, html = EMPTY_PAGE, net = new Net(), scripts, frameOf = null, prepare, clock = null } = {}) {
  const top = frameOf ? (frameOf.frameOf || frameOf) : null;
  const context = browser.register({
    kind: "tab",
    url,
    net,
    tabId: top ? top.tabId : browser.nextTabId++,
    frameId: top ? (top.nextFrameId = (top.nextFrameId || 0) + 1) : 0,
    topUrl: top ? top.url : url,
    frameOf: top,
  });
  const w = openWindow(browser, context, html, url, clock);
  if (prepare) prepare(w);
  for (const rel of scripts || contentScriptsFor(url, !top)) run(context, rel);
  return context;
}

// A tab at `url` whose page the harness does not make: what the extension's
// other contexts see of it (chrome.tabs), and the listeners of the content
// scripts of its page, which a test or a fuzz target gives it as functions of
// its own (context.events.onMessage.addListener()); a message reaches them
// as values of the harness's realm.
export function openBareTab(browser, { url, net = new Net() } = {}) {
  const context = browser.register({ kind: "tab", url, net, tabId: browser.nextTabId++, frameId: 0, topUrl: url, frameOf: null });
  context.realm = globalThis;
  context.close = () => browser.unregister(context);
  return context;
}

// The popup, its page and its scripts, after `prepare(window)` has had its
// turn; given `clock` (harness/clock.mjs), the page's timers and time are its.
export function openPopup(browser, { net = new Net(), prepare, clock = null } = {}) {
  const url = `chrome-extension://${browser.id}/popup.html`;
  // The user opens the popup by executing the extension's action, which gives
  // the extension activeTab for the active tab: host permission for its page
  // until the user navigates away or closes the tab
  // (https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
  if (browser.activeTabId !== null) browser.granted.add(browser.activeTabId);
  const context = browser.register({ kind: "popup", url, net });
  const w = openWindow(browser, context, read("popup.html"), url, clock);
  if (prepare) prepare(w);
  const loading = w.document.readyState === "loading";
  for (const rel of ["vendor/qrcode-gen.js", "popup.js"]) run(context, rel);
  // popup.js waits for DOMContentLoaded; it gets it, whether or not jsdom
  // sent it before the script ran.
  if (!loading) w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  return context;
}

// Waits `ms` on Node's clock, for until() to look again. A test does not wait
// a fixed time for what the extension does, which a slower machine need not
// finish within it: it waits until all that the harness does on the
// extension's behalf is done (idle() of harness/work.mjs), moves the page's
// own clock (harness/clock.mjs), or waits until what it looks for holds.
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until `condition()` holds, for `timeout` ms at most, and says whether
// it came to hold. Where a test waits for something the extension does, this
// holds on a runner slower than the machine the test was written on, which a
// wait of a fixed time need not.
export async function until(condition, { timeout = 5000 } = {}) {
  const end = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() >= end) return false;
    await settle(5);
  }
  return true;
}
