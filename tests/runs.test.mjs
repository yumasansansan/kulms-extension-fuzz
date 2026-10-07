// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// Runs of what the regular expressions of S9 (docs/findings.md) backtrack
// over, each read in work linear in its length by the code that meets it: a
// course name cleaned for the syllabus's search (background.js), the sort key
// of a course name (course-name.js, textbooks.js), a TOTP secret on the login
// page (auth-totp.js) and the depth of a folder of Resources (tree-view.js). A
// test marked todo fails while S9 stands.
//
// No clock decides. The work is counted (harness/work.mjs) for runs of n, 2n
// and 4n, and the degree of its growth read off them (degree() of
// harness/work.mjs) must be nearer 1 than 2; the regular expressions are
// counted by the steps of a backtracking engine (harness/backtrack.mjs).
// tests/regexp.test.mjs decides the same of each regular expression from its
// automaton; these tests follow the code around it as well, which may loop
// over its matches or search the text again.
import test from "node:test";
import assert from "node:assert/strict";
import { Browser, LINEAR, Net, degree, idle, measure, openBackground, openPopup, openTab } from "../harness/index.mjs";
import { LMS } from "./lms.mjs";

const TODO = { todo: "S9: the regular expressions backtrack, quadratically on these runs" };

// The runs of `runs` on which work(run(k)) grows faster than linearly, each
// with its degree, for runs of n, 2n and 4n.
async function steep(runs, work, n = 1000) {
  const out = [];
  for (const run of runs) {
    const d = await degree(n, (k) => work(run(k)));
    if (!(d < LINEAR)) out.push(`${JSON.stringify(run(2))}…: degree ${d.toFixed(2)}`);
  }
  return out;
}

// f(browser) in a browser of its own, its store holding `stored`, closed when
// f is done, so that nothing of it works on while the next size is counted.
async function inBrowser(f, stored) {
  const browser = new Browser();
  try {
    if (stored) browser.storage.local.load(stored);
    return await f(browser);
  } finally {
    browser.close();
  }
}

test("S9: a course name is cleaned for the syllabus's search in work linear in a run", TODO, async () => {
  // Whitespace that no ( follows, and ( that no ) closes.
  const runs = [(k) => "線形代数" + " ".repeat(k) + "x", (k) => "(".repeat(k)];
  const net = new Net().on("https://", { headers: { "content-type": "text/html; charset=utf-8" }, body: "" });
  assert.deepEqual(await steep(runs, (courseName) => inBrowser(async (browser) => {
    const bg = openBackground(browser, { net });
    const tab = openTab(browser, { url: `${LMS}/portal/site/C1`, scripts: [] });
    await idle();
    return measure(() => browser.deliver(tab, [bg], { action: "fetchTextbooks", courseName, lectureCode: "", siteId: "C1" }));
  })), []);
});

test("S9: the sort key of a course is read from its name in work linear in a run", TODO, async () => {
  // Brackets with a year that no day and period close, and days and periods
  // that no bracket opens.
  const runs = [(k) => "[2026".repeat(k), (k) => "月1]".repeat(k)];
  for (const [file, key] of [["src/course-name.js", "getSortKey"], ["src/textbooks.js", "getCourseSortKey"]]) {
    assert.deepEqual(await steep(runs, (name) => inBrowser(async (browser) => {
      const tab = openTab(browser, { url: `${LMS}/portal`, scripts: ["src/settings.js", file] });
      await idle();
      return measure(() => tab.internals[file][key](name));
    }), 250), [], file);
  }
});

// The page the university's login asks for the one-time code on.
const OTP_PAGE = '<!doctype html><html><head></head><body><form id="login"><input id="password_input"></form></body></html>';
const OTP_URL = "https://auth.iimc.kyoto-u.ac.jp/user/otplogin.cgi";

test("S9: a TOTP secret is decoded on the login page in work linear in a run", TODO, async () => {
  // = that does not end the secret.
  const runs = [(k) => "=".repeat(k) + "A"];
  assert.deepEqual(await steep(runs, (secret) => inBrowser(async (browser) => {
    const bg = openBackground(browser);
    const popup = openPopup(browser);
    await idle();
    await browser.deliver(popup, [bg], { type: "kulms-totp-save", secret });
    await idle();
    return measure(() => {
      openTab(browser, { url: OTP_URL, html: OTP_PAGE, prepare: (w) => { w.HTMLFormElement.prototype.submit = function () {}; } });
    });
  })), []);
});

// Resources with one row, a folder (its icon) whose link has `onclick`.
const resources = (onclick) => '<!doctype html><html><head></head><body><table class="resourcesList"><tbody><tr><td class="title">' +
  `<div class="d-flex"><i class="fa fa-folder"></i><a href="#" onclick="${onclick}">f</a></div></td></tr></tbody></table></body></html>`;

test("S9: the depth of a folder of Resources is read from its link in work linear in a run", TODO, async () => {
  // collectionId with no =' … ' after it.
  const runs = [(k) => "collectionId".repeat(k)];
  assert.deepEqual(await steep(runs, (onclick) => inBrowser((browser) => measure(() => {
    openTab(browser, { url: `${LMS}/portal/site/C1/tool/R`, html: resources(onclick), scripts: ["src/settings.js", "src/tree-view.js"] });
  }), { "kulms-settings": { treeViewEnhanced: true } }), 250), []);
});
