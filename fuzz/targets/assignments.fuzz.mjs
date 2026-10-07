// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The assignment panel (assignments.js) on a course page of the LMS, with
// every content script of the manifest running: it finds the courses (in the
// page's sidebar, else through Sakai's API, else in the portal's page),
// fetches each course's assignments, their submissions and its quizzes from
// Sakai's API, then draws the list, colours the sidebar and marks new
// assignments. The input gives
// - the sidebar's courses (any names and IDs, or none at all);
// - every answer of the network: JSON text of any value, mostly shaped like
//   Sakai's answers, or the portal's page as any bytes, each with any status,
//   content type or a failure, as answer() of fuzz/lib.mjs makes it;
// - what the extension has stored, memos, completion checks and hidden
//   assignments: any value that chrome.storage's JSON carries, as an older
//   version, another tab or a broken store could leave it.
// Teachers write the titles, and the network is the network.
//
// One tab serves every input. The panel is opened once; each input then sets
// the sidebar, the network's answers and the stored state (through the
// script's internals, harness/source.mjs), forgets the courses an earlier
// input's fetch found, and runs the fetch, the drawing and the colouring.
//
// It fails when these throw, when a promise is rejected with nothing to handle
// it, or when a detector of the harness sees something: the panel draws data
// of the API and of the store into the page, where markup that runs script
// would be a DOM XSS. It does not fail on the two errors fetchAllAssignments()
// throws on purpose for the panel to show (no course found, logged out).
//
// It also fails when the extension's work grows faster than n log n from rung
// to rung of the input, or passes what linear code does with an input of its
// size (ladder() and judge() of fuzz/lib.mjs, harness/work.mjs): no clock
// decides. A regular expression's work is the steps of a backtracking engine
// (harness/backtrack.mjs), but for those of a finding that stands, which run
// on V8's linear engine (fuzz/lib.mjs).
//
// The fetch of each course catches what it throws and only warns, leaving out
// the course's assignments: so a TypeError on one malformed item of an answer
// takes all of the course's assignments out of the panel without a word. The
// target fails on such a warning when it tells of a slip of the code
// (warnings() of fuzz/lib.mjs), not of one of the failures that the fetch is
// there to take (an HTTP error, a network that fails, an answer that is not
// JSON).
import { Browser, Net, idle, uncounted, watch } from "../../harness/index.mjs";
import { COURSE_PAGE, LMS, openCoursePage } from "../../tests/lms.mjs";
import { answer, bytes, calibrate, fail, json, jsonText, judge, ladder, number, open, provider, string, value, warnings } from "../lib.mjs";

const NOT_FOUND = { status: 404, headers: { "content-type": "text/html" }, body: "" };
let answers = {};
function api(url) {
  const path = new URL(url).pathname;
  const kind = /\/direct\/assignment\/site\//.test(path) ? "assignments"
    : /\/direct\/assignment\/item\//.test(path) ? "item"
    : /\/direct\/sam_pub\/context\//.test(path) ? "quizzes"
    : /\/pages\.json$/.test(path) ? "pages"
    : /\/direct\/site\.json$/.test(path) ? "sites" : null;
  return (kind && answers[kind]) || NOT_FOUND;
}

const browser = new Browser();
const net = new Net()
  .on(`${LMS}/direct/`, (request) => api(request.url))
  .on(`${LMS}/portal`, (request) => (new URL(request.url).pathname === "/portal" && answers.portal) || NOT_FOUND);
const tab = openCoursePage(browser, { net });
await idle();
tab.document.getElementById("kulms-assign-toggle").click();
await idle();
const a = tab.internals["src/assignments.js"];
if (!a || !tab.document.querySelector(".kulms-assign-content")) throw new Error(`the panel did not open on ${COURSE_PAGE.length} bytes of page`);

const either = (fdp, make) => (fdp.consumeIntegralInRange(0, 7) === 0 ? value(fdp) : make());
const text = (fdp) => (fdp.consumeBoolean() ? string(fdp) : value(fdp));

// As many of make() as the input has bytes for.
function list(fdp, make) {
  const out = [];
  for (let n = fdp.consumeIntegralInRange(0, fdp.remainingBytes); n > 0 && fdp.remainingBytes > 0; n--) out.push(make(fdp));
  return out;
}

// A time as Sakai writes one in its versions, or any number or value.
const time = (fdp) => fdp.pickValue([
  () => Date.now() + fdp.consumeIntegralInRange(-90, 90) * 86400e3,
  () => ({ epochSecond: Math.floor(Date.now() / 1000) + fdp.consumeIntegral(3, true) }),
  () => ({ time: Date.now() + fdp.consumeIntegral(4, true) }),
  () => String(Date.now()),
  () => number(fdp),
  () => value(fdp),
])();

function submission(fdp) {
  const s = { status: text(fdp) };
  for (const k of ["graded", "returned", "userSubmission", "draft"]) s[k] = fdp.consumeBoolean() ? fdp.consumeBoolean() : value(fdp);
  for (const k of ["grade", "submittedTime", "dateSubmitted"]) if (fdp.consumeBoolean()) s[k] = value(fdp);
  if (fdp.consumeBoolean()) s.properties = either(fdp, () => ({ allow_resubmit_number: fdp.pickValue(["0", 0, "-1", "3", () => value(fdp)].map((x) => (typeof x === "function" ? x : () => x)))() }));
  return s;
}

function assignment(fdp) {
  const x = { title: text(fdp), entityId: text(fdp) };
  if (fdp.consumeBoolean()) x.id = value(fdp);
  for (const k of ["dueTime", "dueDate", "closeTime", "openTime"]) if (fdp.consumeBoolean()) x[k] = time(fdp);
  for (const k of ["allowResubmission", "gradeDisplay", "status", "context", "draft"]) if (fdp.consumeBoolean()) x[k] = value(fdp);
  if (fdp.consumeBoolean()) x.submissions = either(fdp, () => list(fdp, submission));
  return x;
}

function quiz(fdp) {
  const q = { title: text(fdp), publishedAssessmentId: value(fdp) };
  for (const k of ["dueDate", "retractDate", "startDate"]) if (fdp.consumeBoolean()) q[k] = time(fdp);
  return q;
}

function site(fdp) {
  return { id: text(fdp), title: text(fdp), type: fdp.consumeBoolean() ? fdp.pickValue(["course", "project", "portfolio"]) : value(fdp) };
}

function memo(fdp) {
  return either(fdp, () => {
    const m = { id: fdp.consumeBoolean() ? fdp.consumeIntegral(6) : value(fdp), text: text(fdp), created: time(fdp) };
    if (fdp.consumeBoolean()) m.deadline = time(fdp);
    if (fdp.consumeBoolean()) m.repeat = fdp.consumeBoolean() ? "weekly" : value(fdp);
    if (fdp.consumeBoolean()) { m.courseId = text(fdp); m.courseName = text(fdp); }
    return m;
  });
}

// The answer to one kind of request: JSON text of make()'s value, or of any
// value, through answer().
const reply = (fdp, make) => answer(fdp, jsonText(fdp, either(fdp, make)), "application/json");

// The sidebar's courses: none, or as many links to /portal/site/<ID> as the
// input has bytes for, the IDs and the names any strings (a page holds only
// strings), as a teacher names a course and Sakai writes its ID. Building it
// is the target's work, not the extension's, and is not counted.
function setSidebar(fdp) {
  uncounted(() => buildSidebar(fdp));
}

function buildSidebar(fdp) {
  const d = tab.document;
  const ul = d.querySelector("#portal-nav-sidebar > ul");
  ul.replaceChildren();
  for (let n = fdp.consumeIntegralInRange(0, fdp.remainingBytes); n > 0 && fdp.remainingBytes > 0; n--) {
    const li = d.createElement("li");
    li.className = "site-list-item";
    const id = string(fdp);
    li.id = `site-list-item-${id}`;
    const head = d.createElement("div");
    head.className = "site-list-item-head";
    const link = d.createElement("a");
    link.setAttribute("href", `/portal/site/${id}`);
    link.textContent = string(fdp);
    head.append(link);
    li.append(head);
    ul.append(li);
  }
}

async function run(data) {
  browser.forget();
  net.forget();
  // The courses the panel keeps from the last fetch that found any: none on a
  // panel just opened. A fetch that finds no course throws before it keeps
  // what it found, and the memo form lists the courses kept, so an earlier
  // input's courses would be drawn, and their work counted, for this one.
  a.lastCourses = [];
  const fdp = provider(data);
  setSidebar(fdp);
  answers = {
    assignments: reply(fdp, () => ({ assignment_collection: list(fdp, assignment) })),
    item: reply(fdp, () => ({ submissions: list(fdp, submission), allowResubmission: value(fdp) })),
    quizzes: reply(fdp, () => ({ sam_pub_collection: list(fdp, quiz) })),
    pages: reply(fdp, () => [{ tools: list(fdp, (f) => ({ toolId: f.consumeBoolean() ? "sakai.assignment.grades" : value(f), id: text(f), placementId: text(f) })) }]),
    sites: reply(fdp, () => ({ site_collection: list(fdp, site) })),
    portal: answer(fdp, bytes(fdp), "text/html"),
  };
  const w = watch(tab);
  const log = warnings(tab);
  let fetched;
  try {
    fetched = await a.fetchAllAssignments();
  } catch (e) {
    if (!(e && (e.loggedOut || e.message === tab.window.t("noCourses")))) throw e;
    fetched = []; // what loadAssignments() shows as a message
  }
  // The stored state as the extension has it once it has read the store: what
  // is not there, or is falsy, is an empty list or record (the loaders say
  // `|| []` and `|| {}`), anything else is as it was stored.
  let memos = json(fdp.consumeBoolean() ? list(fdp, memo) : value(fdp)).value || [];
  // Known: B17 (docs/findings.md). While it is open, no stored memo is null
  // (what JSON makes of undefined in a list too): normalizeMemo() hands it
  // back, and reading its deadline stops the drawing.
  if (open("B17") && Array.isArray(memos)) memos = memos.filter((m) => m !== null);
  a.memos = memos;
  a.checkedState = json(value(fdp)).value || {};
  a.dismissedState = json(value(fdp)).value || {};
  a.renderAssignments(fetched);
  a.colorSidebarTabs(fetched);
  a.checkNotificationBadges(fetched);
  await idle();
  for (const line of log.slips()) {
    // Known: B19 (docs/findings.md). While it is open, a slip that the fetch
    // of the course list or of a course catches is not counted: one item of
    // an answer that is not as Sakai writes it takes out all of the courses
    // of the list, or all of the course's assignments, as the finding says.
    if (open("B19") && /^\[KULMS\] (?:Sakai API failed:|assignment fetch failed for)/.test(line)) continue;
    fail(`a slip of the code: ${line}`);
  }
  const problems = w.check();
  if (problems.length) fail(problems.join("\n"));
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run);
}

await calibrate(fuzz);
