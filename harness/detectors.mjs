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
// context before a run and lists what changed that should not have.
//
// - markup: an element the page gained that runs script — a <script>, an
//   attribute of an event handler (on*), a javascript: URL in a link or a
//   frame, an iframe's srcdoc, an <object> or <embed>. The extension builds
//   its UI with textContent; markup from data that lands in the page is a
//   DOM XSS.
// - prototypes: a property added to, or changed on, a prototype of the
//   context's realm (Object, Array, Function, String) — prototype pollution.
// - errors: what browser.errors gained (exceptions of listeners, timers and
//   event handlers, and rejected promises nothing handled).
const URL_ATTRIBUTES = ["href", "src", "action", "formaction", "xlink:href", "data"];

function scriptCarriers(document) {
  const found = new Set();
  for (const el of document.querySelectorAll("*")) {
    const tag = el.localName;
    if (tag === "script" || tag === "object" || tag === "embed" || (tag === "iframe" && el.hasAttribute("srcdoc"))) found.add(el);
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) found.add(el);
      else if (URL_ATTRIBUTES.includes(name) && /^\s*javascript:/i.test(attr.value)) found.add(el);
    }
  }
  return found;
}

function describe(el) {
  const attrs = [...el.attributes].map((a) => `${a.name}="${a.value.slice(0, 60)}"`).join(" ");
  return `<${el.localName}${attrs ? " " + attrs : ""}>`;
}

const PROTOTYPES = ["Object", "Array", "Function", "String"];

function prototypeShape(realm) {
  const shape = {};
  for (const name of PROTOTYPES) {
    const proto = realm[name] && realm[name].prototype;
    if (!proto) continue;
    for (const key of Reflect.ownKeys(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, key);
      shape[`${name}.prototype.${String(key)}`] = d.value !== undefined ? d.value : d.get;
    }
  }
  return shape;
}

// Snapshots `context` (and browser.errors); check() returns what is new.
export function watch(context) {
  const document = context.document;
  const before = {
    carriers: document ? scriptCarriers(document) : null,
    shape: prototypeShape(context.realm),
    errors: context.browser.errors.length,
  };
  return {
    check() {
      const problems = [];
      if (document) {
        for (const el of scriptCarriers(document)) if (!before.carriers.has(el)) problems.push(`markup that runs script: ${describe(el)}`);
      }
      const shape = prototypeShape(context.realm);
      for (const [key, value] of Object.entries(shape)) {
        if (!(key in before.shape)) problems.push(`prototype gained ${key}`);
        else if (before.shape[key] !== value) problems.push(`prototype changed ${key}`);
      }
      for (const key of Object.keys(before.shape)) if (!(key in shape)) problems.push(`prototype lost ${key}`);
      for (const { where, error } of context.browser.errors.slice(before.errors)) {
        problems.push(`${where}: ${error && error.stack ? error.stack : error}`);
      }
      return problems;
    },
  };
}

// Throws when check() found something, naming it, so a fuzz target fails on it.
export function assertClean(watcher) {
  const problems = watcher.check();
  if (problems.length) throw new Error(problems.join("\n"));
}
