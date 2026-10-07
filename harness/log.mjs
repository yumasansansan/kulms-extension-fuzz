// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The logs the harness keeps of what the extension does: what it wrote to the
// console, what it fetched, the messages that crossed between its contexts.
// A log keeps every entry. A fuzz target runs millions of inputs in one
// browser, and a log that kept every input's entries would fill the memory
// (the daily fuzzing of syllabus-search once ran out of its 4 GB so), so a
// target forgets them as each input begins (Browser.forget(), Net.forget()):
// a log then holds what one input did, which its work bounds.
export function record(log, entry) {
  log.push(entry);
}
