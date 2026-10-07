// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The extension's scripts as the harness runs them.
//
// Most of the extension's code is inside an IIFE, out of reach of a test.
// exposeInternals() adds one statement at the start of each top-level IIFE,
// on the line the function opens on, so no line number of the script moves:
// it hands globalThis.__kulmsExpose(file, internals) an object with a getter
// for every name the function declares at its top, and a setter for each one
// that can be assigned. Function declarations are hoisted, so the getters work
// even when the function returns early; a let or const read before the
// function reaches it throws, as it would in the script itself.
//
// Each script of the extension also counts its work (harness/work.mjs): a
// call of __kulmsWork(1) at the start of each function and each pass of a
// loop, put on the line where the body opens, so no line moves either. A
// regular expression of a finding that backtracks (harness/backtrack.mjs) is
// handed to __kulmsBacktracking() where the code makes it, in its place on
// its line (harness/work.mjs).
//
// loadedSource() then puts that code through Node's loader without running
// it, so that whatever require hook is registered applies to it. When
// Jazzer.js runs, that is its instrumentation: the extension's code gives the
// fuzzer coverage although the harness runs it in vm contexts and jsdom
// windows, not as a module. Elsewhere the code comes back as it went in.
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import * as acorn from "acorn";
import { CACHE, EXT, read } from "./paths.mjs";
import { findingOf } from "./backtrack.mjs";
import { addSites, counters, parse } from "./work.mjs";

// The function of a statement such as (function () { ... })(); or
// (function () { ... }());, if it is one.
function iife(statement) {
  if (statement.type !== "ExpressionStatement") return null;
  const call = statement.expression;
  if (call.type !== "CallExpression") return null;
  const fn = call.callee;
  if (fn.type !== "FunctionExpression" && fn.type !== "ArrowFunctionExpression") return null;
  return fn.body.type === "BlockStatement" ? fn : null;
}

// The names a block declares at its top, each with whether it can be assigned.
function declarations(statements) {
  const names = [];
  for (const s of statements) {
    if (s.type === "FunctionDeclaration" && s.id) names.push({ name: s.id.name, assignable: true });
    else if (s.type === "ClassDeclaration" && s.id) names.push({ name: s.id.name, assignable: false });
    else if (s.type === "VariableDeclaration") {
      for (const d of s.declarations) {
        if (d.id.type === "Identifier") names.push({ name: d.id.name, assignable: s.kind !== "const" });
      }
    }
  }
  return names;
}

export function exposeInternals(code, file) {
  return apply(code, exposing(acorn.parse(code, { ecmaVersion: "latest", sourceType: "script" }), file));
}

// `code` with `edits` made: { at, text } puts text in at `at`, and
// { at, end, text } puts it in place of what is from `at` to `end`. They are
// made from the end back, so that each place is still where it was. What is
// made later at one place lands in front of what was made there before, so a
// replacement is made first; then what opens a wrapping, the inner first, so
// that the outer lands outside; then what closes one, the outer first, so
// that the inner closes inside it and before anything that opens there.
function apply(code, edits) {
  let out = code;
  const end = (e) => (e.end === undefined ? e.at : e.end);
  const rank = (e) => (end(e) > e.at ? 0 : e.side === "close" ? 2 : 1);
  const depth = (e) => e.depth || 0;
  const order = (a, b) => b.at - a.at || rank(a) - rank(b) || (a.side === "close" ? depth(a) - depth(b) : depth(b) - depth(a));
  for (const e of [...edits].sort(order)) out = out.slice(0, e.at) + e.text + out.slice(end(e));
  return out;
}

// The edits that hand each regular expression literal of `ast` (the code of
// `file`) that is one of a finding to __kulmsBacktracking().
function backtrackingRegExps(ast, file, code) {
  const edits = [];
  const walk = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "Literal" && node.regex) {
      const id = findingOf(file, node.regex.pattern, node.regex.flags);
      if (id) {
        const args = [JSON.stringify(id), JSON.stringify(node.regex.pattern), JSON.stringify(node.regex.flags)];
        edits.push({ at: node.start, end: node.end, text: `__kulmsBacktracking(${code.slice(node.start, node.end)}, ${args.join(", ")})` });
      }
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === "string") walk(v);
    }
  };
  walk(ast);
  return edits;
}

// The inserts that expose the internals of each top-level IIFE of `ast`.
function exposing(ast, file) {
  const inserts = [];
  for (const statement of ast.body) {
    const fn = iife(statement);
    if (!fn) continue;
    const names = declarations(fn.body.body);
    if (names.length === 0) continue;
    // After the directive prologue, so that "use strict" stays first.
    let at = fn.body.start + 1;
    for (const s of fn.body.body) {
      if (s.type === "ExpressionStatement" && s.directive !== undefined) at = s.end;
      else break;
    }
    const members = names.map(({ name, assignable }) =>
      `get ${name}() { return ${name}; }` + (assignable ? `, set ${name}(v) { ${name} = v; }` : ""));
    inserts.push({
      at,
      text: ` if (globalThis.__kulmsExpose) globalThis.__kulmsExpose(${JSON.stringify(file)}, { ${members.join(", ")} });`,
    });
  }
  return inserts;
}

// `code` (the script `file` of the extension) as the harness runs it, its
// internals not exposed: what tests/costs.test.mjs checks the counting of.
export function instrument(code, file = "") {
  const { ast, tokens } = parse(code);
  return apply(code, [...counters(ast, tokens).inserts, ...backtrackingRegExps(ast, file, code)]);
}

// The cache keeps the scripts as CommonJS files to Node's loader, whatever the
// package of this repository says.
function prepareCache() {
  const dir = path.join(CACHE, "scripts");
  fs.mkdirSync(dir, { recursive: true });
  const pkg = path.join(dir, "package.json");
  if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, '{ "type": "commonjs" }\n');
  return dir;
}

const loaded = new Map();

// `code`, named `name` (a path under the cache), its internals exposed if
// `expose`, and, if it is the extension's (`extension`), its work counted and
// its regular expressions of a finding handed to __kulmsBacktracking(); written
// to the cache and put through the loader. Returns the code to run and the file it was
// written to, which stack traces and the fuzzer's coverage name.
function prepare(name, code, { expose, extension }) {
  if (loaded.has(name)) return loaded.get(name);
  const { ast, tokens } = parse(code);
  const edits = expose ? exposing(ast, name) : [];
  if (extension) {
    const counting = counters(ast, tokens);
    edits.push(...counting.inserts, ...backtrackingRegExps(ast, name, code));
    addSites(counting.sites);
  }
  const exposed = apply(code, edits);
  const file = path.join(prepareCache(), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== exposed) fs.writeFileSync(file, exposed);
  let compiled = null;
  const m = new Module(file);
  m.filename = file;
  m.paths = [];
  m._compile = (c) => { compiled = c; };
  Module._extensions[".js"](m, file);
  const result = { code: compiled, file };
  loaded.set(name, result);
  return result;
}

// The extension's script at `rel`, its work counted. The libraries it bundles
// (vendor/) are not exposed, and the fuzzing leaves them out of its coverage
// (ci/fuzz.sh), as they are not the extension's code; their work is the
// extension's all the same.
export function loadedSource(rel) {
  return prepare(rel, read(rel), { expose: !rel.startsWith("vendor/"), extension: true });
}

// A script of this repository at `abs` (the fuzzing's canary), cached as `name`.
export function loadedFile(abs, name) {
  return prepare(name, fs.readFileSync(abs, "utf8"), { expose: true, extension: false });
}

export { EXT };
