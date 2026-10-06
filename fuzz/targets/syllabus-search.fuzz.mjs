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
// keyword (a course's name or code, which the LMS gives), the name and the
// teacher it is matched against, and then the page of results, as UTF-8.
//
// It fails when the search throws, asks for a URL outside KULASIS's search, or
// returns what is not a course (null, or a lecture number of digits and a
// department number of digits or nothing), or when a detector of the harness
// sees something.
import { Browser, Net, openBackground, watch } from "../../harness/index.mjs";
import { FuzzedDataProvider, fail, string } from "../lib.mjs";

const SEARCH = "https://www.k.kyoto-u.ac.jp/external/open_syllabus/search?";
let page = new Uint8Array();
const net = new Net().on("https://www.k.kyoto-u.ac.jp/", () => ({ headers: { "content-type": "text/html; charset=utf-8" }, body: page }));
const bg = openBackground(new Browser(), { net });

export async function fuzz(data) {
  const fdp = new FuzzedDataProvider(data);
  const keyword = string(fdp, 40);
  const expectedName = fdp.consumeBoolean() ? string(fdp, 40) : undefined;
  const teacher = string(fdp, 20);
  page = Uint8Array.from(fdp.consumeRemainingAsBytes());
  net.requests.length = 0;
  const w = watch(bg);
  const result = await bg.global.searchSyllabus(keyword, { expectedName, expectedTeacher: () => Promise.resolve(teacher) });
  for (const r of net.requests) if (!r.url.startsWith(SEARCH)) fail(`asked for ${r.url}`);
  if (result !== null && !(typeof result === "object" && /^\d+$/.test(result.lectureNo) && /^\d*$/.test(result.departmentNo))) {
    fail(`not a course: ${JSON.stringify(result)}`);
  }
  const problems = w.check();
  if (problems.length) fail(problems.join("\n"));
}
