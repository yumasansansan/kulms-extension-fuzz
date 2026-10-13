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
// Last, the input gives what the TOTP store held as the message came: the
// secret an earlier session saved (any string), or none.
//
// One background serves every input, as a service worker serves message after
// message, but what it keeps for later is each input's own. Its TOTP store in
// IndexedDB is emptied before each input, and holds the secret the input
// says, saved by the extension's own saveTotpSecret() apart from the input's
// work (aside() of harness/work.mjs): kept from input to input, an earlier
// input's secret made the work of a later load follow its size, a load of six
// units decrypting a secret of millions. The Shift_JIS table that the
// background builds on its first search is there for every input alike (P6,
// below).
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
import vm from "node:vm";
import { Browser, Net, aside, idle, openBackground, openPopup, openTab, uncounted, watch } from "../../harness/index.mjs";
import { answer, brief, bytes, calibrate, fail, json, judge, ladder, open, provider, seen, string, value, warnings } from "../lib.mjs";

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
  const replies = Array.from({ length: FETCHES }, () => answer(fdp, b, "text/html"));
  const stored = fdp.consumeBoolean() ? string(fdp) : null;
  return { from, message: m, body: b, replies, stored };
}

// Known: B22 (docs/findings.md). background.js writes a secret's ciphertext
// out by spreading its bytes into String.fromCharCode(), and the engine throws
// a RangeError past so many arguments: about 125,000 bytes in V8, some 60,000
// in the harness, whose wrappers of the built-ins pass the arguments on once
// more. While B22 is open, no secret of more than 32 KiB in UTF-8 is saved; a
// TOTP secret is some 32 characters. What the message's secret comes to as
// text is what TextEncoder makes of it (nothing for none).
const LONG_SECRET = 2 ** 15;
function utf8Length(v) {
  let text;
  try {
    text = String(v);
  } catch {
    return 0; // TextEncoder throws on it as well, before anything is encrypted
  }
  return new TextEncoder().encode(text).length;
}
const savesLongSecret = (m) => m !== null && typeof m === "object" && m.type === "kulms-totp-save" &&
  m.secret !== undefined && utf8Length(m.secret) > LONG_SECRET;

// Where background.js keeps the TOTP secret: its IndexedDB database, and the
// key of chrome.storage.local an older version kept the ciphertext in.
const TOTP_DB = "kulms-totp-db";
const TOTP_LEGACY = "kulms-totp-encrypted";

// The TOTP store as `stored` says an earlier session left it (the head of
// this file).
async function totpStore(stored) {
  await new Promise((resolve, reject) => {
    const req = bg.indexedDB.deleteDatabase(TOTP_DB);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`${TOTP_DB} is still open`));
  });
  browser.storage.local.unload([TOTP_LEGACY]);
  if (stored !== null) await bg.global.saveTotpSecret(stored);
}

async function run(data) {
  browser.forget();
  net.forget();
  // Known: P6 (docs/findings.md). background.js builds its Shift_JIS table on
  // the first search after the service worker starts, about 156,000 steps
  // whatever the keyword, more than linear code does with a small input. The
  // background serves every input, so only the first input to search would
  // pay for it, and an input's work would depend on the inputs before it.
  // Looking for P6, each input begins without the table, as on a service
  // worker just started; while P6 is open, the table is built before the
  // first input and kept, as on one that has searched before, and building
  // it is charged to no input.
  if (open("P6")) uncounted(() => bg.global.encodeShiftJIS(""));
  else vm.runInContext("sjisEncodeTable = null;", bg.global);
  const input = read(provider(data));
  const from = senders[input.from];
  const m = input.message;
  ({ body, replies } = input);
  const sent = json(m);
  if (!sent.sendable) return;
  // Known: S7. While it is open, the messages it throws on are left out, so
  // that the fuzzing goes on to what is not known yet.
  if (open("S7") && knownToThrowS7(sent.value)) return;
  // Known: B22 (docs/findings.md). While it is open, no secret longer than
  // LONG_SECRET is saved, by the message or as the store the input begins
  // with: the input is left out.
  if (open("B22") && (savesLongSecret(sent.value) || (input.stored !== null && utf8Length(input.stored) > LONG_SECRET))) return;
  await aside(() => totpStore(input.stored));
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
  // Known: B20, as above: the same slip, as the function's catch clause hands
  // it on (harness/detectors.mjs).
  const problems = seen(w).filter((p) => !(open("B20") && /^a slip the extension caught at background\.js:\d+ in fetchSakaiSiteContact /.test(p)));
  if (problems.length) fail(`message ${brief(sent.value)} from ${input.from}:\n${problems.join("\n")}`);
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run, browser);
}

await calibrate(fuzz);
