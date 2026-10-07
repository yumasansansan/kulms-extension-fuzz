// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The findings of docs/findings.md that the extension at the submodule's
// commit still has, and that a fuzz target would otherwise stop on at once.
// A target that knows of one keeps away from what sets it off (each says
// how, in a comment marked "Known:" at the place), so that the fuzzing goes on
// to what is not known yet. When the submodule moves to a commit that fixes
// one, it comes off this list, and the targets look for it again: the fuzzing
// then checks the fix. fuzz/README.md lists where each is kept away from.
//
// KULMS_FUZZ_LOOK_FOR names findings (joined by commas) that the targets look
// for in this run all the same: to find an input of fuzz/known/ again when a
// target comes to read its bytes another way, or to fuzz an extension that
// fixes them (KULMS_EXTENSION_DIR, harness/paths.mjs).
export const OPEN = new Set([
  "S1", // the plaintext TOTP secret reaches content scripts
  "S2", // the site contact regex is cubic
  "S6", // the popup saves secrets no code can be made from
  "S7", // the message listeners throw on messages that are not objects
  "S8", // the syllabus parser's regular expressions are quadratic
  "B10", // t() expands replacement patterns in what it puts in a placeholder
  "B15", // t() looks a key up through the prototype: t("hasOwnProperty") is undefined
  "B16", // grading-ta.js throws URIError on a link with a malformed %-sequence
  "B17", // a stored memo that is null stops the drawing of the assignment panel
  "B18", // grading-ta.js throws on a submission whose status String() cannot convert
  "B19", // one malformed item of Sakai's answer takes out all of a course's assignments
  "B20", // one malformed page of pages.json ends the search for the site's contact
  "B21", // t() puts nothing in a placeholder whose value, given alone, is empty
]);
for (const id of (process.env.KULMS_FUZZ_LOOK_FOR || "").split(",")) OPEN.delete(id.trim());

export const open = (id) => OPEN.has(id);
