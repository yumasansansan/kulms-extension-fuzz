// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The background's runtime messages, as a content script of the LMS or of the
// login pages, or the popup, can send them: any value at all (fuzz/lib.mjs),
// often shaped like the messages the extension sends itself (fetchTextbooks
// and the TOTP ones), which the harness copies as JSON as Chrome does. A
// value that JSON cannot hold (a BigInt) cannot be sent: Chrome throws in the
// sender, the background sees nothing, and the input is left. The network
// answers the background's fetches as the input says (answer() of lib.mjs):
// the body is made first, then the answers to the fetches, in order: as many
// as a message makes at most, which is five (fetchTextbooks searches by the
// lecture code and by the name, reads the site's contact in two fetches,
// pages.json and the Site Info page, and the syllabus in one). A message that
// makes more fails the input, as the count above would then be out of date.
// The background keeps its state between inputs, the TOTP store in IndexedDB
// among it, as a service worker does between messages.
//
// It fails when a listener throws, when a promise of the background is
// rejected with nothing to handle it, when the message gets no answer though
// the background has nothing left to do (idle() of harness/work.mjs: no
// fetch, IndexedDB request or Web Crypto operation left, its sender would
// wait for ever), when the answer to a content script holds a TOTP secret
// (S1), or when a detector of the harness sees something. Both listeners
// catch what their work throws and answer with an error.
//
// It also fails when the extension's work grows faster than n log n from rung
// to rung of the input, or passes what linear code does with an input of its
// size (ladder() and judge() of fuzz/lib.mjs, harness/work.mjs): no clock
// decides. A regular expression's work is the steps of a backtracking engine
// (harness/backtrack.mjs), but for those of a finding that stands, which run
// on V8's linear engine (fuzz/lib.mjs).
//
// The extension catches its own errors in many places and only warns; the
// target fails too on a warning or an error that tells of a slip of the code
// (warnings() of fuzz/lib.mjs), not on an HTTP error, a network that fails
// or an answer that is not JSON, which the catching is there for.
import { Browser, Net, idle, openBackground, openPopup, openTab, watch } from "../../harness/index.mjs";
import { answer, brief, bytes, calibrate, fail, json, judge, ladder, open, provider, string, value, warnings } from "../lib.mjs";

const LMS = "https://lms.gakusei.kyoto-u.ac.jp";
let replies = [];
let body = new Uint8Array();
// The most fetches a message makes (the head of this file).
const FETCHES = 5;
const net = new Net().on(() => true, () => replies.shift() || { headers: { "content-type": "text/html" }, body });
const browser = new Browser();
const bg = openBackground(browser, { net });
const senders = {
  lms: openTab(browser, { url: `${LMS}/portal/site/C1`, scripts: [] }),
  login: openTab(browser, { url: "https://auth.iimc.kyoto-u.ac.jp/user/otplogin.cgi", scripts: [] }),
  popup: openPopup(browser),
};
await idle();

const TOTP = ["kulms-totp-save", "kulms-totp-load", "kulms-totp-has", "kulms-totp-delete", "kulms-totp-code"];
const field = (fdp) => (fdp.consumeBoolean() ? string(fdp) : value(fdp));

function message(fdp) {
  switch (fdp.consumeIntegralInRange(0, 3)) {
    case 0: return { action: "fetchTextbooks", courseName: field(fdp), lectureCode: field(fdp), siteId: field(fdp) };
    case 1: {
      const m = { type: fdp.pickValue(TOTP) };
      if (fdp.consumeBoolean()) m.secret = field(fdp);
      return m;
    }
    case 2: return { type: field(fdp), action: field(fdp), secret: field(fdp) };
    default: return value(fdp);
  }
}

// Known: S7 (docs/findings.md). The messages the listeners throw on while it
// is open: null (what JSON makes of undefined too), a type that is truthy and
// not a string, a fetchTextbooks whose courseName is truthy and not a string,
// or whose siteId or lectureCode is a value that String() cannot convert (an
// object with a toString or valueOf of its own that is not a function).
function knownToThrowS7(m) {
  if (m === null || m === undefined) return true;
  if (typeof m !== "object") return false;
  if (m.type && typeof m.type !== "string") return true;
  if (m.action !== "fetchTextbooks") return false;
  const convertible = (v) => { try { String(v); return true; } catch { return false; } };
  return (!!m.courseName && typeof m.courseName !== "string") || [m.siteId, m.lectureCode].some((v) => !!v && !convertible(v));
}

// What the input gives the target, as fuzz/lib.mjs reads it (fuzz/inputs.mjs
// checks its seeds and known inputs against this).
export function read(fdp) {
  const from = fdp.pickValue(Object.keys(senders));
  const m = message(fdp);
  const b = bytes(fdp);
  return { from, message: m, body: b, replies: Array.from({ length: FETCHES }, () => answer(fdp, b, "text/html")) };
}

async function run(data) {
  browser.forget();
  net.forget();
  const input = read(provider(data));
  const from = senders[input.from];
  const m = input.message;
  ({ body, replies } = input);
  const sent = json(m);
  if (!sent.sendable) return;
  // Known: S7. While it is open, the messages it throws on are left out, so
  // that the fuzzing goes on to what is not known yet.
  if (open("S7") && knownToThrowS7(sent.value)) return;
  const w = watch(bg);
  const log = warnings(bg);
  let settled = false;
  const delivery = browser.deliver(from, [bg], m).then((response) => ({ response }), (error) => ({ error }));
  delivery.then(() => { settled = true; });
  const result = await Promise.race([delivery, idle().then(() => (settled ? delivery : { unanswered: true }))]);
  if (result.unanswered) fail(`message ${brief(sent.value)} from ${input.from}: no answer, and the background has nothing left to do`);
  if (net.requests.length > FETCHES) fail(`message ${brief(sent.value)} made ${net.requests.length} fetches, more than the ${FETCHES} the target answers: count them anew`);
  for (const line of log.slips()) {
    // Known: B20. While it is open, a slip that fetchSakaiSiteContact()
    // catches is not counted (fuzz/targets/site-contact.fuzz.mjs).
    if (open("B20") && line.startsWith("[KULMS] fetchSakaiSiteContact error:")) continue;
    fail(`message ${brief(sent.value)} from ${input.from}: a slip of the code: ${line}`);
  }
  // Known: S1. While it is open, a content script is handed the secret (the
  // settings panel on the LMS asks for it), so the answers are not looked at.
  if (!open("S1") && from.kind === "tab" && result.response && result.response.secret) {
    fail(`a content script of ${from.url} was handed a TOTP secret for ${brief(sent.value)}`);
  }
  const problems = w.check();
  if (problems.length) fail(`message ${brief(sent.value)} from ${input.from}:\n${problems.join("\n")}`);
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run);
}

await calibrate(fuzz);
