// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The work the extension does, counted rather than timed. A clock says as
// much about the machine, jsdom and the load of the moment as about the
// extension, and no fixed time tells a large input that takes long in linear
// time from a small one that takes long because the code is not linear. So
// the harness counts the steps of everything the extension does:
// - in its own code, each call of a function and each turn of a loop
//   (counters(), which harness/source.mjs puts every script of the extension
//   through), and the syntax that goes through a value: a comparison of two
//   strings that are not written in the code, a property read with a key
//   made at run time (whose string is hashed), the spreading of an object's
//   properties, a walk up a prototype chain;
// - in what it calls of the platform, ECMAScript's built-ins and the web
//   APIs, the steps their standards give (harness/costs.mjs,
//   harness/web-costs.mjs, put in each context by harness/install.mjs); for a
//   regular expression, the steps of a backtracking engine
//   (harness/backtrack.mjs).
//
// What linear code may do follows from the code and the input. Each counting
// site of the code (a function, a loop, a call, a read of a property whose
// steps grow, a counted piece of syntax: sitesOf()) goes through each unit of
// the input a bounded number of times, so linear code does no more than
//   sites × (U + 1) × ⌈log₂(U + 2)⌉ + base
// where U is the size of the input (its bytes, and the units of what is made
// from them: fuzz/lib.mjs), the logarithm allows for sorting, the 1 for what a
// site does once whatever the input, and base is the work of the input of no
// bytes at all, counted when a target starts. Work past that bound is not
// linear, and a loop that does not end gets there too: the counting site then
// throws WorkExceeded from inside the extension's code, and that the bound
// was passed stays recorded even when the extension catches what is thrown.
//
// An input's work is what follows from it: each input is an asynchronous
// context of its own (AsyncLocalStorage), which the promises, timers and
// callbacks it sets going carry along, and a step counts toward the input
// whose context it is in. What an earlier input set going and runs late (a
// timer of the extension's that sorts the sidebar again), or what the page's
// start set going, is not this input's work, and is not counted toward it.
import { AsyncLocalStorage } from "node:async_hooks";
import * as acorn from "acorn";
import { JSDOM } from "jsdom";
import { builtIns, chainLength, keyCount, ruleOf, stringUnits, units } from "./costs.mjs";
import { ALIASES, webRuleOf } from "./web-costs.mjs";

export const work = {
  done: 0, // the work counted since the input began
  units: 0, // U, the size of the input
  base: 0, // the work of the input of no bytes
  sites: 0, // the counting sites of the code loaded so far
  cap: Infinity, // what the rungs below allow this rung of the input (fuzz/lib.mjs)
  bound: Infinity, // what linear code may do with this input, or the cap if less
  capped: false, // the cap is the bound
  deadline: Infinity, // when (performance.now()) the time the rungs below allow runs out
  over: false, // the bound was passed during this input
  overTime: false, // the deadline was passed during this input
  judging: false, // an input is being judged: passing the bound or the deadline throws
};

export class WorkExceeded extends Error {
  constructor() {
    super(work.capped
      ? `the extension's work passed ${work.bound}, what its work on the rungs below allows this rung (fuzz/lib.mjs)`
      : `the extension's work passed ${work.bound}, the most that linear code does with an input of ${work.units} units`);
    this.name = "WorkExceeded";
  }
}

export class TimeExceeded extends Error {
  constructor() {
    super("the extension's time passed what its time on the rungs below allows this rung (fuzz/lib.mjs)");
    this.name = "TimeExceeded";
  }
}

// The context of the input being judged, and its number.
const inputs = new AsyncLocalStorage();
let epoch = 0;

function rebound() {
  const u = work.units;
  const linear = work.sites * (u + 1) * Math.ceil(Math.log2(u + 2)) + work.base;
  work.bound = Math.min(linear, work.cap);
  work.capped = work.cap < linear;
}

// The extension's Math.random (harness/contexts.mjs puts it in each realm in
// place of the realm's own): draws that begin anew with each input, from the
// seed the input is given. A rung of an input (fuzz/lib.mjs) is the input run
// again with its pieces repeated more, and draws what the rungs below drew;
// what the rungs add is then all that differs between them. With draws of
// the moment, how long a draw comes out (the extension makes a request's ID
// of Math.random().toString(36), whose length differs from draw to draw)
// would add work to one rung and not to the next. sfc32, from the seed and
// three constants of its own, two of its numbers to a double in [0, 1) of
// 53 bits, as fine as a double there goes.
let s0 = 0;
let s1 = 0;
let s2 = 0;
let s3 = 0;

function next32() {
  const t = (((s0 + s1) | 0) + s3) | 0;
  s3 = (s3 + 1) | 0;
  s0 = s1 ^ (s1 >>> 9);
  s1 = (s2 + (s2 << 3)) | 0;
  s2 = (s2 << 21) | (s2 >>> 11);
  s2 = (s2 + t) | 0;
  return t >>> 0;
}

function seedRandom(seed) {
  s0 = 0x9e3779b9;
  s1 = 0x243f6a88;
  s2 = 0xb7e15162;
  s3 = seed >>> 0;
  for (let i = 0; i < 12; i++) next32(); // its first numbers, which say little of the seed yet
}

export function random() {
  return ((next32() >>> 5) * 2 ** 26 + (next32() >>> 6)) / 2 ** 53;
}

// An input of `units` units begins, drawing from `seed`; with `judge`,
// passing the bound, or the cap and the deadline that a rung of the input is
// given (fuzz/lib.mjs), throws.
export function beginInput(units, { judge = true, cap = Infinity, deadline = Infinity, seed = 0 } = {}) {
  epoch++;
  inputs.enterWith(epoch);
  seedRandom(seed);
  work.done = 0;
  work.units = units;
  work.cap = cap;
  work.deadline = deadline;
  work.over = false;
  work.overTime = false;
  work.judging = judge;
  rebound();
}

// What is made from the input adds `n` units to it.
export function addUnits(n) {
  work.units += n;
  rebound();
}

// A script's code adds `n` counting sites.
export function addSites(n) {
  work.sites += n;
  rebound();
}

// The work of the input of no bytes, counted when a target starts.
export function setBase(base) {
  work.base = base;
  rebound();
}

// The input has been judged: the work it took, and whether it passed the
// bound.
export function endInput() {
  work.judging = false;
  return { done: work.done, bound: work.bound, capped: work.capped, units: work.units, over: work.over, overTime: work.overTime };
}

let paused = false;

// Steps between two looks at the clock: a look costs more than a step.
let ticks = 0;

// The counting site's call, as __kulmsWork(n) in each context.
export function step(n) {
  if (paused || (epoch > 0 && inputs.getStore() !== epoch)) return;
  work.done += n;
  if (!work.judging) return;
  if (work.done > work.bound) {
    work.over = true;
    throw new WorkExceeded();
  }
  if ((++ticks & 4095) === 0 && performance.now() > work.deadline) {
    work.overTime = true;
    throw new TimeExceeded();
  }
}

// Runs `f` without counting: the harness's or a target's own work on the
// extension's objects (building the page an input describes, looking for
// what a detector looks for), and the working out of a cost. `f` is
// synchronous, and nothing of the extension runs inside it.
export function uncounted(f) {
  const was = paused;
  paused = true;
  try {
    return f();
  } finally {
    paused = was;
  }
}

export const isPaused = () => paused;

// --- The syntax that goes through a value, as each context calls it.

const COMPARISONS = new Set(["===", "!==", "==", "!=", "<", "<=", ">", ">="]);

// a op b, where neither is written in the code: comparing two strings goes
// through them (V8 first compares the lengths of two strings for equality).
export function compare(a, b, op) {
  if (!paused && typeof a === "string" && typeof b === "string") {
    const relational = op[0] === "<" || op[0] === ">";
    step(1 + (relational || a.length === b.length ? Math.min(a.length, b.length) : 0));
  }
  switch (op) {
    case "===": return a === b;
    case "!==": return a !== b;
    case "==": return a == b;
    case "!=": return a != b;
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    default: return a >= b;
  }
}

// A key made at run time: a string is hashed to find the property.
export function key(k) {
  if (!paused) step(1 + stringUnits(k));
  return k;
}

// An object whose own properties are copied ({...o}, a rest of an object).
export function spread(o) {
  if (!paused) step(1 + keyCount(o));
  return o;
}

// x instanceof C walks up x's prototype chain.
export function instanceOf(x, C) {
  if (!paused) step(1 + chainLength(x));
  return x instanceof C;
}

// k in o hashes k and walks up o's prototype chain.
export function has(k, o) {
  if (!paused) step(1 + stringUnits(k) + chainLength(o));
  return k in o;
}

// The object of a for-in, whose keys up its chain are gathered first.
export function forIn(o) {
  if (!paused) {
    let n = 1;
    for (let p = o; p !== null && p !== undefined && (typeof p === "object" || typeof p === "function"); p = Object.getPrototypeOf(p)) n += keyCount(p);
    step(n);
  }
  return o;
}

// The names of the members of the platform whose reading or setting has
// steps that grow: each read or set of one in the code is a counting site.
let costed = null;
function costedNames() {
  if (costed) return costed;
  costed = new Set();
  const w = new JSDOM("", { url: "https://lms.gakusei.kyoto-u.ac.jp/portal", runScripts: "outside-only" }).window;
  const es = builtIns(w);
  for (const b of es) if (b.kind !== "value" && ruleOf(b.path)) costed.add(String(b.key));
  const owners = new Set(es.map((b) => b.owner));
  for (const iface of Object.getOwnPropertyNames(w)) {
    if (Object.hasOwn(ALIASES, iface)) continue;
    let C;
    try {
      C = w[iface];
    } catch {
      continue;
    }
    if (typeof C !== "function" || !C.prototype || owners.has(C) || owners.has(C.prototype)) continue;
    for (const k of Object.getOwnPropertyNames(C.prototype)) {
      const d = Object.getOwnPropertyDescriptor(C.prototype, k);
      if ((d.get && webRuleOf(iface, k, "get")) || (d.set && webRuleOf(iface, k, "set"))) costed.add(k);
    }
  }
  w.close();
  return costed;
}

// --- The extension's code.

function walk(node, visit, depth = 0, parent = null) {
  if (!node || typeof node.type !== "string") return;
  visit(node, depth, parent);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((x) => walk(x, visit, depth + 1, node));
    else if (v && typeof v.type === "string") walk(v, visit, depth + 1, node);
  }
}

const isFunction = (n) => n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression";
const isLoop = (n) => ["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"].includes(n.type);
const isWritten = (n) => n.type === "Literal" || (n.type === "TemplateLiteral" && n.expressions.length === 0) || (n.type === "UnaryExpression" && n.argument.type === "Literal");

// Where a counter goes at the start of a block's statements: after its
// directive prologue, so that "use strict" stays first.
function blockStart(block) {
  let at = block.start + 1;
  for (const s of block.body) {
    if (s.type === "ExpressionStatement" && s.directive !== undefined) at = s.end;
    else break;
  }
  return at;
}

// The edits that count the work of the code of `ast` (`tokens`, acorn's
// tokens of it), each without a newline, so that no line of the script
// moves: { at, text } puts text in, { at, end, text } puts it in place of
// what is there; `depth` and `side` ("open" or "close") order those at one
// place, the outer one outside. And the number of counting sites (sitesOf()).
export function counters(ast, tokens = []) {
  const edits = [];
  let sites = 0;
  const names = costedNames();
  const wrap = (node, depth, open, close) => {
    edits.push({ at: node.start, text: open, depth, side: "open" }, { at: node.end, text: close, depth, side: "close" });
  };
  const operator = (node) => tokens.find((t) => t.start >= node.left.end && t.end <= node.right.start && t.value === node.operator);
  walk(ast, (n, depth, parent) => {
    if (isFunction(n) || isLoop(n)) {
      sites++;
      const body = n.body;
      if (body.type === "BlockStatement") {
        edits.push({ at: blockStart(body), text: " __kulmsWork(1);", depth: depth + 1, side: "open" });
      } else if (isFunction(n)) {
        // An arrow function's expression: (count, expression).
        wrap(body, depth, "(__kulmsWork(1), ", ")");
      } else {
        wrap(body, depth, "{ __kulmsWork(1); ", " }");
      }
      if (n.type === "ForInStatement") wrap(n.right, depth + 1, "__kulmsForIn(", ")");
    } else if (n.type === "CallExpression" || n.type === "NewExpression" || n.type === "TaggedTemplateExpression") {
      sites++;
    } else if (n.type === "BinaryExpression" && (COMPARISONS.has(n.operator) || n.operator === "instanceof" || n.operator === "in")) {
      const counted = n.operator === "instanceof" || n.operator === "in" || !(isWritten(n.left) || isWritten(n.right));
      const op = counted && operator(n);
      if (!op) return;
      sites++;
      const call = n.operator === "instanceof" ? "__kulmsInstanceOf(" : n.operator === "in" ? "__kulmsIn(" : "__kulmsCompare(";
      edits.push({ at: op.start, end: op.end, text: ",", depth, side: "open" });
      wrap(n, depth, call, COMPARISONS.has(n.operator) ? `, ${JSON.stringify(n.operator)})` : ")");
    } else if (n.type === "MemberExpression") {
      if (n.computed && !isWritten(n.property)) {
        sites++;
        wrap(n.property, depth + 1, "__kulmsKey(", ")");
      } else if (!n.computed && names.has(n.property.name)) {
        sites++;
      }
    } else if (n.type === "SwitchCase" && n.test && !isWritten(n.test)) {
      // The discriminant is compared with the case: at most the case's units.
      sites++;
      wrap(n.test, depth + 1, "__kulmsKey(", ")");
    } else if (n.type === "SpreadElement" && parent && parent.type === "ObjectExpression") {
      sites++;
      wrap(n.argument, depth + 1, "__kulmsSpread(", ")");
    } else if ((n.type === "VariableDeclarator" && n.id.type === "ObjectPattern" && n.init) || (n.type === "AssignmentExpression" && n.left.type === "ObjectPattern")) {
      const pattern = n.type === "VariableDeclarator" ? n.id : n.left;
      if (pattern.properties.some((p) => p.type === "RestElement")) {
        sites++;
        wrap(n.type === "VariableDeclarator" ? n.init : n.right, depth + 1, "__kulmsSpread(", ")");
      }
    }
  });
  return { inserts: edits, sites };
}

// `code` parsed, with its tokens.
export function parse(code) {
  const tokens = [];
  const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script", onToken: tokens });
  return { ast, tokens };
}

// The counting sites of `code` (counters()).
export function sitesOf(code) {
  const { ast, tokens } = parse(code);
  return counters(ast, tokens).sites;
}

// --- What is still to happen.
//
// The asynchronous work the harness carries out for the extension: callbacks
// and messages of the chrome API, answers of the network, IndexedDB's
// requests and transactions, Web Crypto's operations. idle() waits until none
// of it is left and the extension has done no work through a whole turn of
// the event loop. The timers the extension sets itself are left out: they are
// its own schedule (a refresh every two minutes, a toast that goes after
// three seconds), not what it does in answer to an input.
export const pending = { count: 0 };

// Something the harness will do later on the extension's behalf begins…
export function started() {
  pending.count++;
}

// …and is done.
export function finished() {
  pending.count--;
}

// `promise`, followed until it settles.
export function tracked(promise) {
  started();
  return Promise.resolve(promise).finally(finished);
}

export async function idle() {
  for (let last = -1; ;) {
    await new Promise((resolve) => setImmediate(resolve));
    if (pending.count === 0 && work.done === last) return;
    last = work.done;
  }
}

// The work the extension does for f() and for all that follows from it, until
// nothing is left to do (idle()), unjudged.
export async function measure(f) {
  beginInput(0, { judge: false });
  await f();
  await idle();
  return work.done;
}

// How the work of run(k), the work for an input of size k, grows with k: the
// work for n, 2n and 4n. What the work has whatever the size cancels out of
// the differences, and work that grows as the d-th power of the size adds 2^d
// times as much from 2n to 4n as from n to 2n: the degree is log₂ of that
// ratio (0 when the work does not grow). Linear work has degree 1, and a
// little more with a sort (n⌈log₂ n⌉ adds at most 2 + 4/⌈log₂ n⌉ times as
// much: degree 1.27 for n of a thousand); quadratic work has degree 2.
export async function degree(n, run) {
  const w = [];
  for (const k of [n, 2 * n, 4 * n]) w.push(await run(k));
  const first = w[1] - w[0];
  const second = w[2] - w[1];
  if (first <= 0) return second <= 0 ? 0 : Infinity;
  return Math.log2(second / first);
}

// The degree below which work is linear: nearer 1 than 2.
export const LINEAR = 1.5;

// Web Crypto (Node's), its operations followed, and their steps counted: an
// operation goes through the data it is given (the key's data to import it,
// the message to sign or digest it, the bytes to fill with random values).
const DATA = { digest: 1, sign: 2, verify: 3, encrypt: 2, decrypt: 2, importKey: 1 };
export const trackedCrypto = {
  getRandomValues: (array) => {
    if (!paused) step(1 + units(array));
    return globalThis.crypto.getRandomValues(array);
  },
  randomUUID: () => globalThis.crypto.randomUUID(),
  subtle: new Proxy(globalThis.crypto.subtle, {
    get(target, k) {
      const v = Reflect.get(target, k, target);
      if (typeof v !== "function") return v;
      return (...args) => {
        if (!paused) step(1 + (Object.hasOwn(DATA, k) ? units(args[DATA[k]]) : 0));
        return tracked(Reflect.apply(v, target, args));
      };
    },
  }),
};
