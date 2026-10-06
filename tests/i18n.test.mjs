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
import { Browser, openTab, settle } from "../harness/index.mjs";
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
