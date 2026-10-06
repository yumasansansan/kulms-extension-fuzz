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
