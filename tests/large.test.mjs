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
// be handled without an error, in work linear in its size.
//
// No clock decides. The work the extension does is counted (harness/work.mjs)
// for the input at three sizes, n, 2n and 4n, 4n being the size above, and
// the degree of its growth read off them (degree() of harness/work.mjs) must
// be nearer 1 than 2. The regular expressions of the findings that backtrack
// are counted by the steps of a backtracking engine (harness/backtrack.mjs),
// so that one that backtracked on these inputs would show.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Browser, LINEAR, Net, degree, idle, measure, openBackground, openPopup, openTab } from "../harness/index.mjs";
import { H, LMS, assignment, cached, openCoursePage } from "./lms.mjs";

const MB = 1 << 20;
const HTML = { "content-type": "text/html; charset=utf-8" };

// `length` bytes that look random and are the same on every run: the start of
// SHAKE256's output for this file's name, so that a shorter run of them is the
// start of a longer one.
const bytes = (length) => crypto.createHash("shake256", { outputLength: length }).update("tests/large.test.mjs").digest();

const assertLinear = (d) => assert.ok(d < LINEAR, `the work grows as the ${d.toFixed(2)}th power of the input's size`);

// f(context, browser) in a browser of its own, closed when f is done, so that
// nothing of it works on while the next size is counted.
async function inBrowser(open, f, stored) {
  const browser = new Browser();
  try {
    if (stored) browser.storage.local.load(stored);
    const context = open(browser);
    await idle();
    return await f(context, browser);
  } finally {
    browser.close();
  }
}

const inBackground = (net, f) => inBrowser((browser) => openBackground(browser, { net }), f);

test("a syllabus page of 8 MB of any bytes is read in work linear in its size", async () => {
  const net = (k) => new Net().on("https://www.k.kyoto-u.ac.jp/", { headers: HTML, body: bytes(k) });
  assertLinear(await degree(2 * MB, (k) => inBackground(net(k), (bg) => measure(async () => {
    assert.ok(Array.isArray(await bg.global.fetchSyllabusDetail("1", "2")));
  }))));
});

test("a syllabus page of 8 MB of textbook lines is read in work linear in its size", async () => {
  const line = "<td>(教科書)</td><td>金東海『現代電気機器理論』(電気学会) ISBN:9784886862808<br>";
  const net = (k) => new Net().on("https://www.k.kyoto-u.ac.jp/", { headers: HTML, body: line.repeat(k) });
  assertLinear(await degree(Math.floor((2 * MB) / Buffer.byteLength(line)), (k) => inBackground(net(k), (bg) => measure(async () => {
    const books = await bg.global.fetchSyllabusDetail("1", "2");
    assert.deepEqual(Array.from(books, (book) => book.title), ["現代電気機器理論"]);
  }))));
});

// S8 (docs/findings.md): bytes at random hold a row that opens and
// does not close (<tr> and no </tr>) about once in four million: each such
// row sends the search for rows to the end of the page, so that the work grows
// with the square of the page's size.
test("a page of search results of 8 MB of any bytes is read in work linear in its size", { todo: "S8: rows that do not close are looked through to the end of the page, each" }, async () => {
  const net = (k) => new Net().on("https://www.k.kyoto-u.ac.jp/", { headers: HTML, body: bytes(k) });
  assertLinear(await degree(2 * MB, (k) => inBackground(net(k), (bg) => measure(() =>
    bg.global.searchSyllabus("線形代数", { expectedTeacher: () => Promise.resolve(null) })))));
});

test("a Site Info page of 8 MB of any bytes is read in work linear in its size", async () => {
  const net = (k) => new Net()
    .on(`${LMS}/direct/site/`, { headers: { "content-type": "application/json" }, body: JSON.stringify([{ tools: [{ toolId: "sakai.siteinfo", placementId: "p" }] }]) })
    .on(`${LMS}/portal/tool/p`, { headers: HTML, body: bytes(k) });
  assertLinear(await degree(2 * MB, (k) => inBackground(net(k), (bg) => measure(() => bg.global.fetchSakaiSiteContact("site")))));
});

test("a fetchTextbooks with a course name of a million characters is answered in work linear in its length", async () => {
  const net = new Net().on("https://", { headers: HTML, body: "" });
  assertLinear(await degree(MB / 4, (k) => inBackground(net, (bg, browser) => {
    const tab = openTab(browser, { url: `${LMS}/portal/site/C1`, scripts: [] });
    return measure(async () => {
      const answer = await browser.deliver(tab, [bg], { action: "fetchTextbooks", courseName: "線".repeat(k), lectureCode: "", siteId: "C1" });
      assert.equal(answer.books.length, 0);
    });
  })));
});

test("t() puts a value of four million characters in its placeholder in work linear in its length", async () => {
  const open = (browser) => openTab(browser, { url: `${LMS}/portal`, scripts: ["src/settings.js"] });
  assertLinear(await degree(MB, (k) => inBrowser(open, (tab) => {
    const value = "x".repeat(k);
    return measure(() => assert.ok(tab.window.t("lastUpdatedMins", [value]).includes(value)));
  })));
});

const many = (n) => cached(Array.from({ length: n }, (_, i) => assignment(`A${i}`, `レポート${i}`, Date.now() + (i % 100) * H)));

// The assignment panel of a course page whose store holds `stored`, drawn,
// and the work its drawing took.
const panelWork = (stored, check) => inBrowser(openCoursePage, async (tab) => {
  const w = await measure(() => tab.document.getElementById("kulms-assign-toggle").click());
  check(tab.document.getElementById("kulms-assign-panel"));
  return w;
}, stored);

test("the panel draws 5,000 assignments in work linear in their number", async () => {
  assertLinear(await degree(1250, (k) => panelWork(many(k), (panel) => {
    assert.ok(panel.querySelectorAll(".kulms-assign-card").length >= k);
  })));
});

test("the popup lists 5,000 assignments in work linear in their number", async () => {
  assertLinear(await degree(1250, (k) => inBrowser(() => null, async (none, browser) => {
    let popup;
    const w = await measure(() => {
      popup = openPopup(browser);
    });
    assert.ok(popup.document.body.textContent.includes(`レポート${k - 1}`));
    return w;
  }, many(k))));
});

test("the panel draws 20,000 memos in work linear in their number", async () => {
  const memos = (k) => ({ ...cached([]), "kulms-memos": Array.from({ length: k }, (_, i) => ({ id: i + 1, text: `メモ${i}`, created: 0 })) });
  assertLinear(await degree(5000, (k) => panelWork(memos(k), (panel) => {
    assert.ok(panel.textContent.includes(`メモ${k - 1}`));
  })));
});
