// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The TA's grading support (grading-ta.js): how it reads the status of a
// submission from the text Sakai shows (the page, in Japanese or English, and
// students' own names beside it), the IDs from the link to a submission, and
// the list of submissions that the bridge in the page's world sends. The
// input gives a status text and a link (any strings, fuzz/lib.mjs), and what
// a script of the page answers in place of the bridge: the detail of the
// event, which may be any string (JSON text or not) or any value (through a
// structured clone, as between the worlds).
//
// It fails when one of these throws, gives a kind it does not know, takes off
// its status icon only part of the way (taking it off twice gives more), reads
// a link into what is not a string, or reads the submissions into an entry
// that is not one (a string name, status and time, a kind it knows), or when
// a detector of the harness sees something.
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
import { Browser, idle, openTab, watch } from "../../harness/index.mjs";
import { brief, calibrate, clone, fail, jsonText, judge, ladder, open, provider, string, value, warnings } from "../lib.mjs";

const browser = new Browser();
const tab = openTab(browser, { url: "https://lms.gakusei.kyoto-u.ac.jp/portal/site/S/tool/T", scripts: ["src/settings.js", "src/grading-ta.js"] });
await idle();
const g = tab.internals["src/grading-ta.js"];
const w = tab.window;
const KINDS = new Set(["pendingGrade", "inProgress", "notSubmitted", "graded", "returned", "unknown"]);
const ICONS = ["🟡", "🟠", "⚪", "🟨", "✅", " ", "", "\u200b"];
const STATUS = ["未採点 - 提出済み", "未採点 - 取組中", "未提出", "採点済み", "返却済み", "再提出済み", "Ungraded - Submitted", "Awaiting Grade", "No Submission", "Honor Pledge Accepted", "Returned", "Graded"];

// jsdom loads no bridge, so the bridge is taken as ready; a script of the page
// answers each request first, with the detail the input gives (where it says
// @REQUEST@, the request's ID, which the page can read), as one can in Sakai.
// The bridge answers after it with no submissions, as it would: an answer the
// extension does not take then ends its wait at once, not after 300 ms.
g.pageBridgePromise = w.Promise.resolve();
let detail = null;
w.addEventListener("kulms-ta-get-submissions", (event) => {
  let requestId = null;
  try { requestId = JSON.parse(event.detail).requestId; } catch { /* not the extension's */ }
  let forged = detail;
  if (typeof forged === "string") forged = forged.replaceAll("@REQUEST@", requestId);
  else if (forged && typeof forged === "object" && forged.requestId === "@REQUEST@") forged.requestId = requestId;
  w.dispatchEvent(new w.CustomEvent("kulms-ta-submissions", { detail: forged }));
  w.dispatchEvent(new w.CustomEvent("kulms-ta-submissions", { detail: JSON.stringify({ requestId, submissions: [] }) }));
});

// A submission shaped like the bridge's, any of its fields any value.
function submission(fdp, status) {
  const s = { id: fdp.consumeBoolean() ? string(fdp) : value(fdp), status: fdp.consumeBoolean() ? status : value(fdp) };
  for (const k of ["firstSubmitterName", "submittedTime", "draft", "hasHistory", "submitted", "returned", "graded", "grade"]) {
    if (fdp.consumeBoolean()) s[k] = value(fdp);
  }
  return s;
}

// As many submissions shaped like the bridge's as the input has bytes for.
function submissions(fdp, status) {
  const out = [];
  for (let n = fdp.consumeIntegralInRange(0, fdp.remainingBytes); n > 0 && fdp.remainingBytes > 0; n--) out.push(submission(fdp, status));
  return out;
}

// Known: B18 (docs/findings.md). Whether v holds, at any depth, an object with
// a toString or valueOf of its own, which String() cannot convert when it is
// not a function.
// (A stack of its own rather than recursion: a value can nest as deep as the
// input says.)
function hasOwnConversion(root) {
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== "object" || seen.has(v)) continue;
    seen.add(v);
    if (Object.hasOwn(v, "toString") || Object.hasOwn(v, "valueOf")) return true;
    for (const x of Object.values(v)) stack.push(x);
  }
  return false;
}

async function run(data) {
  await check(data);
  judge();
}

async function check(data) {
  browser.forget();
  const fdp = provider(data);
  const status = fdp.pickValue(ICONS) + fdp.pickValue(ICONS) + (fdp.consumeBoolean() ? fdp.pickValue(STATUS) : "") + string(fdp);
  const href = (fdp.consumeBoolean() ? "?assignmentId=/assignment/a/" : "") + string(fdp) + (fdp.consumeBoolean() ? "&submissionId=/assignment/s/" : "") + string(fdp);
  const payload = { requestId: "@REQUEST@", submissions: fdp.consumeBoolean() ? value(fdp) : submissions(fdp, status) };
  switch (fdp.consumeIntegralInRange(0, 2)) {
    case 0: detail = jsonText(fdp, payload); break;
    case 1: detail = string(fdp); break;
    default: {
      const sent = clone(payload);
      if (!sent.sendable) return; // a value no structured clone carries cannot be sent between the worlds
      detail = sent.value;
    }
  }

  const watcher = watch(tab);
  const log = warnings(tab);
  const kind = g.classifyStatus(status);
  if (!KINDS.has(kind)) fail(`classifyStatus(${brief(status)}) = ${brief(kind)}`);
  const stripped = g.stripStatusIcon(status);
  if (g.stripStatusIcon(stripped) !== stripped) fail(`stripStatusIcon(${brief(status)}) left an icon: ${brief(stripped)}`);

  const malformed = (() => { try { decodeURIComponent(href); return false; } catch { return true; } })();
  // Known: B16. While it is open, a link with a malformed %-sequence, which it
  // throws URIError on, is not read.
  if (!(open("B16") && malformed)) {
    const ids = g.parseGradeLinkIds(href);
    for (const k of ["siteId", "assignmentId", "submissionId"]) if (typeof ids[k] !== "string") fail(`parseGradeLinkIds(${brief(href)}).${k} = ${brief(ids[k])}`);
  }

  // Known: B18. While it is open, the submissions are taken as they come, so an
  // answer that holds a value String() cannot convert, which it throws
  // TypeError on, is not read, and the entries are not held to string fields
  // (a number in place of a status comes through as it is).
  const parsedDetail = typeof detail === "string" ? (() => { try { return JSON.parse(detail); } catch { return null; } })() : detail;
  if (!(open("B18") && hasOwnConversion(parsedDetail))) {
    const map = g.parseGraderSubmissions(await g.requestPageSubmissions());
    for (const [id, entry] of Object.entries(map || {})) {
      if (open("B18")) break;
      if (typeof entry.name !== "string" || typeof entry.status !== "string" || typeof entry.submitTime !== "string" || !KINDS.has(entry.kind)) {
        fail(`submission ${brief(id)} read as ${brief(entry)}`);
      }
    }
  }
  for (const line of log.slips()) fail(`a slip of the code: ${line}`);
  const problems = watcher.check();
  if (problems.length) fail(problems.join("\n"));
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run);
}

await calibrate(fuzz);
