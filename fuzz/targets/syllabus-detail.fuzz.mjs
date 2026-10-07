// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// background.js's fetchSyllabusDetail(lectureNo, departmentNo), which reads
// the textbooks and reference books out of a syllabus page of KULASIS with
// regular expressions. The input gives the lecture and department numbers
// (any strings: they come from the page of the search's results) and the
// page (any bytes), answered by the network as the input says (fuzz/lib.mjs).
// What a teacher writes in a syllabus reaches this code, so the page is as
// much the teacher's as the university's.
//
// It fails when the parser throws, when a book it returns is not one (a title
// of three characters or more, the other fields strings, an ISBN of digits, a
// type of textbook or reference), when it asks for a URL outside KULASIS's
// syllabus, or when a detector of the harness sees something
// (harness/detectors.mjs). An input that takes longer than the fuzzer's
// --timeout is a regular expression that backtracks. The message handler
// catches what the parser throws and answers with no books.
//
// The extension catches its own errors in many places and only warns; the
// target fails too on a warning or an error that tells of a slip of the code
// (warnings() of fuzz/lib.mjs), not on an HTTP error, a network that fails
// or an answer that is not JSON, which the catching is there for.
import { Browser, Net, openBackground, watch } from "../../harness/index.mjs";
import { FuzzedDataProvider, answer, brief, bytes, fail, isSlip, open, string, warnings } from "../lib.mjs";

const SYLLABUS = "https://www.k.kyoto-u.ac.jp/external/open_syllabus/";
let page = {};
const net = new Net().on("https://www.k.kyoto-u.ac.jp/", () => page);
const bg = openBackground(new Browser(), { net });

// What the input gives the target, as fuzz/lib.mjs reads it (fuzz/inputs.mjs
// checks its seeds and known inputs against this).
export function read(fdp) {
  const lectureNo = string(fdp);
  const departmentNo = fdp.consumeBoolean() ? string(fdp) : undefined;
  return { lectureNo, departmentNo, page: answer(fdp, bytes(fdp), "text/html") };
}

export async function fuzz(data) {
  const { lectureNo, departmentNo, page: answered } = read(new FuzzedDataProvider(data));
  page = answered;
  // Known: S8 (docs/findings.md). While it is open, the page is cut at 16,384
  // bytes, where its quadratic regular expressions still answer within a
  // tenth of a second, so that the fuzzing goes on to what is not known yet.
  if (open("S8") && page.body) page = { ...page, body: page.body.subarray(0, 16384) };
  net.requests.length = 0;
  const w = watch(bg);
  const log = warnings(bg);
  let books = [];
  try {
    books = await bg.global.fetchSyllabusDetail(lectureNo, departmentNo);
  } catch (e) {
    if (isSlip(e)) throw e;
  }
  for (const line of log.slips()) fail(`a slip of the code: ${line}`);
  for (const r of net.requests) if (!r.url.startsWith(SYLLABUS)) fail(`asked for ${r.url}`);
  if (!Array.isArray(books)) fail(`not a list: ${brief(books)}`);
  for (const b of books) {
    if (typeof b.title !== "string" || b.title.length <= 2) fail(`title ${brief(b.title)}`);
    for (const k of ["author", "publisher", "isbn"]) if (typeof b[k] !== "string") fail(`${k} ${brief(b[k])}`);
    if (!/^\d*$/.test(b.isbn)) fail(`isbn ${brief(b.isbn)}`);
    if (b.type !== "textbook" && b.type !== "reference") fail(`type ${brief(b.type)}`);
  }
  const problems = w.check();
  if (problems.length) fail(problems.join("\n"));
}
