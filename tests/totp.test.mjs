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
import vm from "node:vm";
import fc from "fast-check";
import { Browser, contentScriptsFor, openBackground, openPopup, openTab, settle, until } from "../harness/index.mjs";
import { cached, openCoursePage, openPanel } from "./lms.mjs";

const OTP_PAGE = '<!doctype html><html><head></head><body><form id="login"><input id="password_input"></form></body></html>';
const OTP_URL = "https://auth.iimc.kyoto-u.ac.jp/user/otplogin.cgi";
const QR_URL = "https://auth.iimc.kyoto-u.ac.jp/user/index.php?app=qrsecret";

test("P4: jsQR goes only into the page of auth.iimc that reads a QR", { todo: "P4: it goes into every page of auth.iimc, the login page among them" }, () => {
  assert.equal(contentScriptsFor(OTP_URL).includes("vendor/jsqr.min.js"), false, "the login page");
  assert.ok(contentScriptsFor(QR_URL).includes("vendor/jsqr.min.js"), "the page of the QR");
  assert.ok(contentScriptsFor(OTP_URL).includes("src/auth-totp-register.js"), "the registration helper, which looks at every page for the end of a registration");
});

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
// returns what auth-totp.js typed into its field, once it has typed (it sets
// the whole code at once), or "" when it has typed nothing in 5 seconds. The
// clocks of the page and of the background both read `seconds`, so that the
// code is the same wherever the extension works it out.
async function autofill({ browser, bg, popup }, secret, seconds) {
  await browser.deliver(popup, [bg], { type: "kulms-totp-save", secret });
  vm.runInContext(`Date.now = () => ${seconds * 1000};`, bg.global);
  const tab = openTab(browser, {
    url: OTP_URL,
    html: OTP_PAGE,
    prepare: (w) => {
      w.Date.now = () => seconds * 1000;
      w.HTMLFormElement.prototype.submit = function () {};
    },
  });
  const field = tab.document.getElementById("password_input");
  await until(() => field.value !== "");
  const code = field.value;
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

// The messages whose answer handed a content script the secret.
const leaks = (browser) => browser.traffic.filter((x) => x.from === "tab" && x.response && x.response.secret).map((x) => `${x.message.type} to ${x.url}`);

test("S1: the login page is handed the code, never the secret", { todo: "S1: auth-totp.js asks for kulms-totp-load and gets the secret" }, async (t) => {
  const ext = await extension();
  t.after(() => ext.browser.close());
  await autofill(ext, "JBSWY3DPEHPK3PXP", 1e9);
  assert.deepEqual(leaks(ext.browser), []);
});

test("S1: a content script of the login pages that asks for the secret is not given it", { todo: "S1: kulms-totp-load answers every content script with the secret" }, async (t) => {
  const ext = await extension();
  t.after(() => ext.browser.close());
  await ext.browser.deliver(ext.popup, [ext.bg], { type: "kulms-totp-save", secret: "JBSWY3DPEHPK3PXP" });
  const tab = openTab(ext.browser, { url: "https://auth.iimc.kyoto-u.ac.jp/user/index.php?app=qrsecret", scripts: [] });
  await ext.browser.deliver(tab, [ext.bg], { type: "kulms-totp-load" });
  assert.deepEqual(leaks(ext.browser), []);
});

test("S1: the settings panel on the LMS shows the code and the QR without being handed the secret", { todo: "S1: the panel asks for kulms-totp-load and draws the QR of the secret into the LMS page" }, async (t) => {
  const ext = await extension();
  t.after(() => ext.browser.close());
  await ext.browser.deliver(ext.popup, [ext.bg], { type: "kulms-totp-save", secret: "JBSWY3DPEHPK3PXP" });
  ext.browser.storage.local.load(cached([]));
  const panel = await openPanel(openCoursePage(ext.browser));
  [...panel.querySelectorAll(".kulms-panel-tab")].at(-1).click();
  await until(() => panel.querySelector(".kulms-totp-actions"));
  for (const button of panel.querySelectorAll(".kulms-totp-actions .kulms-totp-btn:not(.kulms-totp-btn-danger)")) button.click();
  await settle(50);
  assert.deepEqual(leaks(ext.browser), []);
});

// The secrets sent to be saved so far.
const saved = (browser) => browser.traffic.filter((x) => x.message && x.message.type === "kulms-totp-save").map((x) => x.message.secret);

// Enters each of `entries` in the popup's form and presses Save; returns what
// was sent to be saved.
async function enterInPopup({ browser, popup }, entries) {
  for (const entry of entries) {
    const input = popup.document.getElementById("totp-input");
    input.value = entry;
    input.dispatchEvent(new popup.window.Event("input"));
    popup.document.getElementById("totp-save-btn").click();
    await settle(30);
  }
  return saved(browser);
}

// The same with the form of the settings tab of the panel on the LMS, which
// shows the form until a secret is saved and then shows that one is set.
async function enterInSettingsPanel({ browser }, entries) {
  browser.storage.local.load(cached([]));
  const panel = await openPanel(openCoursePage(browser));
  [...panel.querySelectorAll(".kulms-panel-tab")].at(-1).click();
  for (const entry of entries) {
    if (!(await until(() => panel.querySelector(".kulms-totp-input"), { timeout: 1000 }))) break;
    const input = panel.querySelector(".kulms-totp-input");
    input.value = entry;
    input.dispatchEvent(new input.ownerDocument.defaultView.Event("input"));
    panel.querySelector(".kulms-totp-btn-primary").click();
    await settle(30);
  }
  return saved(browser);
}

const MALFORMED = ["A", "AB=CD2345", "========"];
const S6 = "S6: A, AB=CD2345 and ======== are saved";

test("S6: the popup refuses a secret no code can be made from", { todo: S6 }, async (t) => {
  const ext = await extension();
  t.after(() => ext.browser.close());
  assert.deepEqual(await enterInPopup(ext, MALFORMED), []);
});

test("S6: the settings panel on the LMS refuses a secret no code can be made from", { todo: S6 }, async (t) => {
  const ext = await extension();
  t.after(() => ext.browser.close());
  assert.deepEqual(await enterInSettingsPanel(ext, MALFORMED), []);
});

test("the popup saves a secret written with spaces, hyphens, lower case or padding", async (t) => {
  const ext = await extension();
  t.after(() => ext.browser.close());
  const sent = await enterInPopup(ext, ["JBSWY3DPEHPK3PXP", "jbsw y3dp ehpk 3pxp", "JBSW-Y3DP-EHPK-3PXP", "JBSWY3DPEHPK3PXP===="]);
  assert.deepEqual(sent, ["JBSWY3DPEHPK3PXP", "JBSWY3DPEHPK3PXP", "JBSWY3DPEHPK3PXP", "JBSWY3DPEHPK3PXP===="]);
});

test("the settings panel on the LMS saves a secret written with spaces and lower case", async (t) => {
  const ext = await extension();
  t.after(() => ext.browser.close());
  assert.deepEqual(await enterInSettingsPanel(ext, ["jbsw y3dp ehpk 3pxp"]), ["JBSWY3DPEHPK3PXP"]);
});
