// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The assignment panel (assignments.js) on a course page of the LMS, with
// every content script of the manifest running: it fetches a course's
// assignments, their submissions and its quizzes from Sakai's API, then draws
// the list, colours the sidebar and marks new assignments. The input is what
// the API answers — shaped like Sakai's answers, with any JSON in their fields
// or in their place — and what the extension has stored: memos, completion
// checks and hidden assignments, of any shape, as an older version, a bug or
// another tab could leave them. Teachers write the titles; the stored state is
// the extension's own, which it has to read back whatever it holds.
//
// Both are JSON that Sakai's server or the extension writes from its own
// values, so no object in them has a toString or valueOf of its own: only a
// script that forges JSON puts one there (as the page can in B18), and String()
// and + cannot convert such an object. So those two keys are left out of both,
// and the stored state goes through JSON, as it does in chrome.storage.
//
// One tab serves every input. The panel is opened once; each input then has
// the API answer anew, sets the stored state through the script's internals
// (harness/source.mjs) and runs the fetch, the drawing and the colouring.
//
// It fails when these throw, when a promise is rejected with nothing to handle
// it, or when a detector of the harness sees something: the panel draws data
// of the API and of the store into the page, where markup that runs script
// would be a DOM XSS. While B17 is open (fuzz/open-findings.mjs), no stored
// memo is null, which B17 is known to stop the drawing on.
import { Browser, Net, settle, watch } from "../../harness/index.mjs";
import { COURSE_PAGE, LMS, openCoursePage } from "../../tests/lms.mjs";
import { FuzzedDataProvider, fail, jsonValue, open, string } from "../lib.mjs";

// JSON as a server or the extension writes it (see above).
const written = (key, value) => (key === "toString" || key === "valueOf" ? undefined : value);
const stored = (value) => JSON.parse(JSON.stringify(value, written));

let answers = {};
function api(url) {
  const path = new URL(url).pathname;
  const kind = /\/direct\/assignment\/site\//.test(path) ? "assignments"
    : /\/direct\/assignment\/item\//.test(path) ? "item"
    : /\/direct\/sam_pub\/context\//.test(path) ? "quizzes"
    : /\/pages\.json$/.test(path) ? "pages"
    : /\/direct\/site\.json$/.test(path) ? "sites" : null;
  if (!kind || answers[kind] === undefined) return { status: 404, body: "" };
  return { headers: { "content-type": "application/json" }, body: JSON.stringify(answers[kind], written) };
}

const browser = new Browser();
const tab = openCoursePage(browser, { net: new Net().on(`${LMS}/direct/`, (request) => api(request.url)) });
await settle(300);
tab.document.getElementById("kulms-assign-toggle").click();
await settle(300);
const a = tab.internals["src/assignments.js"];
if (!a || !tab.document.querySelector(".kulms-assign-content")) throw new Error(`the panel did not open on ${COURSE_PAGE.length} bytes of page`);

const time = (fdp) => fdp.pickValue([
  () => Date.now() + fdp.consumeIntegralInRange(-90, 90) * 86400e3,
  () => ({ epochSecond: Math.floor(Date.now() / 1000) + fdp.consumeIntegral(3, true) }),
  () => ({ time: Date.now() + fdp.consumeIntegral(4, true) }),
  () => String(Date.now()),
  () => jsonValue(fdp),
])();

function submission(fdp) {
  const s = { status: string(fdp, 24) };
  for (const k of ["graded", "returned", "userSubmission", "draft"]) s[k] = fdp.consumeBoolean();
  if (fdp.consumeBoolean()) s.grade = jsonValue(fdp);
  if (fdp.consumeBoolean()) s.properties = { allow_resubmit_number: fdp.pickValue(["0", 0, "-1", "3", jsonValue(fdp)]) };
  return s;
}

function assignment(fdp) {
  const x = { title: fdp.consumeBoolean() ? string(fdp, 40) : jsonValue(fdp), entityId: string(fdp, 12) };
  for (const k of ["dueTime", "dueDate", "closeTime"]) if (fdp.consumeBoolean()) x[k] = time(fdp);
  if (fdp.consumeBoolean()) x.allowResubmission = fdp.consumeBoolean();
  if (fdp.consumeBoolean()) x.gradeDisplay = jsonValue(fdp);
  if (fdp.consumeBoolean()) x.submissions = Array.from({ length: fdp.consumeIntegralInRange(0, 2) }, () => submission(fdp));
  return x;
}

const listOf = (fdp, make, max = 4) => Array.from({ length: fdp.consumeIntegralInRange(0, max) }, () => make(fdp));
const shaped = (fdp, make) => (fdp.consumeIntegralInRange(0, 7) === 0 ? jsonValue(fdp) : make());

function memo(fdp) {
  if (fdp.consumeIntegralInRange(0, 5) === 0) return jsonValue(fdp);
  const m = { id: fdp.consumeIntegral(6), text: string(fdp, 30), created: Date.now() };
  if (fdp.consumeBoolean()) m.deadline = time(fdp);
  if (fdp.consumeBoolean()) m.repeat = fdp.pickValue(["weekly", jsonValue(fdp)]);
  if (fdp.consumeBoolean()) { m.courseId = "C1"; m.courseName = string(fdp, 20); }
  return m;
}

const record = (fdp) => Object.fromEntries(listOf(fdp, (f) => [string(f, 16), f.consumeBoolean() ? Date.now() : jsonValue(f)], 3));

export async function fuzz(data) {
  const fdp = new FuzzedDataProvider(data);
  answers = {
    assignments: shaped(fdp, () => ({ assignment_collection: listOf(fdp, assignment) })),
    item: shaped(fdp, () => ({ submissions: listOf(fdp, submission, 2), allowResubmission: fdp.consumeBoolean() })),
    quizzes: shaped(fdp, () => ({
      sam_pub_collection: listOf(fdp, (f) => ({ title: string(f, 30), dueDate: time(f), retractDate: time(f), startDate: time(f), publishedAssessmentId: jsonValue(f) })),
    })),
    pages: shaped(fdp, () => [{ tools: [{ toolId: "sakai.assignment.grades", id: string(fdp, 12) }] }]),
  };
  const w = watch(tab);
  const list = await a.fetchAllAssignments();
  a.memos = stored(fdp.consumeBoolean() ? listOf(fdp, memo).filter((m) => !(open("B17") && m === null)) : []);
  a.checkedState = stored(record(fdp));
  a.dismissedState = stored(record(fdp));
  a.renderAssignments(list);
  a.colorSidebarTabs(list);
  a.checkNotificationBadges(list);
  await settle(0);
  const problems = w.check();
  if (problems.length) fail(problems.join("\n"));
}
