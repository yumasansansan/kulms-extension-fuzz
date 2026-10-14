// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The TA's grading support (grading-ta.js), with what reaches it from the page:
// the submissions that the bridge in the page's world sends, which a script of
// the page can forge, and the links of the page.
import test from "node:test";
import assert from "node:assert/strict";
import { Browser, openTab, until } from "../harness/index.mjs";
import { LMS } from "./lms.mjs";

async function grader(t) {
  const browser = new Browser();
  t.after(() => browser.close());
  const tab = openTab(browser, { url: `${LMS}/portal/site/S/tool/T`, scripts: ["src/settings.js", "src/grading-ta.js"] });
  await until(() => tab.internals["src/grading-ta.js"]);
  return { tab, g: tab.internals["src/grading-ta.js"] };
}

test("B18: submissions that a script of the page sends in place of the bridge are read whatever their fields hold", { todo: "B18: the status is passed to String(), which throws on an object whose toString is not a function" }, async (t) => {
  const { tab, g } = await grader(t);
  const w = tab.window;
  // jsdom loads no bridge, so the bridge is taken as ready and a script of
  // the page answers the request, as it can in Sakai.
  g.pageBridgePromise = w.Promise.resolve();
  w.addEventListener("kulms-ta-get-submissions", (event) => {
    const { requestId } = JSON.parse(event.detail);
    const submissions = [
      { id: "s1", status: { toString: 0 }, submittedTime: { toString: 0 }, firstSubmitterName: [{ toString: 0 }], submitted: "yes" },
      { id: { toString: 0 }, status: "未提出" },
      null,
      7,
    ];
    w.dispatchEvent(new w.CustomEvent("kulms-ta-submissions", { detail: JSON.stringify({ requestId, submissions }) }));
  });
  const map = g.parseGraderSubmissions(await g.requestPageSubmissions());
  assert.deepEqual(JSON.parse(JSON.stringify(map)), {
    s1: { name: "", status: "未採点 - 提出済み", kind: "pendingGrade", submitTime: "", source: "originalSubmissions", statusSource: "derived" },
  });
});

test("B16: a link with a malformed %-sequence is read as it is written", { todo: "B16: decodeURIComponent throws URIError on it" }, async (t) => {
  const { g } = await grader(t);
  const ids = g.parseGradeLinkIds("?assignmentId=/assignment/a/S%/A%zz&submissionId=/assignment/s/S%/A%zz/0a1b");
  assert.deepEqual({ ...ids }, { siteId: "S%", assignmentId: "A%zz", submissionId: "0a1b" });
});

// A list of submissions whose row stops at the column of the status: it has a
// student's link and a status, and no cell at the column of the submission
// time (as when cells are put together with colspan).
test("B26: a row of the list of submissions with no cell at the column of the submission time is read without it", { todo: "B26: parseSubmissionListGroups() reads cells[submitColIdx] without looking whether the row has it" }, async (t) => {
  const { tab, g } = await grader(t);
  const link = "/portal/site/S/tool/T?assignmentId=/assignment/a/S/A&submissionId=/assignment/s/S/A/0a1b&panel=Main&sakai_action=doGrade_submission";
  const html = `<table id="submissionList"><thead><tr><th>受講者</th><th>状態</th><th>提出日時</th></tr></thead>
    <tbody><tr><td><a href="${link}">学生A</a></td><td>未採点 - 提出済み</td></tr></tbody></table>`;
  const map = g.parseSubmissionList(new tab.window.DOMParser().parseFromString(html, "text/html"));
  assert.deepEqual(JSON.parse(JSON.stringify(map)), { "0a1b": { name: "学生A", status: "未採点 - 提出済み", kind: "pendingGrade", submitTime: "", source: "submissionList" } });
});
