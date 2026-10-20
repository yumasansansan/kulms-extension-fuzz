// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
//   node fuzz/inputs.mjs [--check]
//
// Writes the seeds (fuzz/seeds/<target>/<name>), the known inputs
// (fuzz/known/<target>/<ID>-<name>) and the regression inputs
// (fuzz/regressions/<target>/<ID>-<name>) of the fuzz targets from the plans
// below.
// A plan hands a Writer of fuzz/encode.mjs the values the target is to read,
// in the order the target reads them through fuzz/lib.mjs, and may climb
// rungs (`doublings` up: the rungs of fuzz/lib.mjs). When the target or
// lib.mjs comes to read its input another way, the files on disk would read
// as something else, so they are written anew from the plans.
//
// With --check it writes nothing, and fails when a file is not what its plan
// writes or when a file under fuzz/seeds/, fuzz/known/ or fuzz/regressions/
// has no plan.
// tests/fuzz-inputs.test.mjs checks the same, and also that a target that
// has read() (the page targets) reads each of its inputs as `expect` says,
// that the seeds pass, and that each known input sets off its finding and
// nothing else.
//
// jsonText() of lib.mjs reads nothing from the input: a plan writes nothing
// for it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { read } from "../harness/index.mjs";
import { answer, bytes, encode, number, repeated, repeatedBytes, string, value } from "./encode.mjs";

const FUZZ = path.dirname(fileURLToPath(import.meta.url));
const utf8 = (s) => new TextEncoder().encode(s);
const keys = Object.keys(JSON.parse(read("_locales/ja/messages.json")));

// A syllabus's textbooks and reference books, as KULASIS writes them.
const BOOKS = `<div><span class="lesson_plan_subheading">(教科書)</span>京大 太郎『線形代数入門』(京都大学学術出版会) ISBN:978-4-00-000000-0 <br/>
<span class="lesson_plan_subheading">(参考書)</span>京大 花子『解析学』(大学書房, 2020年)<br/>Example Author, Linear Algebra Done Wrong, University Press, 2019<br/></div><div>（成績評価の方法）</div>`;

// A syllabus that names no books.
const NO_BOOKS = "<td>(教科書)</td><td>使用しない</td><td>(参考書)</td><td>授業中に指示する</td>";

// KULASIS's search results: two courses of the same name, told apart by their
// teachers, and one whose name only begins the same.
const SEARCH = `<table class="search_result">
<tr><th>科目名</th><th>教員</th><th>曜時限</th><th>シラバス</th></tr>
<tr><td>線形代数学Ａ</td><td>京大 太郎</td><td>月1</td><td><a href="la_syllabus?lectureNo=12345"><img src="syllabus.gif" alt="シラバス"></a></td></tr>
<tr><td>線形代数学Ａ</td><td>京大 花子</td><td>水2</td><td><a href="department_syllabus?lectureNo=23456&amp;departmentNo=10"><img src="syllabus.gif" alt="シラバス"></a></td></tr>
<tr><td>線形代数学Ｂ</td><td>京大 次郎</td><td>金3</td><td><a href="la_syllabus?lectureNo=34567"><img src="syllabus.gif" alt="シラバス"></a></td></tr>
</table>`;

// The contact row of a site's Site Info page, as Sakai writes it.
const CONTACT = `<table><tr><th>サイト連絡先・メール</th>
<td>
  京大 太郎, <a href="mailto:taro@example.com">taro@example.com</a></td></tr></table>
`;

// One row of KULASIS's search results, and one book of a syllabus, as the
// pages above write them, for the seeds that repeat them on rungs.
const ROW = '<tr><td>線形代数学Ａ</td><td>京大 太郎</td><td>月1</td><td><a href="la_syllabus?lectureNo=12345"><img src="syllabus.gif" alt="シラバス"></a></td></tr>\n';
const BOOK = '<span class="lesson_plan_subheading">(教科書)</span>京大 太郎『線形代数入門』(京都大学学術出版会) ISBN:978-4-00-000000-0 <br/>\n';

// A contact row with two names and the half-width middle dot.
const TWO_CONTACTS = "<tr><th>サイト連絡先･メール</th><td>京大 花子<br>, 京大 太郎</td></tr>";

const ok = (type, body) => ({ status: 200, headers: { "content-type": type }, body });

// An input of fuzz/targets/submission.fuzz.mjs, as its read() reads it: both
// settings on, the page to submit an assignment with its post button,
// sessionStorage's submitted IDs and the free units written by `ids` and
// `free`, nothing marked as submitted, and a click on the post button.
function submissionPage(w, { ids, free }) {
  w.bool(true); w.bool(true); w.bool(true); w.bool(true);
  string(w, "S");
  w.bool(true);
  w.int(0, 2, 1); string(w, "S"); string(w, "A1");
  w.int(0, 2, 0);
  w.int(0, w.remaining, 0);
  w.bool(false); w.bool(false);
  ids(); w.int(0, 2, 0);
  free();
  // The click's place is 1, not 0, so that the action takes bytes of the
  // input and its count can be read as 1.
  w.int(0, w.remaining, 1); w.int(0, 9, 0); w.int(0, 65535, 1);
}

// An input of fuzz/targets/sidebar.fuzz.mjs, as its read() reads it: every
// setting as loaded (its nine that the scripts read as they go), no tool
// config, the page's own data leaving `free` units of its localStorage
// (Infinity: none of its data), Wednesday 10:00, the courses and the actions
// written by the functions given (an action's kind is one of fifteen).
function sidebarPage(w, { free, pinned, sites, actions }) {
  for (let i = 0; i < 9; i++) w.bool(false);
  w.int(0, 2, 0);
  if (free === Infinity) w.int(0, 2, 0);
  else if (free === 0) w.int(0, 2, 2);
  else { w.int(0, 2, 1); w.int(0, 65535, free); }
  w.int(0, 6, 3); w.int(0, 24 * 60 - 1, 600);
  for (const list of [pinned, sites, actions]) {
    w.int(0, w.remaining, list.length);
    for (const write of list) write();
  }
}
const SITE_INFO_TOOLS = [{ tools: [{ toolId: "sakai.siteinfo", placementId: "p" }] }];

// An input of fuzz/targets/grading-bridge.fuzz.mjs, as its read() reads it:
// the graders that `graders` write, and a request of the content script for
// each of `ids`. A grader is a <sakai-grader> with the ID Sakai gives it
// (sakai-grader-<id>), whose originalSubmissions `prop` writes (an index of
// read()'s choices and what follows it).
function bridgePage(w, graders, ids) {
  w.int(0, w.remaining, graders.length);
  for (const { id, prop } of graders) {
    w.int(0, 2, 0); // <sakai-grader>
    w.int(0, 2, 1); string(w, id);
    prop();
  }
  w.int(0, w.remaining, ids.length);
  for (const id of ids) { w.int(0, 3, 0); string(w, id); }
}
// An assignment of the cache that fuzz/targets/popup.fuzz.mjs puts in the
// store, every field as the extension writes it: `inMs` from when the popup
// opens to its deadline, `status` one of the target's STATUSES.
const DAY = 24 * 60 * 60e3;
const POPUP_STATUSES = ["", "提出済", "評定済", "未提出", "取組中", "Submitted", "Graded"];
function popupAssignment(w, { course, site, name, id, inMs, status }) {
  w.bool(true); string(w, course);
  w.bool(true); string(w, site);
  w.bool(true); string(w, name);
  w.bool(true); w.bool(true); string(w, site); string(w, "t1");
  for (let i = 0; i < 2; i++) { w.bool(true); w.bool(true); w.int(-60 * DAY, 60 * DAY, inMs); } // the deadline and the close time
  w.bool(true); w.bool(true); w.pick(POPUP_STATUSES, status);
  w.bool(true); string(w, "");
  w.bool(true); string(w, id);
  w.bool(true); w.int(0, 2, 0); // an assignment, not a quiz
  w.bool(true); w.bool(false);
}

// What fuzz/targets/grading-pages.fuzz.mjs reads (read()), written: its lists
// of words as the target has them, an ID as Sakai gives one (`hex`, as
// bytes), a status (`icons` the indexes of the icons before it, `words` one
// of the target's STATUSES), a name (a status read as any string), and a
// link to the grader.
const GRADING_STATUSES = ["未採点 - 提出済み", "未採点 - 取組中", "未提出", "採点済み", "返却済み", "再提出済み", "Ungraded - Submitted",
  "Ungraded - In Progress", "Awaiting Grade", "Submitted, Awaiting Grade", "No Submission", "Not Submitted", "Honor Pledge Accepted",
  "Returned", "Graded"];
const GRADING_HEADERS = ["状態", "Status", "提出日時", "Submitted", "受講者", "学生番号", "Student", "氏名", "Name", "成績", "Grade", "開示", "Release", "再提出"];
const GRADING_BUTTONS = ["保存", "Save", "返却", "Return", "提出", "Submit", "保存して返却", "Release", ""];
const GRADING_CONTROLS = ["前の提出物を表示", "次の提出物を表示", "一覧へ戻る", "設定", "previous submission", "next submission", "Back to list", "Settings"];
const GRADING_ACTIONS = ["jump-next", "jump-prev", "select", "type", "grader-button", "page-control", "redraw", "panel", "status", "storage", "resize", "time"];
function gradingId(w, hex) {
  w.bool(true);
  bytes(w, hex.match(/../g).map((h) => parseInt(h, 16)));
}
function gradingStatus(w, words, icons = []) {
  w.int(0, w.remaining, icons.length);
  for (const i of icons) { w.int(0, 4, i); w.bool(true); }
  w.bool(true); w.pick(GRADING_STATUSES, words); w.bool(false);
}
function gradingName(w, name) {
  w.int(0, w.remaining, 0);
  w.bool(false); string(w, name);
}
function gradingLink(w, { site, assignment, tool, hex }) {
  w.bool(true); string(w, site); string(w, assignment); string(w, tool); gradingId(w, hex);
}
// A submission of the grader: of the student `of`, named `name`, its status
// `status`, submitted or not, graded or not; every field as Sakai gives it.
function gradingSubmission(w, { of, name, status, submitted, graded }) {
  w.bool(true); w.bool(true); w.int(0, 255, of);
  w.bool(true); string(w, name);
  w.bool(true); w.bool(true); w.pick(GRADING_STATUSES, status);
  w.bool(true); string(w, submitted ? "2026/10/10 12:00" : "");
  w.bool(true); w.bool(submitted);
  w.bool(true); w.bool(false);
  w.bool(true); w.bool(false);
  w.bool(true); string(w, graded ? "85" : "");
  w.bool(true); w.bool(graded);
  w.bool(true); w.bool(false);
}
function gradingAction(w, kind, at = 0) {
  w.pick(GRADING_ACTIONS, kind); w.int(0, 65535, at);
}
const GRADING_PAGE = { site: "2026-110-1001-000", assignment: "a1b2c3d4", tool: "sakai.assignment.grades" };

const BRIDGE_FIELDS = ["id", "submissionId", "reference", "firstSubmitterName", "status", "submissionStatus", "submittedTime",
  "submitted", "draft", "hasHistory", "grade", "graded", "returned", "length"];
const BRIDGE_TRAPS = ["get", "getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor", "has"];

// The grader's submissions as an object of the bridge's input (read()'s
// "object") with one entry, keyed "length", of the value `length`.
function bridgeObjectWithLength(w, length) {
  w.int(0, 6, 4);
  w.int(0, w.remaining, 1);
  w.bool(true); w.pick(BRIDGE_FIELDS, "length");
  w.int(0, 4, 0); value(w, length);
}

// A submission of the bridge's input whose fields are `fields`, each a field
// Sakai gives and its value: a string as a string field, any other value as
// a value.
function bridgeSubmission(w, fields) {
  w.int(0, 4, 1);
  w.int(0, w.remaining, Object.keys(fields).length);
  for (const [k, v] of Object.entries(fields)) {
    w.bool(true); w.pick(BRIDGE_FIELDS, k);
    if (typeof v === "string") { w.int(0, 7, 1); string(w, v); } else { w.int(0, 7, 0); value(w, v); }
  }
}

// The empty answers of the assignment panel's network (fuzz/targets/
// assignments.fuzz.mjs), after its sidebar and the answer to the courses'
// assignments: each answer of Sakai's shape (either() picks it) with no item,
// and the portal's page empty.
export function emptyAnswers(w) {
  w.int(0, 7, 1); w.int(0, w.remaining, 0); value(w, undefined); answer(w); // an assignment's submissions
  w.int(0, 7, 1); w.int(0, w.remaining, 0); answer(w); // the quizzes
  w.int(0, 7, 1); w.int(0, w.remaining, 0); answer(w); // the tools of pages.json
  w.int(0, 7, 1); w.int(0, w.remaining, 0); answer(w); // the sites
  bytes(w, []); answer(w); // the portal's page
}

// Each input: the file it is written to, the plan, and for a target with
// read(), what it reads.
export const INPUTS = [
  {
    file: "seeds/syllabus-detail/books",
    plan: (w) => {
      string(w, "1");
      w.bool(true); string(w, "2");
      bytes(w, utf8(BOOKS)); answer(w, { utf8: true });
    },
    expect: { lectureNo: "1", departmentNo: "2", page: ok("text/html; charset=utf-8", utf8(BOOKS)) },
  },
  {
    file: "seeds/syllabus-detail/no-books",
    plan: (w) => {
      string(w, "1");
      w.bool(true); string(w, "2");
      bytes(w, utf8(NO_BOOKS)); answer(w, { utf8: true });
    },
    expect: { lectureNo: "1", departmentNo: "2", page: ok("text/html; charset=utf-8", utf8(NO_BOOKS)) },
  },
  {
    file: "seeds/syllabus-search/same-name",
    plan: (w) => {
      string(w, "線形代数学Ａ");
      w.bool(false);
      w.bool(true); string(w, "京大 花子");
      bytes(w, utf8(SEARCH)); answer(w, { utf8: true });
    },
    expect: { keyword: "線形代数学Ａ", expectedName: undefined, teacher: "京大 花子", page: ok("text/html; charset=utf-8", utf8(SEARCH)) },
  },
  {
    file: "seeds/syllabus-search/by-code",
    plan: (w) => {
      string(w, "U-LAS10 10001 LJ55");
      w.bool(true); string(w, "線形代数学Ｂ");
      w.bool(false);
      bytes(w, utf8(SEARCH)); answer(w, { utf8: true });
    },
    expect: { keyword: "U-LAS10 10001 LJ55", expectedName: "線形代数学Ｂ", teacher: null, page: ok("text/html; charset=utf-8", utf8(SEARCH)) },
  },
  {
    // A syllabus of eight books, and on its rungs 2^8 times as many.
    file: "seeds/syllabus-detail/many-books",
    doublings: 8,
    plan: (w) => {
      string(w, "1");
      w.bool(true); string(w, "2");
      repeatedBytes(w, utf8(BOOK), 8); answer(w, { utf8: true });
    },
    expect: { lectureNo: "1", departmentNo: "2", page: ok("text/html; charset=utf-8", utf8(BOOK.repeat(8))) },
  },
  {
    // Search results of eight rows, and on their rungs 2^8 times as many.
    file: "seeds/syllabus-search/many-rows",
    doublings: 8,
    plan: (w) => {
      string(w, "線形代数学Ａ");
      w.bool(false);
      w.bool(false);
      repeatedBytes(w, utf8(ROW), 8); answer(w, { utf8: true });
    },
    expect: { keyword: "線形代数学Ａ", expectedName: undefined, teacher: null, page: ok("text/html; charset=utf-8", utf8(ROW.repeat(8))) },
  },
  {
    file: "seeds/site-contact/contact-row",
    plan: (w) => {
      string(w, "S1");
      w.bool(false); w.bool(true); w.bool(true); string(w, "p");
      answer(w);
      bytes(w, utf8(CONTACT), { rest: true }); answer(w);
    },
    expect: { siteId: "S1", pages: ok("application/json", JSON.stringify(SITE_INFO_TOOLS)), page: ok("text/html", utf8(CONTACT)) },
  },
  {
    file: "seeds/site-contact/two-contacts",
    plan: (w) => {
      string(w, "S1");
      w.bool(false); w.bool(true); w.bool(true); string(w, "p");
      answer(w);
      bytes(w, utf8(TWO_CONTACTS), { rest: true }); answer(w);
    },
    expect: { siteId: "S1", pages: ok("application/json", JSON.stringify(SITE_INFO_TOOLS)), page: ok("text/html", utf8(TWO_CONTACTS)) },
  },
  {
    // A Site Info page of eight contact rows, and on its rungs 2^8 times as
    // many.
    file: "seeds/site-contact/many-contacts",
    doublings: 8,
    plan: (w) => {
      string(w, "S1");
      w.bool(false); w.bool(true); w.bool(true); string(w, "p");
      answer(w);
      repeatedBytes(w, utf8(TWO_CONTACTS), 8); answer(w);
    },
    expect: { siteId: "S1", pages: ok("application/json", JSON.stringify(SITE_INFO_TOOLS)), page: ok("text/html", utf8(TWO_CONTACTS.repeat(8))) },
  },
  {
    // A content script of the LMS asks for a course's books: the search, the
    // site's contact and the syllabus are answered with the same page, which
    // holds the search's results and the books. The target answers five
    // fetches (FETCHES of fuzz/targets/background-message.fuzz.mjs).
    file: "seeds/background-message/textbooks",
    plan: (w) => {
      w.int(0, 2, 0);
      w.int(0, 3, 0);
      w.bool(true); string(w, "線形代数学Ａ");
      w.bool(true); string(w, "");
      w.bool(true); string(w, "S1");
      bytes(w, utf8(SEARCH + BOOKS));
      for (let i = 0; i < 5; i++) answer(w, { utf8: true });
    },
    expect: {
      from: "lms",
      message: { action: "fetchTextbooks", courseName: "線形代数学Ａ", lectureCode: "", siteId: "S1" },
      body: utf8(SEARCH + BOOKS),
      replies: Array.from({ length: 5 }, () => ok("text/html; charset=utf-8", utf8(SEARCH + BOOKS))),
      stored: null,
    },
  },
  {
    // The same message, its pages a row of the search's results and a book
    // repeated eight times, and on their rungs 2^8 times as many.
    file: "seeds/background-message/many-books",
    doublings: 8,
    plan: (w) => {
      w.int(0, 2, 0);
      w.int(0, 3, 0);
      w.bool(true); string(w, "線形代数学Ａ");
      w.bool(true); string(w, "");
      w.bool(true); string(w, "S1");
      repeatedBytes(w, utf8(ROW + BOOK), 8);
      for (let i = 0; i < 5; i++) answer(w, { utf8: true });
    },
    expect: {
      from: "lms",
      message: { action: "fetchTextbooks", courseName: "線形代数学Ａ", lectureCode: "", siteId: "S1" },
      body: utf8((ROW + BOOK).repeat(8)),
      replies: Array.from({ length: 5 }, () => ok("text/html; charset=utf-8", utf8((ROW + BOOK).repeat(8)))),
      stored: null,
    },
  },
  {
    // t("remainDaysHoursMins", ["$HOURS$", "5", "7"]): the first value is
    // replaced again as the placeholder that comes after it.
    file: "known/i18n/B10-placeholder-in-value",
    plan: (w) => {
      w.bool(true); w.pick(keys, "remainDaysHoursMins");
      w.int(0, 2, 2); w.int(0, w.remaining, 3);
      for (const v of ["$HOURS$", "5", "7"]) { w.bool(true); string(w, v); }
    },
  },
  {
    // t("hasOwnProperty"), with no values.
    file: "known/i18n/B15-hasOwnProperty",
    plan: (w) => {
      w.bool(false); string(w, "hasOwnProperty", { word: true });
      w.int(0, 2, 0);
    },
  },
  {
    // t("sectionDanger", ""): "$HOURS$時間以内" is left as it is.
    file: "known/i18n/B21-empty-value",
    plan: (w) => {
      w.bool(true); w.pick(keys, "sectionDanger");
      w.int(0, 2, 1); w.bool(true); string(w, "");
    },
  },
  {
    // A link to an assignment whose ID is a lone "%".
    file: "known/grading-status/B16-malformed-percent",
    plan: (w) => {
      w.int(0, 7, 6); w.int(0, 7, 6); w.bool(false); string(w, ""); // no status (ICONS[6] is "")
      w.bool(true); string(w, "S1/%"); w.bool(false); string(w, ""); // ?assignmentId=/assignment/a/S1/%
      w.bool(false); w.int(0, w.remaining, 0); // no submissions
      w.int(0, 2, 1); string(w, ""); // the page answers with ""
    },
  },
  {
    // A script of the page answers with a submission whose status is
    // { toString: 0 }, through a structured clone.
    file: "known/grading-status/B18-status-object",
    plan: (w) => {
      w.int(0, 7, 6); w.int(0, 7, 6); w.bool(false); string(w, "");
      w.bool(false); string(w, ""); w.bool(false); string(w, "");
      w.bool(false); w.int(0, w.remaining, 1);
      w.bool(true); string(w, "1");
      w.bool(false); value(w, { toString: 0 });
      for (let i = 0; i < 8; i++) w.bool(false);
      w.int(0, 2, 2);
    },
  },
  {
    // No course is found, and the stored memos are [null].
    file: "known/assignments/B17-null-memo",
    plan: (w) => {
      w.int(0, w.remaining, 0);
      w.int(0, 7, 1); w.int(0, w.remaining, 0); answer(w);
      emptyAnswers(w);
      w.bool(true); w.int(0, w.remaining, 1); w.int(0, 7, 0); value(w, null);
      value(w, undefined); value(w, undefined);
    },
  },
  {
    // No course is found, and the stored memos are "メモ", not a list.
    file: "known/assignments/B17-memos-not-a-list",
    plan: (w) => {
      w.int(0, w.remaining, 0);
      w.int(0, 7, 1); w.int(0, w.remaining, 0); answer(w);
      emptyAnswers(w);
      w.bool(false); value(w, "メモ");
      value(w, undefined); value(w, undefined);
    },
  },
  {
    // No course is found, and the stored memos are one memo, without a
    // deadline, whose text is { toString: 0 }: an object that cannot be made a
    // string, which the panel puts in the memo's card.
    file: "known/assignments/B17-memo-text-object",
    plan: (w) => {
      w.int(0, w.remaining, 0);
      w.int(0, 7, 1); w.int(0, w.remaining, 0); answer(w);
      emptyAnswers(w);
      w.bool(true); w.int(0, w.remaining, 1); w.int(0, 7, 0); value(w, { id: 1, text: { toString: 0 }, created: 0 });
      value(w, undefined); value(w, undefined);
    },
  },
  {
    // One course, whose assignments are [null, { title: "レポート1" }].
    file: "known/assignments/B19-null-assignment",
    plan: (w) => {
      w.int(0, w.remaining, 1); string(w, "C1"); string(w, "線形代数");
      w.int(0, 7, 0); value(w, { assignment_collection: [null, { title: "レポート1", entityId: "A1" }] }); answer(w);
      emptyAnswers(w);
      w.bool(false); value(w, undefined);
      value(w, undefined); value(w, undefined);
    },
  },
  {
    // One course, whose one assignment has no ID and a title that is an
    // object of its own toString, as JSON can give one.
    file: "known/assignments/B19-title-object",
    plan: (w) => {
      w.int(0, w.remaining, 1); string(w, "C1"); string(w, "線形代数");
      w.int(0, 7, 0); value(w, { assignment_collection: [{ title: { toString: 0 } }] }); answer(w);
      emptyAnswers(w);
      w.bool(false); value(w, undefined);
      value(w, undefined); value(w, undefined);
    },
  },
  {
    // One pinned course whose one tool, 概要, tool-visibility.js shows: the
    // page's clock then runs on, and the reprocessing never ends.
    file: "known/sidebar/B4-every-tool-shown",
    plan: (w) => {
      sidebarPage(w, {
        free: Infinity,
        pinned: [() => {
          string(w, "C1"); string(w, "[2026前期月１]線形代数"); w.bool(false);
          w.int(0, w.remaining, 0);
          for (const part of [true, true, true, true, true, false]) w.bool(part);
          w.int(0, 2, 0); w.bool(true);
          w.int(0, w.remaining, 1); string(w, "t1"); string(w, "概要"); w.bool(false);
        }],
        sites: [],
        actions: [],
      });
    },
  },
  {
    // A page of Resources with its form and two rows, a folder that Sakai's
    // link expands and a file; every folder feature on. The server answers
    // the post with the folder's rows; the user opens the folder, moves down a
    // row and lets a second go by.
    file: "seeds/resources/folders",
    plan: (w) => {
      for (const on of [true, true, true, false]) { w.bool(true); w.bool(on); }
      w.bool(true); w.int(0, 2, 1);
      w.int(0, w.remaining, 1); string(w, "sakai_csrf_token"); string(w, "t");
      w.bool(true);
      const row = (name, mark, id) => () => {
        w.bool(true); w.bool(true); w.int(0, 4, mark); string(w, name); w.bool(true); string(w, `/access/content${id}`);
        w.bool(false); w.bool(false); string(w, id);
      };
      const rows = (list) => { w.int(0, w.remaining, list.length); for (const r of list) r(); };
      rows([row("第1回", 0, "/group/S/1/"), row("シラバス.pdf", 4, "/group/S/syllabus.pdf")]);
      w.int(0, w.remaining, 1);
      w.bool(true); rows([row("第1回", 1, "/group/S/1/"), row("資料.pdf", 4, "/group/S/1/a.pdf")]); answer(w);
      w.int(0, w.remaining, 3);
      w.int(0, 4, 1); w.int(0, 65535, 0);
      w.int(0, 4, 3); w.int(0, 65535, 0); w.bool(true); w.int(0, 4, 0);
      w.int(0, 4, 4); w.int(0, 65535, 0); w.int(0, 600000, 1000);
    },
  },
  {
    // A page of Resources with no form and one folder that Sakai's link
    // expands, its name and its ID empty; every folder feature on, the
    // expansion of all folders among them, which finds no form to post. The
    // page is the row's markup around what the input made, far more than
    // the input's units, and the bound is of the page (harness/work.mjs): an
    // input such as this one passed the bound of its units in CI run
    // 38504368910.
    file: "seeds/resources/no-form",
    plan: (w) => {
      for (let i = 0; i < 4; i++) { w.bool(true); w.bool(true); }
      w.bool(false);
      w.int(0, w.remaining, 1);
      w.bool(true); w.bool(true); w.int(0, 4, 0); string(w, ""); w.bool(false);
      w.bool(false); w.bool(false); string(w, "");
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 0);
    },
  },
  {
    // The page to submit レポート1, its form with the assignment's reference,
    // the post button, the panel of attachments and its file input; the user
    // drops a PDF on the zone and posts.
    file: "seeds/submission/report",
    plan: (w) => {
      w.bool(true); w.bool(true); w.bool(true); w.bool(true);
      string(w, "2026-110-1001-000");
      w.bool(true);
      w.int(0, 2, 1); string(w, "2026-110-1001-000"); string(w, "a1b2c3d4-0000-4000-8000-000000000001");
      w.int(0, 2, 0);
      w.int(0, w.remaining, 1); w.bool(true); string(w, "レポート1");
      w.bool(true); w.bool(true);
      w.int(0, 2, 0); w.int(0, 2, 0);
      w.int(0, 2, 0);
      w.int(0, w.remaining, 2);
      w.int(0, 9, 5); w.int(0, 65535, 0); w.int(0, w.remaining, 1); string(w, "report.pdf"); string(w, "application/pdf"); bytes(w, [37, 80, 68, 70]);
      w.int(0, 9, 0); w.int(0, 65535, 0);
    },
  },
  {
    // The page has left in its sessionStorage submitted IDs that are a string,
    // not a list, and the user posts the assignment.
    file: "known/submission/B12-ids-not-a-list",
    plan: (w) => {
      submissionPage(w, { ids: () => { w.int(0, 2, 2); string(w, '"abc"'); }, free: () => w.int(0, 2, 0) });
    },
  },
  {
    // The page has filled its sessionStorage, and the user posts the
    // assignment: submit-detect.js writes there.
    file: "known/submission/B23-session-full",
    plan: (w) => {
      submissionPage(w, { ids: () => w.int(0, 2, 0), free: () => w.int(0, 2, 2) });
    },
  },
  {
    // The page has filled its localStorage, and the user drags the sidebar's
    // handle to 200 px: sidebar-resize.js writes the width there.
    file: "known/sidebar/B23-storage-full",
    plan: (w) => {
      sidebarPage(w, { free: 0, pinned: [], sites: [], actions: [() => { w.int(0, 14, 8); w.int(0, 65535, 0); number(w, 200); }] });
    },
  },
  {
    // One pinned course whose site ID ends in a % that no two hex digits
    // follow, with a tool, and a click on its item of the bar: top-favbar.js
    // decodes the ID of the item's link to open the dropdown of its tools,
    // and decodeURIComponent() throws a URIError (docs/findings.md, B27).
    file: "known/sidebar/B27-malformed-percent-site",
    plan: (w) => {
      sidebarPage(w, {
        free: Infinity,
        pinned: [() => {
          string(w, "2026-110-1001-000%"); string(w, "[2026前期月１]線形代数"); w.bool(false);
          w.int(0, w.remaining, 0);
          for (const part of [true, true, true, true, true, false]) w.bool(part);
          w.int(0, 2, 0); w.bool(true);
          w.int(0, w.remaining, 1); string(w, "t1"); string(w, "概要"); w.bool(false);
        }],
        sites: [],
        actions: [() => { w.int(0, 14, 3); w.int(0, 65535, 0); }],
      });
    },
  },
  {
    // A sidebar of two pinned courses and one more, each with tools, its
    // names as KULMS writes them, and what a user does: open the bar's
    // dropdown, move a tool under the toggle, drag the sidebar, let a minute
    // go by.
    file: "seeds/sidebar/courses",
    plan: (w) => {
      const c = (id, name, tools) => () => {
        string(w, id); string(w, name); w.bool(false);
        w.int(0, w.remaining, 1); w.bool(true); w.int(0, 4, 0);
        for (const part of [true, true, true, true, true, false]) w.bool(part);
        w.int(0, 2, 0); w.bool(true);
        w.int(0, w.remaining, tools.length);
        for (const [tid, tname] of tools) { string(w, tid); string(w, tname); w.bool(false); }
      };
      const tools = [["t1", "概要"], ["t2", "授業資料（リソース）"], ["t3", "課題"], ["t4", "お知らせ"]];
      sidebarPage(w, {
        free: Infinity,
        pinned: [c("2026-110-1001-000", "[2026前期月１]線形代数", tools), c("2026-110-1002-000", "[2026前期火２]英語リーディング", tools)],
        sites: [c("2026-110-1003-000", "[2026後期水３]情報学", tools)],
        actions: [
          () => { w.int(0, 14, 3); w.int(0, 65535, 0); },
          () => { w.int(0, 14, 4); w.int(0, 65535, 0); },
          () => { w.int(0, 14, 1); w.int(0, 65535, 3); },
          () => { w.int(0, 14, 8); w.int(0, 65535, 0); number(w, 250); },
          () => { w.int(0, 14, 10); w.int(0, 65535, 0); w.int(0, 600000, 60000); },
        ],
      });
    },
  },
  {
    // The popup asks for the books of the course 評定済 (one of the words
    // the extension looks for, as the fuzzer found it), and the input ends:
    // every answer is empty. The search is the first since the service
    // worker started, which builds the Shift_JIS table.
    file: "known/background-message/P6-first-search",
    plan: (w) => {
      w.int(0, 2, 2);
      w.int(0, 3, 0);
      w.bool(true); string(w, "評定済", { word: true });
    },
    expect: {
      from: "popup",
      message: { action: "fetchTextbooks", courseName: "評定済", lectureCode: undefined, siteId: undefined },
      body: utf8(""),
      replies: Array.from({ length: 5 }, () => ok("text/html", utf8(""))),
      stored: null,
    },
  },
  {
    // The popup saves a TOTP secret of 64 "A"s repeated 64 times, 4,096
    // units, and on its rungs up to 2^5 times as many: encrypted, more bytes
    // than the engine takes as arguments of String.fromCharCode().
    file: "known/background-message/B22-long-secret",
    doublings: 5,
    plan: (w) => {
      w.int(0, 2, 2);
      w.int(0, 3, 1); w.int(0, 4, 0);
      w.bool(true); w.bool(true); repeated(w, "A".repeat(64), 64);
    },
    expect: {
      from: "popup",
      message: { type: "kulms-totp-save", secret: "A".repeat(4096) },
      body: utf8(""),
      replies: Array.from({ length: 5 }, () => ok("text/html", utf8(""))),
      stored: null,
    },
  },
  {
    // pages.json is [null, { tools: [the Site Info tool] }].
    file: "known/site-contact/B20-null-page",
    plan: (w) => {
      string(w, "S1");
      w.bool(true); value(w, [null, ...SITE_INFO_TOOLS]);
      answer(w);
      bytes(w, utf8(CONTACT), { rest: true }); answer(w);
    },
    expect: { siteId: "S1", pages: ok("application/json", JSON.stringify([null, ...SITE_INFO_TOOLS])), page: ok("text/html", utf8(CONTACT)) },
  },
  {
    // The grader of an assignment of two submissions, as Sakai keeps them,
    // and the content script's request.
    file: "seeds/grading-bridge/submissions",
    plan: (w) => {
      bridgePage(w, [{
        id: "1",
        prop: () => {
          w.int(0, 2, 2); w.int(0, 6, 1);
          w.int(0, w.remaining, 2);
          bridgeSubmission(w, { id: "s1", firstSubmitterName: "京大 太郎", status: "未採点 - 提出済み", submittedTime: "2026/10/13 10:00", submitted: true, graded: false, returned: false, grade: "" });
          bridgeSubmission(w, { reference: "/assignment/s/S/A/s2", firstSubmitterName: "京大 花子", status: "", submitted: true, graded: true, returned: true, grade: "85" });
          w.bool(false);
        },
      }], ["kulms-ta-1791900000000-abc"]);
    },
  },
  {
    // The page's grader has a getter of its submissions that throws: the
    // bridge lets it out, and answers nothing.
    file: "known/grading-bridge/B24-getter-throws",
    plan: (w) => {
      bridgePage(w, [{ id: "1", prop: () => { w.int(0, 2, 1); w.bool(true); string(w, "x"); } }], ["r"]);
    },
  },
  {
    // A submission whose ID is a number: the bridge hands it on as it is.
    file: "known/grading-bridge/B24-id-not-a-string",
    plan: (w) => {
      bridgePage(w, [{
        id: "1",
        prop: () => {
          w.int(0, 2, 2); w.int(0, 6, 1);
          w.int(0, w.remaining, 1);
          bridgeSubmission(w, { id: 5 });
          w.bool(false);
        },
      }], ["r"]);
    },
  },
  {
    // The grader's submissions are an array-like of no elements that says it
    // has 2^32 - 2: the bridge's Array.from() loops to that.
    file: "known/grading-bridge/P7-array-like-length",
    plan: (w) => {
      bridgePage(w, [{
        id: "1",
        prop: () => {
          w.int(0, 2, 2); w.int(0, 6, 3);
          w.bool(true); number(w, 2 ** 32 - 2);
          w.int(0, w.remaining, 0);
          w.bool(false);
        },
      }], ["r"]);
    },
  },
  {
    // The grader's submissions are an object of no elements whose length is
    // 2^32 - 2: the bridge's Array.from() loops to that, as for an
    // array-like, and the harness stops the loop before it runs.
    file: "known/grading-bridge/P7-object-length",
    plan: (w) => {
      bridgePage(w, [{ id: "1", prop: () => { w.int(0, 2, 2); bridgeObjectWithLength(w, 2 ** 32 - 2); } }], ["r"]);
    },
  },
  {
    // A submission whose submissionId is the submission itself, as the page
    // may make it: the bridge takes it for the ID and hands it to
    // JSON.stringify(), which throws on the cycle (Chrome's V8 only after its
    // fast path has written it out for 200,000 turns; docs/findings.md, B24).
    file: "known/grading-bridge/B24-submission-holds-itself",
    plan: (w) => {
      bridgePage(w, [{
        id: "1",
        prop: () => {
          w.int(0, 2, 2); w.int(0, 6, 1);
          w.int(0, w.remaining, 1);
          w.int(0, 4, 1);
          w.int(0, w.remaining, 2);
          w.bool(true); w.pick(BRIDGE_FIELDS, "status"); w.int(0, 7, 1); string(w, "未採点 - 提出済み");
          w.bool(true); w.pick(BRIDGE_FIELDS, "submissionId"); w.int(0, 7, 7);
          w.bool(false);
        },
      }], ["r"]);
    },
  },
  {
    // The same through a proxy whose trap (has) the bridge passes, with a
    // length of 2^25: the harness cannot read the length of a proxy before
    // the loop runs, and counts the loop once it has run. To a length of
    // 2^31 V8 ends the process instead (docs/findings.md, P7).
    file: "known/grading-bridge/P7-proxy-length",
    plan: (w) => {
      bridgePage(w, [{
        id: "1",
        prop: () => {
          w.int(0, 2, 2); w.int(0, 6, 5);
          bridgeObjectWithLength(w, 2 ** 25);
          w.pick(BRIDGE_TRAPS, "has");
          w.bool(true); string(w, "x");
        },
      }], ["r"]);
    },
  },
  {
    // Every folder opens as the page loads (autoExpandAll), and the server
    // answers each post with a listing that shows the one folder still
    // closed: tree-view.js asks to expand them all (doExpandall, since
    // v1.22.0), then for the folder, again and again.
    file: "known/resources/P2-folder-stays-closed",
    plan: (w) => {
      for (const on of [false, true, false, false]) { w.bool(true); w.bool(on); }
      w.bool(true); w.int(0, 2, 1); w.int(0, w.remaining, 0); w.bool(true);
      const folder = () => {
        w.bool(true); w.bool(false); w.int(0, 4, 0); string(w, "資料"); w.bool(false);
        w.bool(false); w.bool(false); string(w, "/group/S/f1/");
      };
      w.int(0, w.remaining, 1); folder();
      w.int(0, w.remaining, 1); w.bool(true); w.int(0, w.remaining, 1); folder(); answer(w);
      w.int(0, w.remaining, 0);
    },
  },
  {
    // The page's localStorage holds, under the key of tree-view.js's cache for
    // this page and the site's root, a tree whose markup runs script (an
    // image's onerror), as any script of the page may have written it. The
    // page has Sakai's link that expands every folder and one folder closed,
    // and every folder opens as the page loads (autoExpandAll): tree-view.js
    // puts the cached tree in the table as it is, before it asks the server,
    // which does not answer here, so that the tree stays (docs/findings.md,
    // S14).
    file: "known/resources/S14-cached-tree-runs-script",
    plan: (w) => {
      for (const on of [false, true, false, false]) { w.bool(true); w.bool(on); }
      w.bool(true); w.int(0, 2, 1); w.int(0, w.remaining, 0); w.bool(true);
      w.int(0, w.remaining, 1);
      w.bool(true); w.bool(false); w.int(0, 4, 0); string(w, "資料"); w.bool(false);
      w.bool(false); w.bool(false); string(w, "/group/S/f1/");
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 0);
      w.bool(true); w.bool(true); w.bool(true);
      w.int(0, w.remaining, 1);
      w.int(0, 2, 0); w.int(0, 2, 2);
      string(w, JSON.stringify({ html: '<tr><td class="title"><img src="x" onerror="alert(document.cookie)">資料</td></tr>', savedAt: 1 }));
      w.int(0, 2, 0);
    },
  },
  {
    // pages.json comes by a redirect from an origin the extension has no host
    // permission for, whose server lets it read the answer (CORS: the
    // request's origin, which the redirect hid, "null", with credentials):
    // the background reads it as the LMS's.
    file: "known/site-contact/S12-redirect-elsewhere",
    plan: (w) => {
      string(w, "S1");
      w.bool(false); w.bool(true); w.bool(true); string(w, "p");
      answer(w, { redirect: { to: 1, path: "pages.json", allowed: 2, credentials: true } });
      bytes(w, utf8(CONTACT), { rest: true }); answer(w);
    },
  },
  {
    // The popup opens on a cache written five minutes before: an assignment
    // due in six hours, one in three days, one submitted two days ago; a memo
    // due tomorrow; a TOTP secret kept. The user opens the TOTP section,
    // shows the code, and waits two seconds.
    file: "seeds/popup/assignments",
    plan: (w) => {
      w.int(0, 2, 0);
      w.int(0, 2, 1); w.bool(true); w.bool(true); w.int(-60 * DAY, 60 * DAY, -5 * 60e3);
      w.bool(true); w.int(0, w.remaining, 3);
      popupAssignment(w, { course: "[2026前期月１]線形代数", site: "2026-110-1001-000", name: "第3回レポート", id: "a1", inMs: 6 * 60 * 60e3, status: "" });
      popupAssignment(w, { course: "[2026前期火２]英語リーディング", site: "2026-110-1002-000", name: "Reading Response #4", id: "a2", inMs: 3 * DAY, status: "" });
      popupAssignment(w, { course: "[2026前期月１]線形代数", site: "2026-110-1001-000", name: "第2回レポート", id: "a3", inMs: -2 * DAY, status: "提出済" });
      w.int(0, 2, 0); w.int(0, 2, 0);
      w.int(0, 2, 1); w.int(0, w.remaining, 1);
      w.bool(false);
      w.bool(true); w.int(0, 2 ** 48 - 1, 1);
      w.bool(true); string(w, "教科書を買う");
      w.bool(true); string(w, "[2026前期月１]線形代数");
      w.bool(true); string(w, "2026-110-1001-000");
      w.bool(true); w.bool(true); w.int(-60 * DAY, 60 * DAY, DAY);
      w.bool(true); w.bool(true);
      w.bool(true); w.bool(true); w.int(-60 * DAY, 60 * DAY, -DAY);
      w.bool(true); string(w, "JBSWY3DPEHPK3PXP");
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 3);
      w.int(0, 12, 4); w.int(0, 65535, 1);
      w.int(0, 12, 7); w.int(0, 65535, 1);
      w.int(0, 12, 11); w.int(0, 65535, 1); w.int(0, 10 * 60e3, 2000);
    },
  },
  {
    // The popup opens on a cache whose list of assignments is a string.
    file: "known/popup/B25-assignments-not-a-list",
    plan: (w) => {
      w.int(0, 2, 0);
      w.int(0, 2, 1); w.bool(true); w.bool(true); w.int(-60 * DAY, 60 * DAY, 0);
      w.bool(false); value(w, "課題");
      w.int(0, 2, 0); w.int(0, 2, 0); w.int(0, 2, 0);
      w.bool(false);
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 0);
    },
  },
  {
    // The popup opens on a cache of one assignment whose closing time is
    // { toString: 0 }: an object that cannot be made a number, which the
    // popup compares with the time.
    file: "known/popup/B25-close-time-object",
    plan: (w) => {
      w.int(0, 2, 0);
      w.int(0, 2, 1); w.bool(true); w.bool(true); w.int(-60 * DAY, 60 * DAY, 0);
      w.bool(false); value(w, [{ courseId: "C1", name: "レポート1", closeTime: { toString: 0 } }]);
      w.int(0, 2, 0); w.int(0, 2, 0); w.int(0, 2, 0);
      w.bool(false);
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 0);
    },
  },
  {
    // The popup opens with nothing stored and no secret kept, in a window of
    // two tabs: a course page of the LMS, whose content script answers a
    // request to refresh with {ok: true}, and the authentication server's
    // page that registers a TOTP secret, which is active. That page has an
    // image of 20 by 20 pixels in which jsQR finds nothing, and a canvas of
    // that size in which it finds an otpauth URI. The user refreshes, opens
    // the TOTP section, scans the page, which gives the secret of the URI,
    // and saves it.
    file: "seeds/popup/tabs",
    plan: (w) => {
      for (let i = 0; i < 5; i++) w.int(0, 2, 0);
      w.bool(false);
      w.int(0, w.remaining, 2);
      w.int(0, 4, 0); string(w, "2026-110-1001-000"); string(w, "a1b2c3"); w.int(0, 5, 3);
      w.int(0, 4, 2); w.int(0, 5, 0);
      w.bool(true); w.int(0, 1, 1);
      w.int(0, w.remaining, 1); w.int(1, 4096, 20); bytes(w, new Array(20 * 20 * 4).fill(0)); w.bool(false); w.int(0, 2, 0);
      w.int(0, w.remaining, 1); w.int(1, 4096, 20); bytes(w, new Array(20 * 20 * 4).fill(255)); w.bool(false); w.int(0, 2, 1); string(w, "JBSWY3DPEHPK3PXP");
      w.int(0, w.remaining, 4);
      w.int(0, 12, 2); w.int(0, 65535, 0);
      w.int(0, 12, 4); w.int(0, 65535, 0);
      w.int(0, 12, 10); w.int(0, 65535, 0);
      w.int(0, 12, 6); w.int(0, 65535, 0);
    },
  },
  {
    // The page that registers a TOTP secret: jsQR finds nothing in its QR
    // code, and the link that shows the secret as text shows it; the helper
    // reads it there and fills in the code.
    file: "seeds/totp-register/registration",
    plan: (w) => {
      w.bool(true);
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 1); w.bool(true); w.bool(true); w.bool(true); w.int(0, 2, 1); string(w, "JBSWY3DPEHPK3PXP");
      w.int(0, w.remaining, 1); w.int(1, 4096, 4); bytes(w, new Array(64).fill(255)); w.int(0, 2, 0);
      w.bool(true);
      w.bool(false);
      w.int(0, 2, 0);
    },
  },
  {
    // The page that says the registration is done, the secret kept in the
    // page's sessionStorage: the helper has the background save it.
    file: "seeds/totp-register/done",
    plan: (w) => {
      w.bool(false); string(w, "user/index.php"); string(w, "");
      w.int(0, w.remaining, 1); w.int(0, 2, 0);
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 0);
      w.bool(false);
      w.bool(true); string(w, "JBSWY3DPEHPK3PXP");
      w.int(0, 2, 0);
    },
  },
  {
    // The registration page says its secret is "A": the helper takes it, and
    // making a key of it fails.
    file: "known/totp-register/S6-short-secret",
    plan: (w) => {
      w.bool(true);
      w.int(0, w.remaining, 1); w.int(0, 2, 1); string(w, "A");
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 0);
      w.bool(true);
      w.bool(false);
      w.int(0, 2, 0);
    },
  },
  {
    // The page has filled its sessionStorage, and the helper keeps the secret
    // it read there.
    file: "known/totp-register/B23-session-full",
    plan: (w) => {
      w.bool(true);
      w.int(0, w.remaining, 1); w.int(0, 2, 1); string(w, "JBSWY3DPEHPK3PXP");
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 0);
      w.bool(true);
      w.bool(false);
      w.int(0, 2, 2);
    },
  },
  {
    // The background keeps a secret of one base32 character, J, five bits
    // that decode to no byte, and the user shows its code: the popup hands
    // Web Crypto an HMAC key of no bytes, which it rejects with nothing to
    // handle it (the daily fuzzing of 2026-10-14, 38474299674, found such an
    // input).
    file: "known/popup/S6-short-secret-shown",
    plan: (w) => {
      for (let i = 0; i < 5; i++) w.int(0, 2, 0);
      w.bool(true); string(w, "J");
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 1); w.int(0, 12, 7); w.int(0, 65535, 0);
    },
  },
  {
    // The background keeps a secret of 150 characters U+FFFF, which no
    // base32 has, and the user shows its QR code: popup.js percent-encodes
    // it into nine bytes a character, and qrcode-gen makes a large code.
    file: "known/popup/S6-qr-of-non-base32",
    plan: (w) => {
      for (let i = 0; i < 5; i++) w.int(0, 2, 0);
      w.bool(true); string(w, "\uffff".repeat(150));
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 1); w.int(0, 12, 9); w.int(0, 65535, 1);
    },
  },
  {
    // The background keeps a base32 secret of 512 characters, and the user
    // shows its QR code five times, hiding it in between (nine clicks): the
    // popup asks the background for the secret and makes the code anew each
    // time it is shown, some 6,300,000 steps a time (docs/findings.md, P9).
    file: "known/popup/P9-qr-shown-again",
    plan: (w) => {
      for (let i = 0; i < 5; i++) w.int(0, 2, 0);
      w.bool(true); string(w, "JBSWY3DPEHPK3PXP".repeat(32));
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 9);
      for (let i = 0; i < 9; i++) { w.int(0, 12, 9); w.int(0, 65535, 0); }
    },
  },
  {
    // The grader of an assignment: its panel shown, with a field and buttons
    // to save and to return; the count of what is graded; three students, of
    // whom the second's submission waits for a grade, as the grader's
    // submissions say, the first selected; Sakai's button to the next one;
    // and a link of the page back to the list. The user types a grade (the
    // grader is unsaved), presses the jump to the next submission that waits
    // for a grade and answers to stay, then presses it again and answers to
    // leave.
    file: "seeds/grading-pages/grader",
    plan: (w) => {
      const { site, assignment, tool } = GRADING_PAGE;
      w.int(0, 2, 0); string(w, site); string(w, assignment); string(w, tool); gradingId(w, "0a1b2c3d");
      w.bool(true);
      w.int(0, 1, 0);
      w.int(0, 2, 0); string(w, assignment);
      w.bool(true); w.int(0, 3, 0);
      w.int(0, w.remaining, 3);
      w.bool(true);
      w.bool(false); w.bool(true); w.pick(GRADING_BUTTONS, "保存"); w.bool(false);
      w.bool(false); w.bool(true); w.pick(GRADING_BUTTONS, "返却"); w.bool(false);
      w.int(0, 1, 1); w.bool(true); w.bool(true); w.int(0, 1, 0); w.int(0, 2 ** 16 - 1, 1); w.int(0, 2 ** 16 - 1, 3);
      w.int(0, w.remaining, 3);
      gradingId(w, "0a1b2c3d"); gradingName(w, "学生A");
      gradingId(w, "1a2b3c4d"); gradingName(w, "学生B");
      gradingId(w, "2a3b4c5d"); gradingName(w, "学生C");
      w.bool(true);
      w.bool(false);
      w.bool(true); w.int(0, w.remaining, 3);
      gradingSubmission(w, { of: 0, name: "学生A", status: "採点済み", submitted: true, graded: true });
      gradingSubmission(w, { of: 1, name: "学生B", status: "未採点 - 提出済み", submitted: true, graded: false });
      gradingSubmission(w, { of: 2, name: "学生C", status: "未提出", submitted: false, graded: false });
      w.bool(true); w.int(0, 2, 0);
      w.int(0, w.remaining, 1); w.bool(true); string(w, `/portal/site/${site}/tool/${tool}?panel=Main`); w.bool(true); w.pick(GRADING_CONTROLS, "一覧へ戻る");
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 0);
      w.int(0, 3, 0);
      w.int(0, w.remaining, 2); w.bool(false); w.bool(true);
      w.bool(true);
      w.int(0, w.remaining, 3);
      gradingAction(w, "type"); string(w, "85");
      gradingAction(w, "jump-next", 1);
      gradingAction(w, "jump-next", 1);
    },
  },
  {
    // The list of submissions of an assignment: a header of Sakai's words in a
    // thead (受講者, 状態, 提出日時, 成績), and three rows, each a student's
    // link to the grader, a status (waiting for a grade, graded, returned),
    // a time and a grade. Then Sakai shows the first one graded, and time
    // goes by.
    file: "seeds/grading-pages/list",
    plan: (w) => {
      const { site, assignment, tool } = GRADING_PAGE;
      w.int(0, 2, 1); string(w, site); string(w, tool); string(w, "panel=Main");
      w.bool(false);
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 1);
      w.bool(true); w.bool(true);
      w.int(0, w.remaining, 4);
      for (const h of ["受講者", "状態", "提出日時", "成績"]) { w.bool(true); w.pick(GRADING_HEADERS, h); }
      w.int(0, w.remaining, 3);
      for (const [hex, name, status] of [["0a1b2c3d", "学生A", "未採点 - 提出済み"], ["1a2b3c4d", "学生B", "採点済み"], ["2a3b4c5d", "学生C", "返却済み"]]) {
        w.int(0, w.remaining, 4);
        w.int(0, 2, 1); gradingLink(w, { site, assignment, tool, hex }); string(w, name);
        w.int(0, 2, 0); gradingStatus(w, status);
        w.int(0, 2, 2); string(w, "2026/10/10 12:00");
        w.int(0, 2, 2); string(w, "");
      }
      w.int(0, w.remaining, 0);
      w.int(0, 3, 0);
      w.int(0, w.remaining, 0);
      w.bool(true);
      w.int(0, w.remaining, 2);
      gradingAction(w, "status", 1); gradingStatus(w, "採点済み");
      gradingAction(w, "time"); w.int(0, 10 * 60e3, 2000);
    },
  },
  {
    // The list of submissions of the list seed, but for its last row, which
    // has a student's link and a status, and no cell at the column of the
    // submission time.
    file: "known/grading-pages/B26-row-short-of-submit-column",
    plan: (w) => {
      const { site, assignment, tool } = GRADING_PAGE;
      w.int(0, 2, 1); string(w, site); string(w, tool); string(w, "panel=Main");
      w.bool(false);
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 1);
      w.bool(true); w.bool(true);
      w.int(0, w.remaining, 4);
      for (const h of ["受講者", "状態", "提出日時", "成績"]) { w.bool(true); w.pick(GRADING_HEADERS, h); }
      w.int(0, w.remaining, 2);
      w.int(0, w.remaining, 4);
      w.int(0, 2, 1); gradingLink(w, { site, assignment, tool, hex: "0a1b2c3d" }); string(w, "学生A");
      w.int(0, 2, 0); gradingStatus(w, "未採点 - 提出済み");
      w.int(0, 2, 2); string(w, "2026/10/10 12:00");
      w.int(0, 2, 2); string(w, "");
      w.int(0, w.remaining, 2);
      w.int(0, 2, 1); gradingLink(w, { site, assignment, tool, hex: "1a2b3c4d" }); string(w, "学生B");
      w.int(0, 2, 0); gradingStatus(w, "採点済み");
      w.int(0, w.remaining, 0);
      w.int(0, 3, 0);
      w.int(0, w.remaining, 0);
      w.bool(true);
      w.int(0, w.remaining, 0);
    },
  },
  {
    // The grader with no submissions for the bridge to read, so the extension
    // fetches the list of submissions: the server answers with a page of the
    // list, whose rows hold the statuses of the grader's two students. The
    // page's sessionStorage keeps what the extension kept of an earlier
    // visit: the second student's submission returned a minute before. Time
    // goes by.
    file: "seeds/grading-pages/fetched",
    plan: (w) => {
      const { site, assignment, tool } = GRADING_PAGE;
      w.int(0, 2, 0); string(w, site); string(w, assignment); string(w, tool); gradingId(w, "0a1b2c3d");
      w.bool(true);
      w.int(0, 1, 0);
      w.int(0, 2, 0); string(w, assignment);
      w.bool(false);
      w.int(0, 1, 0);
      w.int(0, w.remaining, 2);
      gradingId(w, "0a1b2c3d"); gradingName(w, "学生A");
      gradingId(w, "1a2b3c4d"); gradingName(w, "学生B");
      w.bool(false);
      w.bool(false);
      w.bool(false);
      w.bool(true); w.int(0, 1, 0);
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 0);
      w.int(0, w.remaining, 1);
      w.bool(true);
      w.int(0, w.remaining, 1);
      w.bool(true); w.bool(true);
      w.int(0, w.remaining, 2);
      for (const h of ["受講者", "状態"]) { w.bool(true); w.pick(GRADING_HEADERS, h); }
      w.int(0, w.remaining, 2);
      for (const [hex, name, status] of [["0a1b2c3d", "学生A", "未採点 - 提出済み"], ["1a2b3c4d", "学生B", "採点済み"]]) {
        w.int(0, w.remaining, 2);
        w.int(0, 2, 1); gradingLink(w, { site, assignment, tool, hex }); string(w, name);
        w.int(0, 2, 0); gradingStatus(w, status);
      }
      answer(w);
      w.int(0, 3, 1);
      w.int(0, w.remaining, 1);
      w.bool(true); w.int(0, 255, 1);
      w.bool(true);
      string(w, "学生B");
      w.bool(true); w.pick(GRADING_STATUSES, "返却済み");
      w.int(0, 5, 4);
      string(w, "2026/10/10 12:00");
      w.int(0, 2, 2);
      w.int(0, 2, 2);
      w.int(0, 10 * 60e3, 60e3);
      w.int(0, w.remaining, 0);
      w.bool(true);
      w.int(0, w.remaining, 1);
      gradingAction(w, "time"); w.int(0, 10 * 60e3, 1000);
    },
  },
];

// The files under fuzz/seeds/, fuzz/known/ and fuzz/regressions/, relative to
// fuzz/.
export function onDisk() {
  const out = [];
  for (const kind of ["seeds", "known", "regressions"]) {
    const dir = path.join(FUZZ, kind);
    if (!fs.existsSync(dir)) continue;
    for (const target of fs.readdirSync(dir)) {
      for (const f of fs.readdirSync(path.join(dir, target))) out.push(`${kind}/${target}/${f}`);
    }
  }
  return out.sort();
}

// What is wrong with the files on disk: a file that is not what its plan
// writes, or that no plan writes.
export function problems() {
  const out = [];
  for (const { file, plan, doublings } of INPUTS) {
    const p = path.join(FUZZ, file);
    if (!fs.existsSync(p)) out.push(`${file} is missing`);
    else if (!encode(plan, { doublings }).equals(fs.readFileSync(p))) out.push(`${file} is not what its plan writes`);
  }
  const planned = new Set(INPUTS.map((i) => i.file));
  for (const file of onDisk()) if (!planned.has(file)) out.push(`${file} has no plan`);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--check") {
    const found = problems();
    for (const p of found) console.error(p);
    process.exit(found.length ? 1 : 0);
  }
  for (const { file, plan, doublings } of INPUTS) {
    const p = path.join(FUZZ, file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, encode(plan, { doublings }));
    console.log(`wrote fuzz/${file}`);
  }
  const planned = new Set(INPUTS.map((i) => i.file));
  for (const file of onDisk()) if (!planned.has(file)) console.log(`fuzz/${file} has no plan: delete it, or give it one`);
}
