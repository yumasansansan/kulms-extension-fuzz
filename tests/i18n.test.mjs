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
import { Browser, LINEAR, degree, measure, openPopup, openTab, settle, until } from "../harness/index.mjs";
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

const B10 = "B10: the value is a replacement pattern of String.prototype.replace, so $& and $` expand, and each placeholder is replaced in turn, so a value with the name of a later one in it is replaced again";

test("B10: t() puts any text in its placeholder as it is", { todo: B10 }, async (t) => {
  const w = await settings(t);
  for (const value of ["$&", "$$", "$`", "$'", "$1"]) {
    assert.equal(w.t("lastUpdatedMins", [value]), `最終更新: ${value}分前`);
  }
  assert.equal(w.t("remainDaysHoursMins", ["$HOURS$", "5", "7"]), "残り$HOURS$日5時間7分");
});

test("B10: t()'s work grows linearly with a value that holds a replacement pattern", { todo: B10 }, async (t) => {
  const w = await settings(t);
  // $' puts in what follows the placeholder, the next placeholder's name
  // among it, which the next replacement replaces in turn with its value of
  // $': the text, and the work, grow as the cube of the value's length.
  const d = await degree(16, (k) => measure(() => w.t("remainHoursMins", ["$'".repeat(k), "$'".repeat(k)])));
  assert.ok(d < LINEAR, `degree ${d.toFixed(2)}`);
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

test("B10: t() of the popup puts any text in its placeholder as it is", { todo: B10 }, async (t) => {
  const popupt = await popupT(t);
  for (const value of ["$&", "$$", "$`", "$'", "$1"]) {
    assert.equal(popupt("lastUpdatedMins", [value]), `最終更新: ${value}分前`);
  }
  assert.equal(popupt("remainDaysHoursMins", ["$HOURS$", "5", "7"]), "残り$HOURS$日5時間7分");
});

test("B10: the work of t() of the popup grows linearly with a value that holds a replacement pattern", { todo: B10 }, async (t) => {
  const popupt = await popupT(t);
  const d = await degree(16, (k) => measure(() => popupt("remainHoursMins", ["$'".repeat(k), "$'".repeat(k)])));
  assert.ok(d < LINEAR, `degree ${d.toFixed(2)}`);
});

test("B15: t() of the popup answers a key that every object has with a string", { todo: "B15: the key is looked up through the prototype, and t(\"hasOwnProperty\") is undefined" }, async (t) => {
  const popupt = await popupT(t);
  for (const key of ["hasOwnProperty", "constructor", "toString", "__proto__"]) {
    assert.equal(typeof popupt(key), "string", key);
  }
});

const B21 = "B21: the values are tested for truth, so an empty value given alone is not put in, and $HOURS$ stays";

test("B21: t() puts an empty value given alone in its placeholder", { todo: B21 }, async (t) => {
  const w = await settings(t);
  assert.equal(w.t("sectionDanger", ""), "時間以内");
});

test("B21: t() of the popup puts an empty value given alone in its placeholder", { todo: B21 }, async (t) => {
  const popupt = await popupT(t);
  assert.equal(popupt("sectionDanger", ""), "時間以内");
});
