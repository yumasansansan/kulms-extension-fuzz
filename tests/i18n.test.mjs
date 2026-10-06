// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// t() of settings.js, the i18n helper of every content script, with the
// messages it fetches from the extension as it does in Chrome.
import test from "node:test";
import assert from "node:assert/strict";
import { Browser, openPopup, openTab, settle, until } from "../harness/index.mjs";
import { LMS } from "./lms.mjs";

async function settings(t) {
  const browser = new Browser();
  t.after(() => browser.close());
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: ["src/settings.js"] });
  await settle(100);
  return tab.window;
}

test("t() puts a number in its placeholder", async (t) => {
  const w = await settings(t);
  assert.equal(w.t("lastUpdatedMins", ["5"]), "最終更新: 5分前");
});

test("B10: t() puts any text in its placeholder as it is", { todo: "B10: the value is a replacement pattern of String.prototype.replace, so $& and $` expand" }, async (t) => {
  const w = await settings(t);
  for (const value of ["$&", "$$", "$`", "$'", "$1"]) {
    assert.equal(w.t("lastUpdatedMins", [value]), `最終更新: ${value}分前`);
  }
});

// t() of popup.js, a copy of that of settings.js, once the popup has loaded
// its messages.
async function popupT(t) {
  const browser = new Browser();
  t.after(() => browser.close());
  const popup = openPopup(browser);
  await until(() => popup.internals["popup.js"] && popup.internals["popup.js"].overrideMessages);
  return popup.internals["popup.js"].t;
}

test("B10: t() of the popup puts any text in its placeholder as it is", { todo: "B10: the value is a replacement pattern of String.prototype.replace, so $& and $` expand" }, async (t) => {
  const popupt = await popupT(t);
  for (const value of ["$&", "$$", "$`", "$'", "$1"]) {
    assert.equal(popupt("lastUpdatedMins", [value]), `最終更新: ${value}分前`);
  }
});

test("B15: t() of the popup answers a key that every object has with a string", { todo: "B15: the key is looked up through the prototype, and t(\"hasOwnProperty\") is undefined" }, async (t) => {
  const popupt = await popupT(t);
  for (const key of ["hasOwnProperty", "constructor", "toString", "__proto__"]) {
    assert.equal(typeof popupt(key), "string", key);
  }
});
