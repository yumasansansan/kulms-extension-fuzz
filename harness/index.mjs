// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The harness: the extension's scripts run in a browser made for tests and
// fuzzing. See each module for what it does.
export { Browser, EXTENSION_ID, matchesPattern } from "./chrome.mjs";
export { Net } from "./net.mjs";
export { Clock } from "./clock.mjs";
export { installCanvas } from "./canvas.mjs";
export { openBackground, openBareTab, openTab, openPopup, contentScriptsFor, until } from "./contexts.mjs";
export { watch, assertClean } from "./detectors.mjs";
export { exposeInternals, instrument, loadedFile, loadedSource } from "./source.mjs";
export { LINEAR, aside, allow, degree, idle, measure, uncounted, work } from "./work.mjs";
export { EXT, ROOT, manifest, read } from "./paths.mjs";
