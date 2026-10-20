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
//   elsewhere or sends the page elsewhere; and what the extension put into
//   them at any time before the check, though it took it out again, or made
//   in them without putting it in, where the element acts out of the
//   document (an image, a video, an audio; recorder() below):
//   - a <script> of its own text, or one whose src the harness cannot verify
//     against an integrity hash: one of sha256, sha384 or sha512 that matches
//     the file, which the harness can tell only of the extension's own files;
//     a <style>; a style sheet <link> that cannot be verified so; and a style
//     attribute that markup or setAttribute() gave an element
//     (harness/contexts.mjs), unlike one the CSSOM sets. A nonce verifies
//     nothing the extension puts in: it is the page's, to let in its own. The
//     extension can do without any of these (its content scripts' css, the
//     CSSOM, a script of the page's world that the browser runs), and what it
//     does with them, a page cannot tell from an attack. A <script> of
//     speculation rules is no script: the HTML Standard runs none of its text
//     and fetches none of its src, and what it does is have the browser load
//     pages ahead, which are looked at below as loads;
//   - an <object>, an <embed> or an <applet>; an iframe's srcdoc;
//   - an attribute of an event handler (on*), or one whose code changed;
//   - a URL attribute (href, xlink:href, action, formaction, src, data,
//     poster, background) that the WHATWG's URL parser, which is the
//     browser's, reads as javascript: or vbscript: (whatever spaces, controls,
//     tabs and newlines it holds), or, on a frame, an object, an embed or a
//     script, as data: or blob:; an SVG animation that sets a link to one;
//   - a <base>, a <meta> http-equiv, a <link> that imports or preloads script;
//   - markup that loads a resource (an image, a frame, a script, a style
//     sheet, media, a srcset's candidates, the pages that speculation rules
//     have the browser prefetch or prerender) from an origin outside the
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
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { matchesPattern } from "./chrome.mjs";
import { EXT, manifest } from "./paths.mjs";
import { isPaused, uncounted } from "./work.mjs";
import { preparedScript } from "./contexts.mjs";

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

// Whether a <script> is one of speculation rules. Such a script runs no
// script: its text is a set of rules by which the browser loads pages ahead
// of a navigation, read once, as the script starts (preparedScript() of
// harness/contexts.mjs, which follows the HTML Standard's "prepare the script
// element"), and one with a src loads nothing, the standard firing an error
// at it. One that has not started is taken for what its type attribute says
// now (stripped of ASCII whitespace, matched ASCII case-insensitively): what
// it does once it starts is looked at then.
function isSpeculationRules(el) {
  const prepared = preparedScript(el);
  if (prepared) return prepared.type === "speculationrules";
  return /^[\t\n\f\r ]*speculationrules[\t\n\f\r ]*$/i.test(el.getAttribute("type") || "");
}

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The URLs that a rule set of speculation rules has the browser prefetch or
// prerender in `doc`, as the HTML Standard reads it
// (https://html.spec.whatwg.org/multipage/speculative-loading.html): `text`,
// the script's text as it started, parsed as JSON, which must be an object,
// with no tag or one of printable ASCII ("parse a speculation rule set
// string"); and of each rule in the lists at "prefetch" and "prerender"
// (Chrome takes both), as "parse a speculation rule" reads it, against
// `base`, the document's base URL as the script started (the rule set's, and
// what relative_to "document" names), a list rule's URLs (each a string,
// those of an HTTP(S) scheme) or a document rule's links: the a and area
// elements with an href, in the document and its open shadow trees as they
// are now, whose URL is of an HTTP(S) scheme and which the rule's predicate
// matches ("parse a document rule predicate": and, or, not, href_matches of
// URL patterns, selector_matches). The standard also drops a rule for an
// eagerness, a referrer policy, a tag, a requirement, a No-Vary-Search hint or
// a target hint that it does not take; this reading keeps such a rule, so that
// it says more loads than the browser makes, never fewer.
function speculationLoads({ text, base }, doc) {
  let set;
  try {
    set = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isMap(set) || (Object.hasOwn(set, "tag") && !(typeof set.tag === "string" && /^[\x20-\x7e]*$/.test(set.tag)))) return [];
  const loads = [];
  for (const type of ["prefetch", "prerender"]) {
    if (!Object.hasOwn(set, type) || !Array.isArray(set[type])) continue;
    for (const rule of set[type]) loads.push(...ruleLoads(rule, doc, base));
  }
  return loads;
}

// The URLs that the rule sets of the scripts of speculation rules in
// `document` have the browser prefetch or prerender, of any origin, as
// speculationLoads() reads them: what a test looks at.
export function speculativeLoads(document) {
  return [...document.querySelectorAll("script")].flatMap((el) => {
    const prepared = preparedScript(el);
    return prepared && prepared.rules ? speculationLoads(prepared.rules, document) : [];
  });
}

const RULE_KEYS = new Set(["source", "urls", "where", "relative_to", "eagerness", "referrer_policy", "tag", "requires", "expects_no_vary_search", "target_hint"]);

function ruleLoads(rule, doc, base) {
  if (!isMap(rule) || Object.keys(rule).some((k) => !RULE_KEYS.has(k))) return [];
  const has = (k) => Object.hasOwn(rule, k);
  const source = has("source") ? rule.source : has("urls") && !has("where") ? "list" : has("where") && !has("urls") ? "document" : null;
  if (source === "list") {
    if (has("where")) return [];
    if (has("relative_to") && rule.relative_to !== "ruleset" && rule.relative_to !== "document") return [];
    if (!Array.isArray(rule.urls) || rule.urls.some((u) => typeof u !== "string")) return [];
    return rule.urls.map((u) => urlOf(u, base)).filter((u) => u && /^https?:$/.test(u.protocol)).map((u) => u.href);
  }
  if (source === "document") {
    if (has("urls") || has("relative_to")) return [];
    const predicate = has("where") ? predicateOf(rule.where, doc, base) : { and: [] };
    if (predicate === null) return [];
    return linksOf(doc).filter((a) => matchesPredicate(predicate, a.element)).map((a) => a.url.href);
  }
  return [];
}

const PREDICATES = ["and", "or", "not", "href_matches", "selector_matches"];
const PATTERN_KEYS = ["protocol", "username", "password", "hostname", "port", "pathname", "search", "hash", "baseURL"];

// A document rule's predicate, or null where the standard drops the rule.
function predicateOf(input, doc, base) {
  if (!isMap(input)) return null;
  const kinds = PREDICATES.filter((k) => Object.hasOwn(input, k));
  if (kinds.length !== 1) return null;
  const [kind] = kinds;
  const keys = Object.keys(input);
  if (kind === "and" || kind === "or") {
    if (keys.length !== 1 || !Array.isArray(input[kind])) return null;
    const clauses = input[kind].map((c) => predicateOf(c, doc, base));
    return clauses.includes(null) ? null : { [kind]: clauses };
  }
  if (kind === "not") {
    if (keys.length !== 1) return null;
    const clause = predicateOf(input.not, doc, base);
    return clause && { not: clause };
  }
  if (kind === "href_matches") {
    if (keys.some((k) => k !== "href_matches" && k !== "relative_to")) return null;
    if (Object.hasOwn(input, "relative_to") && input.relative_to !== "ruleset" && input.relative_to !== "document") return null;
    const patterns = [];
    for (const raw of Array.isArray(input.href_matches) ? input.href_matches : [input.href_matches]) {
      try {
        if (typeof raw === "string") patterns.push(new URLPattern(raw, base));
        else if (isMap(raw) && Object.entries(raw).every(([k, v]) => PATTERN_KEYS.includes(k) && typeof v === "string")) patterns.push(new URLPattern({ baseURL: base, ...raw }));
        else return null;
      } catch {
        return null;
      }
    }
    return { href: patterns };
  }
  if (keys.length !== 1) return null;
  const selectors = Array.isArray(input.selector_matches) ? input.selector_matches : [input.selector_matches];
  if (selectors.some((s) => typeof s !== "string")) return null;
  for (const s of selectors) {
    try {
      doc.createDocumentFragment().querySelector(s);
    } catch {
      return null;
    }
  }
  return { selectors };
}

function matchesPredicate(p, el) {
  if (p.and) return p.and.every((c) => matchesPredicate(c, el));
  if (p.or) return p.or.some((c) => matchesPredicate(c, el));
  if (p.not) return !matchesPredicate(p.not, el);
  if (p.href) return p.href.some((pattern) => pattern.test(linkURL(el).href));
  return p.selectors.some((s) => el.matches(s));
}

const linkURL = (el) => urlOf(el.getAttribute("href"), el.ownerDocument.baseURI);

// The links a document rule may load: the a and area elements of the HTML
// namespace with an href, in the document and its open shadow trees, whose
// URL is of an HTTP(S) scheme. jsdom renders nothing: every one is taken for
// one being rendered.
function linksOf(doc) {
  const out = [];
  const visit = (root) => {
    for (const element of root.querySelectorAll("*")) {
      if ((element.localName === "a" || element.localName === "area") && element.namespaceURI === "http://www.w3.org/1999/xhtml" && element.hasAttribute("href")) {
        const url = linkURL(element);
        if (url && /^https?:$/.test(url.protocol)) out.push({ element, url });
      }
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(doc);
  return out;
}

// A value in a description: the start of it, escaped to one line, and a
// hash of all of it, by which descriptions are told apart.
const shown = (v) => `${JSON.stringify(String(v).slice(0, 80))}#${createHash("sha256").update(String(v)).digest("base64").slice(0, 12)}`;

// Whether featuresOf() looks at an attribute of this name (lowercased), by
// itself: what the recorder below keeps of each value it is given.
const telling = (name) => name.startsWith("on") || name === "srcdoc" || name === "srcset" || name === "imagesrcset" || FOLLOWED.includes(name) || LOADED.includes(name);

// What the attribute `name` (lowercased) of value `value` makes an element of
// tag `tag` do (featuresOf()); `rules` for a script of speculation rules.
function attributeFeatures(tag, name, value, base, own, extension, rules) {
  const features = [];
  if (name.startsWith("on")) return [`${name}=${shown(value)}`];
  if (rules && name === "src") return features; // fetched by nothing (featuresOf())
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
  return features;
}

// What makes `el` run script, load from elsewhere or send the page
// elsewhere: short descriptions, the same as long as that does not change
// (see the top of this file).
function featuresOf(el, base, own, extension) {
  const features = [];
  const tag = el.localName;
  const attr = (name) => el.getAttribute(name);
  // A script of speculation rules runs no script and fetches no src: what it
  // does is have the browser load pages, which are looked at as a load is.
  const rules = tag === "script" && isSpeculationRules(el);
  const set = rules ? preparedScript(el)?.rules : null;
  if (set) {
    for (const url of speculationLoads(set, el.ownerDocument)) if (!allowedOrigin(originOf(url, base), own, extension)) features.push(`speculation rules that load ${shown(url)}`);
  }
  if (tag === "script" && !rules) {
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
  for (const a of el.attributes) features.push(...attributeFeatures(tag, a.name.toLowerCase(), a.value, base, own, extension, rules));
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

// --- What the extension does to the elements of a watched page.
//
// The document at the check, compared with the snapshot, does not show markup
// that the extension puts in and takes out again before the check, nor markup
// it makes in the page's document without ever putting it in. A browser acts
// on both: a <script> runs as it is put in, though it be taken out after
// (the HTML Standard's "prepare the script element"), and an <img> loads its
// image and runs the handlers of its load and its error from the moment its
// src is set, in the document or not ("update the image data"), as a media
// element runs its load algorithm as its src is set; so that innerHTML of a
// <div> never put in the page runs an onerror that the markup holds. So the
// elements that the extension's code (not the harness's: uncounted()) puts
// into a watched document (jsdom's insertion, _insert()), or gives an
// attribute while they are in it (_attributeChangeSteps()), are kept, and so
// are those it gives an attribute out of the document that act out of it (an
// image, a video, an audio), with each value they were given of an attribute
// that featuresOf() looks at; at the check, what they did (recorder()'s
// said()) is reported with what the document holds then. Keeping, not
// looking, while the input runs keeps the watch from slowing the fuzzing:
// an element is looked at once, however often it is touched.
const jsdomRequire = createRequire(import.meta.url);
const NodeImpl = jsdomRequire("jsdom/lib/jsdom/living/nodes/Node-impl.js").implementation;
const ElementImpl = jsdomRequire("jsdom/lib/jsdom/living/nodes/Element-impl.js").implementation;
const idlUtils = jsdomRequire("jsdom/lib/generated/idl/utils.js");
const ACTING_OUT_OF_DOCUMENT = new Set(["img", "video", "audio"]);
const recorders = new WeakMap(); // a document's impl → what the watch on it keeps (recorder())
const documentOf = (impl) => (impl.nodeType === 9 ? impl : impl._ownerDocument);

const insertNode = NodeImpl.prototype._insert;
NodeImpl.prototype._insert = function (nodeImpl, ...rest) {
  const kept = isPaused() ? undefined : recorders.get(documentOf(this));
  // A fragment's children move out of it as it is put in.
  const nodes = kept ? (nodeImpl.nodeType === 11 ? [...nodeImpl._children()] : [nodeImpl]) : null;
  const out = Reflect.apply(insertNode, this, [nodeImpl, ...rest]);
  if (nodes && this.isConnected) uncounted(() => { for (const n of nodes) kept.inserted(n); });
  return out;
};
const changeAttribute = ElementImpl.prototype._attributeChangeSteps;
ElementImpl.prototype._attributeChangeSteps = function (localName, oldValue, value, namespace) {
  const out = Reflect.apply(changeAttribute, this, [localName, oldValue, value, namespace]);
  const kept = isPaused() ? undefined : recorders.get(documentOf(this));
  if (kept) uncounted(() => kept.changed(this, localName, value, namespace));
  return out;
};

// What a watch keeps of the elements the extension touches: those it put into
// the document (inserted()), with every value it gave there an attribute that
// featuresOf() looks at (changed()), and the images, videos and audios it
// gave an attribute out of the document. What they did, said() says at the
// check, once: featuresOf() of each that is no longer in the document as it
// was found (`found`, from carriers()), and of every value it kept.
function recorder(own, extension) {
  const touched = new Set();
  const values = new Map(); // an element → the [name, value] it was given, of the names telling() takes
  const watched = {
    inserted(impl) {
      for (const d of impl._shadowIncludingInclusiveDescendants()) {
        if (d.nodeType !== 1) continue;
        const el = idlUtils.wrapperForImpl(d);
        if (el) touched.add(el);
        // A frame put in: its document is watched too.
        if (el && (d._localName === "iframe" || d._localName === "frame")) {
          let inner;
          try {
            inner = el.contentDocument;
          } catch {
            inner = null;
          }
          if (inner) watchDocument(inner, watched);
        }
      }
    },
    changed(impl, localName, value, namespace) {
      const el = idlUtils.wrapperForImpl(impl);
      if (!el || (!impl.isConnected && !(el.namespaceURI === "http://www.w3.org/1999/xhtml" && ACTING_OUT_OF_DOCUMENT.has(el.localName)))) return;
      touched.add(el);
      if (value === null) return;
      const attribute = impl._attributeList.find((a) => a._localName === localName && a._namespace === namespace);
      const name = attribute ? attribute._qualifiedName.toLowerCase() : localName;
      if (!telling(name)) return;
      if (!values.has(el)) values.set(el, []);
      values.get(el).push([name, value]);
    },
    said(found) {
      const out = new Map();
      const add = (el, features) => {
        if (!features.length) return;
        if (!out.has(el)) out.set(el, new Set());
        for (const f of features) out.get(el).add(f);
      };
      for (const el of touched) {
        const base = el.ownerDocument.baseURI;
        if (found.has(el)) add(el, found.get(el));
        else if (!(el.isConnected && el.getRootNode() === el.ownerDocument)) add(el, featuresOf(el, base, own, extension));
        const rules = el.localName === "script" && isSpeculationRules(el);
        for (const [name, value] of values.get(el) || []) add(el, attributeFeatures(el.localName, name, value, base, own, extension, rules));
      }
      return out;
    },
  };
  return watched;
}

// Has `kept` keep what the extension does to `document` and the documents of
// its frames.
function watchDocument(document, kept) {
  recorders.set(idlUtils.implForWrapper(document), kept);
  for (const frame of document.querySelectorAll("iframe, frame")) {
    let inner;
    try {
      inner = frame.contentDocument;
    } catch {
      inner = null;
    }
    if (inner) watchDocument(inner, kept);
  }
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
  const kept = recorder(own, extension);
  if (document) watchDocument(document, kept);
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
        // What the document holds now, and what the elements the extension
        // touched said as it touched them (recorder()).
        const found = carriers(document, own, extension);
        for (const [el, said] of kept.said(found)) found.set(el, [...new Set([...(found.get(el) || []), ...said])]);
        for (const [el, features] of found) {
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
