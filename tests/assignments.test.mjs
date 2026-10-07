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
import { Browser, Net, openPopup, settle, until } from "../harness/index.mjs";
import { COURSE_PAGE, D, H, LMS, assignment, cached, card, openCoursePage, openPanel } from "./lms.mjs";

function browserWith(stored) {
  const browser = new Browser();
  browser.storage.local.load(stored);
  return browser;
}

// Two tabs of the course page with their panels open, as when a user keeps
// the LMS open in two tabs: each has read the stored state before the other
// changes it. What one tab stores reaches the other on the next turn, as
// storage.onChanged does in Chrome, so a wait of 20ms after a change lets the
// other tab hear of it however slow the machine (its timer comes later).
async function twoTabs(t, assignments) {
  const browser = browserWith(cached(assignments));
  t.after(() => browser.close());
  const panelA = await openPanel(openCoursePage(browser));
  const panelB = await openPanel(openCoursePage(browser));
  return { stored: (key) => browser.storage.local.dump()[key], panelA, panelB };
}

function addMemo(panel, text) {
  panel.querySelector(".kulms-memo-btn").click();
  panel.querySelector(".kulms-memo-form textarea").value = text;
  panel.querySelector(".kulms-memo-save").click();
}

const B1 = "B1: each tab saves the state it loaded, over the other tab's";

test("B1: a memo added in one tab survives a memo added in another", { todo: B1 }, async (t) => {
  const { stored, panelA, panelB } = await twoTabs(t, [assignment("A1", "レポート1", Date.now() + 30 * H)]);
  addMemo(panelB, "Bで書いたメモ");
  await settle(20);
  addMemo(panelA, "Aで書いたメモ");
  await settle(20);
  assert.deepEqual((stored("kulms-memos") || []).map((m) => m.text).sort(), ["Aで書いたメモ", "Bで書いたメモ"]);
});

test("B1: a completion check made in one tab survives one made in another", { todo: B1 }, async (t) => {
  const { stored, panelA, panelB } = await twoTabs(t, [assignment("A1", "レポート1", Date.now() + 30 * H), assignment("A2", "レポート2", Date.now() + 50 * H)]);
  card(panelB, "レポート1").querySelector(".kulms-checkbox").click();
  await settle(20);
  card(panelA, "レポート2").querySelector(".kulms-checkbox").click();
  await settle(20);
  assert.deepEqual(Object.keys(stored("kulms-checked-assignments") || {}).sort(), ["A1", "A2"]);
});

test("B1: an assignment hidden in one tab stays hidden when another tab hides one", { todo: B1 }, async (t) => {
  const { stored, panelA, panelB } = await twoTabs(t, [assignment("A1", "レポート1", Date.now() + 30 * H), assignment("A2", "レポート2", Date.now() + 50 * H)]);
  for (const [panel, name] of [[panelB, "レポート1"], [panelA, "レポート2"]]) {
    const button = card(panel, name).querySelector(".kulms-card-delete");
    button.click(); // asks to confirm
    button.click();
    await settle(20);
  }
  assert.deepEqual(Object.keys(stored("kulms-dismissed-assignments") || {}).sort(), ["A1", "A2"]);
});

test("B1: a panel open in one tab shows a memo added in another", { todo: B1 }, async (t) => {
  const { panelA, panelB } = await twoTabs(t, [assignment("A1", "レポート1", Date.now() + 30 * H)]);
  addMemo(panelB, "Bで書いたメモ");
  await settle(20);
  assert.ok(card(panelA, "Bで書いたメモ"), "the memo is not in the other tab's panel");
});

// The record of an item hidden `days` ago, as dismissAssignment() writes it.
const hidden = (id, name, days, extra = {}) => ({ dismissedAt: Date.now() - days * D, name, courseName: "線形代数", courseId: "C1", type: "assignment", entityId: id, ...extra });
const names = (panel, selector) => [...panel.querySelectorAll(`${selector} .kulms-assign-card-name`)].map((n) => n.textContent);

test("B2: an assignment hidden 31 days ago stays hidden, out of the deleted section", { todo: "B2 (upstream #74): the purge drops the record that hides it, and it comes back" }, async (t) => {
  const browser = browserWith({
    ...cached([assignment("OLD", "未提出のまま期限切れ", Date.now() - 40 * D), assignment("FUT", "先の課題", Date.now() + 20 * D), assignment("NEW", "昨日隠した課題", Date.now() + 5 * D)]),
    "kulms-dismissed-assignments": { OLD: hidden("OLD", "未提出のまま期限切れ", 31), FUT: hidden("FUT", "先の課題", 31), NEW: hidden("NEW", "昨日隠した課題", 1) },
  });
  t.after(() => browser.close());
  const panel = await openPanel(openCoursePage(browser));
  assert.deepEqual(names(panel, ".kulms-assign-card:not(.kulms-deleted-card)"), []);
  // What was hidden 30 days ago or more can no longer be restored, as the panel says.
  assert.deepEqual(names(panel, ".kulms-deleted-card"), ["昨日隠した課題"]);
});

// After a submission, submit-detect.js leaves the IDs submitted in the page's
// sessionStorage for assignments.js to mark as done; the page's own scripts
// can write there too.
test("B12: a list of submitted IDs that the page has spoiled is read as far as it holds IDs", { todo: "B12: ids.forEach and checkedState[id] throw on what is not an array of strings" }, async (t) => {
  for (const ids of ["null", '"abc"', "{}", JSON.stringify([{ toString: 0 }, 1, "A1"])]) {
    const browser = browserWith(cached([assignment("A1", "レポート1", Date.now() + 30 * H)]));
    t.after(() => browser.close());
    openCoursePage(browser, { prepare: (w) => w.sessionStorage.setItem("kulms-submitted-ids", ids) });
    const checked = () => browser.storage.local.dump()["kulms-checked-assignments"] || {};
    if (ids.includes("A1")) await until(() => "A1" in checked(), { timeout: 2000 });
    else await settle(300);
    assert.deepEqual(browser.errors.map((e) => `${ids}: ${e.error}`), []);
    assert.deepEqual(Object.keys(checked()), ids.includes("A1") ? ["A1"] : [], ids);
  }
});

// The stored state of B17: one memo that is null, beside one that is not.
const withNullMemo = () => ({
  ...cached([assignment("A1", "レポート1", Date.now() + 30 * H)]),
  "kulms-memos": [null, { id: 1, text: "残るメモ", created: Date.now() }],
});

test("B17: a stored memo that is null does not stop the drawing of the panel", { todo: "B17: normalizeMemo() hands null back, and reading its deadline throws" }, async (t) => {
  const browser = browserWith(withNullMemo());
  t.after(() => browser.close());
  const tab = openCoursePage(browser);
  await until(() => tab.document.getElementById("kulms-assign-toggle"));
  tab.document.getElementById("kulms-assign-toggle").click();
  const panel = tab.document.getElementById("kulms-assign-panel");
  await until(() => card(panel, "残るメモ"), { timeout: 2000 });
  assert.ok(card(panel, "レポート1") && card(panel, "残るメモ"), "the panel lacks the assignment or the memo");
});

test("B17: a stored memo that is null does not stop the popup's list", { todo: "B17: normalizeMemo() hands null back, and reading its id throws" }, async (t) => {
  const browser = browserWith(withNullMemo());
  t.after(() => browser.close());
  const popup = openPopup(browser);
  await until(() => popup.document.body.textContent.includes("残るメモ"), { timeout: 2000 });
  const text = popup.document.body.textContent;
  assert.ok(text.includes("レポート1") && text.includes("残るメモ"), "the popup lacks the assignment or the memo");
});

test("a memo deleted 31 days ago is deleted for good", async (t) => {
  const memo = { id: 1, text: "古いメモ", created: Date.now() - 40 * D };
  const browser = browserWith({
    ...cached([assignment("A1", "レポート1", Date.now() + 30 * H)]),
    "kulms-memos": [memo],
    "kulms-dismissed-assignments": { "memo-1": hidden("memo-1", "古いメモ", 31, { type: "memo", _memoId: 1 }) },
  });
  t.after(() => browser.close());
  await openPanel(openCoursePage(browser));
  const stored = browser.storage.local.dump();
  assert.deepEqual([stored["kulms-memos"], stored["kulms-dismissed-assignments"]], [[], {}]);
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

test("B7: the assignments of a course the sidebar does not show link to its tool, looked up once and kept", { todo: "B7: each item sends for pages.json in turn, each time the panel opens, and what it finds is not kept" }, async (t) => {
  const timestamp = Date.now();
  const items = ["A1", "A2", "A3"].map((id, i) => assignment(id, `レポート${i + 1}`, Date.now() + (30 + 10 * i) * H, { courseId: "C9", url: `${LMS}/portal/site/C9` }));
  const browser = browserWith({ "kulms-assignments": { timestamp, assignments: items } });
  t.after(() => browser.close());
  const net = new Net().on(`${LMS}/direct/site/C9/pages.json`, { headers: { "content-type": "application/json" }, body: JSON.stringify([{ tools: [{ toolId: "sakai.assignment.grades", id: "T9" }] }]) });
  const panel = await openPanel(openCoursePage(browser, { net }));
  assert.deepEqual([...panel.querySelectorAll(".kulms-assign-card-name a")].map((link) => new URL(link.href).pathname), Array(3).fill("/portal/site/C9/tool/T9"));
  assert.equal(net.requests.filter((r) => r.url.endsWith("/pages.json")).length, 1);
  await settle(100);
  const kept = browser.storage.local.dump()["kulms-assignments"];
  assert.equal(kept.timestamp, timestamp);
  assert.deepEqual(kept.assignments.map((x) => x.url), Array(3).fill(`${LMS}/portal/site/C9/tool/T9`));
});

test("B8: drawing the list twice in a row leaves one banner of each kind", { todo: "B8: each draw appends its banners when storage answers, after the next draw" }, async (t) => {
  const browser = browserWith(cached([assignment("A1", "レポート1", Date.now() + 30 * H)]));
  t.after(() => browser.close());
  const panel = await openPanel(openCoursePage(browser));
  await settle(100); // the banners come when storage answers
  assert.equal(panel.querySelectorAll(".kulms-tester-banner").length, 2);
  const checkbox = () => panel.querySelector(".kulms-checkbox");
  checkbox().click();
  checkbox().click();
  await settle(100);
  assert.equal(panel.querySelectorAll(".kulms-tester-banner").length, 2);
});

test("B8: the list's banners do not come into the settings view opened before storage answers", { todo: "B8: each draw appends its banners when storage answers, to whatever the panel shows then" }, async (t) => {
  const browser = browserWith(cached([assignment("A1", "レポート1", Date.now() + 30 * H)]));
  t.after(() => browser.close());
  const tab = openCoursePage(browser);
  const panel = await openPanel(tab);
  // The list drawn again, its banners to come when storage answers, and the
  // settings view opened before it does.
  panel.querySelector(".kulms-checkbox").click();
  tab.internals["src/assignments.js"].showSettingsView();
  await settle(100);
  assert.equal(panel.querySelectorAll(".kulms-tester-banner").length, 0);
});

test("B9: a refresh asked for while the list loads is carried out after it, and only then answered", { todo: "B9: loadAssignments() returns at once while a load is under way, and the refresh asked for is dropped" }, async (t) => {
  const json = (body) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const browser = new Browser();
  t.after(() => browser.close());
  const net = new Net()
    .on(`${LMS}/direct/assignment/site/C1.json`, json({ assignment_collection: [] }))
    .on(`${LMS}/direct/sam_pub/context/C1.json`, json({ sam_pub_collection: [] }));
  const tab = openCoursePage(browser, { net });
  await until(() => tab.internals["src/assignments.js"] && tab.document.getElementById("kulms-assign-toggle"));
  await settle(100);
  const a = tab.internals["src/assignments.js"];
  const fetches = () => net.requests.filter((r) => r.url.endsWith("/direct/assignment/site/C1.json")).length;
  const before = fetches();
  a.loadAssignments(true);
  // The popup's button, while the list loads: answered once the list is
  // fetched anew after the load under way.
  await a.loadAssignments(true);
  assert.equal(fetches() - before, 2);
});

test("a textbook list cached by the course's name, as the extension has kept it, is drawn with its names", async (t) => {
  const browser = browserWith({ "kulms-textbooks-v3": { timestamp: Date.now(), data: {
    "[2026前期火２]英語リーディング": { books: [], syllabusUrl: "", status: "not_found" },
    "[2026前期月１]線形代数": { books: [{ title: "線形代数入門", author: "", publisher: "", isbn: "", type: "textbook" }], syllabusUrl: "", status: "found" },
  } } });
  t.after(() => browser.close());
  const tab = openCoursePage(browser);
  await until(() => tab.window.__kulmsTextbookAPI);
  const list = tab.document.createElement("div");
  tab.document.body.append(list);
  tab.window.__kulmsTextbookAPI.loadInto(list, false);
  await until(() => list.querySelector(".kulms-textbook-course"), { timeout: 5000 });
  assert.deepEqual([...list.querySelectorAll(".kulms-textbook-course-name")].map((n) => n.textContent), ["[2026前期月１]線形代数", "[2026前期火２]英語リーディング"]);
});

test("B11: two courses of the same name each have their own entry in the textbook list", { todo: "B11: the list is keyed by the course's name, so one course's entry replaces the other's" }, async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const net = new Net().on(`${LMS}/direct/site.json`, { headers: { "content-type": "application/json" }, body: JSON.stringify({ site_collection: [
    { id: "2026-110-1001-000", title: "英語リーディング", type: "course" },
    { id: "2026-110-1002-000", title: "英語リーディング", type: "course" },
  ] }) });
  const tab = openCoursePage(browser, { net });
  await until(() => tab.window.__kulmsTextbookAPI);
  const list = tab.document.createElement("div");
  tab.document.body.append(list);
  tab.window.__kulmsTextbookAPI.loadInto(list, true);
  await until(() => list.querySelector(".kulms-textbook-course"), { timeout: 5000 });
  assert.equal(list.querySelectorAll(".kulms-textbook-course").length, 2);
});

// A course page whose fetch reaches Sakai's API: the course's assignments and
// quizzes are `assignments` and `quizzes`, and anything else is not found. It
// returns the names of what fetchAllAssignments() fetches.
async function fetchedNames(t, assignments, quizzes) {
  const json = (body) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const browser = new Browser();
  t.after(() => browser.close());
  const net = new Net()
    .on(`${LMS}/direct/assignment/site/C1.json`, json({ assignment_collection: assignments }))
    .on(`${LMS}/direct/sam_pub/context/C1.json`, json({ sam_pub_collection: quizzes }));
  const tab = openCoursePage(browser, { net });
  await until(() => tab.internals["src/assignments.js"]);
  return Array.from(await tab.internals["src/assignments.js"].fetchAllAssignments(), (a) => a.name);
}

const due = { epochSecond: Math.floor(Date.now() / 1000) + 3 * 86400 };
const B19 = "B19: the fetches read Sakai's answers without looking at their shape, so a TypeError on one item takes out all of the courses of the list, or all of a course's assignments or quizzes";

test("B19: one malformed assignment does not take the course's other assignments out", { todo: B19 }, async (t) => {
  for (const bad of [null, { title: "状態が数の課題", entityId: "A2", dueTime: due, submissions: [{ status: 1 }] }]) {
    const names = await fetchedNames(t, [bad, { title: "レポート1", entityId: "A1", dueTime: due }], []);
    assert.ok(names.includes("レポート1"), `${JSON.stringify(bad)}: ${JSON.stringify(names)}`);
  }
});

test("B19: one malformed quiz does not take the course's other quizzes out", { todo: B19 }, async (t) => {
  const names = await fetchedNames(t, [], [null, { title: "小テスト1", publishedAssessmentId: 7, dueDate: due }]);
  assert.ok(names.includes("小テスト1"), JSON.stringify(names));
});

test("B19: one malformed site in Sakai's list of courses does not take the other courses out", { todo: B19 }, async (t) => {
  const json = (body) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const browser = new Browser();
  t.after(() => browser.close());
  const net = new Net()
    .on(`${LMS}/direct/site.json`, json({ site_collection: [null, { id: "C1", title: "線形代数", type: "course" }] }))
    .on(`${LMS}/direct/assignment/site/C1.json`, json({ assignment_collection: [{ title: "レポート1", entityId: "A1", dueTime: due }] }));
  // No course in the page's sidebar, so that the courses come from Sakai's API.
  const html = COURSE_PAGE.replace(/<nav[\s\S]*<\/nav>/, '<nav id="portal-nav-sidebar"><ul></ul></nav>');
  const tab = openCoursePage(browser, { net, html });
  await until(() => tab.internals["src/assignments.js"]);
  const names = Array.from(await tab.internals["src/assignments.js"].fetchAllAssignments(), (a) => a.name);
  assert.deepEqual(names, ["レポート1"]);
});
