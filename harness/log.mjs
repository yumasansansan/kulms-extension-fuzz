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
// A fuzz target runs millions of inputs in one browser, and a log that kept
// every entry would fill the memory: the daily fuzzing of syllabus-search ran
// out of its 4 GB so, at about 1 KB an input. A log keeps its last LOG_LIMIT
// entries or more; it is cut back to LOG_LIMIT whenever it holds twice as
// many, which costs little more than the push itself. A test reads far fewer.
export const LOG_LIMIT = 1000;

export function record(log, entry) {
  log.push(entry);
  if (log.length > 2 * LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
}
