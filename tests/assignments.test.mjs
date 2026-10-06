// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The assignment panel, on a course page whose content scripts run as the
// manifest has them, drawn from a fresh cache so that nothing is fetched.
import test from "node:test";
import assert from "node:assert/strict";
import { Browser, settle } from "../harness/index.mjs";
import { D, H, LMS, assignment, cached, openCoursePage, openPanel } from "./lms.mjs";

function browserWith(stored) {
  const browser = new Browser();
  browser.storage.local.load(stored);
  return browser;
}

test("B1: a memo added in one tab survives a memo added in another", { todo: "B1: each tab saves the memo list it loaded, over the other tab's" }, async (t) => {
  const browser = browserWith(cached([assignment("A1", "レポート1", Date.now() + 30 * H)]));
  t.after(() => browser.close());
  const tabA = openCoursePage(browser);
  const tabB = openCoursePage(browser);
  for (const [tab, text] of [[tabB, "Bで書いたメモ"], [tabA, "Aで書いたメモ"]]) {
    const panel = await openPanel(tab);
    panel.querySelector(".kulms-memo-btn").click();
    panel.querySelector(".kulms-memo-form textarea").value = text;
    panel.querySelector(".kulms-memo-save").click();
    await settle(50);
  }
  const memos = browser.storage.local.dump()["kulms-memos"] || [];
  assert.deepEqual(memos.map((m) => m.text).sort(), ["Aで書いたメモ", "Bで書いたメモ"]);
});

test("B2: an assignment hidden 31 days ago stays hidden", { todo: "B2 (upstream #74): the purge drops the record that hides it, and it comes back" }, async (t) => {
  const hidden = (id, name) => ({ dismissedAt: Date.now() - 31 * D, name, courseName: "線形代数", courseId: "C1", type: "assignment", entityId: id });
  const browser = browserWith({
    ...cached([assignment("OLD", "未提出のまま期限切れ", Date.now() - 40 * D), assignment("FUT", "先の課題", Date.now() + 20 * D)]),
    "kulms-dismissed-assignments": { OLD: hidden("OLD", "未提出のまま期限切れ"), FUT: hidden("FUT", "先の課題") },
  });
  t.after(() => browser.close());
  const panel = await openPanel(openCoursePage(browser));
  const shown = [...panel.querySelectorAll(".kulms-assign-card:not(.kulms-deleted-card) .kulms-assign-card-name")].map((n) => n.textContent);
  assert.deepEqual(shown, []);
});

test("B3: a course with an overdue assignment is coloured as overdue", { todo: "B3: priority[u] || 99 makes overdue (0) the least urgent" }, async (t) => {
  const browser = browserWith(cached([assignment("A1", "期限切れ", Date.now() - 2 * D), assignment("A2", "ずっと先", Date.now() + 60 * D)]));
  t.after(() => browser.close());
  const tab = openCoursePage(browser);
  await settle(300);
  const li = tab.document.getElementById("site-list-item-C1");
  assert.ok(li.classList.contains("cs-tab-danger"), `classes: ${li.className}`);
});

test("B7: a quiz drawn from the cache links to the quiz tool", { todo: "B7: the cached URL is replaced with the assignment tool's" }, async (t) => {
  const browser = browserWith(cached([assignment("Q1", "小テスト1", Date.now() + 50 * H, { type: "quiz", url: `${LMS}/portal/site/C1/tool/QUIZ` })]));
  t.after(() => browser.close());
  const panel = await openPanel(openCoursePage(browser));
  const link = panel.querySelector(".kulms-assign-card-name a");
  assert.equal(new URL(link.href).pathname, "/portal/site/C1/tool/QUIZ");
});

test("B8: drawing the list twice in a row leaves one banner of each kind", { todo: "B8: each draw appends its banners when storage answers, after the next draw" }, async (t) => {
  const browser = browserWith(cached([assignment("A1", "レポート1", Date.now() + 30 * H)]));
  t.after(() => browser.close());
  const panel = await openPanel(openCoursePage(browser));
  assert.equal(panel.querySelectorAll(".kulms-tester-banner").length, 2);
  const checkbox = () => panel.querySelector(".kulms-checkbox");
  checkbox().click();
  checkbox().click();
  await settle(100);
  assert.equal(panel.querySelectorAll(".kulms-tester-banner").length, 2);
});
