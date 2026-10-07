// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The extension's regular expressions, judged by their automata rather than
// by a clock. recheck (https://makenowjust-labs.github.io/recheck/) builds the
// automaton of a regular expression and decides from it how the time that a
// backtracking engine such as Chrome's takes grows with the input: linearly
// ("safe"), as a polynomial of some degree, or exponentially. For a regular
// expression with no back reference and no lookaround, its automaton checker
// decides this exactly, and it is given no time limit.
//
// The regular expressions are those of the scripts Chrome runs for the
// extension (manifest.json and popup.html): every literal, and every RegExp
// the code makes at run time, from what RUNTIME below says it can be made
// of. One that backtracks beyond linear time is a finding of
// docs/findings.md (BACKTRACKING of harness/backtrack.mjs), whose test is
// marked todo while it stands; every other one must be linear, as the work
// counting of the harness takes it to be (harness/work.mjs).
//
// The harness counts the work of a regular expression by the steps of a
// backtracking engine of its own (harness/backtrack.mjs), on the input it is
// given: it must find what V8 finds. A fuzz target that keeps away from a
// finding that stands runs the finding's regular expressions on V8's linear
// engine instead, as harness/regexp.mjs writes them: the engine must take
// them, and they must match just what they matched.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as acorn from "acorn";
import fc from "fast-check";
import { JSDOM } from "jsdom";
import { check } from "recheck";
import { EXT, ROOT, manifest, read } from "../harness/index.mjs";
import { BACKTRACKING as KNOWN, compile, run } from "../harness/backtrack.mjs";
import { linear } from "../harness/regexp.mjs";

const TITLES = {
  S2: "the site contact regex keeps to linear time",
  S8: "the syllabus parser's regular expressions keep to linear time",
  S9: "the regular expressions of course names, TOTP secrets and folders keep to linear time",
};

// The placeholders' names in the messages of every locale the extension has.
function placeholders() {
  const names = new Set();
  for (const locale of fs.readdirSync(path.join(EXT, "_locales"))) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    for (const entry of Object.values(messages)) for (const name of Object.keys(entry.placeholders || {})) names.add(name);
  }
  return [...names];
}

// The RegExps the extension makes at run time, by the code of their
// arguments, each with what it can be.
const RUNTIME = {
  // t() of settings.js and of popup.js: a placeholder's name, in capitals,
  // between dollar signs.
  [String.raw`"\\$" + name.toUpperCase() + "\\$", "g"`]: () => placeholders().map((name) => ({ source: `\\$${name.toUpperCase()}\\$`, flags: "g" })),
};

// The scripts Chrome runs for the extension: its service worker, its content
// scripts, the scripts it opens to pages, and those of its popup.
function scripts() {
  const files = new Set([manifest.background.service_worker]);
  for (const cs of manifest.content_scripts) for (const f of cs.js || []) files.add(f);
  for (const r of manifest.web_accessible_resources || []) for (const f of r.resources) if (f.endsWith(".js")) files.add(f);
  const popup = manifest.action.default_popup;
  const { document } = new JSDOM(read(popup)).window;
  for (const s of document.querySelectorAll("script[src]")) files.add(path.posix.join(path.posix.dirname(popup), s.getAttribute("src")));
  return [...files];
}

function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) v.forEach((x) => walk(x, visit));
    else if (v && typeof v.type === "string") walk(v, visit);
  }
}

// The regular expressions of the extension: { file, line, source, flags },
// and, for one made at run time, `made`, the code of its arguments.
function regExps() {
  const found = [];
  for (const file of scripts()) {
    const code = read(file);
    const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script", locations: true });
    walk(ast, (n) => {
      const line = n.loc.start.line;
      if (n.type === "Literal" && n.regex) found.push({ file, line, source: n.regex.pattern, flags: n.regex.flags });
      if ((n.type === "NewExpression" || n.type === "CallExpression") && n.callee.type === "Identifier" && n.callee.name === "RegExp") {
        const args = n.arguments;
        if (args.length && args.every((a) => a.type === "Literal" && typeof a.value === "string")) {
          found.push({ file, line, source: args[0].value, flags: args[1] ? args[1].value : "" });
        } else {
          const made = args.length ? code.slice(args[0].start, args.at(-1).end) : "";
          const can = RUNTIME[made];
          if (!can) found.push({ file, line, made });
          else for (const r of can()) found.push({ file, line, made, ...r });
        }
      }
    });
  }
  return found;
}

const found = regExps();
const regular = found.filter((r) => r.source !== undefined);
const where = (r) => `${r.file}:${r.line} /${r.source}/${r.flags}`;
const knownAs = (r) => Object.keys(KNOWN).find((id) => KNOWN[id].some(([file, source, flags]) => file === r.file && source === r.source && flags === r.flags));

// recheck runs a binary built for the platform when it finds one, and a build
// in JavaScript many times slower when it does not. It looks for the binary
// by cutting "/package.json" off a path, which on Windows has backslashes, so
// it never finds it there: the path is given here. The binary on Windows reads
// what it is given in the system's code page, so each code unit of a regular
// expression that is not ASCII is given as a \u escape, which is the same
// regular expression (ascii()).
function recheckBinary() {
  const platform = { darwin: "macos", linux: "linux", win32: "windows" }[process.platform];
  try {
    const fromRecheck = createRequire(createRequire(import.meta.url).resolve("recheck"));
    const dir = path.dirname(fromRecheck.resolve(`recheck-${platform}-${process.arch}/package.json`));
    return path.join(dir, process.platform === "win32" ? "recheck.exe" : "recheck");
  } catch {
    return null;
  }
}
const binary = recheckBinary();
if (binary && !process.env.RECHECK_BIN) process.env.RECHECK_BIN = binary;

// `source` with each code unit that is not ASCII written as a \u escape. One
// escaped with a backslash (\あ, which stands for itself) loses the backslash.
const ascii = (source) => source.replace(/(\\*)([\u0080-\uffff])/g, (m, slashes, c) =>
  (slashes.length % 2 ? slashes.slice(1) : slashes) + "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

const verdicts = new Map();

// What recheck's automaton checker says of `r`: { status, complexity, ... }.
function verdict(r) {
  const key = `/${r.source}/${r.flags}`;
  if (!verdicts.has(key)) {
    const v = check(ascii(r.source), r.flags, { checker: "automaton", timeout: null });
    v.catch(() => {}); // awaited by the test that asks for it
    verdicts.set(key, v);
  }
  return verdicts.get(key);
}

// All of them asked for at once: recheck works on them side by side.
for (const r of regular) verdict(r);

function describe(r, v) {
  if (v.status === "unknown") return `${where(r)}: undecided (${v.error ? `${v.error.kind}: ${v.error.message || ""}` : "no reason given"})`;
  const c = v.complexity;
  return `${where(r)}: ${c.type === "polynomial" ? `polynomial of degree ${c.degree}` : c.type}`;
}

async function notLinear(rs) {
  const out = [];
  for (const r of rs) {
    const v = await verdict(r);
    if (v.status !== "safe") out.push(describe(r, v));
  }
  return out;
}

for (const id of Object.keys(KNOWN)) {
  test(`${id}: ${TITLES[id]}`, { todo: `${id} stands (docs/findings.md)` }, async () => {
    assert.deepEqual(await notLinear(regular.filter((r) => knownAs(r) === id)), []);
  });
}

test("every other regular expression of the extension keeps to linear time", async () => {
  assert.deepEqual(await notLinear(regular.filter((r) => !knownAs(r))), []);
});

test("every RegExp the extension makes at run time is one this test knows", () => {
  assert.deepEqual(found.filter((r) => r.source === undefined).map((r) => `${r.file}:${r.line} RegExp(${r.made})`), []);
});

// KNOWN is of the extension at the submodule's commit: a branch that fixes a
// finding may no longer have its regular expressions.
const submodule = EXT === path.join(ROOT, "kulms-extension");
test("each regular expression KNOWN names is in the extension", { skip: !submodule && "the extension under test is not the submodule's" }, () => {
  const missing = [];
  for (const [id, entries] of Object.entries(KNOWN)) {
    for (const [file, source, flags] of entries) {
      if (!regular.some((r) => r.file === file && r.source === source && r.flags === flags)) missing.push(`${id}: ${file} /${source}/${flags}`);
    }
  }
  assert.deepEqual(missing, []);
});

// The regular expressions of the findings, as the extension has them.
const ofFindings = () => regular.filter((r) => knownAs(r));

test("V8's linear engine takes each regular expression of a finding as harness/regexp.mjs writes it", () => {
  const refused = [];
  for (const r of ofFindings()) {
    const l = linear(r.source, r.flags);
    try {
      new RegExp(l.source, l.flags + "l");
    } catch (e) {
      refused.push(`${where(r)}: ${e.message}`);
    }
  }
  assert.deepEqual(refused, []);
});

// The characters a regular expression's matching turns on: those it names,
// in both cases, and those that case folding treats in ways of their own
// (dotless and dotted I, long s, the Kelvin sign, sharp s, final sigma), with
// line ends and spaces that are not ASCII.
const TRICKY = ["\u0130", "\u0131", "\u017f", "\u212a", "\u00df", "\u1e9e", "\u03c2", "\u03a3", "\u2028", "\n", " ", "\u3000", "\ufeff"];
function alphabet(source) {
  const chars = new Set(TRICKY);
  for (const c of source.replace(/\\u([\da-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))) {
    for (const x of [c, c.toUpperCase(), c.toLowerCase()]) if (x.length === 1) chars.add(x);
  }
  return [...chars];
}

const matches = (re, s) => (re.global ? [...s.matchAll(re)] : [s.match(re)].filter(Boolean)).map((m) => ({ index: m.index, groups: [...m] }));

test("harness/regexp.mjs writes each regular expression of a finding as one that matches just what it matched", () => {
  for (const r of ofFindings()) {
    const l = linear(r.source, r.flags);
    if (l.source === r.source && l.flags === r.flags) continue;
    const before = new RegExp(r.source, r.flags);
    const after = new RegExp(l.source, l.flags);
    const strings = fc.array(fc.constantFrom(...alphabet(r.source)), { maxLength: 40 }).map((a) => a.join(""));
    fc.assert(fc.property(strings, (s) => {
      assert.deepEqual(matches(after, s), matches(before, s), `${where(r)} on ${JSON.stringify(s)}`);
    }), { numRuns: 300 });
  }
});

test("the backtracking matcher of the harness finds what V8 finds, on each regular expression of the extension", () => {
  for (const r of regular) {
    const p = compile(r.source, r.flags);
    const re = new RegExp(r.source, r.flags);
    const strings = fc.array(fc.constantFrom(...alphabet(r.source)), { maxLength: 40 }).map((a) => a.join(""));
    fc.assert(fc.property(strings, fc.nat(8), (str, lastIndex) => {
      re.lastIndex = lastIndex;
      const m = re.exec(str);
      const want = m ? { index: m.index, end: m.index + m[0].length } : { index: -1, end: -1 };
      assert.deepEqual(run(p, str, lastIndex, () => {}), want, `${where(r)} on ${JSON.stringify(str)} from ${lastIndex}`);
    }), { numRuns: 300 });
  }
});
