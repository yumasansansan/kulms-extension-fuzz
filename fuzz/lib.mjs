// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// What the fuzz targets share: the provider that turns the fuzzer's bytes
// into values, the values made from them, the answers of the network, and a
// failure that names the input's problem.
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
//   key too), nested deep;
// - a length is bounded only by the input, or reaches millions of units by
//   repeating a piece of the input (mostly a few bytes, now and then as long
//   as the input), so that a few bytes make a huge input;
// - the network may fail, answer with any status, any content type and any
//   charset, or cut its body short.
// Words the extension looks for are mixed in only so that the fuzzer reaches
// the branches behind them sooner.
//
// What a value turns into on its way into the extension is the channel's
// doing, and is done as Chrome does it: the harness copies runtime messages
// and chrome.storage as JSON (NaN becomes null, a BigInt cannot be sent at
// all), and json() and clone() below do the same for values a target hands
// over directly.
import { FuzzedDataProvider } from "@jazzer.js/core";

export { FuzzedDataProvider };
export { open } from "./open-findings.mjs";

// Strings the extension looks for.
export const WORDS = [
  "提出済", "評定済", "採点済", "返却", "再提出", "未開始", "取組中", "submitted", "graded", "returned",
  "kulms-totp-load", "kulms-totp-save", "kulms-totp-has", "kulms-totp-delete", "kulms-totp-code", "fetchTextbooks",
  "epochSecond", "time", "id", "type", "text", "deadline", "repeat", "weekly", "memo-", "active",
  "__proto__", "constructor", "prototype", "toString", "valueOf", "hasOwnProperty", "length", "",
];

// The longest string or array a repeated piece makes, and the deepest a value
// nests. They bound only what a handful of bytes can ask of the generator
// itself (V8 cannot make a string of 2^29 units, and recursion as deep as a
// megabyte of input would overflow the generator's stack); both are far past
// what the extension meets.
export const LOG2_MAX_REPEAT = 22;
export const MAX_REPEAT = 2 ** LOG2_MAX_REPEAT;
export const MAX_DEPTH = 200;

// How many of something: as many as the input has bytes left for.
const count = (fdp) => fdp.consumeIntegralInRange(0, fdp.remainingBytes);

// How many times to repeat a piece, up to `max`: as likely between 1 and 2 as
// between 2,048 and 4,096, and one time in 64 as likely between a million and
// two as well, so that most inputs stay small and quick and some are huge.
// (A huge input takes a second or more, and were it as likely as a small one,
// it would take most of the fuzzer's time.)
const many = (fdp, max) => {
  const bits = fdp.consumeIntegralInRange(0, 63) === 0 ? LOG2_MAX_REPEAT : 12;
  return Math.min(max, fdp.consumeIntegralInRange(0, 2 ** fdp.consumeIntegralInRange(0, bits)));
};

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

// Any bytes: some of the input's, the rest of it, or a piece repeated.
export function bytes(fdp) {
  switch (fdp.consumeIntegralInRange(0, 3)) {
    case 0: return Uint8Array.from(fdp.consumeRemainingAsBytes());
    case 1: {
      const piece = Uint8Array.from(fdp.consumeBytes(pieceLength(fdp)));
      const times = piece.length ? many(fdp, Math.floor(MAX_REPEAT / piece.length)) : 0;
      const out = new Uint8Array(piece.length * times);
      for (let i = 0; i < times; i++) out.set(piece, i * piece.length);
      return out;
    }
    default: return Uint8Array.from(fdp.consumeBytes(count(fdp)));
  }
}

// Any string: mostly some of the input's bits, or the rest of them, read as
// the input picks; now and then a word the extension looks for, or a piece
// repeated.
export function string(fdp) {
  if (fdp.remainingBytes === 0) return "";
  switch (fdp.consumeIntegralInRange(0, 5)) {
    case 0: return fdp.pickValue(WORDS);
    case 1: {
      const piece = fdp.consumeBoolean() ? fdp.pickValue(WORDS) : decoded(fdp, () => fdp.consumeBytes(pieceLength(fdp)));
      return piece ? piece.repeat(many(fdp, Math.floor(MAX_REPEAT / piece.length))) : "";
    }
    case 2: return decoded(fdp, () => fdp.consumeRemainingAsBytes());
    default: return decoded(fdp, () => fdp.consumeBytes(count(fdp)));
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

function array(fdp, depth) {
  const a = [];
  for (let n = count(fdp); n > 0 && fdp.remainingBytes > 0; n--) a.push(value(fdp, depth + 1));
  if (fdp.consumeBoolean()) a.length += many(fdp, MAX_REPEAT); // holes, as many as a few bytes say
  return a;
}

function object(fdp, depth) {
  const o = {};
  for (let n = count(fdp); n > 0 && fdp.remainingBytes > 0; n--) {
    Object.defineProperty(o, string(fdp), { value: value(fdp, depth + 1), enumerable: true, writable: true, configurable: true });
  }
  return o;
}

// Binary data as a structured clone can carry it: the bytes as an
// ArrayBuffer, a DataView or a typed array of any kind over them (as many
// elements as whole ones fit).
const VIEWS = [Uint8Array, (b) => b.buffer, (b) => new DataView(b.buffer), Int8Array, Uint8ClampedArray, Int16Array, Uint16Array,
  Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array]
  .map((T) => (T.BYTES_PER_ELEMENT ? (b) => new T(b.buffer, 0, Math.floor(b.length / T.BYTES_PER_ELEMENT)) : T));

const REGEXP_FLAGS = "dgimsuvy";

// Any value a script can hand over. The containers (Map, Set, array, object)
// come after the values that hold no other, so that MAX_DEPTH leaves them
// out.
export function value(fdp, depth = 0) {
  if (fdp.remainingBytes === 0) return undefined;
  switch (fdp.consumeIntegralInRange(0, depth < MAX_DEPTH ? 15 : 10)) {
    case 0: return undefined;
    case 1: return null;
    case 2: return fdp.consumeBoolean();
    case 3: case 4: return number(fdp);
    case 5: case 6: return string(fdp);
    case 7: return fdp.consumeBigIntegral(8, true);
    case 8: return new Date(number(fdp));
    case 9: {
      const source = string(fdp);
      const mask = fdp.consumeIntegral(1);
      const flags = [...REGEXP_FLAGS].filter((_, i) => (mask >> i) & 1).join("");
      try { return new RegExp(source, flags); } catch { return /x/; } // a source or flags (u with v) that no RegExp takes
    }
    case 10: {
      const view = fdp.pickValue(VIEWS);
      return view(Uint8Array.from(fdp.consumeBytes(count(fdp))));
    }
    case 11: {
      const m = new Map();
      for (let n = count(fdp); n > 0 && fdp.remainingBytes > 0; n--) m.set(value(fdp, depth + 1), value(fdp, depth + 1));
      return m;
    }
    case 12: {
      const s = new Set();
      for (let n = count(fdp); n > 0 && fdp.remainingBytes > 0; n--) s.add(value(fdp, depth + 1));
      return s;
    }
    case 13: return array(fdp, depth);
    default: return object(fdp, depth);
  }
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
// content script (the detail of a CustomEvent), or { sendable: false }.
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
export function jsonText(fdp, v) {
  const text = JSON.stringify(v, (key, x) => {
    if (typeof x === "bigint") return MARK + x.toString();
    if (typeof x !== "number") return x;
    if (Number.isNaN(x)) return fdp.consumeBoolean() ? null : MARK + fdp.pickValue(["1e400", "-1e400"]);
    if (x === Infinity) return MARK + (fdp.consumeBoolean() ? "1e400" : "1e999999");
    if (x === -Infinity) return MARK + "-1e400";
    if (Object.is(x, -0)) return MARK + "-0";
    return x;
  });
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
// BigInt with an n), else String(), cut at 300 characters, since an input can
// make values of millions.
export function brief(v) {
  let s;
  try {
    s = JSON.stringify(v, (key, x) => (typeof x === "bigint" ? `${x}n` : x));
  } catch { /* a cycle, or a value whose toJSON throws */ }
  if (s === undefined) s = printable(v);
  return s.length > 300 ? `${s.slice(0, 300)}… (${s.length} characters)` : s;
}

// Fails the input, saying what went wrong with it.
export function fail(message) {
  throw new Error(message);
}
