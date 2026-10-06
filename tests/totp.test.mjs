// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// TOTP, the whole way: the popup saves a secret to the background's store, and
// on the university's login page auth-totp.js asks for it and types the code.
// What that page types is checked against RFC 6238 and node:crypto, and what
// crossed between the contexts against what should.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fc from "fast-check";
import { Browser, openBackground, openPopup, openTab, settle } from "../harness/index.mjs";

const OTP_PAGE = '<!doctype html><html><head></head><body><form id="login"><input id="password_input"></form></body></html>';
const OTP_URL = "https://auth.iimc.kyoto-u.ac.jp/user/otplogin.cgi";

function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

// RFC 6238's own reckoning, with node:crypto's HMAC.
function reference(key, seconds) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(seconds / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  return String((h.readUInt32BE(h[19] & 15) & 0x7fffffff) % 1e6).padStart(6, "0");
}

// A browser with the extension's background and popup.
async function extension() {
  const browser = new Browser();
  const bg = openBackground(browser);
  const popup = openPopup(browser);
  await settle(50);
  return { browser, bg, popup };
}

// Saves `secret` from the popup, then opens the login page at `seconds` and
// returns what auth-totp.js typed into its field.
async function autofill({ browser, bg, popup }, secret, seconds) {
  await browser.deliver(popup, [bg], { type: "kulms-totp-save", secret });
  const tab = openTab(browser, {
    url: OTP_URL,
    html: OTP_PAGE,
    prepare: (w) => {
      w.Date.now = () => seconds * 1000;
      w.HTMLFormElement.prototype.submit = function () {};
    },
  });
  await settle(30);
  const code = tab.document.getElementById("password_input").value;
  tab.close();
  return code;
}

test("the code typed on the login page matches the test vectors of RFC 6238 (SHA-1)", async (t) => {
  const ext = await extension();
  t.after(() => ext.browser.close());
  const secret = base32(Buffer.from("12345678901234567890"));
  const vectors = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"],
    [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]];
  for (const [seconds, want] of vectors) assert.equal(await autofill(ext, secret, seconds), want, `T=${seconds}`);
});

// A property of fast-check: for any key of 1 to 40 bytes and any time, the
// code is node:crypto's. A key or time it fails on is shrunk to the smallest
// one that still fails before it is reported.
test("the code typed on the login page matches node:crypto for any key and time", async (t) => {
  const ext = await extension();
  t.after(() => ext.browser.close());
  await fc.assert(
    fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 40 }), fc.integer({ min: 0, max: 2 ** 40 }), async (key, seconds) => {
      assert.equal(await autofill(ext, base32(key), seconds), reference(Buffer.from(key), seconds));
    }),
    { numRuns: 100 },
  );
});

test("S1: no content script is ever handed the plaintext secret", { todo: "S1: auth-totp.js asks for kulms-totp-load and gets the secret" }, async (t) => {
  const ext = await extension();
  t.after(() => ext.browser.close());
  await autofill(ext, "JBSWY3DPEHPK3PXP", 1e9);
  const leaks = ext.browser.traffic.filter((x) => x.from === "tab" && x.response && x.response.secret);
  assert.deepEqual(leaks.map((x) => x.message), []);
});

test("S6: the popup refuses a secret no code can be made from", { todo: "S6: A, AB=CD2345 and ======== are saved" }, async (t) => {
  const { browser, popup } = await extension();
  t.after(() => browser.close());
  for (const bad of ["A", "AB=CD2345", "========"]) {
    const input = popup.document.getElementById("totp-input");
    input.value = bad;
    input.dispatchEvent(new popup.window.Event("input"));
    popup.document.getElementById("totp-save-btn").click();
    await settle(30);
  }
  const saved = browser.traffic.filter((x) => x.message && x.message.type === "kulms-totp-save").map((x) => x.message.secret);
  assert.deepEqual(saved, []);
});
