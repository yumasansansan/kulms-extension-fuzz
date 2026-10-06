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
// how), so that the fuzzing goes on to what is not known yet. When the
// submodule moves to a commit that fixes one, it comes off this list, and the
// targets look for it again: the fuzzing then checks the fix.
export const OPEN = new Set([
  "S1", // the plaintext TOTP secret reaches content scripts
  "S2", // the site contact regex is cubic
  "S6", // the popup saves secrets no code can be made from
  "S7", // the message listeners throw on messages that are not objects
  "B10", // t() expands replacement patterns in what it puts in a placeholder
  "B15", // t() looks a key up through the prototype: t("hasOwnProperty") is undefined
  "B16", // grading-ta.js throws URIError on a link with a malformed %-sequence
  "B17", // a stored memo that is null stops the drawing of the assignment panel
  "B18", // grading-ta.js throws on a submission whose status String() cannot convert
]);

export const open = (id) => OPEN.has(id);
