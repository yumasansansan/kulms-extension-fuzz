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
// outside the LMS, or when a detector of the harness sees something. The
// function catches what it throws and returns null.
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
import { answer, brief, bytes, calibrate, fail, jsonText, judge, ladder, open, provider, string, value, warnings } from "../lib.mjs";

const LMS = "https://lms.gakusei.kyoto-u.ac.jp";
let pages = {};
let page = {};
const net = new Net()
  .on(`${LMS}/direct/site/`, () => pages)
  .on(`${LMS}/portal/tool/`, () => page);
const browser = new Browser();
const bg = openBackground(browser, { net });

// What the input gives the target, as fuzz/lib.mjs reads it (fuzz/inputs.mjs
// checks its seeds and known inputs against this).
export function read(fdp) {
  const siteId = string(fdp);
  const tools = fdp.consumeBoolean() ? value(fdp) : [{ tools: [{ toolId: fdp.consumeBoolean() ? "sakai.siteinfo" : value(fdp), placementId: fdp.consumeBoolean() ? string(fdp) : value(fdp) }] }];
  return { siteId, pages: answer(fdp, jsonText(fdp, tools), "application/json"), page: answer(fdp, bytes(fdp), "text/html") };
}

async function run(data) {
  browser.forget();
  net.forget();
  const input = read(provider(data));
  ({ pages, page } = input);
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
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run);
}

await calibrate(fuzz);
