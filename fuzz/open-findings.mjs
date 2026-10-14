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
  "S9", // the regular expressions of course names, TOTP secrets and folders are quadratic
  "S10", // the extension puts in pages <script> and <style> with neither a nonce nor an integrity hash
  "S11", // the extension passes strings to sinks of Trusted Types (innerHTML, DOMParser, a script's src)
  "S12", // the extension reads responses that a redirect brought from where TLS does not vouch for them
  "B4", // tool-visibility.js reprocesses the sidebar every 200 ms for as long as the page is open
  "B10", // t() expands replacement patterns in what it puts in a placeholder
  "B12", // values the page writes to its Web Storage make the extension throw
  "B15", // t() looks a key up through the prototype: t("hasOwnProperty") is undefined
  "B16", // grading-ta.js throws URIError on a link with a malformed %-sequence
  "B17", // stored memos that are not a list, or hold a null, stop the drawing of the assignment panel
  "B18", // grading-ta.js throws on a submission whose status String() cannot convert
  "B19", // one malformed item of Sakai's answer takes out all of a course's assignments
  "B20", // one malformed page of pages.json ends the search for the site's contact
  "B21", // t() puts nothing in a placeholder whose value, given alone, is empty
  "B22", // the background cannot save a TOTP secret of more than about 125,000 bytes
  "B23", // a page's Web Storage that the page has filled stops the tool toggles, the sidebar's drag and the check of a submission
  "B24", // the page bridge throws on what the page's objects throw or JSON cannot hold, and hands on IDs, names and times that are not strings
  "B25", // a stored cache of assignments that is not shaped as the extension writes it stops the popup
  "B26", // a row of a list of submissions with no cell at the column of the submission time stops the reading of the list
  "P2", // expandAllFolders() asks again for a folder the server shows still closed, up to 30 times, and goes through the whole listing each time
  "P6", // the background builds its Shift_JIS table on its first search, about 156,000 steps
  "P7", // the page bridge loops to an array-like's length, not to what it holds
  "P8", // the popup decodes the TOTP secret and makes its HMAC key anew every second the code is shown
]);
for (const id of (process.env.KULMS_FUZZ_LOOK_FOR || "").split(",")) OPEN.delete(id.trim());

export const open = (id) => OPEN.has(id);
