// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// background.js's searchSyllabus(): the keyword is put in Shift_JIS into the
// URL of KULASIS's search, and the course is picked out of the page of results
// by its name and, when several match, its teacher. The input gives the
// keyword (any string: a course's name or code, which the LMS gives), the name
// and the teacher it is matched against (any strings, or no teacher found),
// and then the page of results (any bytes), answered by the network as the
// input says (fuzz/lib.mjs).
//
// It fails when the search throws, asks for a URL outside KULASIS's search, or
// returns what is not a course (null, or a lecture number of digits and a
// department number of digits or nothing), or when a detector of the harness
// sees something. An input that takes longer than the fuzzer's --timeout is a
// regular expression that backtracks. The message handler catches what the
// search throws and answers with no books.
//
// The extension catches its own errors in many places and only warns; the
// target fails too on a warning or an error that tells of a slip of the code
// (warnings() of fuzz/lib.mjs), not on an HTTP error, a network that fails
// or an answer that is not JSON, which the catching is there for.
import { Browser, Net, openBackground, watch } from "../../harness/index.mjs";
import { FuzzedDataProvider, answer, brief, bytes, fail, isSlip, open, string, warnings } from "../lib.mjs";

const SEARCH = "https://www.k.kyoto-u.ac.jp/external/open_syllabus/search?";
let page = {};
const net = new Net().on("https://www.k.kyoto-u.ac.jp/", () => page);
const bg = openBackground(new Browser(), { net });

// What the input gives the target, as fuzz/lib.mjs reads it (fuzz/inputs.mjs
// checks its seeds and known inputs against this).
export function read(fdp) {
  const keyword = string(fdp);
  const expectedName = fdp.consumeBoolean() ? string(fdp) : undefined;
  const teacher = fdp.consumeBoolean() ? string(fdp) : null;
  return { keyword, expectedName, teacher, page: answer(fdp, bytes(fdp), "text/html") };
}

export async function fuzz(data) {
  const { keyword, expectedName, teacher, page: answered } = read(new FuzzedDataProvider(data));
  page = answered;
  // Known: S8 (docs/findings.md). While it is open, the page is cut at 16,384
  // bytes, where the quadratic regular expressions that read the results
  // still answer within a tenth of a second, so that the fuzzing goes on to
  // what is not known yet.
  if (open("S8") && page.body) page = { ...page, body: page.body.subarray(0, 16384) };
  net.requests.length = 0;
  const w = watch(bg);
  const log = warnings(bg);
  let result = null;
  try {
    result = await bg.global.searchSyllabus(keyword, { expectedName, expectedTeacher: () => Promise.resolve(teacher) });
  } catch (e) {
    if (isSlip(e)) throw e;
  }
  for (const line of log.slips()) fail(`a slip of the code: ${line}`);
  for (const r of net.requests) if (!r.url.startsWith(SEARCH)) fail(`asked for ${r.url}`);
  if (result !== null && !(typeof result === "object" && /^\d+$/.test(result.lectureNo) && /^\d*$/.test(result.departmentNo))) {
    fail(`not a course: ${brief(result)}`);
  }
  const problems = w.check();
  if (problems.length) fail(problems.join("\n"));
}
