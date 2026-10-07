// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// background.js's fetchSakaiSiteContact(siteId), which reads pages.json of a
// site, then its Site Info page, and takes from it the name of the course's
// contact, to tell apart courses of the same name in the syllabus. The input
// gives the site's ID (any string: a content script's message carries it),
// the answer to pages.json (JSON text of any value, mostly shaped like
// Sakai's), and the page (any bytes: the site's maintainers write what it
// shows), each answered by the network as the input says (fuzz/lib.mjs).
//
// It fails when the function throws or returns what is not a name (null, or a
// trimmed string that is not empty and has no < or >), when it asks for a URL
// outside the LMS, or when a detector of the harness sees something. An input
// that takes longer than the fuzzer's --timeout is a regular expression that
// backtracks. The function catches what it throws and returns null.
//
// The extension catches its own errors in many places and only warns; the
// target fails too on a warning or an error that tells of a slip of the code
// (warnings() of fuzz/lib.mjs), not on an HTTP error, a network that fails
// or an answer that is not JSON, which the catching is there for.
import { Browser, Net, openBackground, watch } from "../../harness/index.mjs";
import { FuzzedDataProvider, answer, brief, bytes, fail, jsonText, open, string, value, warnings } from "../lib.mjs";

const LMS = "https://lms.gakusei.kyoto-u.ac.jp";
let pages = {};
let page = {};
const net = new Net()
  .on(`${LMS}/direct/site/`, () => pages)
  .on(`${LMS}/portal/tool/`, () => page);
const bg = openBackground(new Browser(), { net });

// What the input gives the target, as fuzz/lib.mjs reads it (fuzz/inputs.mjs
// checks its seeds and known inputs against this).
export function read(fdp) {
  const siteId = string(fdp);
  const tools = fdp.consumeBoolean() ? value(fdp) : [{ tools: [{ toolId: fdp.consumeBoolean() ? "sakai.siteinfo" : value(fdp), placementId: fdp.consumeBoolean() ? string(fdp) : value(fdp) }] }];
  return { siteId, pages: answer(fdp, jsonText(fdp, tools), "application/json"), page: answer(fdp, bytes(fdp), "text/html") };
}

export async function fuzz(data) {
  const input = read(new FuzzedDataProvider(data));
  ({ pages, page } = input);
  // Known: S2 (docs/findings.md). While it is open, the page is cut at 512
  // bytes, where the cubic regex still answers within milliseconds, so that
  // the fuzzing goes on to what is not known yet.
  if (open("S2") && page.body) page = { ...page, body: page.body.subarray(0, 512) };
  net.requests.length = 0;
  const w = watch(bg);
  const log = warnings(bg);
  const name = await bg.global.fetchSakaiSiteContact(input.siteId);
  for (const line of log.slips()) {
    // Known: B20. While it is open, a slip that the function catches is not
    // counted: one page of pages.json that is not an object ends the search
    // for the Site Info tool, as the finding says.
    if (open("B20") && line.startsWith("[KULMS] fetchSakaiSiteContact error:")) continue;
    fail(`a slip of the code: ${line}`);
  }
  for (const r of net.requests) if (!r.url.startsWith(`${LMS}/`)) fail(`asked for ${r.url}`);
  if (name !== null && (typeof name !== "string" || name === "" || name !== name.trim() || /[<>]/.test(name))) {
    fail(`not a name: ${brief(name)}`);
  }
  const problems = w.check();
  if (problems.length) fail(problems.join("\n"));
}
