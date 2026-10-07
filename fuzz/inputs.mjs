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
// jsonText() of lib.mjs reads nothing for a value that holds no NaN,
// ±Infinity, -0 or BigInt, which no plan here hands it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { read } from "../harness/index.mjs";
import { answer, bytes, encode, repeatedBytes, string, value } from "./encode.mjs";

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
const SITE_INFO_TOOLS = [{ tools: [{ toolId: "sakai.siteinfo", placementId: "p" }] }];

// The empty answers of the assignment panel's network (fuzz/targets/
// assignments.fuzz.mjs), after its sidebar and the answer to the courses'
// assignments: each answer of Sakai's shape (either() picks it) with no item,
// and the portal's page empty.
function emptyAnswers(w) {
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
