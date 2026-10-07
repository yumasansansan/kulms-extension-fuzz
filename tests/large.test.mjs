// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The extension on inputs far larger than it meets: pages of 8 MB from the
// syllabus and the LMS, a message of a million characters, a text of four
// million, thousands of assignments and tens of thousands of memos. Each must
// end without an error within a time limit. The fuzzing makes inputs this
// large too (fuzz/lib.mjs), but its time limit per input is one for a hang;
// these limits are ten times or more what the extension takes on a desktop
// machine (a fraction of a second for each), and far less than what a pass
// quadratic in the input's length would take.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Browser, Net, openBackground, openPopup, openTab, settle, until } from "../harness/index.mjs";
import { H, LMS, assignment, cached, openCoursePage, openPanel } from "./lms.mjs";

const MB = 1 << 20;
const HTML = { "content-type": "text/html; charset=utf-8" };

async function within(seconds, f) {
  const started = performance.now();
  const result = await f();
  const took = (performance.now() - started) / 1000;
  assert.ok(took < seconds, `took ${took.toFixed(1)} s, more than ${seconds} s`);
  return result;
}

function background(t, net) {
  const browser = new Browser();
  t.after(() => browser.close());
  return { browser, bg: openBackground(browser, { net }) };
}

test("a syllabus page of 8 MB of any bytes is read within 5 s", async (t) => {
  const { bg } = background(t, new Net().on("https://www.k.kyoto-u.ac.jp/", { headers: HTML, body: crypto.randomBytes(8 * MB) }));
  const books = await within(5, () => bg.global.fetchSyllabusDetail("1", "2"));
  assert.ok(Array.isArray(books));
});

test("a syllabus page of 8 MB of textbook lines is read within 5 s", async (t) => {
  const line = "<td>(教科書)</td><td>金東海『現代電気機器理論』(電気学会) ISBN:9784886862808<br>";
  const body = line.repeat(Math.floor((8 * MB) / Buffer.byteLength(line)));
  const { bg } = background(t, new Net().on("https://www.k.kyoto-u.ac.jp/", { headers: HTML, body }));
  const books = await within(5, () => bg.global.fetchSyllabusDetail("1", "2"));
  assert.deepEqual(Array.from(books, (book) => book.title), ["現代電気機器理論"]);
});

test("a page of search results of 8 MB of any bytes is read within 5 s", async (t) => {
  const { bg } = background(t, new Net().on("https://www.k.kyoto-u.ac.jp/", { headers: HTML, body: crypto.randomBytes(8 * MB) }));
  await within(5, () => bg.global.searchSyllabus("線形代数", { expectedTeacher: () => Promise.resolve(null) }));
});

test("a Site Info page of 8 MB of any bytes is read within 5 s", async (t) => {
  const net = new Net()
    .on(`${LMS}/direct/site/`, { headers: { "content-type": "application/json" }, body: JSON.stringify([{ tools: [{ toolId: "sakai.siteinfo", placementId: "p" }] }]) })
    .on(`${LMS}/portal/tool/p`, { headers: HTML, body: crypto.randomBytes(8 * MB) });
  const { bg } = background(t, net);
  await within(5, () => bg.global.fetchSakaiSiteContact("site"));
});

test("a fetchTextbooks with a course name of a million characters is answered within 5 s", async (t) => {
  const { browser, bg } = background(t, new Net().on("https://", { headers: HTML, body: "" }));
  const tab = openTab(browser, { url: `${LMS}/portal/site/C1`, scripts: [] });
  const answer = await within(5, () => browser.deliver(tab, [bg], { action: "fetchTextbooks", courseName: "線".repeat(MB), lectureCode: "", siteId: "C1" }));
  assert.equal(answer.books.length, 0);
});

test("t() puts a value of four million characters in its placeholder within 2 s", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: ["src/settings.js"] });
  await settle(100);
  const value = "x".repeat(4 * MB);
  const text = await within(2, () => tab.window.t("lastUpdatedMins", [value]));
  assert.ok(text.includes(value));
});

const many = (n) => cached(Array.from({ length: n }, (_, i) => assignment(`A${i}`, `レポート${i}`, Date.now() + (i % 100) * H)));

test("the panel draws 5,000 assignments within 10 s", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  browser.storage.local.load(many(5000));
  const panel = await within(10, () => openPanel(openCoursePage(browser)));
  assert.equal(panel.querySelectorAll(".kulms-assign-card").length >= 5000, true);
});

test("the popup lists 5,000 assignments within 10 s", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  browser.storage.local.load(many(5000));
  const popup = openPopup(browser);
  await within(10, () => until(() => popup.document.body.textContent.includes("レポート4999"), { timeout: 10000 }));
  assert.ok(popup.document.body.textContent.includes("レポート0"));
});

test("the panel draws 20,000 memos within 15 s", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  browser.storage.local.load({ ...cached([]), "kulms-memos": Array.from({ length: 20000 }, (_, i) => ({ id: i + 1, text: `メモ${i}`, created: 0 })) });
  const panel = await within(15, () => openPanel(openCoursePage(browser)));
  assert.ok(panel.textContent.includes("メモ19999"));
});
