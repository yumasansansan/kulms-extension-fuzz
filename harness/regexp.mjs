// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The extension's regular expressions without the i flag. The harness runs
// every regular expression of the extension as Chrome does, on V8's usual
// engine, which backtracks, but for those of a finding that stands (S2, S8 and
// S9 of docs/findings.md), which a fuzz target keeps away from: they run on
// V8's experimental engine, which finds the same in time linear in the input
// (onLinearEngine(), harness/work.mjs). That engine does not take the i flag,
// and the backtracking matcher of the harness (harness/backtrack.mjs) does not
// fold case, so linear() writes a regular expression with the flag as one
// without it: each character, class or escape outside a class becomes the
// class of the code units it matches with the flag, as V8 itself says (each of
// the 65,536 tried), and nothing else changes, groups and captures included.
// The regular expression then matches just what it matched.
//
// A regular expression with the u or v flag (whose units are code points), a
// back reference (which compares without regard to case) or a lookaround is
// left as it is: the experimental engine does not take the last two at all.
// tests/regexp.test.mjs checks that each regular expression of a finding, as
// linear() writes it, is one the experimental engine takes, and matches just
// what it matched.
import v8 from "node:v8";
import { RegExpParser } from "@eslint-community/regexpp";

// The l flag, which asks for the experimental engine, is taken from here on.
v8.setFlagsFromString("--enable-experimental-regexp-engine");

const parser = new RegExpParser();
const hex = (c) => "\\u" + c.toString(16).padStart(4, "0");
const classes = new Map();

// The class of the code units that `oracle`, an atom between ^ and $ with the
// i flag, matches, written with each unit escaped.
function expand(atom, flags) {
  const key = `${flags}/${atom}`;
  let out = classes.get(key);
  if (out !== undefined) return out;
  const re = new RegExp(`^(?:${atom})$`, flags);
  const matches = (c) => re.test(String.fromCharCode(c));
  let s = "";
  for (let c = 0; c <= 0xffff; c++) {
    if (!matches(c)) continue;
    let d = c;
    while (d < 0xffff && matches(d + 1)) d++;
    s += d === c ? hex(c) : `${hex(c)}-${hex(d)}`;
    c = d;
  }
  out = `[${s}]`;
  classes.set(key, out);
  return out;
}

// `source` and `flags` of a regular expression, written without the i flag
// where it has it and can be (the head of this file).
export function linear(source, flags) {
  if (!flags.includes("i") || /[uv]/.test(flags)) return { source, flags };
  let pattern;
  try {
    pattern = parser.parsePattern(source, 0, source.length, { unicode: false, unicodeSets: false });
  } catch {
    return { source, flags }; // not ours to say: V8 throws on it as it would
  }
  // `.` is the only atom whose units depend on another flag (s).
  const oracle = flags.includes("s") ? "is" : "i";
  const edits = [];
  let kept = false;
  const element = (node) => {
    switch (node.type) {
      case "Character":
        // By its value: the raw text of one (a lone backslash, in Annex B)
        // need not stand alone.
        edits.push({ start: node.start, end: node.end, text: expand(hex(node.value), oracle) });
        break;
      case "CharacterClass":
      case "CharacterSet":
        edits.push({ start: node.start, end: node.end, text: expand(node.raw, oracle) });
        break;
      case "Quantifier":
        element(node.element);
        break;
      case "Group":
      case "CapturingGroup":
        node.alternatives.forEach(alternative);
        break;
      case "Backreference":
        kept = true;
        break;
      case "Assertion":
        if (node.kind === "lookahead" || node.kind === "lookbehind") kept = true;
        break;
    }
  };
  const alternative = (a) => a.elements.forEach(element);
  pattern.alternatives.forEach(alternative);
  if (kept) return { source, flags };
  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { source: out, flags: flags.replace("i", "") };
}

// `re`, made of `source` and `flags`, as a regular expression of its realm
// that runs on V8's experimental engine: written as linear() writes it, with
// the l flag.
export function onLinearEngine(re, source, flags) {
  const l = linear(source, flags);
  return new re.constructor(l.source, l.flags + "l");
}
