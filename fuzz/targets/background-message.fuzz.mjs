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
// the body is made first, then the answers to the first eight fetches, in
// order (a message makes five at most: fetchTextbooks searches twice, reads
// the site's contact in two and the syllabus in one), and any later fetch
// gets the body as it is.
// The background keeps its state between inputs, the TOTP store in IndexedDB
// among it, as a service worker does between messages.
//
// It fails when a listener throws, when a promise of the background is
// rejected with nothing to handle it, when the message gets no answer at all
// within 5 seconds (its sender would wait for ever), when the answer to a
// content script holds a TOTP secret (S1), or when a detector of the harness
// sees something. Both listeners catch what their work throws and answer
// with an error.
//
// The extension catches its own errors in many places and only warns; the
// target fails too on a warning or an error that tells of a slip of the code
// (warnings() of fuzz/lib.mjs), not on an HTTP error, a network that fails
// or an answer that is not JSON, which the catching is there for.
import { Browser, Net, openBackground, openPopup, openTab, settle, watch } from "../../harness/index.mjs";
import { FuzzedDataProvider, answer, brief, bytes, fail, json, open, string, value, warnings } from "../lib.mjs";

const LMS = "https://lms.gakusei.kyoto-u.ac.jp";
let replies = [];
let body = new Uint8Array();

// Known: S2 and S8 (docs/findings.md). While they are open, an answer to the
// Site Info page is cut at 512 bytes, and one from KULASIS (the syllabus and
// the search's results) at 16,384, as in site-contact and syllabus-detail,
// so that their slow regular expressions do not stop the fuzzing here.
function cut(url, a) {
  const limit = open("S2") && url.startsWith(`${LMS}/portal/tool/`) ? 512
    : open("S8") && url.startsWith("https://www.k.kyoto-u.ac.jp/") ? 16384 : Infinity;
  if (!a.body || a.body.length <= limit) return a;
  const b = typeof a.body === "string" ? new TextEncoder().encode(a.body) : a.body;
  return { ...a, body: b.subarray(0, limit) };
}

const net = new Net().on(() => true, (request) => cut(request.url, replies.shift() || { headers: { "content-type": "text/html" }, body }));
const browser = new Browser();
const bg = openBackground(browser, { net });
const senders = {
  lms: openTab(browser, { url: `${LMS}/portal/site/C1`, scripts: [] }),
  login: openTab(browser, { url: "https://auth.iimc.kyoto-u.ac.jp/user/otplogin.cgi", scripts: [] }),
  popup: openPopup(browser),
};
await settle(100);

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
  return { from, message: m, body: b, replies: Array.from({ length: 8 }, () => answer(fdp, b, "text/html")) };
}

export async function fuzz(data) {
  const input = read(new FuzzedDataProvider(data));
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
  const result = await Promise.race([
    browser.deliver(from, [bg], m).then((response) => ({ response }), (error) => ({ error })),
    settle(5000).then(() => ({ timedOut: true })),
  ]);
  if (result.timedOut) fail(`message ${brief(sent.value)} from ${input.from}: no answer in 5 seconds`);
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
}
