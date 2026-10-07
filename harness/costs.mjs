// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// What each operation of the platform costs, in steps of work
// (harness/work.mjs). The extension's own code is counted where it runs, a
// step for each call of a function and each turn of a loop; what it calls of
// the platform runs elsewhere, and is counted here: ECMAScript's built-ins
// (ECMASCRIPT below, every one of them, which tests/costs.test.mjs checks),
// and the web APIs (harness/web-costs.mjs).
//
// An operation costs the steps of the algorithm its standard gives, as
// written: a loop of it, a step a turn; a step that goes through a value — that
// scans, copies or compares a string, a list, a tree — a step for each unit it
// goes through. Where an engine may do it faster than the steps (a live
// collection, getElementById), the steps are counted all the same: the count
// is a bound for every engine that follows the standard. Where Chrome's
// engine does more than the steps (it hashes a string to use it as a key), its
// work is counted too: the count is a bound for Chrome. Where the standard
// asks for a bound instead of giving steps (a Map's or a Set's access, in time
// sublinear in its size, on average), the bound: one step for the entry, and
// the units of a string key, which comparing or hashing it goes through. Where
// the standard leaves the steps to the engine (the comparisons of a sort),
// Chrome's. A string the standard defines without steps (a concatenation, a
// substring) is made in one step, as V8 makes it (a rope, a slice); its units
// are counted where an operation goes through them.
//
// A rule is a function of (this, the arguments, the result) giving the steps
// an operation takes besides the one of the call; null marks an operation
// whose steps do not grow with anything (the code that calls it is counted
// where it runs), which is left as it is. An operation whose steps grow only
// with what the code passes it one by one (the arguments of a call, written in
// the code or spread, whose spreading is counted) is of the second kind.

// --- What an operation goes through.

const integer = (x) => (typeof x === "number" && x > 0 ? Math.floor(Math.min(x, 2 ** 53)) : 0);

// The units of a value an operation goes through: a string's code units, an
// array's or an array-like's elements, a typed array's elements, a buffer's
// bytes, a Map's or a Set's entries. Nothing of a value's own code runs to
// tell: a length that is not a plain data property counts nothing.
export function units(x) {
  if (typeof x === "string") return x.length;
  if (x === null || (typeof x !== "object" && typeof x !== "function")) return 0;
  try {
    if (Array.isArray(x)) return x.length;
    if (ArrayBuffer.isView(x)) return x.byteLength;
    const tag = Object.prototype.toString.call(x);
    if (tag === "[object ArrayBuffer]" || tag === "[object SharedArrayBuffer]") return x.byteLength;
    if (tag === "[object Map]" || tag === "[object Set]") return x.size;
    const d = Object.getOwnPropertyDescriptor(x, "length");
    return d && "value" in d ? integer(d.value) : 0;
  } catch {
    return 0;
  }
}

// The own keys of an object, which an operation that copies or checks its
// properties goes through.
export function keyCount(x) {
  if (x === null || (typeof x !== "object" && typeof x !== "function")) return 0;
  try {
    return Reflect.ownKeys(x).length;
  } catch {
    return 0;
  }
}

// The binary logarithm in the steps of a sort and the like: log₂(n + 2) + 1,
// no less than ⌈log₂(n + 2)⌉, and as smooth as n, so that the work of an input
// at sizes a power of two apart (the rungs of fuzz/lib.mjs) compares without
// the jumps of a ceiling.
export const log2 = (n) => Math.log2(n + 2) + 1;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// The units of a string, which comparing it with another of its length goes
// through; nothing for any other value.
export const stringUnits = (x) => (typeof x === "string" ? x.length : 0);

// The objects on the prototype chain of a value, which a walk up it goes
// through.
export function chainLength(x) {
  let n = 0;
  try {
    for (let o = x; o !== null && (typeof o === "object" || typeof o === "function"); o = Object.getPrototypeOf(o)) n++;
  } catch { /* a proxy that throws */ }
  return n;
}

// The 32-bit words of a BigInt, which arithmetic on it goes through.
const bigUnits = (x) => (typeof x === "bigint" ? Math.ceil((x < 0n ? -x : x).toString(16).length / 8) : 0);

// --- Rules that recur.

const ofThis = (self) => units(self);
const ofResult = (self, args, r) => units(r);
const ofArg = (i) => (self, args) => units(args[i]);
const ofThisAndResult = (self, args, r) => units(self) + units(r);
const ofThisAndArg = (i) => (self, args) => units(self) + units(args[i]);
const ofArgAndResult = (i) => (self, args, r) => units(args[i]) + units(r);
const keysOfArg = (i) => (self, args) => keyCount(args[i]);
const keysOfResult = (self, args, r) => keyCount(r);
// A step a call: what the engine calls once for each element it goes through
// (an iterator's next()), so that the elements of what is spread, copied into
// a Set or awaited all together are counted.
const eachCall = () => 0;
// A comparison sort: n log₂ n comparisons at most (log2() above), or, with a
// comparison of the code's own, its calls, which are counted where they run,
// and n moves.
const sorting = (self, [compare]) => units(self) * (typeof compare === "function" ? 1 : log2(units(self)));
// A search of string `s` for `x` from `from`, as StringIndexOf takes it: the
// places it tries, up to where it found `x` (`found`) or to the last place it
// could be, and at each a comparison that goes through `x`.
export function searchSteps(s, x, from, found) {
  const n = units(s);
  const m = units(x);
  const places = found >= 0 ? found - from + 1 : n - m - from + 1;
  return Math.max(0, places) * Math.max(1, m);
}
// An array's search: the elements it tries, up to the one it found or all,
// each compared with what it searches for.
const searched = (self, [x], r) => (typeof r === "number" && r >= 0 ? r + 1 : units(self)) * Math.max(1, stringUnits(x));
const searchedFromEnd = (self, [x], r) => (r >= 0 ? units(self) - r : units(self)) * Math.max(1, stringUnits(x));
// A string pattern of replace() and its kind, or the RegExp's work, which is
// counted at exec() (harness/work.mjs).
const stringPattern = (s, x) => (typeof x === "string" ? searchSteps(s, x, 0, -1) : 0);
// A method that calls a callback for each element until one answers so:
// up to the element it stopped at (`last`, which the call keeps), or all.
const until = (self, args, r, call) => (call.last >= 0 ? call.last + 1 : units(self));
const untilFromEnd = (self, args, r, call) => (call.last >= 0 ? units(self) - call.last : units(self));
// A trim: the white space it took off, which it went through, and a step.
const trimmed = (self, args, r) => Math.max(0, units(self) - units(r));
// A BigInt as a string: its digits, each worked out by a division of the rest.
const digits = (self, args, r) => units(r) * log2(units(r)) ** 2;

// The methods that call a callback until one answers so, whose rule needs
// the last element it was called for.
export const STOPS = new Set([
  "Array.prototype.every", "Array.prototype.some", "Array.prototype.find", "Array.prototype.findIndex",
  "Array.prototype.findLast", "Array.prototype.findLastIndex",
  "%TypedArray%.prototype.every", "%TypedArray%.prototype.some", "%TypedArray%.prototype.find", "%TypedArray%.prototype.findIndex",
  "%TypedArray%.prototype.findLast", "%TypedArray%.prototype.findLastIndex",
]);

// The rules of ECMAScript's built-ins, by the place each is found at:
// "Array.prototype.indexOf", "Map.prototype.size (get)", "%TypedArray%.from".
// What is not here is in FIXED below, by pattern.
export const ECMASCRIPT = {
  // The global functions: what they go through.
  "decodeURI": ofArgAndResult(0),
  "decodeURIComponent": ofArgAndResult(0),
  "encodeURI": ofArgAndResult(0),
  "encodeURIComponent": ofArgAndResult(0),
  "escape": ofArgAndResult(0),
  "unescape": ofArgAndResult(0),
  "eval": ofArg(0), // parsing its source (the code it runs is not the extension's, and is not counted: tests/costs.test.mjs checks that the extension calls none)
  "isFinite": ofArg(0), // ToNumber of a string goes through it
  "isNaN": ofArg(0),
  "parseFloat": ofArg(0),
  "parseInt": ofArg(0),

  "Object.assign": (self, [, ...sources]) => sum(sources.map(keyCount)),
  "Object.create": keysOfArg(1),
  "Object.defineProperties": keysOfArg(1),
  "Object.entries": ofResult,
  "Object.freeze": keysOfArg(0),
  "Object.fromEntries": ofArg(0),
  "Object.getOwnPropertyDescriptors": keysOfResult,
  "Object.getOwnPropertyNames": ofResult,
  "Object.getOwnPropertySymbols": ofResult,
  "Object.groupBy": ofArg(0),
  "Object.isFrozen": keysOfArg(0),
  "Object.isSealed": keysOfArg(0),
  "Object.keys": ofResult,
  "Object.seal": keysOfArg(0),
  "Object.values": ofResult,
  "Object.prototype.isPrototypeOf": (self, [v]) => chainLength(v),
  "Object.prototype.__lookupGetter__": (self) => chainLength(self),
  "Object.prototype.__lookupSetter__": (self) => chainLength(self),
  "Object.prototype.__proto__ (set)": (self, [v]) => chainLength(v), // a cycle is looked for up the new chain

  "Function": (self, args) => sum(args.map(units)), // parsing (the code it makes is not counted: as eval)
  "Function.prototype.apply": ofArg(1),
  "Function.prototype.bind": (self, args) => args.length,
  "Function.prototype.toString": ofResult,

  "Array.from": ofResult,
  "Array.fromAsync": ofArg(0),
  "Array.prototype.concat": ofResult,
  "Array.prototype.copyWithin": ofThis,
  "Array.prototype.every": until,
  "Array.prototype.fill": ofThis,
  "Array.prototype.filter": ofThis,
  "Array.prototype.find": until,
  "Array.prototype.findIndex": until,
  "Array.prototype.findLast": untilFromEnd,
  "Array.prototype.findLastIndex": untilFromEnd,
  "Array.prototype.flat": ofThisAndResult,
  "Array.prototype.flatMap": ofThisAndResult,
  "Array.prototype.forEach": ofThis,
  "Array.prototype.includes": (self, args, r, call) => searched(self, args, call.found),
  "Array.prototype.indexOf": searched,
  "Array.prototype.join": ofThisAndResult,
  "Array.prototype.lastIndexOf": searchedFromEnd,
  "Array.prototype.map": ofThis,
  "Array.prototype.reduce": ofThis,
  "Array.prototype.reduceRight": ofThis,
  "Array.prototype.reverse": ofThis,
  "Array.prototype.shift": ofThis, // moves every element down a place
  "Array.prototype.slice": ofResult,
  "Array.prototype.some": until,
  "Array.prototype.sort": sorting,
  "Array.prototype.splice": ofThis,
  "Array.prototype.toLocaleString": ofThisAndResult,
  "Array.prototype.toReversed": ofThis,
  "Array.prototype.toSorted": sorting,
  "Array.prototype.toSpliced": ofThis,
  "Array.prototype.toString": ofThisAndResult,
  "Array.prototype.unshift": ofThis, // moves every element up
  "Array.prototype.with": ofThis,

  "%ArrayIteratorPrototype%.next": eachCall,
  "%StringIteratorPrototype%.next": eachCall,
  "%MapIteratorPrototype%.next": eachCall,
  "%SetIteratorPrototype%.next": eachCall,
  "%RegExpStringIteratorPrototype%.next": eachCall,

  "%TypedArray%.from": ofResult,
  "%TypedArray%.of": ofResult,
  "%TypedArray%.prototype.copyWithin": ofThis,
  "%TypedArray%.prototype.every": until,
  "%TypedArray%.prototype.fill": ofThis,
  "%TypedArray%.prototype.filter": ofThis,
  "%TypedArray%.prototype.find": until,
  "%TypedArray%.prototype.findIndex": until,
  "%TypedArray%.prototype.findLast": untilFromEnd,
  "%TypedArray%.prototype.findLastIndex": untilFromEnd,
  "%TypedArray%.prototype.forEach": ofThis,
  "%TypedArray%.prototype.includes": (self, args, r, call) => searched(self, args, call.found),
  "%TypedArray%.prototype.indexOf": searched,
  "%TypedArray%.prototype.join": ofThisAndResult,
  "%TypedArray%.prototype.lastIndexOf": searchedFromEnd,
  "%TypedArray%.prototype.map": ofThis,
  "%TypedArray%.prototype.reduce": ofThis,
  "%TypedArray%.prototype.reduceRight": ofThis,
  "%TypedArray%.prototype.reverse": ofThis,
  "%TypedArray%.prototype.set": ofArg(0),
  "%TypedArray%.prototype.slice": ofResult,
  "%TypedArray%.prototype.some": until,
  "%TypedArray%.prototype.sort": sorting,
  "%TypedArray%.prototype.toLocaleString": ofThisAndResult,
  "%TypedArray%.prototype.toReversed": ofThis,
  "%TypedArray%.prototype.toSorted": sorting,
  "%TypedArray%.prototype.toString": ofThisAndResult,
  "%TypedArray%.prototype.with": ofThis,
  "Uint8Array.fromBase64": ofArgAndResult(0),
  "Uint8Array.fromHex": ofArgAndResult(0),
  "Uint8Array.prototype.setFromBase64": ofArg(0),
  "Uint8Array.prototype.setFromHex": ofArg(0),
  "Uint8Array.prototype.toBase64": ofThisAndResult,
  "Uint8Array.prototype.toHex": ofThisAndResult,

  // A typed array of n elements is a block of bytes each set to 0; one made of
  // an array, an iterable or another typed array copies its elements (an
  // iterable's next() is counted besides); one over a buffer is a view.
  ...Object.fromEntries(["Int8", "Uint8", "Uint8Clamped", "Int16", "Uint16", "Int32", "Uint32", "Float16", "Float32", "Float64", "BigInt64", "BigUint64"]
    .map((t) => [`${t}Array`, (self, [x], r) => (typeof x === "object" && x !== null && /ArrayBuffer\]$/.test(Object.prototype.toString.call(x)) ? 0 : units(r))])),
  "ArrayBuffer": (self, [n]) => integer(n), // a block of n bytes, each set to 0
  "ArrayBuffer.prototype.resize": (self, [n]) => integer(n),
  "ArrayBuffer.prototype.slice": ofResult,
  "ArrayBuffer.prototype.transfer": ofThis,
  "ArrayBuffer.prototype.transferToFixedLength": ofThis,
  "SharedArrayBuffer": (self, [n]) => integer(n),
  "SharedArrayBuffer.prototype.grow": (self, [n]) => integer(n),
  "SharedArrayBuffer.prototype.slice": ofResult,

  "BigInt": ofArg(0), // from a string, its digits
  "BigInt.asIntN": (self, [, x]) => bigUnits(x),
  "BigInt.asUintN": (self, [, x]) => bigUnits(x),
  "BigInt.prototype.toLocaleString": digits,
  "BigInt.prototype.toString": digits,

  "Date": (self, args) => (args.length === 1 && typeof args[0] === "string" ? args[0].length : 0), // a string is parsed
  "Date.parse": ofArg(0),

  "Error.prototype.toString": ofResult,

  "JSON.parse": ofArg(0),
  "JSON.rawJSON": ofArg(0),
  "JSON.stringify": ofResult,

  "Map.groupBy": ofArg(0),
  "Map.prototype.clear": ofThis,
  "Map.prototype.forEach": ofThis,
  ...Object.fromEntries(["Map.prototype.get", "Map.prototype.set", "Map.prototype.has", "Map.prototype.delete", "Map.prototype.getOrInsert",
    "Map.prototype.getOrInsertComputed", "Set.prototype.add", "Set.prototype.has", "Set.prototype.delete"].map((p) => [p, (self, [k]) => stringUnits(k)])),

  "Number": ofArg(0), // ToNumber of a string goes through it
  "Number.parseFloat": ofArg(0),
  "Number.parseInt": ofArg(0),

  "Reflect.apply": ofArg(2),
  "Reflect.construct": ofArg(1),
  "Reflect.ownKeys": ofResult,

  "RegExp": (self, [pattern]) => (typeof pattern === "string" ? pattern.length : 0), // its pattern is parsed
  "RegExp.escape": ofArgAndResult(0),
  "RegExp.prototype.compile": ofArg(0),
  "RegExp.prototype.flags (get)": ofResult,
  "RegExp.prototype.source (get)": ofResult,
  "RegExp.prototype.toString": ofResult,
  // What the RegExp's own methods of the symbols do through exec() is counted
  // there (harness/work.mjs); here, what they make of it.
  "RegExp.prototype.Symbol(Symbol.match)": ofResult,
  "RegExp.prototype.Symbol(Symbol.replace)": ofArgAndResult(0),
  "RegExp.prototype.Symbol(Symbol.split)": ofArgAndResult(0),

  "Set.prototype.clear": ofThis,
  "Set.prototype.difference": ofThisAndArg(0),
  "Set.prototype.forEach": ofThis,
  "Set.prototype.intersection": ofThisAndArg(0),
  "Set.prototype.isDisjointFrom": ofThisAndArg(0),
  "Set.prototype.isSubsetOf": ofThisAndArg(0),
  "Set.prototype.isSupersetOf": ofThisAndArg(0),
  "Set.prototype.symmetricDifference": ofThisAndArg(0),
  "Set.prototype.union": ofThisAndArg(0),

  "String.fromCharCode": (self, args) => args.length,
  "String.fromCodePoint": (self, args) => args.length,
  "String.raw": ofResult,
  "String.prototype.anchor": ofResult,
  "String.prototype.big": ofResult,
  "String.prototype.blink": ofResult,
  "String.prototype.bold": ofResult,
  "String.prototype.endsWith": ofArg(0),
  "String.prototype.fixed": ofResult,
  "String.prototype.fontcolor": ofResult,
  "String.prototype.fontsize": ofResult,
  "String.prototype.includes": (s, [x, from], r, call) => searchSteps(s, x, integer(from), call.found),
  "String.prototype.indexOf": (s, [x, from], r) => searchSteps(s, x, integer(from), r),
  "String.prototype.isWellFormed": ofThis,
  "String.prototype.italics": ofResult,
  "String.prototype.lastIndexOf": (s, [x], r) => Math.max(1, units(s) - Math.max(r, 0)) * Math.max(1, units(x)),
  "String.prototype.link": ofResult,
  "String.prototype.localeCompare": ofThisAndArg(0),
  "String.prototype.match": ofResult, // a RegExp is made of a string, and its work is counted at exec()
  "String.prototype.matchAll": ofThis,
  "String.prototype.normalize": ofThisAndResult,
  "String.prototype.padEnd": ofArg(1), // the filler, made once; the rest is a rope
  "String.prototype.padStart": ofArg(1),
  "String.prototype.replace": (s, [x], r) => stringPattern(s, x) + units(r),
  "String.prototype.replaceAll": (s, [x], r) => stringPattern(s, x) + units(r),
  "String.prototype.search": () => 0, // a RegExp's, counted at exec()
  "String.prototype.small": ofResult,
  "String.prototype.split": (s, [x], r) => stringPattern(s, x) + units(s) + units(r),
  "String.prototype.startsWith": ofArg(0),
  "String.prototype.strike": ofResult,
  "String.prototype.sub": ofResult,
  "String.prototype.sup": ofResult,
  "String.prototype.toLocaleLowerCase": ofThis,
  "String.prototype.toLocaleUpperCase": ofThis,
  "String.prototype.toLowerCase": ofThis,
  "String.prototype.toUpperCase": ofThis,
  "String.prototype.toWellFormed": ofThis,
  "String.prototype.trim": trimmed,
  "String.prototype.trimEnd": trimmed,
  "String.prototype.trimLeft": trimmed,
  "String.prototype.trimRight": trimmed,
  "String.prototype.trimStart": trimmed,

  "Symbol.for": ofArg(0),

  "Intl.getCanonicalLocales": ofArg(0),
  "Intl.Collator.supportedLocalesOf": ofArg(0),
  "Intl.DateTimeFormat.supportedLocalesOf": ofArg(0),
  "Intl.DisplayNames.supportedLocalesOf": ofArg(0),
  "Intl.DurationFormat.supportedLocalesOf": ofArg(0),
  "Intl.ListFormat.supportedLocalesOf": ofArg(0),
  "Intl.NumberFormat.supportedLocalesOf": ofArg(0),
  "Intl.PluralRules.supportedLocalesOf": ofArg(0),
  "Intl.RelativeTimeFormat.supportedLocalesOf": ofArg(0),
  "Intl.Segmenter.supportedLocalesOf": ofArg(0),
  "Intl.Locale": ofArg(0),
  "Intl.DisplayNames.prototype.of": ofArgAndResult(0),
  "Intl.ListFormat.prototype.format": ofArgAndResult(0),
  "Intl.ListFormat.prototype.formatToParts": ofArgAndResult(0),
  // compare is a function of the collator's, made once and kept: the getter
  // hands out one that is counted (harness/work.mjs), at the units of the two
  // strings it compares.
  "Intl.Collator.prototype.compare (get)": () => 0,
  // A segment found: the units of it, which finding its ends goes through.
  "%SegmentsPrototype%.containing": (self, args, r) => (r ? units(r.segment) : 0),
  "%SegmentIteratorPrototype%.next": (self, args, r) => (r && r.value ? units(r.value.segment) : 0),
};

// What compare() of an Intl.Collator goes through.
export const COLLATOR_COMPARE = (self, [a, b]) => units(a) + units(b);

// The built-in whose work is the steps of the backtracking matcher of the
// harness (harness/backtrack.mjs, harness/work.mjs).
export const BACKTRACKING_EXEC = "RegExp.prototype.exec";

// Built-ins whose steps do not grow with anything, by pattern, each with why.
const FIXED = [
  // A property of a value read or set; the arithmetic of numbers; a date's
  // fields; one place of a buffer.
  [/^Math\./, "arithmetic of numbers"],
  [/^Date\.prototype\./, "a date's fields, and strings of a fixed length made of them"],
  [/^Date\.(?:UTC|now)$/, "arithmetic of numbers"],
  [/^DataView(?:\.prototype\.|$)/, "one place of a buffer"],
  [/^Atomics\./, "one place of a buffer"],
  [/^Boolean(?:\.prototype\.|$)/, "a boolean"],
  [/^Number\.(?:is|prototype\.|EPSILON)/, "a number, and its string of at most 1,100 digits"],
  [/^Symbol(?:\.prototype\.|\.keyFor$|$)/, "a symbol"],
  [/^(?:WeakMap|WeakSet|WeakRef|FinalizationRegistry)(?:\.prototype\.|$)/, "an entry, which the standard asks to be reached in time sublinear in their size"],
  [/^(?:Map|Set)(?:\.prototype\.(?:entries|keys|values|Symbol\(Symbol\.iterator\)|size \(get\))|\.Symbol\(Symbol\.species\) \(get\)|$)/,
    "an iterator, or the size; a Map or a Set made from an iterable goes through it by its iterator's next(), counted"],
  [/^Promise(?:\.prototype\.|\.(?:all|allSettled|any|race|reject|resolve|try|withResolvers)$|\.Symbol|$)/,
    "a promise; all() and its kind go through what they are given by its iterator's next(), counted"],
  [/^Proxy(?:\.revocable|$)/, "a proxy"],
  [/^Reflect\.(?:defineProperty|deleteProperty|get|getOwnPropertyDescriptor|getPrototypeOf|has|isExtensible|preventExtensions|set|setPrototypeOf)$/, "a property"],
  [/^Object\.(?:defineProperty|getOwnPropertyDescriptor|getPrototypeOf|hasOwn|is|isExtensible|preventExtensions|setPrototypeOf)$/, "a property"],
  [/^Object(?:\.prototype\.(?:constructor|hasOwnProperty|propertyIsEnumerable|toLocaleString|toString|valueOf|__defineGetter__|__defineSetter__|__proto__ \(get\))|$)/, "a property, or the tag of an object"],
  [/^Function\.prototype(?:\.(?:call|Symbol\(Symbol\.hasInstance\)|arguments)|$)/, "a call, whose arguments are written in the code or spread, which is counted"],
  [/^Array(?:\.isArray|\.of|\.Symbol\(Symbol\.species\) \(get\)|\.prototype\.(?:at|entries|keys|values|pop|push|Symbol\(Symbol\.iterator\)|Symbol\(Symbol\.unscopables\))|$)/,
    "an element; or arguments written in the code or spread, which is counted"],
  [/^%TypedArray%(?:\.Symbol|\.prototype\.(?:at|buffer|byteLength|byteOffset|length|entries|keys|values|subarray|Symbol\(Symbol\.(?:iterator|toStringTag)\)))/, "an element, or a view of the same buffer"],
  [/^(?:ArrayBuffer|SharedArrayBuffer)\.(?:isView|Symbol\(Symbol\.species\) \(get\)|prototype\.(?:byteLength|detached|maxByteLength|resizable|growable) \(get\))$/, "a property"],
  [/^BigInt\.prototype\.valueOf$/, "the value itself"],
  [/^String(?:\.prototype\.(?:at|charAt|charCodeAt|codePointAt|concat|repeat|slice|substr|toString|valueOf|Symbol\(Symbol\.iterator\))|$)/,
    "a code unit, or a string made without going through it (a rope, a slice)"],
  [/^(?:Error|AggregateError|EvalError|RangeError|ReferenceError|SyntaxError|TypeError|URIError|SuppressedError)(?:\.prototype\.(?:message|name)|\.captureStackTrace|\.isError|\.stackTraceLimit|$)/,
    "an error, its stack of at most Error.stackTraceLimit frames"],
  [/^(?:Iterator(?:\.from|\.concat|\.prototype\.|$)|%IteratorHelperPrototype%\.|%WrapForValidIteratorPrototype%\.)/, "an iterator, whose next() is counted where it is the platform's, or the code's own where it runs"],
  [/^%SegmentsPrototype%\.Symbol\(Symbol\.iterator\)$/, "an iterator"],
  [/^JSON\.isRawJSON$/, "a property"],
  [/^RegExp(?:\.prototype\.(?:dotAll|global|hasIndices|ignoreCase|linear|multiline|sticky|unicode|unicodeSets) \(get\)|\.prototype\.(?:test|Symbol\(Symbol\.(?:search|matchAll)\))|\.Symbol\(Symbol\.species\) \(get\)|\.(?:\$.|input|lastMatch|lastParen|leftContext|rightContext) \((?:get|set)\))$/,
    "a flag; or exec(), counted (harness/work.mjs), and what it found"],
  [/^Intl\.(?:Collator|DateTimeFormat|DisplayNames|DurationFormat|ListFormat|Locale|NumberFormat|PluralRules|RelativeTimeFormat|Segmenter)(?:\.prototype\.(?!of$|format$|formatToParts$|compare \(get\)$)|$)/,
    "a format of a number, a date or a duration, of a length bounded by its kind; a locale's tag of the code's own, the options, the parts of a locale"],
  [/^Intl\.(?:DisplayNames|ListFormat)\.prototype\.(?:format|formatToParts)$|^Intl\.(?:DateTimeFormat|NumberFormat|DurationFormat|RelativeTimeFormat|PluralRules)\.prototype\.(?:format|formatToParts)$/,
    "a format of a number, a date or a duration, of a length bounded by its kind"],
  [/^Intl\.Collator\.prototype\.compare$/, "never reached: compare is an accessor"],
  [/^Intl\.supportedValuesOf$/, "a list of the engine's own, of a length bounded by it"],
  [/^Intl\.Segmenter\.prototype\.segment$/, "a Segments object over the string; finding its segments is counted"],
  [/^globalThis$/, "the global object"],
];

// The rule of the built-in at `path`: a function, null for one whose steps
// do not grow, the name of a built-in counted otherwise (BACKTRACKING_EXEC),
// or undefined for one this table lacks.
export function ruleOf(path) {
  if (path === BACKTRACKING_EXEC) return BACKTRACKING_EXEC;
  if (Object.hasOwn(ECMASCRIPT, path)) return ECMASCRIPT[path];
  for (const [re] of FIXED) if (re.test(path)) return null;
  return undefined;
}

// --- The syntax of the extension's code: what each form's steps are, and
// how they are counted (harness/work.mjs). "counted" is counted where it is
// (counters()); every other form's steps do not grow, for the reason given.
// tests/costs.test.mjs checks that every form in the extension's code is here.
export const SYNTAX = {
  "Program": "the script, run once",
  "ExpressionStatement": "a statement",
  "BlockStatement": "a block",
  "EmptyStatement": "nothing",
  "IfStatement": "a choice",
  "SwitchStatement": "a choice, its cases counted",
  "SwitchCase": "a case written in the code: a comparison with what is written, of its length",
  "SwitchCase (not written)": "counted: a comparison with the case, at most its units",
  "BreakStatement": "a jump",
  "ContinueStatement": "a jump",
  "ReturnStatement": "a jump",
  "ThrowStatement": "a jump",
  "TryStatement": "a handler set",
  "CatchClause": "a handler",
  "LabeledStatement": "a label",
  "WhileStatement": "counted: a turn",
  "DoWhileStatement": "counted: a turn",
  "ForStatement": "counted: a turn",
  "ForOfStatement": "counted: a turn, and a step of the iterator, counted where it is the platform's",
  "ForInStatement": "counted: a turn, and the keys gathered first",
  "FunctionDeclaration": "counted: a call",
  "FunctionExpression": "counted: a call",
  "ArrowFunctionExpression": "counted: a call",
  "VariableDeclaration": "a binding",
  "VariableDeclarator": "a binding; one with the rest of an object, counted",
  "Identifier": "a binding read",
  "Literal": "a value written in the code",
  "Literal regex": "a RegExp made of a pattern written in the code, of its length",
  "TemplateLiteral": "concatenations, each in one step (a rope)",
  "TemplateElement": "a string written in the code",
  "TaggedTemplateExpression": "counted: a call",
  "ThisExpression": "a binding read",
  "ArrayExpression": "elements written in the code; a spread one, counted by its iterator's next()",
  "ObjectExpression": "properties written in the code; a spread one, counted",
  "Property": "a property written in the code",
  "SpreadElement in CallExpression": "counted by its iterator's next()",
  "SpreadElement in NewExpression": "counted by its iterator's next()",
  "SpreadElement in ArrayExpression": "counted by its iterator's next()",
  "SpreadElement in ObjectExpression": "counted: the properties copied",
  "RestElement in ArrayPattern": "counted by its iterator's next()",
  "RestElement in ObjectPattern": "counted: the properties copied",
  "RestElement in FunctionDeclaration": "the arguments of the call, written in the code or spread, which is counted",
  "RestElement in FunctionExpression": "the arguments of the call, written in the code or spread, which is counted",
  "RestElement in ArrowFunctionExpression": "the arguments of the call, written in the code or spread, which is counted",
  "ArrayPattern": "its elements written in the code, taken by its iterator's next(), counted",
  "ObjectPattern": "its properties written in the code; the rest of one, counted",
  "AssignmentPattern": "a default",
  "CallExpression": "counted: a call; what it calls is counted where it runs",
  "NewExpression": "counted: a call; what it calls is counted where it runs",
  "MemberExpression": "a property; one whose key is made at run time, counted (its string hashed); one of the platform whose steps grow, counted at its getter or setter",
  "ChainExpression": "a property or a call",
  "SequenceExpression": "expressions in turn",
  "ConditionalExpression": "a choice",
  "LogicalExpression &&": "a choice",
  "LogicalExpression ||": "a choice",
  "LogicalExpression ??": "a choice",
  "AwaitExpression": "a promise settled",
  "YieldExpression": "a step of a generator, whose body is counted",
  "UpdateExpression ++": "a number",
  "UpdateExpression --": "a number",
  ...Object.fromEntries(["!", "-", "+", "~", "typeof", "void", "delete"].map((op) => [`UnaryExpression ${op}`, op === "delete" ? "a property taken off" : "a value's kind, or a number"])),
  ...Object.fromEntries(["-", "*", "/", "%", "**", "<<", ">>", ">>>", "&", "|", "^"].map((op) => [`BinaryExpression ${op}`, "arithmetic of numbers"])),
  "BinaryExpression +": "a concatenation in one step (a rope), or a sum",
  ...Object.fromEntries(["===", "!==", "==", "!=", "<", "<=", ">", ">="].map((op) => [`BinaryExpression ${op}`, "counted where neither side is written in the code (two strings compared); with one side written, a comparison of at most its length"])),
  "BinaryExpression instanceof": "counted: a walk up the prototype chain",
  "BinaryExpression in": "counted: a key hashed, a walk up the prototype chain",
  ...Object.fromEntries(["=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^=", "&&=", "||=", "??="].map((op) => [`AssignmentExpression ${op}`, op === "+=" ? "a concatenation in one step (a rope), or a sum" : "a binding or a property set; arithmetic of numbers"])),
  "ClassDeclaration": "a class made of members written in the code",
  "ClassExpression": "a class made of members written in the code",
  "ClassBody": "members written in the code",
  "MethodDefinition": "a member written in the code",
  "PropertyDefinition": "a member written in the code",
  "StaticBlock": "run once",
  "Super": "a binding read",
  "MetaProperty": "a binding read",
  "PrivateIdentifier": "a name",
};

// The form of a node of the syntax, as SYNTAX names it.
export function formOf(node, parent) {
  if (node.type === "Literal" && node.regex) return "Literal regex";
  if (node.type === "SwitchCase") return node.test && !(node.test.type === "Literal" || (node.test.type === "TemplateLiteral" && node.test.expressions.length === 0)) ? "SwitchCase (not written)" : "SwitchCase";
  if (node.type === "SpreadElement" || node.type === "RestElement") return `${node.type} in ${parent ? parent.type : "Program"}`;
  return node.operator ? `${node.type} ${node.operator}` : node.type;
}

// --- The built-ins of a realm.

const GLOBAL_NAMES = ["Object", "Function", "Array", "String", "Number", "Boolean", "Symbol", "BigInt", "Math", "JSON", "Reflect", "Date", "RegExp",
  "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "FinalizationRegistry", "Promise", "Proxy", "ArrayBuffer", "SharedArrayBuffer", "DataView", "Atomics",
  "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float16Array", "Float32Array", "Float64Array",
  "BigInt64Array", "BigUint64Array", "Error", "AggregateError", "EvalError", "RangeError", "ReferenceError", "SyntaxError", "TypeError", "URIError",
  "SuppressedError", "Iterator", "Intl", "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURI", "encodeURIComponent", "decodeURI",
  "decodeURIComponent", "escape", "unescape", "eval"];

// The intrinsics that no global names, found from values of the realm.
function hidden(g) {
  const out = [];
  const add = (name, make) => {
    try {
      const v = make();
      if (v) out.push([name, v]);
    } catch { /* this realm has none */ }
  };
  add("%TypedArray%", () => Object.getPrototypeOf(g.Uint8Array));
  add("%ArrayIteratorPrototype%", () => Object.getPrototypeOf(g.Array.prototype.values.call(new g.Array())));
  add("%StringIteratorPrototype%", () => Object.getPrototypeOf(g.String.prototype[Symbol.iterator].call("")));
  add("%MapIteratorPrototype%", () => Object.getPrototypeOf(new g.Map().entries()));
  add("%SetIteratorPrototype%", () => Object.getPrototypeOf(new g.Set().values()));
  add("%RegExpStringIteratorPrototype%", () => Object.getPrototypeOf(g.RegExp.prototype[Symbol.matchAll].call(new g.RegExp("x", "g"), "")));
  add("%IteratorHelperPrototype%", () => Object.getPrototypeOf(g.Iterator.prototype.map.call(g.Array.prototype.values.call(new g.Array()), (x) => x)));
  add("%WrapForValidIteratorPrototype%", () => Object.getPrototypeOf(g.Iterator.from({ next() {} })));
  add("%SegmentsPrototype%", () => Object.getPrototypeOf(new g.Intl.Segmenter().segment("")));
  add("%SegmentIteratorPrototype%", () => Object.getPrototypeOf(new g.Intl.Segmenter().segment("")[Symbol.iterator]()));
  return out;
}

// Every function and accessor of the built-ins of the realm whose global
// object is `g`: { path, owner, key, kind } (kind "value", "get" or "set").
// A constructor is at its own name; its prototype's "constructor" is the
// same function, and is left out.
export function builtIns(g) {
  const out = [];
  const seen = new Set();
  const visit = (owner, name, depth) => {
    if (!owner || (typeof owner !== "object" && typeof owner !== "function") || seen.has(owner)) return;
    seen.add(owner);
    for (const key of Reflect.ownKeys(owner)) {
      if (key === "constructor" || key === "prototype") continue;
      const d = Object.getOwnPropertyDescriptor(owner, key);
      const path = `${name}.${String(key)}`;
      if (typeof d.value === "function") {
        out.push({ path, owner, key, kind: "value" });
        if (d.value.prototype && depth < 2) visit(d.value.prototype, `${path}.prototype`, depth + 1);
        if (depth < 2) visit(d.value, path, depth + 1);
      } else if (d.value && typeof d.value === "object" && depth < 1) {
        visit(d.value, path, depth + 1);
      }
      if (d.get) out.push({ path: `${path} (get)`, owner, key, kind: "get" });
      if (d.set) out.push({ path: `${path} (set)`, owner, key, kind: "set" });
    }
  };
  for (const name of GLOBAL_NAMES) {
    let v;
    try {
      v = g[name];
    } catch {
      continue;
    }
    if (v === undefined) continue;
    if (typeof v === "function") out.push({ path: name, owner: g, key: name, kind: "value" });
    visit(v, name, 0);
    if (typeof v === "function" && v.prototype) visit(v.prototype, `${name}.prototype`, 1);
  }
  for (const [name, v] of hidden(g)) {
    visit(v, name, 1);
    if (typeof v === "function" && v.prototype) visit(v.prototype, `${name}.prototype`, 1);
  }
  return out;
}
