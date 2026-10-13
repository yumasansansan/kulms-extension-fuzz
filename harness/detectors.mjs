// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// What the harness looks for besides a thrown exception, the way a sanitizer
// looks for what a crash would not show. Each detector takes a snapshot of a
// context before a run and lists what changed that should not have. They look
// at all of a context, whatever state it is in, not at a part chosen for what
// the extension is expected to do.
//
// - markup: what the document, its open shadow roots and the documents of its
//   frames gained, on an element new or old, that runs script, loads from
//   elsewhere or sends the page elsewhere:
//   - a <script> of its own text, or one whose src the harness cannot verify
//     against an integrity hash: one of sha256, sha384 or sha512 that matches
//     the file, which the harness can tell only of the extension's own files;
//     a <style>; a style sheet <link> that cannot be verified so; and a style
//     attribute that markup or setAttribute() gave an element
//     (harness/contexts.mjs), unlike one the CSSOM sets. A nonce verifies
//     nothing the extension puts in: it is the page's, to let in its own. The
//     extension can do without any of these (its content scripts' css, the
//     CSSOM, a script of the page's world that the browser runs), and what it
//     does with them, a page cannot tell from an attack;
//   - an <object>, an <embed> or an <applet>; an iframe's srcdoc;
//   - an attribute of an event handler (on*), or one whose code changed;
//   - a URL attribute (href, xlink:href, action, formaction, src, data,
//     poster, background) that the WHATWG's URL parser, which is the
//     browser's, reads as javascript: or vbscript: (whatever spaces, controls,
//     tabs and newlines it holds), or, on a frame, an object, an embed or a
//     script, as data: or blob:; an SVG animation that sets a link to one;
//   - a <base>, a <meta> http-equiv, a <link> that imports or preloads script;
//   - markup that loads a resource (an image, a frame, a script, a style
//     sheet, media, a srcset's candidates) from an origin outside the
//     extension's host permissions, the page's own and the extension's.
//   The extension builds its UI with textContent: markup from data that
//   lands in the page is a DOM XSS, or a leak to wherever it loads from.
// - intrinsics: what changed of the realm's intrinsics — every function the
//   global object holds and its prototype, the namespaces (Math, JSON,
//   Reflect, Intl, Atomics, WebAssembly), the intrinsics no global names (the
//   iterator, generator and async prototypes, %TypedArray%,
//   %ThrowTypeError%), and every prototype these inherit from: a property
//   gained, lost or changed (its value, getter, setter or attributes), a
//   prototype changed, an object made non-extensible; and a function or a
//   namespace that the global object held, replaced or gone. Prototype
//   pollution, and the tampering it is one kind of.
// - errors: what browser.errors gained (exceptions of listeners, timers and
//   event handlers, and rejected promises nothing handled).
// - caught slips: what the extension caught and went on from, when it tells
//   of a slip of the code (isSlip()): its catch clauses, the rejection
//   handlers it gives promises (harness/source.mjs), and the rejections that
//   Promise.all, allSettled, any and race hand on or let go
//   (harness/contexts.mjs). A TypeError that a catch swallows takes part of
//   the page away without a word.
// - Trusted Types: a string, not a value of a policy, that the extension
//   passed to a sink of Trusted Types (innerHTML, outerHTML,
//   insertAdjacentHTML, DOMParser, createContextualFragment, document.write,
//   an iframe's srcdoc, a script's src and text, an attribute of an event
//   handler, a timer of a string; harness/contexts.mjs), an empty one too: a
//   page that requires Trusted Types refuses it, and what the extension
//   meant to do there does not happen. And a policy that makes the types a
//   formality: a default policy, which makes every string at every sink
//   one, and a policy whose rules, tried when it is made, let through markup
//   that runs script, a script URL of a scheme that runs it or from
//   elsewhere, or any script text.
// - requests: what the context fetched from an origin outside the extension's
//   host permissions, its own and the extension's: a leak, or a request
//   forged from data.
// - responses not vouched for: the body of a response that the context read
//   although it came, by a redirect or not, from anywhere but over https from
//   an origin of the extension's host permissions, or the extension itself
//   (harness/net.mjs). KULMS and KULASIS sign nothing they send: TLS is all
//   that vouches for their data, and only as far as where it came from.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { matchesPattern } from "./chrome.mjs";
import { EXT, manifest } from "./paths.mjs";
import { uncounted } from "./work.mjs";

// A slip of the code, as V8 and the DOM word what the code does not mean to
// throw, unlike its own errors ("Fetch failed: 400", "登録コースが見つかりま
// せんでした"), a network that fails ("Failed to fetch"), an answer that is
// not JSON (a SyntaxError of JSON.parse), a URL that is not one ("Invalid
// URL") or a %-sequence that is not UTF-8 ("URI malformed"), which code that
// reads data is there to meet.
const SLIP = new RegExp([
  "Cannot read properties", "Cannot set properties", "Cannot create property", "Cannot destructure",
  "Cannot access '[^']*' before initialization", "Cannot add property", "Cannot assign to read only property",
  "Cannot redefine property", "Cannot delete property", "object is not extensible", "Assignment to constant variable",
  "is not a function", "is not iterable", "is not a constructor", "cannot be invoked without 'new'",
  "Cannot convert", "Cannot mix BigInt", "Do not know how to serialize a BigInt", "Converting circular structure",
  "is not defined", "Cannot use 'in' operator", "Right-hand side of 'instanceof'", "Spread syntax requires",
  "Reduce of empty array", "Invalid array length", "Invalid string length", "Invalid typed array length",
  "Invalid array buffer length", "Array buffer allocation failed", "Invalid time value", "Invalid count value",
  "Invalid code point", "Invalid regular expression", "Maximum call stack",
  "is not a valid selector", "Illegal invocation", "Failed to execute", "Failed to set the",
].join("|"));
export const isSlip = (e) => {
  try {
    return SLIP.test(typeof e === "string" ? e : String(e && e.message));
  } catch {
    return false;
  }
};

const printable = (x) => {
  try {
    return x && x.stack ? String(x.stack) : String(x);
  } catch {
    return "[a value String() cannot convert]";
  }
};

// --- Markup.

const FRAMES = new Set(["iframe", "frame", "object", "embed"]);
const ANIMATIONS = new Set(["animate", "set", "animatemotion", "animatetransform"]);
// Attributes whose value is a URL the browser follows, or loads.
const FOLLOWED = ["href", "xlink:href", "action", "formaction"];
const LOADED = ["src", "data", "poster", "background"];

// `value` read as a URL against `base`, as the browser reads it (the WHATWG
// parser strips spaces and controls at the ends, and tabs and newlines
// anywhere), or null when it is no URL.
function urlOf(value, base) {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

const schemeOf = (value, base) => {
  const u = urlOf(value, base);
  return u && u.protocol;
};

// The origin a resource of `value` is loaded from, or null where it is
// loaded from nowhere (data:, blob:, about:, javascript:).
const originOf = (value, base) => {
  const u = urlOf(value, base);
  if (!u) return null;
  // The URL standard knows no origin of a scheme it does not list (its
  // origin is "null"); a browser gives an extension's URLs the extension's.
  if (u.protocol === "chrome-extension:") return `${u.protocol}//${u.host}`;
  return /^(?:https?|wss?|ftp):$/.test(u.protocol) ? u.origin : null;
};

// Whether a context at `own` may reach `origin`: the extension's host
// permissions, the context's origin, the extension's.
function allowedOrigin(origin, own, extension) {
  if (origin === null || origin === own || origin === extension) return true;
  return (manifest.host_permissions || []).some((p) => matchesPattern(p, `${origin}/`));
}

// Whether the integrity metadata `integrity` (Subresource Integrity) of a
// resource at `url` holds a hash of sha256, sha384 or sha512 that matches the
// resource, which the harness can tell of the extension's own files only.
function verified(integrity, url, extension) {
  if (!integrity || !url || !url.href.startsWith(`${extension}/`)) return false;
  let bytes;
  try {
    const file = path.join(EXT, decodeURIComponent(url.pathname));
    if (!file.startsWith(EXT + path.sep)) return false;
    bytes = fs.readFileSync(file);
  } catch {
    return false;
  }
  return integrity.trim().split(/\s+/).some((token) => {
    const m = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})(?:\?\S*)?$/.exec(token);
    return m !== null && createHash(m[1]).update(bytes).digest("base64") === m[2];
  });
}

// What makes `el` run script, load from elsewhere or send the page
// elsewhere: short descriptions, the same as long as that does not change
// (see the top of this file).
function featuresOf(el, base, own, extension) {
  const features = [];
  // A value in a description: the start of it, escaped to one line, and a
  // hash of all of it, by which descriptions are told apart.
  const shown = (v) => `${JSON.stringify(String(v).slice(0, 80))}#${createHash("sha256").update(String(v)).digest("base64").slice(0, 12)}`;
  const tag = el.localName;
  const attr = (name) => el.getAttribute(name);
  if (tag === "script") {
    const src = attr("src");
    if (src === null || el.textContent) features.push(`script of its own text: ${shown(el.textContent)}`);
    if (src !== null && !verified(attr("integrity"), urlOf(src, base), extension)) features.push(`script from ${shown(src)} that no integrity hash verifies`);
  }
  if (tag === "style") features.push(`style: ${shown(el.textContent)}`);
  if (tag === "object" || tag === "embed" || tag === "applet") features.push(tag);
  if (tag === "base" && attr("href") !== null) features.push(`base ${shown(attr("href"))}`);
  if (tag === "meta" && attr("http-equiv") !== null) features.push(`meta http-equiv=${shown(attr("http-equiv"))} ${shown(attr("content"))}`);
  if (tag === "link") {
    const rel = (attr("rel") || "").toLowerCase().split(/\s+/);
    if (rel.includes("import") || rel.includes("modulepreload") || (rel.includes("preload") && /^(?:script|document)$/i.test(attr("as") || ""))) {
      features.push(`link rel=${shown(attr("rel"))} ${shown(attr("href"))}`);
    }
    if ((rel.includes("stylesheet") || (rel.includes("preload") && /^style$/i.test(attr("as") || ""))) && !verified(attr("integrity"), urlOf(attr("href") || "", base), extension)) {
      features.push(`style sheet ${shown(attr("href"))} that no integrity hash verifies`);
    }
    if (attr("href") !== null && !allowedOrigin(originOf(attr("href"), base), own, extension)) features.push(`loads link ${shown(attr("href"))}`);
  }
  for (const a of el.attributes) {
    const name = a.name.toLowerCase();
    const value = a.value;
    if (name.startsWith("on")) {
      features.push(`${name}=${shown(value)}`);
      continue;
    }
    if (name === "srcdoc" && (tag === "iframe" || tag === "frame")) features.push(`srcdoc=${shown(value)}`);
    if (FOLLOWED.includes(name) || LOADED.includes(name)) {
      const scheme = schemeOf(value, base);
      if (scheme === "javascript:" || scheme === "vbscript:") features.push(`${name}=${shown(value)}`);
      else if ((scheme === "data:" || scheme === "blob:") && (FRAMES.has(tag) || tag === "script")) features.push(`${name}=${shown(value)}`);
    }
    if (LOADED.includes(name) && !allowedOrigin(originOf(value, base), own, extension)) features.push(`loads ${name}=${shown(value)}`);
    if (name === "srcset" || name === "imagesrcset") {
      for (const candidate of value.split(",")) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url && !allowedOrigin(originOf(url, base), own, extension)) features.push(`loads ${name} ${shown(url)}`);
      }
    }
  }
  if (ANIMATIONS.has(tag) && /^(?:xlink:)?href$/i.test(attr("attributeName") || "")) {
    for (const name of ["to", "from", "values", "by"]) {
      const value = attr(name);
      if (value === null) continue;
      for (const part of value.split(";")) {
        const scheme = schemeOf(part.trim(), base);
        if (scheme === "javascript:" || scheme === "vbscript:" || scheme === "data:") features.push(`animates href ${name}=${shown(value)}`);
      }
    }
  }
  return features;
}

// Each element of `document`, of its open shadow roots and of the documents
// of its frames, with what featuresOf() says of it, when it says something.
// The contents of a <template> are inert until the extension takes them into
// the document, where they are seen.
function carriers(document, own, extension) {
  const found = new Map();
  const seen = new Set();
  const visit = (root, doc) => {
    if (!root || seen.has(root)) return;
    seen.add(root);
    for (const el of root.querySelectorAll("*")) {
      const features = featuresOf(el, doc.baseURI, own, extension);
      if (features.length) found.set(el, features);
      if (el.shadowRoot) visit(el.shadowRoot, doc);
      if (el.localName === "iframe" || el.localName === "frame") {
        let inner;
        try {
          inner = el.contentDocument;
        } catch {
          inner = null;
        }
        if (inner) visit(inner, inner);
      }
    }
  };
  visit(document, document);
  return found;
}

// What featuresOf() says of the elements of `html` parsed in `document`'s
// realm as a fragment of it, apart from the page: the markup a server sent
// that a page shows as it is (harness/detectors.mjs's watch() gives a target
// that copies it into the page the means to tell it from what the extension
// makes; fuzz/targets/resources.fuzz.mjs).
export function featuresIn(html, document, own, extension) {
  return uncounted(() => {
    const t = document.createElement("template");
    t.innerHTML = html; // the harness's own work: no sink of Trusted Types keeps it
    const out = new Set();
    for (const el of t.content.querySelectorAll("*")) for (const f of featuresOf(el, document.baseURI, own, extension)) out.add(f);
    return out;
  });
}

function describe(el) {
  const attrs = [...el.attributes].map((a) => `${a.name}=${JSON.stringify(a.value.slice(0, 60))}`).join(" ");
  return `<${el.localName}${attrs ? " " + attrs : ""}>`;
}

// --- Intrinsics.

const NAMESPACES = ["Math", "JSON", "Reflect", "Intl", "Atomics", "WebAssembly"];
// The intrinsics no global names, as code of the realm reaches them.
const HIDDEN = `(() => {
  const g = function* () {};
  const ag = async function* () {};
  const af = async function () {};
  const proto = Object.getPrototypeOf;
  return {
    "%GeneratorFunction%": proto(g), "%GeneratorFunction.prototype%": proto(g).prototype, "%GeneratorPrototype%": proto(g()),
    "%AsyncGeneratorFunction%": proto(ag), "%AsyncGeneratorFunction.prototype%": proto(ag).prototype,
    "%AsyncGeneratorPrototype%": proto(ag()), "%AsyncIteratorPrototype%": proto(proto(ag())),
    "%AsyncFunction%": proto(af), "%AsyncFunction.prototype%": proto(af).prototype,
    "%ArrayIteratorPrototype%": proto([][Symbol.iterator]()), "%IteratorPrototype%": proto(proto([][Symbol.iterator]())),
    "%MapIteratorPrototype%": proto(new Map()[Symbol.iterator]()), "%SetIteratorPrototype%": proto(new Set()[Symbol.iterator]()),
    "%StringIteratorPrototype%": proto(""[Symbol.iterator]()), "%RegExpStringIteratorPrototype%": proto(/a/g[Symbol.matchAll]("")),
    "%TypedArray%": proto(Int8Array), "%TypedArray.prototype%": proto(Int8Array.prototype),
    "%ThrowTypeError%": (function () { "use strict"; const d = Object.getOwnPropertyDescriptor(Function.prototype, "caller"); return d && d.get; })(),
  };
})()`;

// What the global object of `realm` holds that is a function or a namespace,
// by its key.
function globalsOf(realm) {
  const out = new Map();
  for (const key of Reflect.ownKeys(realm)) {
    let d;
    try {
      d = Object.getOwnPropertyDescriptor(realm, key);
    } catch {
      continue;
    }
    if (d && "value" in d && (typeof d.value === "function" || NAMESPACES.includes(String(key)))) out.set(key, d.value);
  }
  return out;
}

const knownOf = new WeakMap(); // realm → { globals, intrinsics: Map(object → name) }

// The intrinsics of `context`'s realm, each with a name to report it by, and
// the global object's functions and namespaces, found once, when the harness
// first looks: what the global object holds that is a function, with its
// prototype, the namespaces, the hidden ones, and every prototype these
// inherit from.
function known(context) {
  const realm = context.realm;
  if (knownOf.has(realm)) return knownOf.get(realm);
  // Named first by what names them (a global, its prototype, a hidden one),
  // then the prototypes these inherit from that nothing named.
  const named = new Map();
  const name = (o, n) => {
    if (o && (typeof o === "object" || typeof o === "function") && !named.has(o)) named.set(o, n);
  };
  const globals = globalsOf(realm);
  for (const [key, value] of globals) {
    name(value, String(key));
    if (typeof value === "function") {
      const p = Object.getOwnPropertyDescriptor(value, "prototype");
      if (p && "value" in p) name(p.value, `${String(key)}.prototype`);
    }
  }
  const hidden = context.kind === "background" ? vm.runInContext(HIDDEN, context.global) : context.evaluate(HIDDEN);
  for (const [n, o] of Object.entries(hidden)) name(o, n);
  for (const [o, n] of [...named]) {
    let p = Object.getPrototypeOf(o);
    let pn = `${n}.[[Prototype]]`;
    while (p && !named.has(p)) {
      named.set(p, pn);
      p = Object.getPrototypeOf(p);
      pn = `${pn}.[[Prototype]]`;
    }
  }
  const out = { globals, intrinsics: named };
  knownOf.set(realm, out);
  return out;
}

const same = (a, b) => Object.is(a.value, b.value) && a.get === b.get && a.set === b.set &&
  a.writable === b.writable && a.enumerable === b.enumerable && a.configurable === b.configurable;

function shapeOf(context) {
  const shape = new Map();
  for (const [o, name] of known(context).intrinsics) {
    const keys = new Map();
    for (const key of Reflect.ownKeys(o)) {
      let d;
      try {
        d = Object.getOwnPropertyDescriptor(o, key);
      } catch {
        continue;
      }
      keys.set(key, d);
    }
    shape.set(o, { name, proto: Object.getPrototypeOf(o), extensible: Object.isExtensible(o), keys });
  }
  return shape;
}

function shapeChanges(before, after, out) {
  for (const [o, b] of before) {
    const a = after.get(o);
    if (b.proto !== a.proto) out.push(`the prototype of ${b.name} changed`);
    if (b.extensible !== a.extensible) out.push(`${b.name} was made ${a.extensible ? "extensible" : "non-extensible"}`);
    for (const [key, d] of a.keys) {
      if (!b.keys.has(key)) out.push(`${b.name} gained ${String(key)}`);
      else if (!same(b.keys.get(key), d)) out.push(`${b.name} changed ${String(key)}`);
    }
    for (const key of b.keys.keys()) if (!a.keys.has(key)) out.push(`${b.name} lost ${String(key)}`);
  }
}

// --- The detectors together.

// Snapshots `context` (and browser.errors, browser.caught, the requests of its
// network); check() returns what is new. What the detectors go through is the
// harness's work, not the extension's, and is not counted (harness/work.mjs).
export function watch(context) {
  return uncounted(() => watching(context));
}

function watching(context) {
  const document = context.document;
  const extension = `chrome-extension://${context.browser.id}`;
  const own = originOf(context.url || "", undefined);
  const { globals } = known(context);
  const styled = () => (document && context.styledByMarkup
    ? new Set([...document.querySelectorAll("[style]")].filter((el) => context.styledByMarkup.has(el)))
    : new Set());
  const before = {
    carriers: document ? carriers(document, own, extension) : null,
    styled: styled(),
    shape: shapeOf(context),
    errors: context.browser.errors.length,
    caught: context.browser.caught.length,
    untrusted: context.browser.untrusted.length,
    foreign: context.browser.foreign.length,
    requests: context.net ? context.net.requests.length : 0,
    forgotten: context.browser.forgotten,
    answered: context.net ? context.net.forgotten : 0,
  };
  return {
    check: () => uncounted(() => {
      const problems = [];
      // What a log gained since the snapshot: all of it, if it was forgotten
      // since (Browser.forget(), Net.forget()).
      const since = (log, n) => (context.browser.forgotten !== before.forgotten ? log : log.slice(n));
      if (document) {
        for (const [el, features] of carriers(document, own, extension)) {
          const had = before.carriers.get(el) || [];
          for (const f of features) {
            if (!had.includes(f)) problems.push(`markup that runs script, loads from elsewhere or sends the page elsewhere: ${describe(el)} (${f})`);
          }
        }
      }
      for (const el of styled()) {
        if (!before.styled.has(el)) problems.push(`an inline style that markup or setAttribute() gave, which a page's CSP without 'unsafe-inline' blocks: ${describe(el)}`);
      }
      shapeChanges(before.shape, shapeOf(context), problems);
      const now = globalsOf(context.realm);
      for (const [key, value] of globals) {
        if (!now.has(key)) problems.push(`the global object lost ${String(key)}`);
        else if (now.get(key) !== value) problems.push(`the global object's ${String(key)} was replaced`);
      }
      for (const { where, error } of since(context.browser.errors, before.errors)) problems.push(`${where}: ${printable(error)}`);
      const reported = new Set();
      for (const { where, error } of since(context.browser.caught, before.caught)) {
        if (!isSlip(error) || reported.has(error)) continue;
        reported.add(error);
        problems.push(`a slip the extension caught at ${where}: ${printable(error)}`);
      }
      for (const { where, kind, value, issue } of since(context.browser.untrusted, before.untrusted)) {
        if (issue) {
          problems.push(`a policy of Trusted Types ${issue} (${where})`);
          continue;
        }
        const shown = typeof value === "string" ? JSON.stringify(value.slice(0, 120)) : printable(value);
        problems.push(`a string passed to ${where}, which a page that requires Trusted Types refuses unless it is a Trusted${kind === "html" ? "HTML" : kind === "script" ? "Script" : "ScriptURL"}: ${shown}`);
      }
      for (const { where, url, redirected } of since(context.browser.foreign, before.foreign)) {
        problems.push(`the body of a response ${redirected ? "that a redirect brought " : ""}from ${url.slice(0, 200)}, which is not over https from an origin of the extension's host permissions, read in ${where}`);
      }
      if (context.net) {
        for (const r of (context.net.forgotten !== before.answered ? context.net.requests : context.net.requests.slice(before.requests))) {
          if (!allowedOrigin(originOf(r.url, undefined), own, extension) || /^(?:javascript|vbscript):/i.test(r.url)) {
            problems.push(`a request to ${r.url.slice(0, 200)}, outside the extension's host permissions`);
          }
        }
      }
      return problems;
    }),
  };
}

// Throws when check() found something, naming it, so a fuzz target fails on it.
export function assertClean(watcher) {
  const problems = watcher.check();
  if (problems.length) throw new Error(problems.join("\n"));
}
