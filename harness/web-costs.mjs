// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// What the web APIs the extension calls cost, read off the steps of their
// standards as harness/costs.mjs says (the DOM, HTML, CSSOM, CSSOM View,
// Selectors, URL, Encoding, Web Storage and Web Crypto standards): a rule for
// every member of a web interface that the extension's code names, which
// tests/costs.test.mjs checks.
//
// The DOM's steps go through the tree, so the rules measure it as the steps
// go: a query of selectors goes through the subtree in tree order, matching
// each element by what of it the selectors test (its name, its classes, its
// attributes and their values), and walks up from an element its subject
// matched when a selector has a combinator; getElementById goes through the
// subtree until it finds the element; a live collection (children,
// getElementsByTagName(), options) is the view of its root's subtree that its
// filter keeps, gone through anew each time it is read; an insertion or a
// removal goes through the nodes it moves and queues a record for the
// observers of the parent's ancestors; dispatching an event goes up the path,
// through the listeners of each node on it. Where the standard leaves the
// steps to the engine, Chrome's: a selector is matched from its subject, and
// reading an element's layout lays the document out again when the tree has
// changed since.
//
// A rule is a function of (this, the arguments, the result), or, where the
// steps depend on the tree as it was before the call, { before(this, the
// arguments), after(this, the arguments, the result, what before gave) }.
// null marks a member whose steps do not grow.

import { log2, searchSteps, stringUnits, units } from "./costs.mjs";

// --- The tree, measured.

const ELEMENT = 1;
const DOCUMENT = 9;
const FRAGMENT = 11;

// The nodes of the subtree of `root`, itself included, in tree order, each
// with its depth below `root`.
function* inTreeOrder(root) {
  if (!root || typeof root.firstChild === "undefined") return;
  let node = root;
  let depth = 0;
  for (;;) {
    yield [node, depth];
    if (node.firstChild) {
      node = node.firstChild;
      depth++;
      continue;
    }
    while (node !== root && !node.nextSibling) {
      node = node.parentNode;
      depth--;
    }
    if (node === root) return;
    node = node.nextSibling;
  }
}

export function subtreeSize(root) {
  let n = 0;
  for (const it = inTreeOrder(root); !it.next().done;) n++;
  return n;
}

export function depthOf(node) {
  let n = 0;
  for (let p = node && node.parentNode; p; p = p.parentNode) n++;
  return n;
}

function childCount(node) {
  let n = 0;
  for (let c = node && node.firstChild; c; c = c.nextSibling) n++;
  return n;
}

// How many nodes of `root`'s subtree a search in tree order goes through to
// reach `target`, or all of them when it is not there.
function reach(root, target) {
  let n = 0;
  for (const [node] of inTreeOrder(root)) {
    n++;
    if (node === target) return n;
  }
  return n;
}

function maxDepth(root) {
  let d = 0;
  for (const [, depth] of inTreeOrder(root)) if (depth > d) d = depth;
  return d;
}

const isNode = (x) => x !== null && typeof x === "object" && typeof x.nodeType === "number";

// What an insertion of `node` goes through: its inclusive descendants (the
// children of a fragment).
function moving(node) {
  if (!isNode(node)) return stringUnits(node); // a string becomes a text node of it
  if (node.nodeType === FRAGMENT) {
    let n = 0;
    for (let c = node.firstChild; c; c = c.nextSibling) n += subtreeSize(c);
    return n;
  }
  return subtreeSize(node) + (node.parentNode ? depthOf(node.parentNode) : 0); // taken out of where it was first
}

// --- Layout. CSSOM View leaves layout to the engine; Chrome lays the
// document out again, all of it at worst, when something that reads layout
// comes after the tree changed.

const changed = new WeakSet();
const documentOf = (node) => (node && node.nodeType === DOCUMENT ? node : node && node.ownerDocument);
function touched(node) {
  const d = documentOf(node);
  if (d) changed.add(d);
}
function layout(node) {
  const d = documentOf(node);
  if (!d || !changed.has(d)) return 0;
  changed.delete(d);
  return subtreeSize(d);
}

// A change of the tree under `parent`: a record queued for the observers of
// its inclusive ancestors, and a layout to do again.
function mutated(parent) {
  touched(parent);
  return 1 + depthOf(parent);
}

// --- Selectors (Selectors 4; DOM's "scope-match a selectors string"). A query
// parses its selectors, then goes through the subtree in tree order and
// matches each element. Selectors leaves the steps of matching to the engine;
// Chrome's matches a complex selector from its subject, the compound on its
// right, and walks up the ancestors for the compounds on the left only when
// the subject matched. A simple selector goes through what of the element it
// tests: a type compares the element's name, and an ID its ID; a class goes
// through the element's classes; an attribute selector goes through the
// element's attributes for the one it names, then compares its value whole
// (=), at its start or end (^=, $=, |=), word by word (~=), or at each place
// it may be found (*=, as a string search costs, harness/costs.mjs). Every
// simple selector of a compound and every selector of a list is counted, as
// when the last of them decides.
//
// The costs know the selectors the extension's selectors are made of: types,
// IDs, classes, attribute selectors, :scope, the descendant and the child
// combinator, and lists of them; and :not() of a list of them, which matches
// an element that none of the list matches, each of them matched against it.
// Any other kind throws, so that none goes uncounted; tests/costs.test.mjs
// parses every selector of the extension's code.

const WHITE = /[ \t\n\r\f]/;
const parsedSelectors = new Map();

// `text` parsed: its complex selectors, each its compounds from left to right
// (each a list of simple selectors) and the combinators between them (" " or
// ">").
export function parseSelectors(text) {
  const s = String(text);
  if (parsedSelectors.has(s)) return parsedSelectors.get(s);
  let i = 0;
  const fail = (what) => {
    throw new SyntaxError(`the costs know no selectors with ${what}: ${JSON.stringify(s)}`);
  };
  const skipWhite = () => {
    while (i < s.length && WHITE.test(s[i])) i++;
  };
  const inName = (c) => c !== undefined && (/[\w-]/.test(c) || c.charCodeAt(0) >= 0x80 || c === "\\");
  // An escape: up to six hex digits and a white space after them, or the
  // character after the backslash.
  const escape = () => {
    i++;
    let hex = "";
    while (hex.length < 6 && i < s.length && /[\da-f]/i.test(s[i])) hex += s[i++];
    if (!hex) {
      if (i >= s.length) fail("an escape at the end");
      return s[i++];
    }
    if (i < s.length && WHITE.test(s[i])) i++;
    const c = parseInt(hex, 16);
    return String.fromCodePoint(c > 0 && c <= 0x10ffff && (c < 0xd800 || c > 0xdfff) ? c : 0xfffd);
  };
  const name = () => {
    let out = "";
    while (inName(s[i])) out += s[i] === "\\" ? escape() : s[i++];
    if (!out) fail(`no name at ${i}`);
    return out;
  };
  const quoted = () => {
    const quote = s[i++];
    let out = "";
    while (i < s.length && s[i] !== quote) out += s[i] === "\\" ? escape() : s[i++];
    if (i >= s.length) fail("a string that does not close");
    i++;
    return out;
  };
  const attribute = () => {
    i++;
    skipWhite();
    const a = { kind: "attribute", name: name(), op: null, value: null, caseless: false };
    skipWhite();
    if (s[i] !== "]") {
      const op = /^[~|^$*]?=/.exec(s.slice(i, i + 2));
      if (!op) fail(`no operator at ${i}`);
      a.op = op[0];
      i += op[0].length;
      skipWhite();
      a.value = s[i] === '"' || s[i] === "'" ? quoted() : name();
      skipWhite();
      if (/[is]/i.test(s[i] || "") && !inName(s[i + 1])) {
        a.caseless = s[i] === "i" || s[i] === "I";
        i++;
        skipWhite();
      }
    }
    if (s[i] !== "]") fail(`no ] at ${i}`);
    i++;
    return a;
  };
  const compound = () => {
    const simples = [];
    if (s[i] === "*") {
      i++;
      simples.push({ kind: "universal" });
    } else if (inName(s[i])) simples.push({ kind: "type", name: name() });
    for (;;) {
      if (s[i] === "#" || s[i] === ".") {
        const kind = s[i++] === "#" ? "id" : "class";
        simples.push({ kind, name: name() });
      } else if (s[i] === "[") simples.push(attribute());
      else if (s[i] === ":") {
        i++;
        if (s[i] === ":") fail("a pseudo-element");
        const pseudo = name().toLowerCase();
        if (pseudo === "not" && s[i] === "(") {
          i++;
          const list = complexList(")");
          if (s[i] !== ")") fail(`no ) at ${i}`);
          i++;
          simples.push({ kind: "not", list });
        } else if (pseudo === "scope" && s[i] !== "(") simples.push({ kind: "scope" });
        else fail(`:${pseudo}`);
      } else break;
    }
    if (simples.length === 0) fail(`no selector at ${i}`);
    return simples;
  };
  // Complex selectors separated by commas, up to `close` (the ) of :not())
  // or the end.
  function complexList(close) {
    const list = [];
    skipWhite();
    for (;;) {
      const complex = { compounds: [compound()], combinators: [] };
      for (;;) {
        const from = i;
        skipWhite();
        if (i >= s.length || s[i] === "," || s[i] === close) break;
        if (s[i] === ">") {
          i++;
          skipWhite();
          complex.combinators.push(">");
        } else if (s[i] === "+" || s[i] === "~") fail(`the combinator ${s[i]}`);
        else if (i > from) complex.combinators.push(" ");
        else fail(`${JSON.stringify(s[i])} at ${i}`);
        complex.compounds.push(compound());
      }
      list.push(complex);
      if (i >= s.length || s[i] === close) break;
      i++; // the comma
      skipWhite();
    }
    return list;
  }
  const list = complexList(undefined);
  if (i < s.length) fail(`${JSON.stringify(s[i])} at ${i}`);
  parsedSelectors.set(s, list);
  return list;
}

const lower = (x) => String(x).toLowerCase();
const attributeOf = (el, name) => (typeof el.getAttribute === "function" ? el.getAttribute(name) : null);

// What matching `simple` against `el` (with `scope` its scoping root) goes
// through.
function simpleSteps(simple, el, scope) {
  if (simple.kind === "universal" || simple.kind === "scope") return 1;
  if (simple.kind === "not") return 1 + elementSteps(simple.list, el, scope);
  if (simple.kind === "type" || simple.kind === "id") return 1 + simple.name.length;
  if (simple.kind === "class") return 1 + (el.classList ? el.classList.length : 0) * (1 + simple.name.length);
  const found = 1 + attributeCount(el) * (1 + simple.name.length);
  const value = simple.op === null ? null : attributeOf(el, simple.name);
  if (value === null) return found;
  const v = simple.value;
  if (simple.op === "=") return found + 1 + Math.min(value.length, v.length);
  if (simple.op === "~=") return found + 1 + 2 * value.length; // split into words, each compared
  if (simple.op !== "*=") return found + 1 + v.length; // ^=, $=, |=
  if (v.length === 0) return found + 1; // matches nothing
  const at = simple.caseless ? lower(value).indexOf(lower(v)) : value.indexOf(v);
  return found + searchSteps(value, v, 0, at);
}

const compoundSteps = (simples, el, scope) => simples.reduce((n, simple) => n + simpleSteps(simple, el, scope), 0);

// Whether `el` may match the compound `simples` (with `scope` its scoping
// root): false only when it does not, so that the walk counted after a
// subject is never less than Chrome's. Names and values are compared without
// case, which matches whatever case a document or a selector ignores.
function mayMatch(simples, el, scope) {
  return simples.every((simple) => {
    if (simple.kind === "universal" || simple.kind === "not") return true; // :not() may match: what is walked for it is not less
    if (simple.kind === "scope") return el === scope || el === (documentOf(scope) || {}).documentElement;
    if (simple.kind === "type") return lower(el.localName) === lower(simple.name);
    if (simple.kind === "id") return lower(attributeOf(el, "id") ?? "") === lower(simple.name);
    if (simple.kind === "class") return lower(attributeOf(el, "class") ?? "").split(/[ \t\n\r\f]+/).includes(lower(simple.name));
    const value = attributeOf(el, simple.name);
    if (value === null) return false;
    if (simple.op === null) return true;
    const a = lower(value);
    const v = lower(simple.value);
    if (simple.op === "=") return a === v;
    if (simple.op === "~=") return a.split(/[ \t\n\r\f]+/).includes(v);
    if (simple.op === "|=") return a === v || a.startsWith(`${v}-`);
    if (v === "") return false;
    return simple.op === "^=" ? a.startsWith(v) : simple.op === "$=" ? a.endsWith(v) : a.includes(v);
  });
}

// What matching `complex` against `el` goes through: its subject, then, if
// the subject may match, each compound on the left against the ancestors it
// may be matched with: the one at its distance up a chain of child
// combinators, and, past a descendant combinator, every ancestor above.
function complexSteps({ compounds, combinators }, el, scope) {
  const last = compounds.length - 1;
  let n = compoundSteps(compounds[last], el, scope);
  if (last === 0 || !mayMatch(compounds[last], el, scope)) return n;
  let at = el;
  let above = false;
  for (let j = last - 1; j >= 0; j--) {
    if (combinators[j] === " ") above = true;
    if (above) {
      for (let a = at.parentNode; a && a.nodeType === ELEMENT; a = a.parentNode) n += compoundSteps(compounds[j], a, scope);
    } else {
      at = at.parentNode;
      if (!at || at.nodeType !== ELEMENT) break;
      n += compoundSteps(compounds[j], at, scope);
    }
  }
  return n;
}

const elementSteps = (list, el, scope) => list.reduce((n, complex) => n + complexSteps(complex, el, scope), 0);

function queryAll(root, selectors) {
  const list = parseSelectors(selectors);
  let n = String(selectors).length; // parsing the selectors
  for (const [node] of inTreeOrder(root)) if (node.nodeType === ELEMENT) n += elementSteps(list, node, root);
  return n;
}

function queryFirst(root, selectors, found) {
  const list = parseSelectors(selectors);
  let n = String(selectors).length;
  for (const [node] of inTreeOrder(root)) {
    if (node.nodeType === ELEMENT) n += elementSteps(list, node, root);
    if (node === found) break;
  }
  return n;
}

// --- What the steps of members keep track of: event listeners, mutation
// observers, the elements that token lists, declarations and data maps are of,
// and the views of live collections.

const listenerCounts = new WeakMap();
const listening = (target) => listenerCounts.get(target) || 0;
const registrations = new WeakMap(); // a node: how many observers registered on it
const observedNodes = new WeakMap(); // an observer: the nodes it observes
export const ownerOf = new WeakMap(); // a DOMTokenList, CSSStyleDeclaration or DOMStringMap: its element
export const viewOf = new WeakMap(); // a live collection: () => the nodes its view goes through

// The nodes a live collection's view goes through: the children of its root
// for one of children, else its root's subtree.
export function liveView(collection, root, childrenOnly) {
  viewOf.set(collection, () => (childrenOnly ? childCount(root) : subtreeSize(root)));
  return collection;
}

// --- Attributes. Changing an attribute finds it in the element's attribute
// list, stores the value (parsed, for one that is a token list, a style or a
// URL) and queues a record for the observers of the element's ancestors.

const attributeCount = (el) => (el && el.attributes ? el.attributes.length : 0);
const attributeSet = (el, value) => attributeCount(el) + units(value) + mutated(el);
const reflectGet = null; // the content attribute's value, read as it is
const reflectSet = (el, [value]) => attributeSet(el, value);
const urlGet = (el, args, r) => units(r) + units(el && el.baseURI); // the attribute parsed as a URL against the base
const textOf = (el, args, r) => subtreeSize(el) + units(r); // a text content gone through

// The members of HTML and SVG elements that reflect a content attribute.
const REFLECTED = new Set(["action", "alt", "autocomplete", "background", "className", "default", "disabled", "headers", "height", "hidden", "id", "kind",
  "label", "max", "min", "name", "placeholder", "rel", "rows", "size", "src", "tabIndex", "target", "type", "value", "version", "width", "open", "href",
  "content", "title", "code"]);
const URLS = new Set(["action", "href", "src"]);

// --- The rules, by interface and member.

const optionsView = (select) => subtreeSize(select);
const NOTHING = null;

// The select element whose list of options `option` is in (HTML): its
// parent, or its optgroup's parent; none when it is in no such list.
function selectOf(option) {
  const p = option && option.parentNode;
  if (!p || p.nodeType !== ELEMENT) return null;
  if (p.localName === "select") return p;
  const s = p.localName === "optgroup" ? p.parentNode : null;
  return s && s.nodeType === ELEMENT && s.localName === "select" ? s : null;
}

export const WEB = {
  // The tree (DOM).
  "Node.prototype.appendChild": { before: (self, [node]) => moving(node), after: (self) => mutated(self) },
  "Node.prototype.insertBefore": { before: (self, [node]) => moving(node), after: (self) => mutated(self) },
  "Node.prototype.removeChild": { before: (self, [node]) => (isNode(node) ? subtreeSize(node) : 0), after: (self) => mutated(self) },
  "Node.prototype.cloneNode": (self, [deep], r) => (deep ? subtreeSize(r) : 1),
  "Node.prototype.contains": (self, [other]) => depthOf(other),
  "Node.prototype.textContent (get)": textOf,
  "Node.prototype.textContent (set)": { before: (self) => subtreeSize(self), after: (self, [value]) => units(value) + mutated(self) },
  "Node.prototype.nodeValue (set)": { before: (self) => units(self.nodeValue), after: (self, [value]) => units(value) + mutated(self) },
  "CharacterData.prototype.data (set)": { before: (self) => units(self.data), after: (self, [value]) => units(value) + mutated(self) },
  "CharacterData.prototype.remove": { before: (self) => 1, after: (self, a, r, b) => mutated(self.parentNode || self) },
  "DocumentType.prototype.remove": { before: (self) => 1, after: (self) => mutated(self) },
  "Element.prototype.remove": { before: (self) => subtreeSize(self) + depthOf(self), after: (self) => (touched(self), 0) },
  ...Object.fromEntries(["Element", "Document", "DocumentFragment"].flatMap((i) => [
    [`${i}.prototype.append`, { before: (self, nodes) => nodes.reduce((n, x) => n + moving(x), 0), after: (self) => mutated(self) }],
    [`${i}.prototype.querySelector`, (self, [s], r) => queryFirst(self, s, r)],
    [`${i}.prototype.querySelectorAll`, (self, [s]) => queryAll(self, s)],
    [`${i}.prototype.children (get)`, (self, a, r) => (liveView(r, self, true), 0)],
    [`${i}.prototype.getElementsByTagName`, (self, [name], r) => (liveView(r, self, false), units(name))],
  ])),
  // The element and its ancestors, matched up to the one found (DOM: the
  // scoping root is the element).
  "Element.prototype.closest": (self, [s], r) => {
    const list = parseSelectors(s);
    let n = String(s).length;
    for (let e = self; e && e.nodeType === ELEMENT; e = e.parentNode) {
      n += elementSteps(list, e, self);
      if (e === r) break;
    }
    return n;
  },
  "Element.prototype.matches": (self, [s]) => String(s).length + elementSteps(parseSelectors(s), self, self),
  "Element.prototype.insertAdjacentElement": { before: (self, [, el]) => moving(el), after: (self) => mutated(self.parentNode || self) },
  "Element.prototype.innerHTML (get)": textOf,
  "Element.prototype.innerHTML (set)": { before: (self) => subtreeSize(self), after: (self, [html]) => units(html) * (1 + maxDepth(self)) + subtreeSize(self) + mutated(self) },
  "ShadowRoot.prototype.innerHTML (get)": textOf,
  "ShadowRoot.prototype.host (get)": NOTHING, // the element it is attached to
  "ShadowRoot.prototype.innerHTML (set)": { before: (self) => subtreeSize(self), after: (self, [html]) => units(html) * (1 + maxDepth(self)) + subtreeSize(self) + mutated(self) },
  "Element.prototype.getAttribute": (self, [name]) => attributeCount(self) * (1 + stringUnits(name)),
  "Element.prototype.setAttribute": (self, [name, value]) => attributeCount(self) * (1 + stringUnits(name)) + units(value) + mutated(self),
  "Element.prototype.classList (get)": (self, a, r) => (ownerOf.set(r, self), 0),
  "Element.prototype.getBoundingClientRect": (self) => layout(self),
  "Element.prototype.id (get)": NOTHING,
  "Element.prototype.id (set)": reflectSet,
  "Element.prototype.className (get)": NOTHING,
  "Element.prototype.className (set)": reflectSet,
  "Element.prototype.tagName (get)": NOTHING,
  "Node.prototype.nodeType (get)": NOTHING,
  "Node.prototype.nodeValue (get)": NOTHING,
  "Node.prototype.parentNode (get)": NOTHING,
  "Node.prototype.parentElement (get)": NOTHING,
  "Node.prototype.firstChild (get)": NOTHING,
  "Node.prototype.lastChild (get)": NOTHING,
  "Node.prototype.nextSibling (get)": NOTHING,
  "Document.prototype.getElementById": (self, [id], r) => reach(self, r) * (1 + stringUnits(id)),
  "DocumentFragment.prototype.getElementById": (self, [id], r) => reach(self, r) * (1 + stringUnits(id)),
  "SVGSVGElement.prototype.getElementById": (self, [id], r) => reach(self, r) * (1 + stringUnits(id)),
  "Document.prototype.createElement": (self, [name]) => units(name),
  "Document.prototype.createTextNode": NOTHING,
  "Document.prototype.createDocumentFragment": NOTHING,
  "Document.prototype.createTreeWalker": NOTHING,
  "Document.prototype.body (get)": (self) => childCount(self.documentElement),
  "Document.prototype.body (set)": { before: (self, [body]) => childCount(self.documentElement) + moving(body), after: (self) => mutated(self) },
  "Document.prototype.head (get)": (self) => childCount(self.documentElement),
  "Document.prototype.documentElement (get)": (self) => childCount(self),
  "Document.prototype.title (get)": (self, a, r) => subtreeSize(self) + units(r),
  "Document.prototype.title (set)": (self, [v]) => subtreeSize(self) + units(v) + mutated(self),
  "Document.prototype.open": (self) => subtreeSize(self),
  // write() puts its markup into the parser at the insertion point.
  "Document.prototype.write": (self, args) => args.reduce((n, a) => n + units(String(a)), 0) * (1 + maxDepth(self)) + mutated(self),
  "Document.prototype.close": NOTHING,
  "Document.prototype.hidden (get)": NOTHING,
  "Document.prototype.visibilityState (get)": NOTHING,
  "TreeWalker.prototype.nextNode": { before: (self) => self.currentNode, after: (self, a, r, from) => (r ? reach(self.root, r) - reach(self.root, from) : subtreeSize(self.root)) },
  "TreeWalker.prototype.firstChild": (self) => childCount(self.currentNode),
  "TreeWalker.prototype.lastChild": (self) => childCount(self.currentNode),
  "TreeWalker.prototype.nextSibling": (self) => childCount(self.currentNode && self.currentNode.parentNode),
  "TreeWalker.prototype.parentNode": (self) => depthOf(self.currentNode),
  "TreeWalker.prototype.filter (get)": NOTHING,
  "NodeIterator.prototype.nextNode": { before: (self) => self.referenceNode, after: (self, a, r, from) => (r ? reach(self.root, r) - reach(self.root, from) : subtreeSize(self.root)) },
  "NodeIterator.prototype.filter (get)": NOTHING,
  "NodeIterator.prototype.detach": NOTHING,
  "Range.prototype.detach": NOTHING,
  "Range.prototype.toString": (self, a, r) => units(r) + (self.commonAncestorContainer ? subtreeSize(self.commonAncestorContainer) : 0),
  "Selection.prototype.toString": (self, a, r) => units(r) + (self.rangeCount && self.getRangeAt(0).commonAncestorContainer ? subtreeSize(self.getRangeAt(0).commonAncestorContainer) : 0),
  "MutationRecord.prototype.target (get)": NOTHING,
  "MutationRecord.prototype.nextSibling (get)": NOTHING,
  "NamedNodeMap.prototype.length (get)": NOTHING,
  "Attr.prototype.name (get)": NOTHING,
  "Attr.prototype.value (get)": NOTHING,
  "Attr.prototype.value (set)": (self, [v]) => attributeSet(self.ownerElement, v),
  "DocumentType.prototype.name (get)": NOTHING,
  "ProcessingInstruction.prototype.target (get)": NOTHING,
  "CharacterData.prototype.data (get)": NOTHING,
  "CharacterData.prototype.length (get)": NOTHING,

  // Live collections: the view, gone through for each read of it.
  "HTMLCollection.prototype.length (get)": (self) => (viewOf.has(self) ? viewOf.get(self)() : 0),
  "HTMLCollection.prototype.item": (self) => (viewOf.has(self) ? viewOf.get(self)() : 0),
  "HTMLCollection.prototype.namedItem": (self, [name]) => (viewOf.has(self) ? viewOf.get(self)() : 0) * (1 + stringUnits(name)),
  "NodeList.prototype.length (get)": (self) => (viewOf.has(self) ? viewOf.get(self)() : 0),
  "NodeList.prototype.item": (self) => (viewOf.has(self) ? viewOf.get(self)() : 0),
  "NodeList.prototype.forEach": NOTHING, // Array.prototype.forEach, whose reads of the list are counted
  "NodeList.prototype.keys": NOTHING,
  "NodeList.prototype.values": NOTHING,
  "NodeList.prototype.entries": NOTHING,
  "HTMLOptionsCollection.prototype.length (get)": (self) => (viewOf.has(self) ? viewOf.get(self)() : 0),
  "HTMLOptionsCollection.prototype.length (set)": (self) => (viewOf.has(self) ? viewOf.get(self)() : 0),
  "HTMLOptionsCollection.prototype.selectedIndex (get)": (self) => (viewOf.has(self) ? viewOf.get(self)() : 0),
  "HTMLOptionsCollection.prototype.selectedIndex (set)": (self) => (viewOf.has(self) ? viewOf.get(self)() : 0),
  "HTMLOptionsCollection.prototype.add": { before: (self, [el]) => moving(el), after: (self) => (viewOf.has(self) ? viewOf.get(self)() : 0) + 1 },
  "HTMLOptionsCollection.prototype.remove": (self) => (viewOf.has(self) ? 2 * viewOf.get(self)() : 0),
  "RadioNodeList.prototype.value (get)": (self) => (viewOf.has(self) ? viewOf.get(self)() : 0),
  "RadioNodeList.prototype.value (set)": (self) => (viewOf.has(self) ? viewOf.get(self)() : 0),
  "StyleSheetList.prototype.length (get)": NOTHING,
  "MediaList.prototype.length (get)": NOTHING,
  "MediaList.prototype.toString": (self, a, r) => units(r),
  "CSSRuleList.prototype.length (get)": NOTHING,
  "HTMLFormElement.prototype.length (get)": (self) => subtreeSize(self), // the form's listed elements, a live view
  "HTMLSelectElement.prototype.length (get)": (self) => optionsView(self),
  "HTMLSelectElement.prototype.length (set)": (self) => 2 * optionsView(self),
  "Storage.prototype.length (get)": NOTHING,
  "FileList.prototype.length (get)": NOTHING,
  "History.prototype.length (get)": NOTHING,
  "PluginArray.prototype.length (get)": NOTHING,
  "MimeTypeArray.prototype.length (get)": NOTHING,
  "SVGStringList.prototype.length (get)": NOTHING,

  // Token lists: the token set, the attribute serialized again and set.
  ...Object.fromEntries(["add", "remove", "toggle", "replace"].map((m) => [`DOMTokenList.prototype.${m}`, (self, tokens) => {
    const el = ownerOf.get(self);
    return tokens.length * (1 + self.length) + units(self.value) + (el ? mutated(el) : 0);
  }])),
  "DOMTokenList.prototype.contains": (self, [t]) => self.length * (1 + stringUnits(t)),
  "DOMTokenList.prototype.toString": (self, a, r) => units(r),
  "Element.prototype.classList (set)": (self, [v]) => attributeSet(self, v), // [PutForwards=value]
  "DOMTokenList.prototype.length (get)": NOTHING,
  "DOMTokenList.prototype.value (get)": (self, a, r) => units(r),
  "DOMTokenList.prototype.value (set)": (self, [v]) => {
    const el = ownerOf.get(self);
    return units(v) + (el ? attributeSet(el, v) : 0);
  },
  "DOMTokenList.prototype.forEach": NOTHING,
  "DOMTokenList.prototype.keys": NOTHING,
  "DOMTokenList.prototype.values": NOTHING,

  // Events.
  "EventTarget.prototype.addEventListener": { before: (self) => listening(self), after: (self, args, r, n) => (listenerCounts.set(self, n + 1), 0) },
  "EventTarget.prototype.removeEventListener": { before: (self) => listening(self), after: (self, args, r, n) => (listenerCounts.set(self, Math.max(0, n - 1)), 0) },
  "EventTarget.prototype.dispatchEvent": (self) => {
    let n = 0;
    for (let p = self; p; p = p.parentNode) n += 1 + listening(p);
    return n;
  },
  "HTMLElement.prototype.click": (self) => {
    let n = 0;
    for (let p = self; p; p = p.parentNode) n += 1 + listening(p);
    return n;
  },
  "HTMLElement.prototype.focus": (self) => 2 * depthOf(self),
  "SVGElement.prototype.focus": (self) => 2 * depthOf(self),
  "Event.prototype.preventDefault": NOTHING,
  "Event.prototype.stopPropagation": NOTHING,
  "Event.prototype.stopImmediatePropagation": NOTHING,

  // Mutation observers.
  "MutationObserver.prototype.observe": (self, [target]) => {
    const nodes = observedNodes.get(self) || new Set();
    observedNodes.set(self, nodes);
    const n = registrations.get(target) || 0;
    if (!nodes.has(target)) {
      nodes.add(target);
      registrations.set(target, n + 1);
    }
    return n;
  },
  "MutationObserver.prototype.disconnect": (self) => {
    const nodes = observedNodes.get(self) || new Set();
    let n = 0;
    for (const node of nodes) {
      n += registrations.get(node) || 0;
      registrations.set(node, Math.max(0, (registrations.get(node) || 0) - 1));
    }
    observedNodes.delete(self);
    return n;
  },
  // The record queue, cloned and emptied (the DOM's takeRecords()): a step a
  // record.
  "MutationObserver.prototype.takeRecords": (self, args, r) => (Array.isArray(r) ? r.length : 0),

  // Layout (CSSOM View): left to the engine; Chrome's.
  "HTMLElement.prototype.offsetHeight (get)": (self) => layout(self),
  "HTMLElement.prototype.offsetWidth (get)": (self) => layout(self),
  "HTMLElement.prototype.offsetParent (get)": (self) => layout(self) + depthOf(self),
  "DOMRectReadOnly.prototype.bottom (get)": NOTHING,
  "DOMRectReadOnly.prototype.left (get)": NOTHING,
  "DOMRectReadOnly.prototype.top (get)": NOTHING,
  "DOMRectReadOnly.prototype.width (get)": NOTHING,
  "DOMRectReadOnly.prototype.height (get)": NOTHING,

  // Elements of HTML.
  "HTMLElement.prototype.dataset (get)": (self, a, r) => (ownerOf.set(r, self), 0),
  "HTMLElement.prototype.style (get)": (self, a, r) => (ownerOf.set(r, self), 0),
  "HTMLElement.prototype.style (set)": (self, [v]) => units(v) + attributeSet(self, v), // [PutForwards=cssText]
  "SVGElement.prototype.style (set)": (self, [v]) => units(v) + attributeSet(self, v),
  "SVGElement.prototype.dataset (get)": (self, a, r) => (ownerOf.set(r, self), 0),
  "SVGElement.prototype.style (get)": (self, a, r) => (ownerOf.set(r, self), 0),
  "SVGElement.prototype.className (get)": NOTHING,
  "HTMLSelectElement.prototype.options (get)": (self, a, r) => (viewOf.set(r, () => optionsView(self)), 0),
  "HTMLDataListElement.prototype.options (get)": (self, a, r) => (viewOf.set(r, () => optionsView(self)), 0),
  "HTMLSelectElement.prototype.selectedIndex (get)": (self) => optionsView(self),
  "HTMLSelectElement.prototype.selectedIndex (set)": (self) => optionsView(self),
  "HTMLSelectElement.prototype.value (get)": (self, a, r) => optionsView(self) + units(r),
  "HTMLSelectElement.prototype.value (set)": (self, [v]) => optionsView(self) * (1 + stringUnits(v)),
  "HTMLSelectElement.prototype.add": { before: (self, [el]) => moving(el), after: (self) => optionsView(self) + mutated(self) },
  "HTMLSelectElement.prototype.remove": (self) => 2 * optionsView(self),
  // Setting selectedness goes through the list of options of the option's
  // select; an option's index is how many options come before it there.
  "HTMLOptionElement.prototype.selected (set)": (self) => {
    const select = selectOf(self);
    return select ? optionsView(select) : 0;
  },
  "HTMLOptionElement.prototype.index (get)": (self) => {
    const select = selectOf(self);
    return select ? reach(select, self) : 0;
  },
  "HTMLOptionElement.prototype.label (get)": textOf,
  "HTMLOptionElement.prototype.text (get)": textOf,
  "HTMLOptionElement.prototype.text (set)": { before: (self) => subtreeSize(self), after: (self, [v]) => units(v) + mutated(self) },
  "HTMLOptionElement.prototype.selected (get)": NOTHING,
  "HTMLOptionElement.prototype.value (get)": textOf,
  "HTMLInputElement.prototype.value (set)": (self, [v]) => units(v), // sanitized
  "HTMLInputElement.prototype.checked (set)": (self) => (self.type === "radio" ? subtreeSize(self.form || documentOf(self)) : 1),
  "HTMLInputElement.prototype.select": NOTHING,
  "HTMLInputElement.prototype.files (get)": NOTHING,
  "HTMLInputElement.prototype.files (set)": NOTHING,
  "HTMLInputElement.prototype.checked (get)": NOTHING,
  "HTMLInputElement.prototype.value (get)": NOTHING,
  "HTMLTextAreaElement.prototype.value (get)": (self, a, r) => units(r), // the raw value, its line breaks made one kind
  "HTMLTextAreaElement.prototype.value (set)": (self, [v]) => units(v),
  "HTMLTextAreaElement.prototype.select": NOTHING,
  "HTMLAnchorElement.prototype.text (get)": textOf,
  "HTMLAnchorElement.prototype.toString": (self, a, r) => units(r) + units(self.baseURI), // the href parsed
  "HTMLAreaElement.prototype.toString": (self, a, r) => units(r) + units(self.baseURI),
  "HTMLAnchorElement.prototype.text (set)": { before: (self) => subtreeSize(self), after: (self, [v]) => units(v) + mutated(self) },
  "HTMLScriptElement.prototype.text (get)": textOf,
  "HTMLScriptElement.prototype.text (set)": { before: (self) => subtreeSize(self), after: (self, [v]) => units(v) + mutated(self) },
  "HTMLTitleElement.prototype.text (get)": textOf,
  "HTMLTitleElement.prototype.text (set)": { before: (self) => subtreeSize(self), after: (self, [v]) => units(v) + mutated(self) },
  "HTMLFormElement.prototype.submit": (self) => subtreeSize(self),
  "HTMLCanvasElement.prototype.getContext": NOTHING,
  "HTMLTemplateElement.prototype.content (get)": NOTHING,
  "HTMLImageElement.prototype.naturalHeight (get)": NOTHING,
  "HTMLImageElement.prototype.naturalWidth (get)": NOTHING,
  "HTMLProgressElement.prototype.position (get)": NOTHING,
  "HTMLTableElement.prototype.rows (get)": (self, a, r) => (liveView(r, self, false), 0),
  "HTMLTableSectionElement.prototype.rows (get)": (self, a, r) => (liveView(r, self, false), 0),

  // CSSOM: a declaration block, its declarations gone through, serialized
  // again into the element's style attribute when it changes.
  "CSSStyleDeclaration.prototype.setProperty": (self, [p, v]) => units(p) + units(v) + self.length + units(self.cssText) + (ownerOf.has(self) ? mutated(ownerOf.get(self)) : 0),
  "CSSStyleDeclaration.prototype.removeProperty": (self) => self.length + units(self.cssText) + (ownerOf.has(self) ? mutated(ownerOf.get(self)) : 0),
  "CSSStyleDeclaration.prototype.cssText (get)": (self, a, r) => self.length + units(r),
  "CSSStyleDeclaration.prototype.cssText (set)": (self, [v]) => units(v) + (ownerOf.has(self) ? mutated(ownerOf.get(self)) : 0),
  "CSSRule.prototype.cssText (get)": (self, a, r) => units(r),
  "CSSRule.prototype.cssText (set)": NOTHING, // does nothing, as CSSOM says
  "CSSRule.prototype.type (get)": NOTHING,
  "CSSStyleSheet.prototype.replace": (self, [text]) => units(text),
  "StyleSheet.prototype.href (get)": NOTHING,
  "StyleSheet.prototype.title (get)": NOTHING,
  "StyleSheet.prototype.type (get)": NOTHING,
  "StyleSheet.prototype.disabled (get)": NOTHING,
  "StyleSheet.prototype.disabled (set)": NOTHING,

  // Parsing and serializing (DOM Parsing, HTML): the parser goes through
  // its input, and a token may look through the stack of open elements, as
  // deep as the tree it makes.
  "DOMParser.prototype.parseFromString": (self, [s], r) => units(s) * (1 + maxDepth(r)) + subtreeSize(r),
  "XMLSerializer.prototype.serializeToString": (self, [node], r) => subtreeSize(node) + units(r),

  // URL: parsing goes through the input and the base; a getter serializes
  // a part; a setter parses it and serializes the URL again.
  "URL.parse": (self, [u, b]) => units(u) + units(b),
  "URL.canParse": (self, [u, b]) => units(u) + units(b),
  "URL.prototype.href (set)": (self, [v]) => units(v),
  "URL.prototype.searchParams (get)": NOTHING,
  "URLSearchParams.prototype.size (get)": NOTHING,
  "URL.prototype.toString": (self, a, r) => units(r),
  "URLSearchParams.prototype.toString": (self, a, r) => units(r),
  // URLSearchParams: a list of name-value pairs, gone through to find a name;
  // a change serializes the list into the URL's query again.
  "URLSearchParams.prototype.get": (self, [name]) => self.size * (1 + stringUnits(name)),
  "URLSearchParams.prototype.has": (self, [name]) => self.size * (1 + stringUnits(name)),
  "URLSearchParams.prototype.delete": (self, [name]) => self.size * (1 + stringUnits(name)) + units(self.toString()),
  "URLSearchParams.prototype.set": (self, [name, v]) => self.size * (1 + stringUnits(name)) + units(v) + units(self.toString()),
  "URLSearchParams.prototype.append": (self, [name, v]) => units(name) + units(v) + units(self.toString()),
  "URLSearchParams.prototype.sort": (self) => self.size * log2(self.size) + units(self.toString()),
  "URLSearchParams.prototype.forEach": (self) => self.size,
  "URLSearchParams.prototype.keys": NOTHING,
  "URLSearchParams.prototype.values": NOTHING,

  // Encoding.
  "TextDecoder.prototype.decode": (self, [input], r) => units(input) + units(r),
  "TextEncoder.prototype.encode": (self, [s], r) => units(s) + units(r),

  // Web Storage: a list of key-value pairs, gone through to find a key.
  "Storage.prototype.getItem": (self, [k]) => self.length * (1 + stringUnits(k)),
  "Storage.prototype.setItem": (self, [k, v]) => self.length * (1 + stringUnits(k)) + units(v),
  "Storage.prototype.removeItem": (self, [k]) => self.length * (1 + stringUnits(k)),
  "Storage.prototype.key": (self) => self.length,
  "SVGStringList.prototype.getItem": NOTHING,
  "SVGStringList.prototype.removeItem": NOTHING,

  // Web Crypto, files.
  "Crypto.prototype.getRandomValues": (self, [a]) => units(a),
  "Blob.prototype.arrayBuffer": (self) => self.size,
  "Blob.prototype.text": (self) => self.size,
  "Blob.prototype.bytes": (self) => self.size,
  "Blob.prototype.slice": NOTHING,
  "FileReader.prototype.result (get)": NOTHING,
  "FileReader.prototype.error (get)": NOTHING,
  "Performance.prototype.now": NOTHING,
  "Navigator.prototype.language (get)": NOTHING,
  "CustomElementRegistry.prototype.get": NOTHING, // none is defined: the extension defines no element
  "Headers.prototype.get": (self, [name]) => [...self.keys()].length * (1 + stringUnits(name)),
  "Headers.prototype.has": (self, [name]) => [...self.keys()].length * (1 + stringUnits(name)),
  "Headers.prototype.set": (self, [name, v]) => [...self.keys()].length * (1 + stringUnits(name)) + units(v),
  "Headers.prototype.delete": (self, [name]) => [...self.keys()].length * (1 + stringUnits(name)),
  "Headers.prototype.append": (self, [name, v]) => units(name) + units(v),
  "Headers.prototype.forEach": (self) => [...self.keys()].length,
  "Headers.prototype.keys": NOTHING,
  "Headers.prototype.values": NOTHING,
  ...Object.fromEntries(["get", "has", "delete", "set", "append", "forEach", "keys", "values"].map((m) => [`FormData.prototype.${m}`, (self, [name]) => [...self.keys()].length * (1 + stringUnits(name))])),
};

// Members of a family, read by kind rather than one by one.
function family(iface, member, kind) {
  const key = `${iface}.prototype.${member}${kind === "value" ? "" : ` (${kind})`}`;
  // Event interfaces: the values an event was made with.
  if (/Event$/.test(iface) && kind === "get") return null;
  if (/^(?:DOMException|ErrorEvent|AbortSignal|MessageEvent|WebSocket|XMLHttpRequest|XMLHttpRequestEventTarget|FileReader)$/.test(iface) && kind !== "value") return null;
  if (/^(?:XMLHttpRequest|WebSocket|HTMLDialogElement)$/.test(iface) && kind === "value") return null;
  // Event handler attributes: a function kept.
  if (/^on/.test(member) && kind !== "value") return null;
  // CSS properties of a declaration block (CSSOM): the block gone through to
  // find the property; set as setProperty() does.
  if (iface === "CSSStyleProperties" || iface === "CSS2Properties") {
    if (kind === "get") return (self) => self.length;
    if (kind === "set") return WEB["CSSStyleDeclaration.prototype.setProperty"] && ((self, [v]) => units(v) + self.length + units(self.cssText) + (ownerOf.has(self) ? mutated(ownerOf.get(self)) : 0));
  }
  // Rules and style sheets of CSSOM, their parts as kept; a rule's style set
  // is its cssText set ([PutForwards=cssText]).
  if (/^CSS.*(?:Rule|Declarations)$/.test(iface) && kind === "get") return null;
  if (/^CSS.*(?:Rule|Declarations)$/.test(iface) && kind === "set") return member === "style" ? (self, [v]) => units(v) : null;
  if (iface === "CSSStyleDeclaration" && member === "length" && kind === "get") return null;
  // Values of SVG, of the screen, the plugins, files, selections, records:
  // what the object holds.
  if (/^(?:SVGNumber|SVGRect|DOMRect|DOMRectReadOnly|DeviceMotionEventAcceleration|Screen|Plugin|MimeType|Blob|File|Selection|MutationRecord)$/.test(iface) && kind !== "value") return null;
  // An event's returnValue set: a flag.
  if (/Event$/.test(iface) && kind === "set") return null;
  // A member of an HTML or SVG element that reflects a content attribute.
  if (/^(?:HTML.*Element|SVG.*Element)$/.test(iface) && (REFLECTED.has(member) || (iface === "HTMLBodyElement" && member === "text") || (iface === "HTMLObjectElement" && member === "data"))) {
    if (iface === "HTMLObjectElement" && member === "data" && kind === "get") return urlGet;
    if (kind === "get") return URLS.has(member) ? urlGet : reflectGet;
    if (kind === "set") return reflectSet;
  }
  // The parts of an anchor's or an area's URL: the href parsed.
  if (/^(?:HTMLAnchorElement|HTMLAreaElement)$/.test(iface) && ["origin", "protocol", "username", "password", "host", "hostname", "port", "pathname", "search", "hash"].includes(member)) {
    if (kind === "get") return urlGet;
    if (kind === "set") return (self, [v]) => units(self.href) + units(v) + attributeSet(self, self.href);
  }
  // The parts of a URL: serialized when read; parsed when set.
  if (/^(?:URL|webkitURL)$/.test(iface)) {
    if (kind === "get") return (self, a, r) => units(r);
    if (kind === "set") return (self, [v]) => units(v) + units(self.href);
    if (member === "parse" || member === "canParse") return WEB[`URL.${member}`];
  }
  return key in WEB ? WEB[key] : undefined;
}

// The rule of a member of a web interface: a function, an object of before
// and after, null for one whose steps do not grow, or undefined for one this
// table lacks. `kind` is "value" for a method, "get" or "set" for an accessor;
// a static member is at the interface's own name.
// Names of the window that are the same interface as another's: HTMLDocument
// is Document, Option is HTMLOptionElement's and Image HTMLImageElement's
// constructor, webkitURL is URL.
export const ALIASES = { HTMLDocument: "Document", Option: "HTMLOptionElement", Image: "HTMLImageElement", webkitURL: "URL" };

export function webRuleOf(iface, member, kind, isStatic = false) {
  if (Object.hasOwn(ALIASES, iface)) iface = ALIASES[iface];
  const key = `${iface}${isStatic ? "" : ".prototype"}.${member}${kind === "value" ? "" : ` (${kind})`}`;
  if (Object.hasOwn(WEB, key)) return WEB[key];
  if (isStatic) return /^(?:URL|webkitURL)$/.test(iface) ? WEB[`URL.${member}`] : undefined;
  return family(iface, member, kind);
}

// The constructors of web interfaces, by name: what making one goes through.
export const WEB_CONSTRUCTORS = {
  URL: (self, [u, b]) => units(u) + units(b),
  webkitURL: (self, [u, b]) => units(u) + units(b),
  URLSearchParams: (self, [init]) => (typeof init === "string" ? init.length : 0), // a record or a list is gone through by its iterator's next(), counted
  TextDecoder: null,
  TextEncoder: null,
  DOMParser: null,
  XMLSerializer: null,
  MutationObserver: null,
  Event: null,
  CustomEvent: null,
  Image: null,
  Option: null,
  Blob: (self, [parts]) => units(parts),
};

// The members of the window and of its location that the window holds as its
// own (they cannot be changed), by name: their rules.
export const OWN = {
  "Location.href (get)": (self, a, r) => units(r),
  "Location.search (get)": (self, a, r) => units(r),
  "Location.pathname (get)": (self, a, r) => units(r),
  "Location.origin (get)": (self, a, r) => units(r),
  "Location.toString": (self, a, r) => units(r),
};
