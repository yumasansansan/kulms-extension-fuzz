// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The assignment panel (src/assignments.js) where nothing else reached it
// (docs/findings.md, カバレッジ): closing it, its tabs, restoring a hidden
// assignment, the next of a weekly memo, the preview, the cache kept when the
// user is logged out, the form for a memo on a touch screen, and the
// submissions that submit-detect.js leaves for the panel.
import test from "node:test";
import assert from "node:assert/strict";
import { Browser, Net, idle, until } from "../harness/index.mjs";
import { D, H, LMS, assignment, cached, card, openCoursePage, openPanel } from "./lms.mjs";

function browserWith(stored) {
  const browser = new Browser();
  browser.storage.local.load(stored);
  return browser;
}

test("the panel's × closes it, and its button opens it again", async (t) => {
  const browser = browserWith(cached([assignment("A1", "レポート1", Date.now() + 30 * H)]));
  t.after(() => browser.close());
  const tab = openCoursePage(browser);
  const panel = await openPanel(tab);
  assert.ok(panel.classList.contains("open"));
  panel.querySelector(".kulms-assign-close").click();
  assert.ok(!panel.classList.contains("open"), "the × did not close the panel");
  tab.document.getElementById("kulms-assign-toggle").click();
  assert.ok(panel.classList.contains("open"), "the button did not open it again");
});

test("the textbooks tab shows the textbooks, and the assignments tab the list again", async (t) => {
  const browser = browserWith(cached([assignment("A1", "レポート1", Date.now() + 30 * H)]));
  t.after(() => browser.close());
  const tab = openCoursePage(browser, { net: new Net() });
  const panel = await openPanel(tab);
  const tabs = [...panel.querySelectorAll(".kulms-panel-tab")];
  assert.ok(tabs.length >= 2, "the panel has no tabs");
  const [assignments, textbooks] = tabs;
  textbooks.click();
  assert.ok(textbooks.classList.contains("active"));
  assert.ok(!card(panel, "レポート1"), "the textbooks view still shows the assignments");
  assignments.click();
  assert.ok(await until(() => card(panel, "レポート1")), "the assignments tab does not bring the list back");
});

test("a hidden assignment comes back to the list when restored, and is no longer stored as hidden", async (t) => {
  const browser = browserWith({
    ...cached([assignment("A1", "隠した課題", Date.now() + 30 * H)]),
    "kulms-dismissed-assignments": { A1: { dismissedAt: Date.now() - D, name: "隠した課題", courseName: "線形代数", courseId: "C1", type: "assignment", entityId: "A1" } },
  });
  t.after(() => browser.close());
  const panel = await openPanel(openCoursePage(browser));
  const hidden = panel.querySelector(".kulms-deleted-card .kulms-deleted-restore");
  assert.ok(hidden, "the hidden assignment is not in the deleted section");
  hidden.click();
  assert.ok(await until(() => card(panel, "隠した課題") && !card(panel, "隠した課題").classList.contains("kulms-deleted-card")), "the restored assignment is not in the list");
  assert.ok(await until(() => !("A1" in (browser.storage.local.dump()["kulms-dismissed-assignments"] || {}))), "the assignment is still stored as hidden");
});

test("checking a weekly memo makes the next one, a week later", async (t) => {
  const deadline = Date.now() + 2 * D;
  const browser = browserWith({
    ...cached([]),
    "kulms-memos": [{ id: 7, text: "毎週の小テスト", created: Date.now() - D, deadline, repeat: "weekly", courseId: "C1", courseName: "線形代数" }],
  });
  t.after(() => browser.close());
  const panel = await openPanel(openCoursePage(browser));
  const memo = card(panel, "毎週の小テスト");
  assert.ok(memo, "the memo is not in the panel");
  memo.querySelector(".kulms-checkbox").click();
  const stored = await until(() => (browser.storage.local.dump()["kulms-memos"] || []).length === 2);
  assert.ok(stored, "no next memo was stored");
  const next = browser.storage.local.dump()["kulms-memos"].find((m) => m.id !== 7);
  assert.deepEqual([next.text, next.deadline, next.repeat, next.courseId, next.courseName], ["毎週の小テスト", deadline + 7 * D, "weekly", "C1", "線形代数"]);
});

test("the preview shows the made-up assignments, and asks Sakai for nothing", async (t) => {
  const net = new Net();
  const browser = browserWith({ "kulms-settings": { previewMode: true } });
  t.after(() => browser.close());
  const panel = await openPanel(openCoursePage(browser, { net }));
  assert.ok(await until(() => card(panel, "第3回レポート課題")), "the preview's assignments are not drawn");
  assert.deepEqual(net.requests.map((r) => r.url).filter((u) => u.includes("/direct/")), []);
});

test("logged out, the panel draws the cache it had and keeps it as it was", async (t) => {
  const old = Date.now() - 60 * 60e3; // older than the time between fetches: the panel fetches anew
  const stored = { "kulms-assignments": { timestamp: old, assignments: [assignment("A1", "前に読んだ課題", Date.now() + 30 * H)] } };
  const browser = browserWith(stored);
  t.after(() => browser.close());
  // Sakai sends a request whose session has ended to its login page.
  const net = new Net().on(`${LMS}/direct/`, { status: 200, headers: { "content-type": "text/html" }, body: "<html>login</html>", url: `${LMS}/portal/xlogin` });
  const panel = await openPanel(openCoursePage(browser, { net }));
  assert.ok(await until(() => card(panel, "前に読んだ課題")), "the cache is not drawn");
  assert.ok(net.requests.some((r) => r.url.startsWith(`${LMS}/direct/`)), "the panel did not fetch");
  assert.deepEqual(browser.storage.local.dump()["kulms-assignments"], stored["kulms-assignments"], "the cache was written over");
});

test("on a touch screen, the form for a memo takes its deadline from its pickers, and its cancel closes it", async (t) => {
  const browser = browserWith(cached([assignment("A1", "レポート1", Date.now() + 30 * H)]));
  t.after(() => browser.close());
  const coarse = (w) => {
    const plain = w.matchMedia;
    w.matchMedia = (query) => (String(query).includes("pointer: coarse") ? { ...plain(query), matches: true } : plain(query));
  };
  const tab = openCoursePage(browser, { prepare: coarse });
  const panel = await openPanel(tab);
  const d = tab.document;
  // Cancelled, the form goes, and nothing is stored.
  panel.querySelector(".kulms-memo-btn").click();
  assert.ok(d.querySelector(".kulms-memo-modal"), "the form did not open");
  const cancel = [...d.querySelectorAll(".kulms-memo-modal button")].find((b) => !b.classList.contains("kulms-memo-modal-close") && !b.classList.contains("kulms-memo-save"));
  cancel.click();
  assert.ok(!d.querySelector(".kulms-memo-modal"), "the cancel did not close the form");
  // Filled in, with a deadline picked, the memo is stored with it.
  panel.querySelector(".kulms-memo-btn").click();
  const modal = d.querySelector(".kulms-memo-modal");
  modal.querySelector("textarea").value = "教科書を買う";
  const [year, month, day, hour, minute] = modal.querySelectorAll(".kulms-memo-dt-sel");
  const pick = (sel, v) => {
    sel.value = String(v);
    sel.dispatchEvent(new tab.window.Event("change", { bubbles: true }));
  };
  const when = new tab.window.Date(Date.now() + 3 * D);
  pick(year, when.getFullYear());
  pick(month, when.getMonth() + 1);
  pick(day, when.getDate());
  pick(hour, 9);
  pick(minute, 30);
  modal.querySelector(".kulms-memo-save").click();
  const saved = await until(() => (browser.storage.local.dump()["kulms-memos"] || []).length === 1);
  assert.ok(saved, "the memo was not stored");
  const memo = browser.storage.local.dump()["kulms-memos"][0];
  const expected = new tab.window.Date(when.getFullYear(), when.getMonth(), when.getDate(), 9, 30).getTime();
  assert.deepEqual([memo.text, memo.deadline], ["教科書を買う", expected]);
});

// What B12 spoils: the IDs that submit-detect.js leaves in the page's
// sessionStorage after a submission, which the panel marks as done on the
// next page and then takes out.
test("an assignment submitted on the page before is marked done, and the IDs left for it are taken out", async (t) => {
  const browser = browserWith(cached([assignment("A1", "レポート1", Date.now() + 30 * H), assignment("A2", "レポート2", Date.now() + 50 * H)]));
  t.after(() => browser.close());
  const tab = openCoursePage(browser, { prepare: (w) => w.sessionStorage.setItem("kulms-submitted-ids", JSON.stringify(["A1"])) });
  await idle();
  assert.deepEqual(Object.keys(browser.storage.local.dump()["kulms-checked-assignments"] || {}), ["A1"]);
  assert.equal(tab.window.sessionStorage.getItem("kulms-submitted-ids"), null, "the IDs were left in sessionStorage");
  assert.deepEqual(browser.errors.map((e) => String(e.error)), []);
});
