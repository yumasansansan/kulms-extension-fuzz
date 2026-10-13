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
//
// What the extension catches and goes on from is out of sight of every other
// detector: a TypeError swallowed by a catch clause leaves no trace but the
// part of the page it took away. So each catch clause of the extension hands
// what it caught, and where, to __kulmsCaught() before its own code runs, a
// clause without a binding given one; and each handler of a rejection that
// it passes to .catch() or to the second place of .then() is handed to
// __kulmsRejected(), which hands the reason on in the same way
// (harness/detectors.mjs). Both are put on the line they belong to.
//
// sourcePlaces() says where in the extension's own code each place of the
// code the harness runs comes from, so that what V8 counts of the code the
// harness runs can be read as counts of the extension's code
// (harness/coverage.mjs).
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import * as acorn from "acorn";
import { CACHE, EXT, read } from "./paths.mjs";
import { findingOf } from "./backtrack.mjs";
import { counters, parse } from "./work.mjs";

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
const editEnd = (e) => (e.end === undefined ? e.at : e.end);
const editRank = (e) => (editEnd(e) > e.at ? 0 : e.side === "close" ? 2 : 1);
const editDepth = (e) => e.depth || 0;
const editOrder = (a, b) => b.at - a.at || editRank(a) - editRank(b) ||
  (a.side === "close" ? editDepth(a) - editDepth(b) : editDepth(b) - editDepth(a));

function apply(code, edits) {
  let out = code;
  for (const e of [...edits].sort(editOrder)) out = out.slice(0, e.at) + e.text + out.slice(editEnd(e));
  return out;
}

// What `code` with `edits` made (apply()) is made of, in its order: pieces of
// `length` characters, each standing for the code from `from` to `to`. A
// piece no edit touched (`kept`) is that code itself; the text an edit puts
// in stands for the place it is put at (from === to), or for the code it is
// put in place of. The pieces are found as apply() makes the edits, from the
// end back, each edit taking what is still the code as it was.
function pieces(code, edits) {
  const made = [];
  let rest = code.length; // the code before this place is still as it was
  for (const e of [...edits].sort(editOrder)) {
    const to = editEnd(e);
    if (to > rest) throw new Error(`the edit at ${e.at} overlaps one after it`);
    if (rest > to) made.push({ length: rest - to, from: to, to: rest, kept: true });
    made.push({ length: e.text.length, from: e.at, to, text: e.text });
    rest = e.at;
  }
  if (rest > 0) made.push({ length: rest, from: 0, to: rest, kept: true });
  return made.reverse();
}

// The name a function of `ast` goes by in a report: its own, or the one of
// the variable, property or method it is the value of.
function functionName(fn, parent) {
  if (fn.id) return fn.id.name;
  if (!parent) return null;
  const named = (k) => (k && (k.type === "Identifier" ? k.name : k.type === "Literal" ? String(k.value) : null));
  if (parent.type === "VariableDeclarator") return named(parent.id);
  if (parent.type === "AssignmentExpression") return parent.left.type === "MemberExpression" ? named(parent.left.property) : named(parent.left);
  if (parent.type === "Property" || parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") return named(parent.key);
  return null;
}

// The edits that hand to __kulmsCaught() what each catch clause of `ast` (the
// code of `file`) catches, and to __kulmsRejected() each rejection handler the
// code gives a promise, with where: "<file>:<line> in <function>" (see the
// top of this file). A catch clause that destructures what it catches binds
// the whole and destructures it as the first statement of its block.
function catchers(ast, file, code) {
  const lineStarts = [0];
  for (let i = code.indexOf("\n"); i !== -1; i = code.indexOf("\n", i + 1)) lineStarts.push(i + 1);
  const lineOf = (at) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const edits = [];
  const names = [];
  const site = (at) => JSON.stringify(`${file}:${lineOf(at)}${names.length && names[names.length - 1] ? ` in ${names[names.length - 1]}` : ""}`);
  const visit = (node, depth, parent) => {
    if (!node || typeof node.type !== "string") return;
    const fn = node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
    if (fn) names.push(functionName(node, parent) || (names.length ? names[names.length - 1] : null));
    if (node.type === "CatchClause") {
      const at = node.body.start + 1;
      if (!node.param) {
        edits.push({ at: node.start + "catch".length, text: " (__kulmsCaughtError)" });
        edits.push({ at, text: ` __kulmsCaught(__kulmsCaughtError, ${site(node.start)});` });
      } else if (node.param.type === "Identifier") {
        edits.push({ at, text: ` __kulmsCaught(${node.param.name}, ${site(node.start)});` });
      } else {
        const pattern = code.slice(node.param.start, node.param.end);
        if (/\/\/|\/\*/.test(pattern)) throw new Error(`${file}:${lineOf(node.start)}: a catch clause destructures with a comment in its pattern, which harness/source.mjs cannot move to the clause's block on one line`);
        edits.push({ at: node.param.start, end: node.param.end, text: "__kulmsCaughtError" + "\n".repeat((pattern.match(/\n/g) || []).length) });
        edits.push({ at, text: ` __kulmsCaught(__kulmsCaughtError, ${site(node.start)}); let ${pattern.replace(/\s+/g, " ")} = __kulmsCaughtError;` });
      }
    } else if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed && node.callee.property.type === "Identifier") {
      const handler = node.callee.property.name === "catch" ? node.arguments[0] : node.callee.property.name === "then" ? node.arguments[1] : null;
      if (handler && handler.type !== "SpreadElement") {
        edits.push({ at: handler.start, text: "__kulmsRejected(", depth: depth + 1, side: "open" });
        edits.push({ at: handler.end, text: `, ${site(handler.start)})`, depth: depth + 1, side: "close" });
      }
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) v.forEach((x) => visit(x, depth + 1, node));
      else if (v && typeof v.type === "string") visit(v, depth + 1, node);
    }
    if (fn) names.pop();
  };
  visit(ast, 0, null);
  return edits;
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

// The edits that make `code`, named `name`, the code prepare() runs, and its
// counting sites.
function editsOf(name, code, { expose, extension }) {
  const { ast, tokens } = parse(code);
  const edits = expose ? exposing(ast, name) : [];
  let sites = 0;
  if (extension) {
    const counting = counters(ast, tokens);
    edits.push(...counting.inserts, ...backtrackingRegExps(ast, name, code));
    sites = counting.sites;
    // The libraries the extension bundles (vendor/) catch what they throw as
    // their own way of going on; what they let out is seen like the rest.
    if (!name.startsWith("vendor/")) edits.push(...catchers(ast, name, code));
  }
  return { edits, sites };
}

// `code`, named `name` (a path under the cache), its internals exposed if
// `expose`, and, if it is the extension's (`extension`), its work counted and
// its regular expressions of a finding handed to __kulmsBacktracking(); written
// to the cache and put through the loader. Returns the code to run, the file it was
// written to, which stack traces and the fuzzer's coverage name, and its
// counting sites (harness/work.mjs), which the browser that runs it holds
// (harness/chrome.mjs).
function prepare(name, code, { expose, extension }) {
  if (loaded.has(name)) return loaded.get(name);
  const { edits, sites } = editsOf(name, code, { expose, extension });
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
  const result = { code: compiled, file, sites };
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

// The extension's script at `rel`: its own code (`code`), the code the
// harness runs (`runs`, as loadedSource() writes it to the cache and runs it
// where no require hook changes it), and place(offset), the place of its own
// code that a place of the code the harness runs stands for. A place in what
// the harness put in stands for where it was put in, and one at or past the
// end (a window runs the code with a line naming it after it) for the end.
// Places keep their order, so a range of the code the harness runs stands
// for a range of the extension's code, which is empty where the range holds
// only what the harness put in.
export function sourcePlaces(rel) {
  const code = read(rel);
  const { edits } = editsOf(rel, code, { expose: !rel.startsWith("vendor/"), extension: true });
  const parts = pieces(code, edits);
  const starts = [];
  let length = 0;
  for (const p of parts) {
    starts.push(length);
    length += p.length;
  }
  const place = (offset) => {
    if (offset >= length) return code.length;
    let lo = 0;
    let hi = parts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    const p = parts[lo];
    const into = offset - starts[lo];
    if (p.kept) return p.from + into;
    if (p.from === p.to) return p.from;
    // What an edit put in place of code: where that code is still within it
    // (a regular expression handed to __kulmsBacktracking()), its places.
    const replaced = code.slice(p.from, p.to);
    const kept = p.text.indexOf(replaced);
    if (kept < 0) return into === 0 ? p.from : p.to;
    if (into < kept) return p.from;
    if (into < kept + replaced.length) return p.from + (into - kept);
    return p.to;
  };
  return { code, runs: apply(code, edits), parts, place };
}

// A script of this repository at `abs` (the fuzzing's canary), cached as `name`.
export function loadedFile(abs, name) {
  return prepare(name, fs.readFileSync(abs, "utf8"), { expose: true, extension: false });
}

export { EXT };
