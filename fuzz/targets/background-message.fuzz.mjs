// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The background's runtime messages, as a content script of the LMS or of the
// login pages, or the popup, can send them: any JSON, often shaped like the
// messages the extension sends itself (fetchTextbooks and the four of TOTP),
// whose fetches the network answers with bytes of the input. The background
// keeps its state between inputs, the TOTP store in IndexedDB among it, as a
// service worker does between messages.
//
// It fails when a listener throws, when a promise of the background is
// rejected with nothing to handle it, or when the answer to a content script
// holds a TOTP secret (S1), or when a detector of the harness sees something.
//
// While S7 is open (fuzz/open-findings.mjs) it leaves out the messages that
// are known to throw: null, a type that is truthy and not a string, and a
// fetchTextbooks whose courseName is truthy and not a string, or whose siteId
// or lectureCode is a value that String() cannot convert (an object whose
// toString or valueOf is not a function). While S1 is open it does not look
// for the secret in answers.
import { Browser, Net, openBackground, openPopup, openTab, settle, watch } from "../../harness/index.mjs";
import { FuzzedDataProvider, fail, jsonValue, open, string } from "../lib.mjs";

const LMS = "https://lms.gakusei.kyoto-u.ac.jp";
let body = new Uint8Array();
const net = new Net().on(() => true, () => ({ headers: { "content-type": "text/html; charset=utf-8" }, body }));
const browser = new Browser();
const bg = openBackground(browser, { net });
const senders = [
  openTab(browser, { url: `${LMS}/portal/site/C1`, scripts: [] }),
  openTab(browser, { url: "https://auth.iimc.kyoto-u.ac.jp/user/otplogin.cgi", scripts: [] }),
  openPopup(browser),
];
await settle(100);

const TOTP = ["kulms-totp-save", "kulms-totp-load", "kulms-totp-has", "kulms-totp-delete"];

function message(fdp) {
  switch (fdp.consumeIntegralInRange(0, 3)) {
    case 0: return { action: "fetchTextbooks", courseName: jsonValue(fdp), lectureCode: jsonValue(fdp), siteId: jsonValue(fdp) };
    case 1: {
      const m = { type: fdp.pickValue(TOTP) };
      if (fdp.consumeBoolean()) m.secret = fdp.consumeBoolean() ? string(fdp, 40) : jsonValue(fdp);
      return m;
    }
    case 2: return { type: string(fdp), action: string(fdp), secret: jsonValue(fdp) };
    default: return jsonValue(fdp);
  }
}

// What S7 is known to throw on.
function knownToThrow(m) {
  if (m === null || m === undefined) return true;
  if (typeof m !== "object") return false;
  if (m.type && typeof m.type !== "string") return true;
  if (m.action !== "fetchTextbooks") return false;
  const convertible = (v) => { try { String(v); return true; } catch { return false; } };
  return (!!m.courseName && typeof m.courseName !== "string") || [m.siteId, m.lectureCode].some((v) => !!v && !convertible(v));
}

export async function fuzz(data) {
  const fdp = new FuzzedDataProvider(data);
  const from = fdp.pickValue(senders);
  const m = message(fdp);
  body = Uint8Array.from(fdp.consumeRemainingAsBytes());
  if (open("S7") && knownToThrow(m)) return;
  const w = watch(bg);
  const answer = await Promise.race([
    browser.deliver(from, [bg], m).then((response) => ({ response }), (error) => ({ error })),
    settle(2000).then(() => ({ timedOut: true })),
  ]);
  if (!open("S1") && from.kind === "tab" && answer.response && answer.response.secret) {
    fail(`a content script of ${from.url} was handed a TOTP secret for ${JSON.stringify(m)}`);
  }
  const problems = w.check();
  if (problems.length) fail(`message ${JSON.stringify(m)} from ${from.kind}:\n${problems.join("\n")}`);
}
