// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The counting of the extension's work is complete: no step of what the
// extension does goes uncounted by a gap in the rules (harness/costs.mjs,
// harness/web-costs.mjs, harness/work.mjs). Every built-in of ECMAScript in
// the realms the extension runs in has a rule; so does every member of a web
// interface that the extension's code names, and every form of the syntax
// its code is written in; and the code makes no code at run time (eval,
// Function), whose steps would not be counted. Then a few of the rules,
// counted as they run: what grows with the input counts in proportion.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { Browser, EXT, LINEAR, degree, instrument, manifest, measure, openTab, read } from "../harness/index.mjs";
import { SYNTAX, builtIns, formOf, ruleOf } from "../harness/costs.mjs";
import { ALIASES, parseSelectors, webRuleOf } from "../harness/web-costs.mjs";
import { parse } from "../harness/work.mjs";

// The scripts Chrome runs for the extension (as tests/regexp.test.mjs finds
// them).
function scripts() {
  const files = new Set([manifest.background.service_worker]);
  for (const cs of manifest.content_scripts) for (const f of cs.js || []) files.add(f);
  for (const r of manifest.web_accessible_resources || []) for (const f of r.resources) if (f.endsWith(".js")) files.add(f);
  const popup = manifest.action.default_popup;
  const { document } = new JSDOM(read(popup)).window;
  for (const s of document.querySelectorAll("script[src]")) files.add(path.posix.join(path.posix.dirname(popup), s.getAttribute("src")));
  return [...files];
}

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((x) => walk(x, visit, node));
    else if (v && typeof v.type === "string") walk(v, visit, node);
  }
}

const parsed = scripts().map((file) => ({ file, ...parse(read(file)) }));
const window = () => new JSDOM("", { url: "https://lms.gakusei.kyoto-u.ac.jp/portal", runScripts: "outside-only" }).window;

test("every built-in of ECMAScript in the background's realm and a window's has a rule", () => {
  const missing = [];
  for (const [name, g] of [["background", vm.runInContext("globalThis", vm.createContext({}))], ["window", window()]]) {
    for (const b of builtIns(g)) if (ruleOf(b.path) === undefined) missing.push(`${name}: ${b.path}`);
  }
  assert.deepEqual(missing, []);
});

test("every member of a web interface that the extension's code names has a rule", () => {
  const names = new Set();
  for (const { ast } of parsed) {
    walk(ast, (n) => {
      if (n.type !== "MemberExpression") return;
      if (!n.computed) names.add(n.property.name);
      else if (n.property.type === "Literal") names.add(String(n.property.value));
    });
  }
  const w = window();
  const es = new Set(builtIns(w).map((b) => b.owner));
  const missing = [];
  for (const iface of Object.getOwnPropertyNames(w)) {
    let C;
    try {
      C = w[iface];
    } catch {
      continue;
    }
    if (typeof C !== "function" || !C.prototype || es.has(C) || es.has(C.prototype)) continue;
    for (const [owner, isStatic] of [[C.prototype, false], [C, true]]) {
      for (const m of Object.getOwnPropertyNames(owner)) {
        if (!names.has(m) || m === "constructor" || m === "prototype" || (isStatic && ["length", "name"].includes(m))) continue;
        const d = Object.getOwnPropertyDescriptor(owner, m);
        for (const kind of [typeof d.value === "function" && "value", d.get && "get", d.set && "set"].filter(Boolean)) {
          if (webRuleOf(iface, m, kind, isStatic) === undefined) missing.push(`${iface}${isStatic ? "" : ".prototype"}.${m}${kind === "value" ? "" : ` (${kind})`}`);
        }
      }
    }
  }
  assert.deepEqual(missing, [], `aliases: ${Object.keys(ALIASES).join(", ")}`);
});

// A selector made at run time throws where it is matched if the costs do not
// know it (harness/web-costs.mjs).
test("every selector the extension's code writes is one the costs know how to match", () => {
  const unknown = [];
  for (const { file, ast } of parsed) walk(ast, (n) => {
    if (n.type !== "CallExpression" || n.callee.type !== "MemberExpression" || n.callee.computed) return;
    if (!["querySelector", "querySelectorAll", "closest", "matches"].includes(n.callee.property.name)) return;
    const [s] = n.arguments;
    const text = s && s.type === "Literal" && typeof s.value === "string" ? s.value
      : s && s.type === "TemplateLiteral" && s.expressions.length === 0 ? s.quasis[0].value.cooked : null;
    if (text === null) return;
    try {
      parseSelectors(text);
    } catch (e) {
      unknown.push(`${file}: ${e.message}`);
    }
  });
  assert.deepEqual(unknown, []);
});

test("every form of the syntax in the extension's code has a rule", () => {
  const missing = new Set();
  for (const { file, ast } of parsed) walk(ast, (n, parent) => {
    const form = formOf(n, parent);
    if (!Object.hasOwn(SYNTAX, form)) missing.add(`${form} (${file})`);
  });
  assert.deepEqual([...missing], []);
});

test("the extension's code makes no code at run time, whose steps would not be counted", () => {
  const made = [];
  for (const { file, ast } of parsed) walk(ast, (n) => {
    if ((n.type === "CallExpression" || n.type === "NewExpression") && n.callee.type === "Identifier" && ["eval", "Function"].includes(n.callee.name)) made.push(`${file}: ${n.callee.name}`);
  });
  assert.deepEqual(made, []);
});

// --- The rules at work: what grows with the input counts in proportion.

// The degree of the work of code(k), run in a tab of the LMS whose page
// holds k items of `html`.
async function degreeIn(n, html, code) {
  return degree(n, async (k) => {
    const browser = new Browser();
    try {
      const tab = openTab(browser, { url: "https://lms.gakusei.kyoto-u.ac.jp/portal", html: `<!doctype html><body>${html.repeat(k)}</body>`, scripts: [] });
      return await measure(() => code(tab.window, k));
    } finally {
      browser.close();
    }
  });
}

test("a query of selectors goes through the page: one query, linear in its size", async () => {
  assert.ok(Math.abs((await degreeIn(500, "<p><a>x</a></p>", (w) => w.document.querySelectorAll("p a"))) - 1) < 0.2);
});

test("an attribute selector goes through the value it searches: a query for each of its places is quadratic", async () => {
  const d = await degreeIn(200, "", (w, k) => {
    const el = w.document.createElement("i");
    el.setAttribute("data-x", "a".repeat(k));
    w.document.body.append(el);
    for (let i = 0; i < k; i++) w.document.querySelector('[data-x*="b"]');
  });
  assert.ok(d > LINEAR, `degree ${d}`);
});

test(":not() goes through the selectors in it: a query of each element, the attribute searched in it, is quadratic", async () => {
  const d = await degreeIn(200, "", (w, k) => {
    const el = w.document.createElement("i");
    el.setAttribute("data-x", "a".repeat(k));
    w.document.body.append(el);
    for (let i = 0; i < k; i++) w.document.querySelector('i:not([data-x*="b"])');
  });
  assert.ok(d > LINEAR, `degree ${d}`);
});

test("getElementById goes through the page as the DOM says: a query of each element is quadratic", async () => {
  const d = await degreeIn(200, "<i></i>", (w, k) => {
    const els = w.document.body.children;
    for (let i = 0; i < k; i++) {
      els[i].id = `e${i}`;
      w.document.getElementById(`e${i}`);
    }
  });
  assert.ok(d > LINEAR, `degree ${d}`);
});

test("a live collection is gone through for each read: reading each of its items is quadratic", async () => {
  const d = await degreeIn(200, "<i></i>", (w) => {
    const c = w.document.body.children;
    for (let i = 0; i < c.length; i++) c[i];
  });
  assert.ok(d > LINEAR, `degree ${d}`);
});

test("shift() moves the rest of an array down: emptying an array by it is quadratic", async () => {
  const d = await degreeIn(500, "", (w, k) => {
    const a = w.Array.from({ length: k }, (_, i) => i);
    while (a.length) a.shift();
  });
  assert.ok(d > LINEAR, `degree ${d}`);
});

test("indexOf() compares at each place: a search for a string as long as the text is quadratic", async () => {
  const d = await degreeIn(500, "", (w, k) => w.String.prototype.indexOf.call("a".repeat(2 * k), "a".repeat(k - 1) + "b"));
  assert.ok(d > LINEAR, `degree ${d}`);
});

test("a regular expression's work is the steps of its backtracking", async () => {
  const d = await degreeIn(300, "", (w, k) => new w.RegExp("<[^>]+>", "g").exec("<".repeat(k)));
  assert.ok(d > LINEAR, `degree ${d}`);
});

test("the syntax that goes through a value is counted: comparing two long strings, and a key made at run time", async () => {
  const browser = new Browser();
  try {
    const tab = openTab(browser, { url: "https://lms.gakusei.kyoto-u.ac.jp/portal", scripts: [] });
    const code = instrument("(function (a, b, o) { return [a === b, o[a]]; })", "test.js");
    const f = tab.evaluate(code);
    const long = "x".repeat(100000);
    const w = await measure(() => f(long, long.slice(0) + "", {}));
    assert.ok(w >= 2 * long.length, `${w} steps for two strings of ${long.length} units`);
  } finally {
    browser.close();
  }
});

test("the instrumented extension keeps its lines", () => {
  for (const { file } of parsed) {
    const code = read(file);
    assert.equal(instrument(code, file).split("\n").length, code.split("\n").length, file);
  }
});

test("the extension under test is one whose scripts are found", () => {
  assert.ok(fs.existsSync(path.join(EXT, "manifest.json")));
});
