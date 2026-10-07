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
//
// How the work of the parsers grows on a run of what one of their regular
// expressions backtracks over is counted with no clock: the work of the
// regular expressions of the findings by the steps of a backtracking engine
// (harness/backtrack.mjs), for runs of n, 2n and 4n characters, and the degree
// of its growth read off them (degree() of harness/work.mjs). Linear work has
// degree 1; S2 and S8 have 3 and 2 on these runs. tests/regexp.test.mjs
// decides the same of every regular expression of the extension, from its
// automaton.
import test from "node:test";
import assert from "node:assert/strict";
import { Browser, LINEAR, Net, degree, measure, openBackground, openTab, settle } from "../harness/index.mjs";

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

test("the site contact is read from a well-formed row", async (t) => {
  const { browser, g } = background(siteInfo('<th>サイト連絡先・メール</th>\n<td>\n  京大 太郎, <a href="mailto:x@example.com">x</a></td>'));
  t.after(() => browser.close());
  assert.equal(await g.fetchSakaiSiteContact("site"), "京大 太郎");
});

// The degree of the work of read(g), on the background with `net(k)`.
const degreeOf = (n, net, read) => degree(n, async (k) => {
  const { browser, g } = background(net(k));
  try {
    return await measure(() => read(g));
  } finally {
    browser.close();
  }
});

test("S2: the site contact is read in work linear in a run of whitespace", { todo: "S2: the regex backtracks, cubically on a run of whitespace" }, async () => {
  const d = await degreeOf(64, (k) => siteInfo("サイト連絡先・メール<td>" + " \t".repeat(k) + "\n"), (g) => g.fetchSakaiSiteContact("site"));
  assert.ok(d < LINEAR, `the work grows as the ${d.toFixed(2)}th power of the run`);
});

// A run of what one of the parsers' regular expressions takes, where it does
// not find what ends the match: 『 with no 』, an unclosed tag, an opening
// bracket of the publisher with no closing one, and a run of separators that
// is not at the end of a title; in the search's results, rows, cells and tags
// that do not close.
const LINK = '<a href="la_syllabus?lectureNo=1">x</a>';
const RUNS = {
  "the syllabus": [(k) => "『".repeat(k), (k) => "<".repeat(k), (k) => "著者『書名』" + "（".repeat(k), (k) => "書名" + "、".repeat(k) + "x"],
  // A row is read only when it links to a syllabus.
  "the search's results": [(k) => "<tr".repeat(k), (k) => "<tr>".repeat(k), (k) => `<tr><td>${LINK}</td>` + "<td>".repeat(k) + "</tr>", (k) => `<tr><td>${LINK}` + "<".repeat(k) + "</td></tr>"],
};

test("S8: the textbook line parsers read a run in work linear in its length", { todo: "S8: the regular expressions backtrack, quadratically on these runs" }, async () => {
  const steep = [];
  for (const run of RUNS["the syllabus"]) {
    const d = await degreeOf(1000, (k) => syllabus("<td>(教科書)</td><td>" + run(k) + "</td>"), (g) => g.fetchSyllabusDetail("1", "2"));
    if (!(d < LINEAR)) steep.push(`${JSON.stringify(run(2))}…: degree ${d.toFixed(2)}`);
  }
  assert.deepEqual(steep, []);
});

test("S8: the search's results are read in work linear in a run", { todo: "S8: the regular expressions backtrack, quadratically on these runs" }, async () => {
  const steep = [];
  for (const run of RUNS["the search's results"]) {
    const d = await degreeOf(1000, (k) => syllabus("<table>" + run(k) + "</table>"), (g) => g.searchSyllabus("線形代数", { expectedTeacher: () => Promise.resolve(null) }));
    if (!(d < LINEAR)) steep.push(`${JSON.stringify(run(2))}…: degree ${d.toFixed(2)}`);
  }
  assert.deepEqual(steep, []);
});

test("S4: the syllabus text is decoded once, so &amp;lt; stays &lt;", { todo: "S4: &amp; is decoded before &lt;, so &amp;lt; becomes <" }, async (t) => {
  const { browser, g } = background(syllabus("<td>(教科書)</td><td>著者『&amp;lt;b&amp;gt;入門』(出版社)</td>"));
  t.after(() => browser.close());
  const [book] = await g.fetchSyllabusDetail("1", "2");
  assert.equal(book.title, "&lt;b&gt;入門");
});

// KULASIS writes a character that Shift_JIS lacks as a numeric reference.
test("S4: numeric character references in the syllabus are decoded", { todo: "S4: &#…; is replaced with nothing, and &#x…; is left as it is" }, async (t) => {
  const { browser, g } = background(syllabus("<td>(教科書)</td><td>著者『&#134071;野家の&#x2160;巻』(出版社)</td>"));
  t.after(() => browser.close());
  const [book] = await g.fetchSyllabusDetail("1", "2");
  assert.equal(book.title, "𠮷野家のⅠ巻");
});

test("S7: the message listeners survive messages of any shape", { todo: "S7: null and {type: 1} throw a TypeError" }, async (t) => {
  const { browser, bg } = background();
  t.after(() => browser.close());
  // Sent from a content script of the LMS, which can send any JSON.
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  for (const message of [null, 1, "x", [], { type: 1 }, { type: {} }, { action: "fetchTextbooks", courseName: 1 }, { action: "fetchTextbooks", siteId: { toString: 0 } }]) {
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

test("B20: a page of pages.json that is null does not hide the Site Info tool after it", { todo: "B20: pages.json is read without looking at its shape, so a TypeError on a page that is null ends the search" }, async (t) => {
  const net = new Net()
    .on(`${LMS}/direct/site/`, { headers: { "content-type": "application/json" }, body: JSON.stringify([null, { tools: [{ toolId: "sakai.siteinfo", placementId: "p" }] }]) })
    .on(`${LMS}/portal/tool/p`, { headers: { "content-type": "text/html; charset=utf-8" }, body: '<th>サイト連絡先・メール</th>\n<td>\n  京大 太郎, <a href="mailto:x@example.com">x</a></td>' });
  const { browser, g } = background(net);
  t.after(() => browser.close());
  assert.equal(await g.fetchSakaiSiteContact("site"), "京大 太郎");
});
