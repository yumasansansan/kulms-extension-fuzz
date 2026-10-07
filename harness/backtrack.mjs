// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The regular expressions of the extension that backtrack beyond linear time,
// and their work counted by the steps a backtracking engine takes on them.
//
// The harness runs regular expressions on V8's linear engine (fuzz/lib.mjs,
// harness/regexp.mjs), and counts a regular expression's work by how far it
// went (harness/work.mjs): for one that tests/regexp.test.mjs finds linear
// from its automaton, that is its work up to a constant. For one that it finds
// backtracking (BACKTRACKING below), what Chrome's engine does depends on the
// input it is given, and on what the code has done to that input first (a fix
// may cut it where the regular expression cannot match): so its work is
// counted as a backtracking engine does it, step by step. run() tries each
// place to start from, as V8 does, and at each follows the expression's
// choices in V8's order (alternatives from the left, a greedy quantifier's
// longer match first, a lazy one's shorter), backing up to the last choice
// when it fails; every step, forward or back, is one unit of work. What it
// finds is checked against V8's own match, so that it counts the search V8
// makes.
//
// It runs regular expressions as linear() writes them, without the i flag,
// and takes neither back references nor lookarounds (none of BACKTRACKING has
// them; compile() throws on them).
import { RegExpParser } from "@eslint-community/regexpp";
import { linear } from "./regexp.mjs";

// The regular expressions that backtrack beyond linear time, by finding of
// docs/findings.md: the script, the source and the flags of each, as the
// extension at the submodule's commit has them (tests/regexp.test.mjs checks
// that it has them all, and that it has no other).
export const BACKTRACKING = {
  S2: [
    ["background.js", String.raw`サイト連絡先[・･\u30FB]?メール[\s\S]*?<td[^>]*>\s*([^,<\n]+?)\s*(?:,|<)`, ""],
  ],
  S8: [
    ["background.js", String.raw`<tr[^>]*>([\s\S]*?)<\/tr>`, "gi"],
    ["background.js", String.raw`<td[^>]*>([\s\S]*?)<\/td>`, "gi"],
    ["background.js", String.raw`<[^>]+>`, "g"],
    ["background.js", String.raw`<style[^>]*>[\s\S]*?<\/style>`, "gi"],
    ["background.js", String.raw`<script[^>]*>[\s\S]*?<\/script>`, "gi"],
    ["background.js", String.raw`^(.*?)\u300E(.+?)\u300F`, ""],
    ["background.js", String.raw`[\uFF08(]([^\uFF09)]+)[\uFF09)]`, ""],
    ["background.js", String.raw`[\s,\u3001;\uFF1B]+$`, "g"],
    ["background.js", String.raw`[,\u3001]\s*([^,\u3001]+?(?:\u793E|\u51FA\u7248|\u66F8[\u5E97\u9662\u623F]|\u30D7\u30EC\u30B9|Press|Publishing|University Press))`, "i"],
  ],
  S9: [
    ["background.js", String.raw`\s*\(.*\)\s*$`, ""],
    ["popup.js", String.raw`=+$`, ""],
    ["src/assignments.js", String.raw`=+$`, ""],
    ["src/auth-totp-register.js", String.raw`=+$`, ""],
    ["src/auth-totp.js", String.raw`=+$`, ""],
    ["src/course-name.js", String.raw`\[(?:\d{4}[^\]]*?)?([月火水木金土日])\s*([０-９0-9]+)\s*\]`, ""],
    ["src/textbooks.js", String.raw`\[(?:\d{4}[^\]]*?)?([月火水木金土日])\s*([０-９0-9]+)\s*\]`, ""],
    ["src/tree-view.js", String.raw`collectionId.*?=\s*'([^']*)'`, ""],
  ],
};

// The finding whose regular expression a literal of `file` is, if it is one.
export function findingOf(file, source, flags) {
  return Object.keys(BACKTRACKING).find((id) => BACKTRACKING[id].some(([f, s, g]) => f === file && s === source && g === flags));
}

const parser = new RegExpParser();
const tables = new Map();

// Which code units `atom` (a class or an escape of one, standing alone)
// matches with `flags` (s at most), as V8 says: a table of the 65,536.
function table(atom, flags) {
  const key = `${flags}/${atom}`;
  let t = tables.get(key);
  if (!t) {
    const re = new RegExp(`^(?:${atom})$`, flags);
    t = new Uint8Array(0x10000);
    for (let c = 0; c <= 0xffff; c++) t[c] = re.test(String.fromCharCode(c)) ? 1 : 0;
    tables.set(key, t);
  }
  return t;
}

const isLineTerminator = (c) => c === 0x0a || c === 0x0d || c === 0x2028 || c === 0x2029;
const isWord = (c) => (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f;

// The program of `source` and `flags`, as linear() writes them: a list of
// instructions, and how many places a loop keeps where its turn began.
function program(source, flags) {
  const pattern = parser.parsePattern(source, 0, source.length, { unicode: false, unicodeSets: false });
  const dotAll = flags.includes("s") ? "s" : "";
  const multiline = flags.includes("m");
  const code = [];
  let marks = 0;
  const emit = (ins) => {
    code.push(ins);
    return ins;
  };
  const alternatives = (list) => {
    const ends = [];
    list.forEach((a, k) => {
      if (k < list.length - 1) {
        const split = emit({ op: "split", x: code.length + 1, y: 0 });
        sequence(a);
        ends.push(emit({ op: "jmp", to: 0 }));
        split.y = code.length;
      } else {
        sequence(a);
      }
    });
    for (const j of ends) j.to = code.length;
  };
  const sequence = (a) => a.elements.forEach(element);
  // A turn of a quantifier past its least: one that matched nothing fails,
  // as the ECMAScript standard says.
  const turn = (node) => {
    const mark = marks++;
    emit({ op: "mark", mark });
    element(node.element);
    emit({ op: "progress", mark });
  };
  const element = (node) => {
    switch (node.type) {
      case "Character":
        emit({ op: "unit", unit: node.value });
        return;
      case "CharacterClass":
      case "CharacterSet":
        if (node.kind === "property") throw new Error(`compile(): no Unicode property escapes (${node.raw})`);
        emit({ op: "set", table: table(node.raw, dotAll) });
        return;
      case "Group":
      case "CapturingGroup":
        alternatives(node.alternatives);
        return;
      case "Assertion":
        if (node.kind === "start" || node.kind === "end") emit({ op: node.kind });
        else if (node.kind === "word") emit({ op: "word", negate: node.negate });
        else throw new Error(`compile(): no lookarounds (${node.raw})`);
        return;
      case "Quantifier": {
        for (let k = 0; k < node.min; k++) element(node.element);
        if (node.max === Infinity) {
          const split = emit({ op: "split", x: 0, y: 0 });
          const body = code.length;
          turn(node);
          emit({ op: "jmp", to: code.indexOf(split) });
          if (node.greedy) Object.assign(split, { x: body, y: code.length });
          else Object.assign(split, { x: code.length, y: body });
        } else {
          const splits = [];
          for (let k = node.min; k < node.max; k++) {
            const split = emit({ op: "split", x: 0, y: 0 });
            splits.push([split, code.length]);
            turn(node);
          }
          for (const [split, body] of splits) {
            if (node.greedy) Object.assign(split, { x: body, y: code.length });
            else Object.assign(split, { x: code.length, y: body });
          }
        }
        return;
      }
      default:
        throw new Error(`compile(): no ${node.type} (${node.raw})`);
    }
  };
  alternatives(pattern.alternatives);
  emit({ op: "match" });
  return { code, marks, multiline };
}

const programs = new Map();

// The program of a regular expression of the extension, written as linear()
// writes it, made once.
export function compile(source, flags) {
  const key = `/${source}/${flags}`;
  let p = programs.get(key);
  if (!p) {
    const l = linear(source, flags);
    if (/[uv]/.test(l.flags)) throw new Error(`compile(): no u or v flag (${key})`);
    p = { ...program(l.source, l.flags), global: l.flags.includes("g"), sticky: l.flags.includes("y") };
    programs.set(key, p);
  }
  return p;
}

// One try at `start`: the end of the match, or -1, and the steps it took.
function attempt(p, s, start, counted) {
  const { code } = p;
  const n = s.length;
  const marks = new Array(p.marks).fill(-1);
  // Choices to go back to, as [pc, i], and marks to restore, as [-1 - mark,
  // the place it had].
  const back = [];
  let pc = 0;
  let i = start;
  let steps = 0;
  for (;;) {
    if (++steps === 0x10000) {
      counted(steps);
      steps = 0;
    }
    const ins = code[pc];
    let ok;
    switch (ins.op) {
      case "unit": ok = i < n && s.charCodeAt(i) === ins.unit; if (ok) i++; break;
      case "set": ok = i < n && ins.table[s.charCodeAt(i)] === 1; if (ok) i++; break;
      case "split": back.push(ins.y, i); pc = ins.x; continue;
      case "jmp": pc = ins.to; continue;
      case "mark": back.push(-1 - ins.mark, marks[ins.mark]); marks[ins.mark] = i; ok = true; break;
      case "progress": ok = i !== marks[ins.mark]; break;
      case "start": ok = i === 0 || (p.multiline && isLineTerminator(s.charCodeAt(i - 1))); break;
      case "end": ok = i === n || (p.multiline && isLineTerminator(s.charCodeAt(i))); break;
      case "word": ok = (i > 0 && isWord(s.charCodeAt(i - 1))) !== (i < n && isWord(s.charCodeAt(i))) !== ins.negate; break;
      case "match": counted(steps); return i;
    }
    if (ok) {
      pc++;
      continue;
    }
    // Back to the last choice, restoring the marks set since.
    for (;;) {
      if (back.length === 0) {
        counted(steps);
        return -1;
      }
      const at = back.pop();
      const to = back.pop();
      steps++;
      if (to < 0) {
        marks[-1 - to] = at;
        continue;
      }
      pc = to;
      i = at;
      break;
    }
  }
}

// What exec() of the regular expression `p` finds in `s` from `lastIndex`
// (from 0 unless it is global or sticky): { index, end } of the match, or
// { index: -1 }. Its steps are handed to counted() as it goes.
export function run(p, s, lastIndex, counted) {
  const from = p.global || p.sticky ? lastIndex : 0;
  for (let start = from; start <= s.length; start++) {
    const end = attempt(p, s, start, counted);
    if (end >= 0) return { index: start, end };
    if (p.sticky) break;
  }
  return { index: -1, end: -1 };
}
