// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The coverage of the extension's code (harness/coverage.mjs): each place of
// the code the harness runs stands for the place of the extension's code it
// came from, and what V8 counts of a run comes out at the extension's own
// functions and statements, of a vm context and of a window alike.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { countsIn, coverageOf, ownScripts } from "../harness/coverage.mjs";
import { EXT, ROOT } from "../harness/paths.mjs";
import { loadedSource, sourcePlaces } from "../harness/source.mjs";

test("each place of the code the harness runs stands for the place of the extension's code it came from", () => {
  for (const rel of ownScripts()) {
    const { code, runs, parts, place } = sourcePlaces(rel);
    assert.equal(runs, loadedSource(rel).code, `${rel}: the code the harness runs`);
    let made = 0;
    for (const p of parts) {
      if (p.kept) assert.equal(runs.slice(made, made + p.length), code.slice(p.from, p.to), `${rel}: the code kept at ${p.from}`);
      made += p.length;
    }
    assert.equal(made, runs.length, `${rel}: the length of the pieces`);
    // In order, from the start of the extension's code to its end.
    let last = 0;
    let disorder = null;
    for (let offset = 0; offset <= runs.length + 1; offset++) {
      const at = place(offset);
      if (at < last || at > code.length) disorder ??= offset;
      last = at;
    }
    assert.equal(disorder, null, `${rel}: the place of ${disorder}`);
    assert.equal(place(0), 0, rel);
    assert.equal(place(runs.length), code.length, rel);
  }
});

// The functions of `rel` that start on `line`, as a map of `map` counts them.
function callsAt(map, rel, line) {
  const fc = map.fileCoverageFor(path.join(EXT, rel));
  return Object.keys(fc.fnMap).filter((id) => fc.fnMap[id].decl.start.line === line).map((id) => fc.f[id]);
}

test("what V8 counts of a run comes out at the extension's own functions, in the background and in a window", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kulms-coverage-"));
  try {
    // A process of its own, as NODE_V8_COVERAGE is read when a process starts:
    // the background cleans two course names, and a tab of the LMS runs the
    // settings script, whose check that the extension is alive is called once.
    const harness = pathToFileURL(path.join(ROOT, "harness/index.mjs")).href;
    execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { Browser, openBackground, openTab } from ${JSON.stringify(harness)};
      const browser = new Browser();
      const bg = openBackground(browser);
      bg.global.cleanCourseName("[2026前期月１]線形代数");
      bg.global.cleanCourseName("線形代数");
      const tab = openTab(browser, { url: "https://lms.gakusei.kyoto-u.ac.jp/portal", scripts: ["src/settings.js"] });
      tab.window.__kulmsAlive();
      browser.close();
    `], { cwd: ROOT, env: { ...process.env, NODE_V8_COVERAGE: dir }, stdio: "pipe", timeout: 60_000 });
    const map = await coverageOf(countsIn(dir));
    const lineOf = (rel, text) => fs.readFileSync(path.join(EXT, rel), "utf8").split("\n").findIndex((l) => l.includes(text)) + 1;
    assert.deepEqual(callsAt(map, "background.js", lineOf("background.js", "function cleanCourseName(")), [2]);
    assert.deepEqual(callsAt(map, "background.js", lineOf("background.js", "function normalizeTeacherName(")), [0]);
    assert.ok(callsAt(map, "src/settings.js", lineOf("src/settings.js", "window.__kulmsAlive = function"))[0] >= 1);
    assert.deepEqual(callsAt(map, "src/settings.js", lineOf("src/settings.js", "window.__kulmsShowReloadBanner = function")), [0]);
    // The statement of the function, after the count the harness put in front
    // of it, is counted as often as the function.
    const background = map.fileCoverageFor(path.join(EXT, "background.js"));
    const returns = lineOf("background.js", "function cleanCourseName(") + 2;
    assert.deepEqual(Object.keys(background.statementMap).filter((id) => background.statementMap[id].start.line === returns).map((id) => background.s[id]), [2]);
    // A script no process ran is there, reached by nothing.
    const popup = map.fileCoverageFor(path.join(EXT, "popup.js")).toSummary();
    assert.equal(popup.statements.covered, 0);
    assert.ok(popup.statements.total > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a function that the extension injects into a page is counted for its own script, and nothing else of that script with it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kulms-coverage-"));
  try {
    // The popup scans the page of the active tab for a QR code: scanPageForQR()
    // of popup.js, which chrome.scripting compiles anew in the page
    // (injectedText() of harness/contexts.mjs).
    const harness = pathToFileURL(path.join(ROOT, "harness/index.mjs")).href;
    execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { Browser, idle, installCanvas, openBackground, openPopup, openTab } from ${JSON.stringify(harness)};
      const browser = new Browser();
      openBackground(browser);
      let sourceOf;
      openTab(browser, {
        url: "https://auth.iimc.kyoto-u.ac.jp/user/index.php?app=qrsecret",
        html: '<body><canvas width="20" height="20"></canvas></body>',
        scripts: [],
        prepare: (w) => {
          ({ sourceOf } = installCanvas(w, { pixelsOf: () => null, drawn: () => ({ data: new Uint8ClampedArray(20 * 20 * 4), foreign: false }) }));
        },
      });
      browser.standIns["vendor/jsqr.min.js"] = (w) => {
        w.jsQR = (data) => (sourceOf(data) ? { data: "otpauth://totp/KULMS?secret=JBSWY3DPEHPK3PXP" } : null);
      };
      const popup = openPopup(browser);
      await idle();
      popup.document.getElementById("totp-qr-btn").click();
      await idle();
      if (popup.document.getElementById("totp-input").value !== "JBSWY3DPEHPK3PXP") throw new Error("the scan did not read the secret");
      browser.close();
    `], { cwd: ROOT, env: { ...process.env, NODE_V8_COVERAGE: dir }, stdio: "pipe", timeout: 60_000 });
    const map = await coverageOf(countsIn(dir));
    const lineOf = (text) => fs.readFileSync(path.join(EXT, "popup.js"), "utf8").split("\n").findIndex((l) => l.includes(text)) + 1;
    assert.deepEqual(callsAt(map, "popup.js", lineOf("function scanPageForQR(")), [1]);
    assert.deepEqual(callsAt(map, "popup.js", lineOf("function tryDecodeImageData(")), [1]);
    assert.deepEqual(callsAt(map, "popup.js", lineOf("function extractSecret(")), [1]);
    // What the page compiled around the function is blank and counts nothing:
    // a function of the popup's that did not run is reached by nothing still.
    assert.deepEqual(callsAt(map, "popup.js", lineOf("function trySendRefresh(")), [0]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
