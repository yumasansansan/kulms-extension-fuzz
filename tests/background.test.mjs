// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// background.js: the syllabus parsers, the Shift_JIS encoder and the message
// listeners. Each test says what the code should do; a test marked todo fails
// while the finding of docs/findings.md it names stands.
import test from "node:test";
import assert from "node:assert/strict";
import { Browser, Net, openBackground, openTab, settle } from "../harness/index.mjs";

const LMS = "https://lms.gakusei.kyoto-u.ac.jp";
const SYLLABUS = "https://www.k.kyoto-u.ac.jp/external/open_syllabus";

function background(net = new Net()) {
  const browser = new Browser();
  const bg = openBackground(browser, { net });
  return { browser, bg, g: bg.global };
}

// A course whose Site Info page (found through pages.json) is `html`.
const siteInfo = (html) => new Net()
  .on(`${LMS}/direct/site/`, { headers: { "content-type": "application/json" }, body: JSON.stringify([{ tools: [{ toolId: "sakai.siteinfo", placementId: "p" }] }]) })
  .on(`${LMS}/portal/tool/p`, { headers: { "content-type": "text/html; charset=utf-8" }, body: html });

// A syllabus page whose text is `html`.
const syllabus = (html) => new Net().on(`${SYLLABUS}/`, { headers: { "content-type": "text/html; charset=utf-8" }, body: html });

async function timed(f) {
  const started = performance.now();
  await f();
  return performance.now() - started;
}

test("the site contact is read from a well-formed row", async (t) => {
  const { browser, g } = background(siteInfo('<th>サイト連絡先・メール</th>\n<td>\n  京大 太郎, <a href="mailto:x@example.com">x</a></td>'));
  t.after(() => browser.close());
  assert.equal(await g.fetchSakaiSiteContact("site"), "京大 太郎");
});

test("S2: the site contact regex keeps to linear time on a run of whitespace", { todo: "S2: cubic backtracking, 2,000 chars take about 2.4 s and 4,000 about 20 s" }, async (t) => {
  const { browser, g } = background(siteInfo("サイト連絡先・メール<td>" + " \t".repeat(1000) + "\n"));
  t.after(() => browser.close());
  const ms = await timed(() => g.fetchSakaiSiteContact("site"));
  assert.ok(ms < 200, `2,000 whitespace characters took ${ms.toFixed(0)} ms`);
});

test("S4: the syllabus text is decoded once, so &amp;lt; stays &lt;", { todo: "S4: &amp; is decoded before &lt;, so &amp;lt; becomes <" }, async (t) => {
  const { browser, g } = background(syllabus("<td>(教科書)</td><td>著者『&amp;lt;b&amp;gt;入門』(出版社)</td>"));
  t.after(() => browser.close());
  const [book] = await g.fetchSyllabusDetail("1", "2");
  assert.equal(book.title, "&lt;b&gt;入門");
});

test("S8: the textbook line parsers keep to linear time", { todo: "S8: quadratic, 20,000 characters take about 0.2 s each" }, async (t) => {
  for (const run of ["『".repeat(20000), "<".repeat(20000)]) {
    const { browser, g } = background(syllabus("<td>(教科書)</td><td>" + run + "</td>"));
    t.after(() => browser.close());
    const ms = await timed(() => g.fetchSyllabusDetail("1", "2"));
    assert.ok(ms < 50, `${JSON.stringify(run[0])} x 20,000 took ${ms.toFixed(0)} ms`);
  }
});

test("S7: the message listeners survive messages of any shape", { todo: "S7: null and {type: 1} throw a TypeError" }, async (t) => {
  const { browser, bg } = background();
  t.after(() => browser.close());
  // Sent from a content script of the LMS, which can send any JSON.
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  for (const message of [null, 1, "x", [], { type: 1 }, { type: {} }, { action: "fetchTextbooks", courseName: 1 }]) {
    browser.deliver(tab, [bg], message).catch(() => {});
  }
  await settle(50);
  assert.deepEqual(browser.errors.map((e) => String(e.error)), []);
});

test("B14: encodeShiftJIS says when it cannot encode a character", { todo: "B14: characters outside Shift_JIS are dropped silently" }, (t) => {
  const { browser, g } = background();
  t.after(() => browser.close());
  // 𠮷 (U+20BB7) has no Shift_JIS code; the search keyword loses it without a word.
  assert.notEqual(g.encodeShiftJIS("𠮷野家"), g.encodeShiftJIS("野家"));
});
