// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// What the fuzz targets share: the provider that turns the fuzzer's bytes
// into values, the values made from them, the answers of the network, the
// judging of the extension's work, and a failure that names the input's
// problem.
//
// Nothing here holds the input back:
// - bytes are the input's bits as they are, of any length, none included;
// - a string is the input's bits read as the input picks: sixteen at a time
//   as code units, so that every unit comes up (lone surrogates, U+0000 and
//   U+FFFF among them); eight at a time as U+0000 to U+00FF, so that ASCII,
//   which the syntax the extension reads is written in, comes up as often as
//   anything; or as UTF-8, as the dictionaries (fuzz/dict/) spell words;
// - a number is any 64-bit pattern (NaN with any payload, ±Infinity, -0,
//   subnormals) or one of the values that edge cases hide behind;
// - a value may also be undefined, null, a BigInt, a Date, a RegExp with any
//   flags, an ArrayBuffer, a DataView or a typed array of any kind, a Map, a
//   Set, an array with holes or an object with any keys (__proto__ as an own
//   key too), nested as deep as the input says;
// - a length is bounded by what the bytes of an input hold (BOTTOM), and, for
//   a piece of the input repeated, by what one runtime message of Chrome
//   carries (MAX_UNITS) on the input's top rung;
// - the network may fail, answer with any status, any content type and any
//   charset, or cut its body short.
// Words the extension looks for are mixed in only so that the fuzzer reaches
// the branches behind them sooner.
//
// What a value turns into on its way into the extension is the channel's
// doing, and is done as Chrome does it: the harness copies runtime messages
// and chrome.storage as JSON (NaN becomes null, a BigInt cannot be sent at
// all), and json() and clone() below do the same for values a target hands
// over directly. How deep a value can go is the channel's to say too: JSON
// carries any depth, a structured clone stops at about ten thousand levels.
//
// No input is judged by the time it takes (harness/work.mjs): the extension's
// work is counted, on rungs of the input (ladder()). An input is run as it is,
// then with each piece it repeats repeated twice as many times, four times,
// and so on, as many doublings as it picks; a rung is allowed, before it runs,
// the most work that the growth of the work over the two rungs below allows
// work that grows as n log n, and the input fails on the first rung that
// passes it, or that passes what linear code does with an input of its size
// (the bound of harness/work.mjs, all that the two lowest rungs are held to).
// The size is counted here: the input's bytes, and the units of every string
// and byte array made from them (provider()). A regular expression's work is
// counted by the steps of a backtracking engine (harness/backtrack.mjs), on
// the input it is given. The time is looked at from rung to rung too, as a
// check of the counting.
import { constants } from "node:buffer";
import { FuzzedDataProvider } from "@jazzer.js/core";
import { BACKTRACKING } from "../harness/backtrack.mjs";
import { avoidBacktracking } from "../harness/install.mjs";
import { LINEAR, addUnits, beginInput, endInput, setBase, work } from "../harness/work.mjs";
import { open } from "./open-findings.mjs";

export { FuzzedDataProvider, open };

// Known: S2, S8 and S9 (docs/findings.md). While one stands, its regular
// expressions run on V8's linear engine, which finds what they find in time
// linear in the input, and their work is counted by how far they went, not by
// the steps of a backtracking engine (harness/work.mjs): on the first input
// that made them backtrack, a backtracking engine would take them past the
// bound, and Chrome past any time. Nothing of the input is cut.
for (const id of Object.keys(BACKTRACKING)) if (open(id)) avoidBacktracking(id);

// Strings the extension looks for.
export const WORDS = [
  "提出済", "評定済", "採点済", "返却", "再提出", "未開始", "取組中", "submitted", "graded", "returned",
  "kulms-totp-load", "kulms-totp-save", "kulms-totp-has", "kulms-totp-delete", "kulms-totp-code", "fetchTextbooks",
  "epochSecond", "time", "id", "type", "text", "deadline", "repeat", "weekly", "memo-", "active",
  "__proto__", "constructor", "prototype", "toString", "valueOf", "hasOwnProperty", "length", "",
];

// What one input may make: the units of all the strings and byte arrays and
// all the holes of the arrays made from it, as many as one runtime message of
// Chrome carries at the least. The extension's parts hand what they read to
// one another in runtime messages, which Chrome writes as JSON and refuses
// beyond 64 MiB of its UTF-8 (kMaxMessageLength of
// extensions/renderer/api/messaging/messaging_util.cc), and JSON writes a unit
// as six bytes at most (\u0000): an input that made more could not pass
// between the extension's parts even once. A unit that grows on its way, to
// the nine characters of a URL's percent-encoding at most, still leaves what
// is made within the longest string V8 makes, as is checked here.
export const MAX_UNITS = Math.floor((64 * 2 ** 20) / 6);
if (9 * MAX_UNITS > constants.MAX_STRING_LENGTH) throw new Error("what an input makes, percent-encoded, would not fit in a string of V8");

// What the bottom rung of an input may make: as many units as libFuzzer makes
// an input of bytes unless told otherwise, which is as long as ci/fuzz.sh
// lets an input be. Larger sizes are the rungs': an input of this size
// reaches the bound of linear code fast, whatever its work, and the rungs
// above it are judged by how their work grows.
export const BOTTOM = 4096;

// --- The input, its rungs, and its size.
//
// An input is run on rungs (ladder()): on the first as it is, and on each one
// above with every piece it repeats repeated twice as many times as on the
// one below, up to the top rung, as many doublings up as the input picks
// (doublings()). Each rung is a whole input to the extension, judged by
// itself (judge()), and between rungs how the work grew is judged:
// - work that grows as n log n at most adds, from one rung to the next, no
//   more than 2^LINEAR times what it added to the one before (degree() of
//   harness/work.mjs; a sort, as harness/costs.mjs counts it, at most 2.44
//   times), and work that grows as the square adds four times as much once
//   the square outweighs the rest, and so on every rung from there up.
// - Growth is read only where the code went through what the rungs added: a
//   rung whose work grew by fewer steps than the units it added (a step a
//   unit is the least that reading them takes) has not reached them yet, and
//   gives nothing to read growth from.
// - A rung whose work grew faster than n log n once is a step, not yet a
//   growth: where the input's repeats first make something whole that the
//   code then reads (a row that closes), or the parity of a count changes its
//   path, the work jumps on one rung and grows as before after it. Growth
//   faster than n log n goes on. So once a rung has grown faster than that,
//   the rung above is allowed, before it runs, the work of the rung below it
//   and 2^LINEAR times what that one added (work.cap of harness/work.mjs), and
//   is stopped once it passes it: an input whose work grows faster than
//   n log n fails on the second rung in a row where that shows, the first of
//   them run to the end, and no other rung is held to more than the bound
//   of linear code (harness/work.mjs), which an input of BOTTOM units, the
//   bottom rung, reaches fast.
// - The time is a check of the counting, not of the extension: from rung to
//   rung it must grow as the counted work does, to within the noise of the
//   clock (NOISE). Time that grows faster is work the counting does not see
//   (harness/costs.mjs, harness/web-costs.mjs), or a loop where nothing is
//   counted, and fails the input as such. It is compared over rungs two
//   doublings apart (TIME_SPAN): the time of one rung that comes out a little
//   long or short changes the time added below it and above it the other way
//   round, so that the growth from one rung to the next is noisier by far
//   than the growth over two, while work the counting misses grows as much
//   faster over two doublings as over one, in degrees. Once a rung ends, the
//   degree of the time's growth over the span below it may pass the degree of
//   the work's by NOISE at most; and a rung is stopped once its time passes
//   what growth of degree LINEAR + NOISE from the span below allows it. The
//   time is looked at only where the span below added TIME_FLOOR seconds or
//   more: below that, the noise of the clock is as large as what it measures.

let calibrating = false;
let rung = 1; // how many times more the rung being run repeats a piece than the bottom rung
let top = 1; // the same of the input's top rung
let leftBottom = BOTTOM; // what the input may still make on its bottom rung
let leftTop = MAX_UNITS; // and on its top rung
let repeated = 0; // the units of the bottom rung that the rungs above repeat more
let rungCap = Infinity; // the work the rungs below allow the rung being run
let rungTime = Infinity; // and its time, in seconds
let capNote = ""; // how they were worked out, for a failure's message
let timeNote = "";
let judged = null; // the work of the rung last judged (judge())

// How much more a rung may add over the rung below than that one added over
// the one below it: as much as work that grows as n log n at most adds.
export const GROWTH = 2 ** LINEAR;

// How many doublings apart the rungs are whose times are compared.
export const TIME_SPAN = 2;

// The noise of the clock, in degrees: how much faster than the counted work
// the time of the rungs may grow before it is taken for work the counting does
// not see; and the least time the span below a rung must add for its time to
// be looked at. Measured (docs/findings.md), not derived: the time a step
// takes is the machine's, and its noise the garbage collector's and the
// scheduler's. Work the counting misses that grows as the square passes the
// work's degree by 1. KULMS_FUZZ_NOISE sets the noise for a machine of other
// noise (Infinity looks at no time, as when the noise is measured).
export const NOISE = process.env.KULMS_FUZZ_NOISE ? Number(process.env.KULMS_FUZZ_NOISE) : 0.5;
export const TIME_FLOOR = 0.3;

// A provider for `data`, an input of the target's, on the rung being run: its
// work is judged against the size of the input, which is counted from here on
// (harness/work.mjs), and against what the rungs below allow it.
export function provider(data) {
  const fdp = new FuzzedDataProvider(data);
  top = 2 ** doublings(fdp);
  leftBottom = BOTTOM;
  leftTop = MAX_UNITS;
  repeated = 0;
  beginInput(data.length, { judge: !calibrating, cap: rungCap, deadline: performance.now() + 1000 * rungTime });
  return fdp;
}

// A provider for `data` read back outside a target's run (fuzz/inputs.mjs and
// the tests read inputs so): as provider() reads it, on the bottom rung, and
// nothing judged.
export function reading(data) {
  const fdp = new FuzzedDataProvider(data);
  rung = 1;
  top = 2 ** doublings(fdp);
  leftBottom = BOTTOM;
  leftTop = MAX_UNITS;
  repeated = 0;
  return fdp;
}

// What is made from the input: `n` units on the bottom rung, `scaled` when
// the rungs above repeat it more. It adds to the input's size on the rung
// being run, and takes from what the input may still make on its bottom rung
// and on its top rung. The units made on this rung.
function made(n, scaled = false) {
  const here = scaled ? n * rung : n;
  addUnits(here);
  leftBottom -= n;
  leftTop -= scaled ? n * top : n;
  if (scaled) repeated += n;
  return here;
}

// What a piece that the rungs do not repeat may still take of the input.
const room = () => Math.max(0, Math.min(leftBottom, leftTop));

// `x` (a string or bytes), made from the input as it is.
const taken = (x) => {
  made(x.length);
  return x;
};

// Fails the input when the extension's work for it passed what linear code
// does with an input of its size, or what the rungs below allow it, even if
// the extension caught what the counting threw; or when its time passed what
// the rungs below allow it.
export function judge() {
  const r = endInput();
  judged = r;
  if (r.overTime) fail(`the extension's time on the rung of ×${rung} passed ${rungTime.toFixed(2)} s: ${timeNote}; time that grows faster than the counted work is work the counting does not see (harness/costs.mjs, harness/web-costs.mjs), or a loop where nothing is counted`);
  if (r.over && r.capped) fail(`the extension's work on the rung of ×${rung} passed ${r.bound}: ${capNote}; it grows faster than n log n with the input's size on two rungs in a row`);
  if (r.over) fail(`the extension's work passed ${r.bound}, the most that linear code does with an input of ${r.units} units: it is not linear in the input, or it does not end`);
}

// Runs `run`, the target's work for one input, on the rungs of `data` (the
// head of this section), one after another until the top rung or a failure.
export async function ladder(data, run) {
  const rungs = [];
  for (;;) {
    climb(rungs);
    const start = performance.now();
    await run(data);
    if (!landed(rungs, (performance.now() - start) / 1000)) return;
  }
}

// ladder() for a target whose work for an input is synchronous.
export function ladderSync(data, run) {
  const rungs = [];
  for (;;) {
    climb(rungs);
    const start = performance.now();
    run(data);
    if (!landed(rungs, (performance.now() - start) / 1000)) return;
  }
}

// Whether the code went through what rung `y` added over rung `x`: its work
// grew by at least a step a unit added.
const reads = (x, y) => y.work - x.work >= Math.max(1, y.units - x.units);

// Gets the next rung ready: how many times more it repeats a piece, and the
// work and the time that the rungs below allow it.
function climb(rungs) {
  rung = 2 ** rungs.length;
  rungCap = Infinity;
  rungTime = Infinity;
  capNote = "";
  timeNote = "";
  if (rungs.length >= 3) {
    const [a, b, c] = rungs.slice(-3);
    const before = b.work - a.work;
    const after = c.work - b.work;
    if (reads(a, b) && reads(b, c) && after > GROWTH * before) {
      rungCap = c.work + GROWTH * after;
      capNote = `its work grew faster than n log n from ×${b.m} to ×${c.m}, by ${after}, more than ${GROWTH.toFixed(2)} times the ${before} it grew from ×${a.m} to ×${b.m}, and may grow ${GROWTH.toFixed(2)} times ${after} more to ×${rung}`;
    }
  }
  if (rungs.length < 2 * TIME_SPAN) return;
  const [low, high] = [rungs.at(-2 * TIME_SPAN), rungs.at(-TIME_SPAN)];
  const took = high.time - low.time;
  if (took >= TIME_FLOOR) {
    const growth = 2 ** (TIME_SPAN * (LINEAR + NOISE));
    rungTime = high.time + growth * took;
    timeNote = `from ×${low.m} to ×${high.m} the time grew by ${took.toFixed(2)} s, and it may grow ${growth.toFixed(0)} times as much from ×${high.m} to ×${rung}, as work of degree ${LINEAR} at most does, but for the noise of the clock`;
  }
}

// KULMS_FUZZ_RUNGS=1 writes each rung as it ends: how many times more it
// repeats a piece than the bottom rung, its size, its work and its time.
const SHOW_RUNGS = Boolean(process.env.KULMS_FUZZ_RUNGS);

// Keeps the rung just run, and compares its time with its work. Whether there
// is a rung above it: none above the top, and none when the input repeats
// nothing.
function landed(rungs, time) {
  rungs.push({ m: rung, work: judged.done, units: judged.units, time });
  if (SHOW_RUNGS) console.error(`rung ×${rung}: ${judged.units} units, ${judged.done} steps, ${time.toFixed(3)} s`);
  if (rungs.length > 2 * TIME_SPAN) {
    const [a, b, c] = [rungs.at(-2 * TIME_SPAN - 1), rungs.at(-TIME_SPAN - 1), rungs.at(-1)];
    const t1 = b.time - a.time;
    const w1 = b.work - a.work;
    const t2 = c.time - b.time;
    const w2 = c.work - b.work;
    if (t1 >= TIME_FLOOR && w1 > 0 && t2 > 0) {
      const faster = (Math.log2(t2 / t1) - Math.log2(Math.max(w2 / w1, 1))) / TIME_SPAN;
      if (faster > NOISE) {
        fail(`the extension's time grew faster than its counted work, by ${faster.toFixed(2)} degrees: from ×${a.m} to ×${b.m} its rungs added ${t1.toFixed(2)} s and ${w1} steps, from ×${b.m} to ×${c.m} ${t2.toFixed(2)} s and ${w2} steps; time that grows faster than the work is work the counting does not see (harness/costs.mjs, harness/web-costs.mjs)`);
      }
    }
  }
  return repeated > 0 && rung < top;
}

// Runs `fuzz` on the input of no bytes, unjudged, and takes the work it took
// as what any input may take whatever its size (the base of the bound).
export async function calibrate(fuzz) {
  calibrating = true;
  try {
    await fuzz(Buffer.alloc(0));
  } finally {
    calibrating = false;
  }
  setBase(work.done);
}

// How many of something: as many as the input has bytes left for.
const count = (fdp) => fdp.consumeIntegralInRange(0, fdp.remainingBytes);

// The number of binary digits of n (0 for 0), for n below 2^32.
const digits = (n) => 32 - Math.clz32(n);

// The binary digits of the number an input picks its top rung by: as many as
// MAX_UNITS has, so that the top rung is at most 2^(TOP_BITS - 1) times the
// bottom one, and a piece of one unit repeated once on the bottom rung still
// fits on the top one.
export const TOP_BITS = digits(MAX_UNITS);

// How many doublings up the input's top rung is: the input picks it first,
// each more doubling half as likely as the one before, as many() picks a
// number's digits, so that every height takes about the same share of the
// fuzzer's work (a rung costs about twice the one below it).
function doublings(fdp) {
  const r = fdp.consumeIntegralInRange(0, 2 ** TOP_BITS - 1);
  return r === 0 ? 0 : TOP_BITS - digits(r);
}

// How many times to repeat a piece, up to `max`: the input picks how many
// binary digits the number has, each more digit half as likely as the one
// before, and then any number of that many digits. A number of k + 1 digits
// costs about twice one of k and comes up half as often, so that every size
// class takes about the same share of the fuzzer's work: small inputs keep it
// quick, and every size up to `max` comes up.
function many(fdp, max) {
  if (max < 1) return 0;
  const bits = digits(max);
  const r = fdp.consumeIntegralInRange(0, 2 ** bits - 1);
  if (r === 0) return 0;
  const k = bits - digits(r);
  return Math.min(max, 2 ** k + fdp.consumeIntegralInRange(0, 2 ** k - 1));
}

const chars = (codes) => {
  let s = "";
  for (let i = 0; i < codes.length; i += 8192) s += String.fromCharCode.apply(null, codes.subarray(i, i + 8192));
  return s;
};

// Bytes as code units, two to a unit, low byte first (a last odd byte is left
// out).
function units(bytes) {
  const u = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < u.length; i++) u[i] = bytes[2 * i] | (bytes[2 * i + 1] << 8);
  return chars(u);
}

// Bytes as U+0000 to U+00FF, one to a unit.
const latin1 = (bytes) => chars(Uint8Array.from(bytes));

// Bytes as UTF-8, U+FFFD where they are not UTF-8, a byte order mark kept.
const utf8 = (bytes) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(Uint8Array.from(bytes));

// The ways bytes are read as a string, in the order the input picks them by.
export const DECODINGS = [units, latin1, utf8];

// Bytes that take() takes from the input, read as a string as the input picks.
const decoded = (fdp, take) => fdp.pickValue(DECODINGS)(take());

// How long a piece to repeat: mostly a few bytes, now and then as long as the
// input has bytes for.
const pieceLength = (fdp) => Math.max(1, many(fdp, fdp.remainingBytes));

// How many times a piece of `length` units is repeated on the bottom rung:
// up to as many as what the input may still make holds there, and, the
// rungs' times as many, on the top rung.
const repeats = (fdp, length) => (length ? many(fdp, Math.min(Math.floor(leftBottom / length), Math.floor(leftTop / (length * top)))) : 0);

// `piece` repeated on the rung being run: `times` times on the bottom rung.
function repeatedBytes(piece, times) {
  made(piece.length * times, true);
  const out = new Uint8Array(piece.length * times * rung);
  for (let i = 0; i < times * rung; i++) out.set(piece, i * piece.length);
  return out;
}

// Any bytes: some of the input's, the rest of it, or a piece repeated. What
// the input takes as it is ends where what it may still make does.
export function bytes(fdp) {
  switch (fdp.consumeIntegralInRange(0, 3)) {
    case 0: return taken(Uint8Array.from(fdp.consumeRemainingAsBytes()).subarray(0, room()));
    case 1: {
      const piece = Uint8Array.from(fdp.consumeBytes(pieceLength(fdp)));
      return repeatedBytes(piece, repeats(fdp, piece.length));
    }
    default: return taken(Uint8Array.from(fdp.consumeBytes(count(fdp))).subarray(0, room()));
  }
}

// Any string: mostly some of the input's bits, or the rest of them, read as
// the input picks; now and then a word the extension looks for, or a piece
// repeated. It ends where what the input may still make does, as bytes do.
export function string(fdp) {
  if (fdp.remainingBytes === 0) return "";
  switch (fdp.consumeIntegralInRange(0, 5)) {
    case 0: return taken(fdp.pickValue(WORDS).slice(0, room()));
    case 1: {
      const piece = fdp.consumeBoolean() ? fdp.pickValue(WORDS) : decoded(fdp, () => fdp.consumeBytes(pieceLength(fdp)));
      const times = repeats(fdp, piece.length);
      made(piece.length * times, true);
      return piece.repeat(times * rung);
    }
    case 2: return taken(decoded(fdp, () => fdp.consumeRemainingAsBytes()).slice(0, room()));
    default: return taken(decoded(fdp, () => fdp.consumeBytes(count(fdp))).slice(0, room()));
  }
}

// The numbers edge cases hide behind.
export const SPECIAL = [
  NaN, Infinity, -Infinity, -0, 0, 1, -1, 0.5, -0.5,
  2 ** 31 - 1, 2 ** 31, -(2 ** 31), 2 ** 32, 2 ** 53, 2 ** 53 + 2, -(2 ** 53) - 2,
  Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, Number.EPSILON, 1e21, 1e-7,
  8.64e15, -8.64e15, 8.64e15 + 1, // the limits of a Date
];

// Any number: any 64-bit pattern, a special number, or an integer.
export function number(fdp) {
  switch (fdp.consumeIntegralInRange(0, 2)) {
    case 0: return fdp.pickValue(SPECIAL);
    case 1: {
      const b = new Uint8Array(8);
      b.set(fdp.consumeBytes(8));
      return new DataView(b.buffer).getFloat64(0, true);
    }
    default: return fdp.consumeIntegral(6, true);
  }
}

// Binary data as a structured clone can carry it: the bytes as an
// ArrayBuffer, a DataView or a typed array of any kind over them (as many
// elements as whole ones fit).
const VIEWS = [Uint8Array, (b) => b.buffer, (b) => new DataView(b.buffer), Int8Array, Uint8ClampedArray, Int16Array, Uint16Array,
  Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array]
  .map((T) => (T.BYTES_PER_ELEMENT ? (b) => new T(b.buffer, 0, Math.floor(b.length / T.BYTES_PER_ELEMENT)) : T));

const REGEXP_FLAGS = "dgimsuvy";

const property = (o, key, v) => Object.defineProperty(o, key, { value: v, enumerable: true, writable: true, configurable: true });

// Any value a script can hand over, nested as deep as the input says. It is
// made with a stack of its own rather than by recursion, so that how deep it
// can go is not the generator's to say but the channel's (the head of this
// file). The input is read in the order a recursive generator would read it
// (fuzz/encode.mjs writes it so): each value's kind, and a container's count
// before its contents.
export function value(fdp) {
  let result;
  // The containers being filled, innermost last. fill() makes the next of a
  // container's contents and returns true, or finishes the container and
  // returns false.
  const open = [];
  const make = (put) => {
    if (fdp.remainingBytes === 0) return put(undefined);
    switch (fdp.consumeIntegralInRange(0, 15)) {
      case 0: return put(undefined);
      case 1: return put(null);
      case 2: return put(fdp.consumeBoolean());
      case 3: case 4: return put(number(fdp));
      case 5: case 6: return put(string(fdp));
      case 7: return put(fdp.consumeBigIntegral(8, true));
      case 8: return put(new Date(number(fdp)));
      case 9: {
        const source = string(fdp);
        const mask = fdp.consumeIntegral(1);
        const flags = [...REGEXP_FLAGS].filter((_, i) => (mask >> i) & 1).join("");
        try { return put(new RegExp(source, flags)); } catch { return put(/x/); } // a source or flags (u with v) that no RegExp takes
      }
      case 10: {
        const view = fdp.pickValue(VIEWS);
        return put(view(Uint8Array.from(fdp.consumeBytes(count(fdp)))));
      }
      case 11: {
        const m = new Map();
        put(m);
        let n = count(fdp);
        let key;
        let keyed = false;
        open.push({
          fill() {
            if (keyed) {
              keyed = false;
              make((v) => m.set(key, v));
              return true;
            }
            if (!(n > 0 && fdp.remainingBytes > 0)) return false;
            n--;
            keyed = true;
            make((k) => { key = k; });
            return true;
          },
        });
        return undefined;
      }
      case 12: {
        const s = new Set();
        put(s);
        let n = count(fdp);
        open.push({
          fill() {
            if (!(n > 0 && fdp.remainingBytes > 0)) return false;
            n--;
            make((v) => s.add(v));
            return true;
          },
        });
        return undefined;
      }
      case 13: {
        const a = [];
        put(a);
        let n = count(fdp);
        open.push({
          fill() {
            if (n > 0 && fdp.remainingBytes > 0) {
              n--;
              make((v) => a.push(v));
              return true;
            }
            if (fdp.consumeBoolean()) a.length += made(many(fdp, Math.min(leftBottom, Math.floor(leftTop / top))), true); // holes, as many as a few bytes say, the rungs' times as many
            return false;
          },
        });
        return undefined;
      }
      default: {
        const o = {};
        put(o);
        let n = count(fdp);
        open.push({
          fill() {
            if (!(n > 0 && fdp.remainingBytes > 0)) return false;
            n--;
            const key = string(fdp);
            make((v) => property(o, key, v));
            return true;
          },
        });
        return undefined;
      }
    }
  };
  make((v) => { result = v; });
  while (open.length) {
    if (!open[open.length - 1].fill()) open.pop();
  }
  return result;
}

// What v is after the JSON that Chrome's runtime messages and chrome.storage
// go through: { sendable: false } when JSON cannot hold it at all (a BigInt,
// a cycle), as Chrome then throws in the sender and the extension sees
// nothing.
export function json(v) {
  try {
    const text = JSON.stringify(v);
    return { sendable: true, value: text === undefined ? undefined : JSON.parse(text) };
  } catch {
    return { sendable: false };
  }
}

// What v is after a structured clone, as between the page's world and a
// content script (the detail of a CustomEvent), or { sendable: false } when a
// clone cannot carry it (a symbol, a function, or nesting deeper than the
// clone goes).
export function clone(v) {
  try {
    return { sendable: true, value: structuredClone(v) };
  } catch {
    return { sendable: false };
  }
}

// The JSON text a server could send for v: what JSON.stringify writes, except
// that the input picks how a number without a JSON literal is written (1e400
// parses to Infinity, -1e400 to -Infinity, -0 stays -0), and a BigInt is
// written as its digits, which JSON reads as a number that may lose precision.
// Those numbers are put in v itself first, in the order JSON.stringify goes
// through v, so that the plain JSON.stringify, which goes any depth, writes
// the text (one with a replacer stops at about ten thousand levels). v is
// made for the text alone, so changing it changes nothing else.
export function jsonText(fdp, v) {
  const literal = (x) => {
    if (typeof x === "bigint") return MARK + x.toString();
    if (typeof x !== "number") return x;
    if (Number.isNaN(x)) return fdp.consumeBoolean() ? null : MARK + fdp.pickValue(["1e400", "-1e400"]);
    if (x === Infinity) return MARK + (fdp.consumeBoolean() ? "1e400" : "1e999999");
    if (x === -Infinity) return MARK + "-1e400";
    if (Object.is(x, -0)) return MARK + "-0";
    return x;
  };
  const holder = { "": v };
  // Each frame: an object or array whose own enumerable keys are gone through
  // in turn, as JSON.stringify goes through them.
  const frames = [{ o: holder, keys: [""], i: 0 }];
  while (frames.length) {
    const f = frames[frames.length - 1];
    if (f.i === f.keys.length) {
      frames.pop();
      continue;
    }
    const key = f.keys[f.i++];
    let x = f.o[key];
    if (x === null || x === undefined || x instanceof Date) continue; // a Date writes itself as its ISO string, or null
    if (typeof x !== "object") {
      const y = literal(x);
      if (y !== x) f.o[key] = y;
      continue;
    }
    if (ArrayBuffer.isView(x) && !(x instanceof DataView)) {
      // A typed array writes itself as an object of its elements, which can
      // take no string: an object of them, written the same, can.
      x = Object.fromEntries(Object.keys(x).map((k) => [k, x[k]]));
      f.o[key] = x;
    }
    frames.push({ o: x, keys: Array.isArray(x) ? Array.from({ length: x.length }, (_, i) => String(i)) : Object.keys(x), i: 0 });
  }
  const text = JSON.stringify(holder[""]);
  return text === undefined ? "" : text.replace(MARKED, "$1"); // undefined has no JSON: an empty body
}

// What jsonText() writes in place of a number literal, to put the literal in
// once JSON.stringify is done: a private-use character and a nonce, which no
// input can know, and which JSON.stringify leaves as they are.
const MARK = String.fromCharCode(0xe000) + Math.random().toString(36).slice(2) + ":";
const MARKED = new RegExp(`"${MARK}([^"]*)"`, "g");

// Content types a server may send, the charset named in any spelling or not.
function contentType(fdp, type) {
  return fdp.pickValue([
    type, `${type}; charset=utf-8`, `${type}; charset=UTF-8`, `${type}; charset=shift_jis`, `${type};charset="Shift_JIS"`,
    `${type}; charset=euc-jp`, `${type}; charset=windows-31j`, `${type}; charset=iso-2022-jp`, `${type}; charset=utf-16le`,
    "application/json", "text/plain", "application/octet-stream", "", () => string(fdp),
  ].map((t) => (typeof t === "function" ? t : () => t)))();
}

// The statuses servers answer with most; any other from 200 to 599 comes up
// too (what a Response can hold).
export const STATUSES = [200, 201, 204, 206, 301, 302, 304, 400, 401, 403, 404, 408, 410, 429, 500, 502, 503, 504];

// The answer of the network to one fetch, for a route of harness/net.mjs:
// mostly `body` as `type`, otherwise, as the input picks, a network that
// fails, another status, another content type or none, a body cut short, or
// any bytes in its place.
export function answer(fdp, body, type) {
  switch (fdp.remainingBytes === 0 ? 9 : fdp.consumeIntegralInRange(0, 9)) {
    case 0: return { failed: true };
    case 1: {
      const status = fdp.consumeBoolean() ? fdp.pickValue(STATUSES) : fdp.consumeIntegralInRange(200, 599);
      return { status, headers: { "content-type": contentType(fdp, type) }, body };
    }
    case 2: return { status: 200, headers: { "content-type": contentType(fdp, type) }, body };
    case 3: return { status: 200, headers: {}, body };
    case 4: {
      const b = typeof body === "string" ? new TextEncoder().encode(body) : body;
      return { status: 200, headers: { "content-type": type }, body: b.subarray(0, fdp.consumeIntegralInRange(0, b.length)) };
    }
    case 5: return { status: 200, headers: { "content-type": contentType(fdp, type) }, body: bytes(fdp) };
    default: return { status: 200, headers: { "content-type": type }, body };
  }
}

// A slip of the code, as V8 words a TypeError or a RangeError: what the
// extension does not mean to throw, unlike its own errors ("Fetch failed:
// 400", "登録コースが見つかりませんでした"), a network that fails ("Failed to
// fetch") or an answer that is not JSON (a SyntaxError).
const SLIP = /Cannot read properties|Cannot set properties|Cannot create property|is not a function|is not iterable|is not a constructor|Cannot convert|is not defined|Invalid array length|Invalid string length|Invalid time value|Maximum call stack/;
export const isSlip = (e) => SLIP.test(typeof e === "string" ? e : String(e && e.message));

const printable = (x) => { try { return String(x); } catch { return "[a value String() cannot convert]"; } };

// Keeps what `context` writes to console.warn and console.error from now on.
// The extension catches its own errors in many places and only warns, so a
// slip there takes something out of what the user sees without a word;
// slips() stops keeping and returns the lines that tell of one.
export function warnings(context) {
  const console = context.kind === "background" ? context.global.console : context.window.console;
  const kept = { warn: console.warn, error: console.error };
  const lines = [];
  console.warn = (...args) => { lines.push(args); kept.warn(...args); };
  console.error = (...args) => { lines.push(args); kept.error(...args); };
  return {
    slips() {
      console.warn = kept.warn;
      console.error = kept.error;
      return lines.filter((args) => args.some(isSlip)).map((args) => args.map(printable).join(" "));
    },
  };
}

// A value as a failure message shows it: JSON where JSON can write it (a
// BigInt with an n), else String(), its first 300 characters and its length,
// since an input can make values of millions and the message is for a reader.
export function brief(v) {
  let s;
  try {
    s = JSON.stringify(v, (key, x) => (typeof x === "bigint" ? `${x}n` : x));
  } catch { /* a cycle, a value too deep, or one whose toJSON throws */ }
  if (s === undefined) s = printable(v);
  return s.length > 300 ? `${s.slice(0, 300)}… (${s.length} characters)` : s;
}

// Fails the input, saying what went wrong with it.
export function fail(message) {
  throw new Error(message);
}
