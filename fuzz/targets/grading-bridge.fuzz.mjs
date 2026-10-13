// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The bridge in the page's world of the TA's grading support
// (grading-ta-page.js). Sakai's grader, an element of the page
// (<sakai-grader>), keeps the submissions of an assignment in its
// originalSubmissions; the bridge, which the extension puts in the page,
// answers each request of the extension's content script (an event
// kulms-ta-get-submissions) with what it reads of them, as JSON text (an
// event kulms-ta-submissions). The page and what is in it are the page's:
// its scripts make what they make, and send what requests they send. The
// input gives
// - the graders of the page: each a <sakai-grader> or another element, with
//   an ID as Sakai gives it (sakai-grader-…), any other or none, and its
//   originalSubmissions: none, a value, or a getter that throws;
// - that value: any value (fuzz/lib.mjs), or an array (its holes too), a Map,
//   an array-like (any length, its elements, an iterator of its own or not),
//   an object keyed by anything, a proxy of one whose trap throws, or a
//   revoked proxy;
// - each submission in it: any value, an object with any of the fields Sakai
//   gives (id, submissionId, reference, firstSubmitterName, status,
//   submissionStatus, submittedTime, submitted, draft, hasHistory, grade,
//   graded, returned) and any others, a proxy of one whose trap throws, a
//   revoked proxy, or the value that holds it; each field any value or
//   string, a getter that throws, an object with a toJSON, toString or
//   valueOf of its own (a function that gives a value or throws, or not a
//   function), a symbol, or the submission itself;
// - the requests: the content script's (JSON text with its ID), or any string
//   or value a script of the page sends, or none.
// What is thrown is an Error of the page or any value. The page's own code
// (its getters, traps, toJSON) returns or throws at once, and is not the
// extension's work.
//
// It fails when the bridge throws (the page's console shows it, and the
// content script waits its 300 ms for nothing), when it answers a request
// otherwise than once and at once, with JSON text that echoes the content
// script's ID, when what it answers is not a list of submissions each with an
// ID that is a string not empty, a name, a status, a time and a grade that
// are strings and flags that are booleans, or when a detector of the harness
// sees something. It also fails when the bridge's work grows faster than
// n log n from rung to rung of the input, or passes what linear code does
// with an input of its size (ladder() and judge() of fuzz/lib.mjs,
// harness/work.mjs): an array-like's length counts as what it says, as a
// loop to it goes that far.
import { Browser, idle, openTab, uncounted, watch } from "../../harness/index.mjs";
import { LMS } from "../../tests/lms.mjs";
import { brief, calibrate, fail, judge, ladder, number, open, provider, seen, string, value, warnings } from "../lib.mjs";

const SCRIPTS = ["src/grading-ta-page.js"];
const TAGS = ["sakai-grader", "div", "sakai-grader-x"];
const FIELDS = ["id", "submissionId", "reference", "firstSubmitterName", "status", "submissionStatus", "submittedTime",
  "submitted", "draft", "hasHistory", "grade", "graded", "returned", "length"];
const TRAPS = ["get", "getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor", "has"];
const STRINGS = ["firstSubmitterName", "status", "submittedTime", "grade"];
const FLAGS = ["submitted", "draft", "hasHistory", "graded", "returned"];

// As many of make() as the input has bytes for.
function list(fdp, make) {
  const out = [];
  for (let n = fdp.consumeIntegralInRange(0, fdp.remainingBytes); n > 0 && fdp.remainingBytes > 0; n--) out.push(make(fdp));
  return out;
}

// What a getter, a trap or a toJSON of the page throws.
const thrown = (fdp) => (fdp.consumeBoolean() ? { error: string(fdp) } : { value: value(fdp) });

// A key of a submission: one Sakai gives, or any.
const key = (fdp) => (fdp.consumeBoolean() ? fdp.pickValue(FIELDS) : string(fdp));

function field(fdp) {
  const kind = fdp.pickValue(["value", "string", "throws", "toJSON", "toString", "valueOf", "symbol", "self"]);
  switch (kind) {
    case "value": return { kind, value: value(fdp) };
    case "string": return { kind, value: string(fdp) };
    case "throws": return { kind, thrown: thrown(fdp) };
    case "toJSON": case "toString": case "valueOf": {
      const callable = fdp.consumeBoolean();
      return callable && fdp.consumeBoolean() ? { kind, callable, thrown: thrown(fdp) } : { kind, callable, value: value(fdp) };
    }
    case "symbol": return { kind, description: string(fdp) };
    default: return { kind };
  }
}

const fields = (fdp) => list(fdp, (f) => [key(f), field(f)]);

function entry(fdp) {
  const kind = fdp.pickValue(["value", "submission", "proxy", "revoked", "holder"]);
  if (kind === "value") return { kind, value: value(fdp) };
  if (kind === "submission") return { kind, fields: fields(fdp) };
  if (kind === "proxy") return { kind, fields: fields(fdp), trap: fdp.pickValue(TRAPS), thrown: thrown(fdp) };
  return { kind };
}

function source(fdp, nested = false) {
  const kind = fdp.pickValue(["value", "array", "map", "arrayLike", "object", "proxy", "revoked"]);
  switch (kind) {
    case "value": return { kind, value: value(fdp) };
    case "array": return { kind, items: list(fdp, entry), holes: fdp.consumeBoolean() };
    case "map": return { kind, entries: list(fdp, (f) => [value(f), entry(f)]) };
    case "arrayLike": return { kind, length: fdp.consumeBoolean() ? number(fdp) : null, items: list(fdp, entry), iterator: fdp.consumeBoolean() };
    case "object": return { kind, entries: list(fdp, (f) => [key(f), entry(f)]) };
    case "proxy": return { kind, of: nested ? { kind: "value", value: undefined } : source(fdp, true), trap: fdp.pickValue(TRAPS), thrown: thrown(fdp) };
    default: return { kind };
  }
}

function grader(fdp) {
  const tag = fdp.pickValue(TAGS);
  const id = fdp.pickValue([() => null, () => `sakai-grader-${string(fdp)}`, () => string(fdp)])();
  const prop = fdp.pickValue([() => ({ kind: "none" }), () => ({ kind: "throws", thrown: thrown(fdp) }), () => ({ kind: "value", value: source(fdp) })])();
  return { tag, id, prop };
}

function request(fdp) {
  const kind = fdp.pickValue(["extension", "string", "value", "none"]);
  if (kind === "extension") return { kind, id: string(fdp) };
  if (kind === "string") return { kind, text: string(fdp) };
  if (kind === "value") return { kind, value: value(fdp) };
  return { kind };
}

// What the target reads of an input, in the order it reads it.
export function read(fdp) {
  return { graders: list(fdp, grader), requests: list(fdp, request) };
}

const browser = new Browser();
const tab = openTab(browser, { url: `${LMS}/portal/site/S/tool/G`, scripts: SCRIPTS });
await idle();
const w = tab.window;

// A value of the page's realm made from `root`, a value of fuzz/lib.mjs: its
// arrays (holes and all), objects, Maps, Sets, Dates, RegExps, buffers and
// views are the page's own. A stack of its own, as value() nests as deep as
// the input says.
function inPage(root) {
  const copies = new Map();
  const todo = [];
  const copy = (v) => {
    if (v === null || (typeof v !== "object" && typeof v !== "function")) return v;
    if (copies.has(v)) return copies.get(v);
    let c;
    if (Array.isArray(v)) c = new w.Array(v.length);
    else if (v instanceof Map) c = new w.Map();
    else if (v instanceof Set) c = new w.Set();
    else if (v instanceof Date) c = new w.Date(v.getTime());
    else if (v instanceof RegExp) c = new w.RegExp(v.source, v.flags);
    else if (v instanceof ArrayBuffer) c = new w.Uint8Array(new Uint8Array(v)).buffer;
    else if (v instanceof DataView) c = new w.DataView(new w.Uint8Array(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)).buffer);
    else if (ArrayBuffer.isView(v)) c = new w[v.constructor.name](v);
    else c = new w.Object();
    copies.set(v, c);
    todo.push([v, c]);
    return c;
  };
  const out = copy(root);
  while (todo.length) {
    const [v, c] = todo.pop();
    if (Array.isArray(v)) for (const k of Object.keys(v)) c[k] = copy(v[k]);
    else if (v instanceof Map) for (const [k, x] of v) c.set(copy(k), copy(x));
    else if (v instanceof Set) for (const x of v) c.add(copy(x));
    else if (Object.getPrototypeOf(v) === Object.prototype) {
      for (const k of Object.keys(v)) Object.defineProperty(c, k, { value: copy(v[k]), enumerable: true, writable: true, configurable: true });
    }
  }
  return out;
}

// What the page's code of the input throws, as it throws it (Known: B24).
let pageThrows = new Set();
const toThrow = (t) => {
  const v = "error" in t ? new w.Error(t.error) : inPage(t.value);
  pageThrows.add(v);
  return v;
};
const plain = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
const trapping = (trap, t) => ({ [trap]() { throw toThrow(t); } });

function revoked() {
  const { proxy, revoke } = w.Proxy.revocable(new w.Object(), {});
  revoke();
  return proxy;
}

function submissionOf(list) {
  const o = new w.Object();
  for (const [k, f] of list) {
    switch (f.kind) {
      case "value": case "string": plain(o, k, inPage(f.value)); break;
      case "throws": Object.defineProperty(o, k, { get() { throw toThrow(f.thrown); }, enumerable: true, configurable: true }); break;
      case "toJSON": case "toString": case "valueOf": {
        const holder = new w.Object();
        plain(holder, f.kind, !f.callable ? inPage(f.value) : "thrown" in f ? () => { throw toThrow(f.thrown); } : () => inPage(f.value));
        plain(o, k, holder);
        break;
      }
      case "symbol": plain(o, k, w.Symbol(f.description)); break;
      default: plain(o, k, o);
    }
  }
  return o;
}

function entryOf(e, holder) {
  switch (e.kind) {
    case "value": return inPage(e.value);
    case "submission": return submissionOf(e.fields);
    case "proxy": return new w.Proxy(submissionOf(e.fields), trapping(e.trap, e.thrown));
    case "revoked": return revoked();
    default: return holder;
  }
}

function sourceOf(s) {
  switch (s.kind) {
    case "value": return inPage(s.value);
    case "array": {
      const a = new w.Array();
      s.items.forEach((e, i) => { a[s.holes ? 2 * i + 1 : i] = entryOf(e, a); });
      return a;
    }
    case "map": {
      const m = new w.Map();
      for (const [k, e] of s.entries) m.set(inPage(k), entryOf(e, m));
      return m;
    }
    case "arrayLike": {
      const o = new w.Object();
      s.items.forEach((e, i) => plain(o, i, entryOf(e, o)));
      plain(o, "length", s.length === null ? s.items.length : s.length);
      if (s.iterator) {
        plain(o, Symbol.iterator, function* () {
          for (let i = 0; i < s.items.length; i++) yield o[i];
        });
      }
      return o;
    }
    case "object": {
      const o = new w.Object();
      for (const [k, e] of s.entries) plain(o, k, entryOf(e, o));
      return o;
    }
    case "proxy": {
      const of = sourceOf(s.of);
      return new w.Proxy(of !== null && (typeof of === "object" || typeof of === "function") ? of : new w.Object(), trapping(s.trap, s.thrown));
    }
    default: return revoked();
  }
}

// The page of an input: its graders, and nothing else in its body.
function build({ graders }) {
  const d = tab.document;
  d.body.replaceChildren();
  for (const g of graders) {
    const el = d.createElement(g.tag);
    if (g.id !== null) el.id = g.id;
    if (g.prop.kind === "throws") Object.defineProperty(el, "originalSubmissions", { get() { throw toThrow(g.prop.thrown); }, configurable: true });
    else if (g.prop.kind === "value") plain(el, "originalSubmissions", sourceOf(g.prop.value));
    d.body.append(el);
  }
}

// The detail of a request's event, as its sender gives it.
function detailOf(r) {
  if (r.kind === "extension") return JSON.stringify({ requestId: r.id });
  if (r.kind === "string") return r.text;
  if (r.kind === "value") return inPage(r.value);
  return undefined;
}

const shown = (r) => (r.kind === "extension" ? `the content script's request ${brief(r.id)}` : `a request of the page (${r.kind}${r.kind === "none" ? "" : ` ${brief(r.kind === "string" ? r.text : r.value)}`})`);

// Known: B24 (docs/findings.md). Whether `error`, which the bridge let out,
// is one it lets out of the page's objects: what the page's code threw, or
// what the engine throws on a revoked proxy, a value that JSON cannot hold
// (a BigInt, a cycle) or one that String() cannot convert.
const B24_ENGINE = /proxy that has been revoked|serialize a BigInt|circular structure|Cannot convert object to primitive value|Cannot convert a Symbol value/;
function isB24(error) {
  if (pageThrows.has(error)) return true;
  return error instanceof w.TypeError && B24_ENGINE.test(error.message);
}

// Known: P7. Whether an array-like that the input puts in the page says it has
// more elements than it has, at the top of the graders' value or under a
// proxy of it.
function setsOffP7({ graders }) {
  return graders.some(({ prop }) => {
    if (prop.kind !== "value") return false;
    const s = prop.value.kind === "proxy" ? prop.value.of : prop.value;
    if (s.kind !== "arrayLike" || s.length === null) return false;
    const n = Number(s.length);
    return Math.floor(Math.min(n > 0 ? n : 0, 2 ** 53 - 1)) > s.items.length;
  });
}

// What the bridge threw, to be read in a failure's message.
function thrownShown(error) {
  try {
    return error instanceof w.Error || error instanceof Error ? `${error.name}: ${error.message}` : brief(error);
  } catch {
    return "a value that cannot be shown";
  }
}

function checkAnswers(r, answers, raised) {
  if (answers.length !== 1) fail(`the bridge answered ${shown(r)} ${answers.length} times at once${raised.length ? `, having thrown ${raised.map((e) => thrownShown(e.error)).join(", ")}` : ""}`);
  const text = answers[0];
  if (typeof text !== "string") fail(`the bridge answered ${shown(r)} with what is not JSON text: ${brief(text)}`);
  let answer;
  try {
    answer = JSON.parse(text);
  } catch {
    fail(`the bridge answered ${shown(r)} with what is not JSON text: ${brief(text)}`);
  }
  if (r.kind === "extension" && (answer === null || answer.requestId !== r.id)) fail(`the bridge answered ${shown(r)} as ${brief(answer && answer.requestId)}`);
  if (answer === null || typeof answer !== "object" || !Array.isArray(answer.submissions)) fail(`the bridge answered ${shown(r)} with no list of submissions: ${brief(text)}`);
  if (answer.count !== answer.submissions.length) fail(`the bridge answered ${shown(r)} with a count of ${brief(answer.count)} for ${answer.submissions.length} submissions`);
  for (const s of answer.submissions) {
    if (s === null || typeof s !== "object" || Array.isArray(s)) fail(`the bridge answered ${shown(r)} with what is not a submission: ${brief(s)}`);
    // Known: B24. While it is open, the ID, the name and the time are taken as
    // the bridge hands them on (the page's values as they are).
    const handedOn = open("B24") ? new Set(["id", "firstSubmitterName", "submittedTime"]) : new Set();
    if (!handedOn.has("id") && (typeof s.id !== "string" || s.id === "")) fail(`the bridge answered ${shown(r)} with a submission whose ID is ${brief(s.id)}`);
    for (const k of STRINGS) if (!handedOn.has(k) && typeof s[k] !== "string") fail(`the bridge answered ${shown(r)} with a submission whose ${k} is ${brief(s[k])}`);
    for (const k of FLAGS) if (typeof s[k] !== "boolean") fail(`the bridge answered ${shown(r)} with a submission whose ${k} is ${brief(s[k])}`);
  }
}

async function run(data) {
  const input = read(provider(data));
  browser.forget();
  // Known: P7. While it is open, an array-like that says it has more elements
  // than it has is not put in the page.
  if (open("P7") && setsOffP7(input)) return;
  pageThrows = new Set();
  uncounted(() => build(input));
  const watcher = watch(tab);
  const log = warnings(tab);
  for (const r of input.requests) {
    const answers = [];
    const take = (event) => answers.push(event.detail);
    const event = uncounted(() => {
      w.addEventListener("kulms-ta-submissions", take);
      return new w.CustomEvent("kulms-ta-get-submissions", { detail: detailOf(r) });
    });
    const before = browser.errors.length;
    w.dispatchEvent(event);
    uncounted(() => {
      w.removeEventListener("kulms-ta-submissions", take);
      const raised = browser.errors.slice(before);
      // Known: B24. While it is open, a request that the bridge does not answer
      // because it let out what the page's objects threw, or what the engine
      // throws on what JSON or String() cannot take, is let be, and so is what
      // it let out.
      if (open("B24") && answers.length === 0 && raised.length > 0 && raised.every((e) => isB24(e.error))) {
        browser.errors.splice(before, raised.length);
        return;
      }
      checkAnswers(r, answers, raised);
    });
  }
  await idle();
  for (const line of log.slips()) fail(`a slip of the code: ${line}`);
  const problems = seen(watcher);
  if (problems.length) fail(problems.join("\n"));
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run, browser);
}

await calibrate(fuzz);
