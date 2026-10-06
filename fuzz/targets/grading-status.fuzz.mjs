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
// students' own names beside it), from the grader's list of submissions, and
// from the link to a submission. The input is a status text, a link and the
// fields of a submission as the grader holds them.
//
// It fails when one of these throws, gives a kind it does not know, takes
// off its status icon only part of the way (taking it off twice gives more),
// or reads a link into what is not a string, or when a detector of the harness
// sees something. While B16 is open (fuzz/open-findings.mjs), a link with a
// malformed %-sequence, which B16 is known to throw on, is not read.
import { Browser, openTab, settle, watch } from "../../harness/index.mjs";
import { FuzzedDataProvider, fail, jsonValue, open, string } from "../lib.mjs";

const tab = openTab(new Browser(), { url: "https://lms.gakusei.kyoto-u.ac.jp/portal/site/S/tool/T", scripts: ["src/settings.js", "src/grading-ta.js"] });
await settle(100);
const g = tab.internals["src/grading-ta.js"];
const KINDS = new Set(["pendingGrade", "inProgress", "notSubmitted", "graded", "returned", "unknown"]);
const ICONS = ["🟡", "🟠", "⚪", "🟨", "✅", " ", "", "\u200b"];
const STATUS = ["未採点 - 提出済み", "未採点 - 取組中", "未提出", "採点済み", "返却済み", "再提出済み", "Ungraded - Submitted", "Awaiting Grade", "No Submission", "Honor Pledge Accepted", "Returned", "Graded"];

export function fuzz(data) {
  const fdp = new FuzzedDataProvider(data);
  const status = fdp.pickValue(ICONS) + fdp.pickValue(ICONS) + (fdp.consumeBoolean() ? fdp.pickValue(STATUS) : "") + string(fdp, 40);
  const href = (fdp.consumeBoolean() ? "?assignmentId=/assignment/a/" : "") + string(fdp, 40) + (fdp.consumeBoolean() ? "&submissionId=/assignment/s/" : "") + string(fdp, 40);
  const submission = { status: fdp.consumeBoolean() ? status : jsonValue(fdp) };
  for (const k of ["draft", "hasHistory", "submitted", "returned", "graded", "grade", "submittedTime"]) if (fdp.consumeBoolean()) submission[k] = jsonValue(fdp);
  const w = watch(tab);
  const kind = g.classifyStatus(status);
  if (!KINDS.has(kind)) fail(`classifyStatus(${JSON.stringify(status)}) = ${kind}`);
  const stripped = g.stripStatusIcon(status);
  if (g.stripStatusIcon(stripped) !== stripped) fail(`stripStatusIcon(${JSON.stringify(status)}) left an icon: ${JSON.stringify(stripped)}`);
  const malformed = (() => { try { decodeURIComponent(href); return false; } catch { return true; } })();
  if (!(open("B16") && malformed)) {
    const ids = g.parseGradeLinkIds(href);
    for (const k of ["siteId", "assignmentId", "submissionId"]) if (typeof ids[k] !== "string") fail(`parseGradeLinkIds(${JSON.stringify(href)}).${k} = ${ids[k]}`);
  }
  const fromGrader = g.classifySubmission(submission);
  if (!KINDS.has(fromGrader)) fail(`classifySubmission(${JSON.stringify(submission)}) = ${fromGrader}`);
  const problems = w.check();
  if (problems.length) fail(problems.join("\n"));
}
