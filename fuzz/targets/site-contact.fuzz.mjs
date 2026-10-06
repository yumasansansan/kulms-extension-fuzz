// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// background.js's fetchSakaiSiteContact(), which reads the name of a course's
// contact out of its Site Info page on the LMS, to tell apart courses of the
// same name in the syllabus. The input is the page, as UTF-8; the site's
// maintainers write what the page shows.
//
// It fails when the function throws or returns what is not a name (null, or a
// trimmed string that is not empty and has no < or >), or when a detector of
// the harness sees something. An input that takes longer than the fuzzer's
// --timeout is a regular expression that backtracks.
//
// While S2 is open (fuzz/open-findings.mjs) the page is cut at 512 bytes, where
// the cubic regex still answers within milliseconds, so the fuzzing goes past
// what is known to what is not.
import { Browser, Net, openBackground, watch } from "../../harness/index.mjs";
import { fail, open } from "../lib.mjs";

const LMS = "https://lms.gakusei.kyoto-u.ac.jp";
let page = new Uint8Array();
const net = new Net()
  .on(`${LMS}/direct/site/`, { headers: { "content-type": "application/json" }, body: JSON.stringify([{ tools: [{ toolId: "sakai.siteinfo", placementId: "p" }] }]) })
  .on(`${LMS}/portal/tool/p`, () => ({ headers: { "content-type": "text/html; charset=utf-8" }, body: page }));
const bg = openBackground(new Browser(), { net });

export async function fuzz(data) {
  page = open("S2") ? data.subarray(0, 512) : data;
  const w = watch(bg);
  const name = await bg.global.fetchSakaiSiteContact("site");
  if (name !== null && (typeof name !== "string" || name === "" || name !== name.trim() || /[<>]/.test(name))) {
    fail(`not a name: ${JSON.stringify(name)}`);
  }
  const problems = w.check();
  if (problems.length) fail(problems.join("\n"));
}
