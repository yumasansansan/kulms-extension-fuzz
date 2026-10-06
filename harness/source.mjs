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
  const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script" });
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
  let out = code;
  for (const { at, text } of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, at) + text + out.slice(at);
  return out;
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

// `code`, named `name` (a path under the cache), exposed unless `expose` is
// false, written to the cache and put through the loader. Returns the code to
// run and the file it was written to, which stack traces and the fuzzer's
// coverage name.
function prepare(name, code, expose) {
  if (loaded.has(name)) return loaded.get(name);
  const exposed = expose ? exposeInternals(code, name) : code;
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

// The extension's script at `rel`. The libraries it bundles (vendor/) are left
// as they are; the fuzzing leaves them out of the instrumentation too
// (ci/fuzz.sh), as they are not the extension's code.
export function loadedSource(rel) {
  return prepare(rel, read(rel), !rel.startsWith("vendor/"));
}

// A script of this repository at `abs` (the fuzzing's canary), cached as `name`.
export function loadedFile(abs, name) {
  return prepare(name, fs.readFileSync(abs, "utf8"), true);
}

export { EXT };
