// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// fuzz/lib.mjs the other way round: the input on which a target reads the
// values one asks for. fuzz/inputs.mjs writes the seeds and the known inputs
// with it, and tests/fuzz-encode.test.mjs checks that lib.mjs reads back what
// this writes.
//
// FuzzedDataProvider takes bytes from the front of the input and integers
// from its end, and how many bytes an integer takes depends on how many are
// left. A Writer is told the length of the whole input, is handed the values
// in the order a target reads them, and lays out the bytes the provider reads
// them from; encode() runs a plan with longer and longer lengths until the
// plan fills the length exactly.
import { BOTTOM, DECODINGS, MAX_UNITS, SPECIAL, TOP_BITS, WORDS } from "./lib.mjs";

// The number of binary digits of n (0 for 0), for n below 2^32.
const digits = (n) => 32 - Math.clz32(n);

// How many bytes the provider reads for an integer between min and min + range.
function width(range) {
  let n = 0;
  for (let r = BigInt(range); r > 0n; r >>= 8n) n++;
  return n;
}

export class Writer {
  constructor(length) {
    this.length = length;
    this.front = [];
    this.back = []; // the bytes of each integer, in the order they are read
    this.left = length; // the provider's remainingBytes, while it is not below 0
    this.ended = false; // the rest of the input has been taken
    this.fits = true; // the values took no more than `length` bytes
    this.room = BOTTOM; // what the input may still make on its bottom rung (fuzz/lib.mjs)
    this.top = 1; // how many times more its top rung repeats a piece
    this.roomTop = MAX_UNITS; // what the input may still make on its top rung
  }

  // A string or bytes of `n` units made, `scaled` when the rungs repeat it
  // more: no more than the bottom rung of an input may make, which lib.mjs
  // would cut short.
  made(n, scaled = false) {
    if (n > this.room) throw new RangeError(`a plan makes more than the ${BOTTOM} units of an input's bottom rung`);
    this.room -= n;
    this.roomTop -= scaled ? n * this.top : n;
  }

  // many() of lib.mjs gives v, as many as `max` at most.
  many(max, v) {
    if (max < 1) { // the provider reads nothing and gives 0
      if (v !== 0) this.fits = false; // as with a count bounded by what is left: the length is too short yet
      return;
    }
    const bits = digits(max);
    if (v === 0) return this.int(0, 2 ** bits - 1, 0);
    if (v > max) {
      this.fits = false;
      v = max;
    }
    const k = digits(v) - 1;
    this.int(0, 2 ** bits - 1, 2 ** (bits - k - 1));
    this.int(0, 2 ** k - 1, v - 2 ** k);
  }

  // The provider's remainingBytes at this point.
  get remaining() {
    return this.ended ? 0 : Math.max(this.left, 0);
  }

  // consumeIntegralInRange(min, max), or consumeBigIntegralInRange() when v is
  // a BigInt, gives v. Once no input is left, the provider gives min.
  int(min, max, v) {
    const big = typeof v === "bigint";
    [min, max] = big ? [BigInt(min), BigInt(max)] : [min, max];
    if (v < min) throw new RangeError(`${v} is below ${min}`);
    if (v > max) { // a count bounded by what is left: the length is too short yet
      this.fits = false;
      v = max;
    }
    if (min === max) return;
    if (this.ended) {
      if (v !== min) throw new Error(`${v} is asked for after the rest of the input was taken`);
      return;
    }
    if (this.left <= 0 && v === min) return;
    const n = width(max - min);
    if (this.left < n) this.fits = false;
    let x = BigInt(v) - BigInt(min);
    const chunk = [];
    for (let i = 0; i < n; i++, x >>= 8n) chunk.push(Number(x & 0xffn));
    this.back.push(chunk);
    this.left -= n;
  }

  // consumeBoolean() gives b.
  bool(b) {
    this.int(0, 255, b ? 1 : 0);
  }

  // pickValue(array) gives the item that is the same as x (Object.is).
  pick(array, x) {
    const i = array.findIndex((y) => Object.is(y, x));
    if (i < 0) throw new RangeError(`${String(x)} is not among the values to pick`);
    this.int(0, array.length - 1, i);
  }

  // consumeBytes(data.length) gives data.
  bytes(data) {
    if (this.ended) {
      if (data.length) throw new Error("bytes are asked for after the rest of the input was taken");
      return;
    }
    if (this.left < data.length) this.fits = false;
    for (const b of data) this.front.push(b);
    this.left -= data.length;
  }

  // consumeRemainingAsBytes() gives data.
  rest(data) {
    this.bytes(data);
    this.ended = true;
  }

  used() {
    return this.front.length + this.back.reduce((n, chunk) => n + chunk.length, 0);
  }

  // The input: the bytes from the front, then the integers' bytes, the first
  // read last.
  input() {
    return Buffer.from([...this.front, ...this.back.toReversed().flat()]);
  }
}

// The input on which the provider reads what plan(writer) hands the writer,
// with a top rung `doublings` doublings up (fuzz/lib.mjs), which provider()
// reads first.
export function encode(plan, { doublings = 0 } = {}) {
  let length = 0;
  for (let round = 0; round < 64; round++) {
    const w = new Writer(length);
    w.top = 2 ** doublings;
    w.int(0, 2 ** TOP_BITS - 1, doublings === 0 ? 0 : 2 ** (TOP_BITS - doublings - 1));
    plan(w);
    if (w.fits && w.used() === length) return w.input();
    length = Math.max(w.used(), length + 1);
  }
  throw new Error("encode(): no length fits the plan");
}

// --- What the generators of fuzz/lib.mjs read, written the other way round.

// The bytes a decoding of lib.mjs reads s from, or null when it cannot hold s.
const ENCODERS = {
  units: (s) => Array.from({ length: 2 * s.length }, (_, i) => (s.charCodeAt(i >> 1) >> (8 * (i & 1))) & 0xff),
  latin1: (s) => {
    const codes = Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
    return codes.every((c) => c <= 0xff) ? codes : null;
  },
  utf8: (s) => (s.isWellFormed() ? [...new TextEncoder().encode(s)] : null),
};
const NAMES = ["units", "latin1", "utf8"]; // in the order of DECODINGS

// string() gives s: as one of WORDS (`word`), or as bytes that the decoding
// `how` reads (by default the first of latin1, utf8 and units that holds s),
// taken as many as they are or, with `rest`, as the rest of the input.
export function string(w, s, { how, word = false, rest = false } = {}) {
  if (w.remaining === 0 && s === "") return;
  if (word) {
    w.int(0, 5, 0);
    w.pick(WORDS, s);
    w.made(s.length);
    return;
  }
  const name = how || ["latin1", "utf8", "units"].find((n) => ENCODERS[n](s) !== null);
  const data = ENCODERS[name](s);
  if (data === null) throw new RangeError(`${name} cannot hold ${JSON.stringify(s)}`);
  w.made(s.length);
  w.int(0, 5, rest ? 2 : 3);
  w.pick(DECODINGS, DECODINGS[NAMES.indexOf(name)]);
  if (rest) {
    w.rest(data);
  } else {
    w.int(0, w.remaining, data.length);
    w.bytes(data);
  }
}

// string() gives `piece` repeated `times` times on the bottom rung, and the
// rungs' times as many above it: the bytes that the decoding `how` reads it
// from (by default the first of latin1, utf8 and units that holds it).
export function repeated(w, piece, times, { how } = {}) {
  const name = how || ["latin1", "utf8", "units"].find((n) => ENCODERS[n](piece) !== null);
  const data = ENCODERS[name](piece);
  if (data === null || data.length === 0) throw new RangeError(`${name} cannot hold ${JSON.stringify(piece)} as a piece`);
  w.int(0, 5, 1);
  w.bool(false); // not a word
  w.pick(DECODINGS, DECODINGS[NAMES.indexOf(name)]);
  w.many(w.remaining, data.length);
  w.bytes(data);
  w.many(Math.min(Math.floor(w.room / piece.length), Math.floor(w.roomTop / (piece.length * w.top))), times);
  w.made(piece.length * times, true);
}

// bytes() gives `data` repeated `times` times on the bottom rung, and the
// rungs' times as many above it.
export function repeatedBytes(w, data, times) {
  if (data.length === 0) throw new RangeError("no bytes to repeat");
  w.int(0, 3, 1);
  w.many(w.remaining, data.length);
  w.bytes([...data]);
  w.many(Math.min(Math.floor(w.room / data.length), Math.floor(w.roomTop / (data.length * w.top))), times);
  w.made(data.length * times, true);
}

// bytes() gives data, taken as many as they are or, with `rest`, as the rest
// of the input.
export function bytes(w, data, { rest = false } = {}) {
  w.made(data.length);
  if (rest) {
    w.int(0, 3, 0);
    w.rest([...data]);
  } else {
    w.int(0, 3, 2);
    w.int(0, w.remaining, data.length);
    w.bytes([...data]);
  }
}

// number() gives x: one of SPECIAL, or the bits of x.
export function number(w, x) {
  if (SPECIAL.some((y) => Object.is(x, y))) {
    w.int(0, 2, 0);
    w.pick(SPECIAL, x);
    return;
  }
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, x, true);
  w.int(0, 2, 1);
  w.bytes([...b]);
}

// value() gives v: undefined, null, a boolean, a number, a string, a BigInt,
// or an array or plain object of such values, none of its arrays with holes.
export function value(w, v) {
  if (w.remaining === 0 && v === undefined) return;
  const max = 15;
  if (v === undefined) return w.int(0, max, 0);
  if (v === null) return w.int(0, max, 1);
  switch (typeof v) {
    case "boolean": w.int(0, max, 2); w.bool(v); return;
    case "number": w.int(0, max, 3); number(w, v); return;
    case "string": w.int(0, max, 5); string(w, v); return;
    // consumeBigIntegral(8, true) works its bounds out in floating point, as
    // here: 2 ** 63 - 1 comes out as 2 ** 63, and it reads nine bytes.
    case "bigint": w.int(0, max, 7); w.int(BigInt(-(2 ** 63)), BigInt(2 ** 63 - 1), v); return;
  }
  if (Array.isArray(v)) {
    w.int(0, max, 13);
    w.int(0, w.remaining, v.length);
    for (const x of v) {
      if (w.remaining === 0) w.fits = false; // the provider stops at the end of the input
      value(w, x);
    }
    w.bool(false); // no holes
    return;
  }
  if (Object.getPrototypeOf(v) === Object.prototype) {
    const entries = Object.entries(v);
    w.int(0, max, 14);
    w.int(0, w.remaining, entries.length);
    for (const [k, x] of entries) {
      if (w.remaining === 0) w.fits = false;
      string(w, k);
      value(w, x);
    }
    return;
  }
  throw new TypeError(`value() is not written for ${Object.prototype.toString.call(v)}`);
}

// jsonText() reads nothing for v when v holds no number that JSON has no
// literal for (NaN, ±Infinity, -0) and no BigInt, which these plans do not
// use.
export function jsonText(w, v) {
  JSON.stringify(v, (key, x) => {
    if (typeof x === "bigint" || (typeof x === "number" && (!Number.isFinite(x) || Object.is(x, -0)))) {
      throw new TypeError(`jsonText() is not written for ${String(x)}`);
    }
    return x;
  });
}

// answer() gives the body as it is, with status 200 and the type, or with
// `utf8` the type with "; charset=utf-8" (the second of contentType()'s).
export function answer(w, { utf8 = false } = {}) {
  if (utf8) {
    w.int(0, 9, 2);
    w.int(0, 13, 1);
  } else if (w.remaining !== 0) {
    w.int(0, 9, 9);
  }
}
