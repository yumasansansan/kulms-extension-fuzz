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
// sees something. The message handler catches what the search throws and
// answers with no books.
//
// It also fails when the extension's work grows faster than n log n from rung
// to rung of the input, or passes what linear code does with an input of its
// size (ladder() and judge() of fuzz/lib.mjs, harness/work.mjs): no clock
// decides. A regular expression's work is the steps of a backtracking engine
// (harness/backtrack.mjs), but for those of a finding that stands, which run
// on V8's linear engine (fuzz/lib.mjs).
//
// The extension catches its own errors in many places and only warns; the
// target fails too on a warning or an error that tells of a slip of the code
// (warnings() of fuzz/lib.mjs), not on an HTTP error, a network that fails
// or an answer that is not JSON, which the catching is there for.
import { Browser, Net, openBackground, watch } from "../../harness/index.mjs";
import { answer, brief, bytes, calibrate, fail, isSlip, judge, ladder, provider, string, warnings } from "../lib.mjs";

const SEARCH = "https://www.k.kyoto-u.ac.jp/external/open_syllabus/search?";
let page = {};
const net = new Net().on("https://www.k.kyoto-u.ac.jp/", () => page);
const browser = new Browser();
const bg = openBackground(browser, { net });

// What the input gives the target, as fuzz/lib.mjs reads it (fuzz/inputs.mjs
// checks its seeds and known inputs against this).
export function read(fdp) {
  const keyword = string(fdp);
  const expectedName = fdp.consumeBoolean() ? string(fdp) : undefined;
  const teacher = fdp.consumeBoolean() ? string(fdp) : null;
  return { keyword, expectedName, teacher, page: answer(fdp, bytes(fdp), "text/html") };
}

async function run(data) {
  browser.forget();
  net.forget();
  const { keyword, expectedName, teacher, page: answered } = read(provider(data));
  page = answered;
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
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run);
}

await calibrate(fuzz);
