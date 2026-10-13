// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// What a run reaches of the extension's own code: the coverage of the tests
// and of the fuzz corpus (ci/coverage.sh).
//
// V8 counts it, not an instrumentation of ours: a process started with
// NODE_V8_COVERAGE set writes, as it ends, how often each function and each
// block of every script it ran was entered, the scripts of vm contexts and
// jsdom windows among them. The harness runs the extension's code rewritten
// (harness/source.mjs), which V8 counts as the files of the harness's cache,
// so the counts are first moved to the places of the extension's own code
// they stand for (sourcePlaces()). What the harness put in drops out there:
// its ranges come out empty, and the getters and setters it adds are
// functions with no code of the extension. The counts of every process are
// then merged script by script, and ast-v8-to-istanbul reads them against
// the syntax tree of the extension's code, as statements, branches and
// functions in the way istanbul-lib-instrument counts them, so that the
// reports of istanbul read them.
//
// The extension's own code is what it ships and wrote itself: the scripts
// manifest.json and the popup's page load, but not the libraries it bundles
// (vendor/). A script of it that no process ran counts as reached by nothing.
//
// V8 counts a block as run to its end once it is entered: code after a call
// that threw counts as run (the limitations of ast-v8-to-istanbul). And the
// counts are of the code as the harness wrote it: a process under Jazzer.js
// runs that code instrumented, and its counts cannot be read so.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as acorn from "acorn";
import { mergeScriptCovs } from "@bcoe/v8-coverage";
import convert from "ast-v8-to-istanbul";
import libCoverage from "istanbul-lib-coverage";
import { JSDOM } from "jsdom";
import { CACHE, EXT, manifest, read } from "./paths.mjs";
import { sourcePlaces } from "./source.mjs";

// The extension's own scripts, as paths in it.
export function ownScripts() {
  const scripts = new Set();
  if (manifest.background && manifest.background.service_worker) scripts.add(manifest.background.service_worker);
  for (const cs of manifest.content_scripts || []) for (const js of cs.js || []) scripts.add(js);
  for (const r of manifest.web_accessible_resources || []) {
    for (const resource of r.resources) if (resource.endsWith(".js") && !resource.includes("*")) scripts.add(resource);
  }
  const popup = manifest.action && manifest.action.default_popup;
  if (popup) {
    const page = new JSDOM(read(popup)).window.document;
    for (const s of page.querySelectorAll("script[src]")) scripts.add(path.posix.join(path.posix.dirname(popup), s.getAttribute("src")));
  }
  return [...scripts].filter((s) => !s.startsWith("vendor/")).sort();
}

// The script of the extension, among `own`, that V8 counted at `url`, if it is
// one: a script the harness wrote to its cache and ran. A vm context names a
// script by its path, a window by its file: URL.
function scriptAt(url, own) {
  let file;
  try {
    file = url.startsWith("file:") ? fileURLToPath(url) : url;
  } catch {
    return null;
  }
  if (!path.isAbsolute(file)) return null;
  const rel = path.relative(path.join(CACHE, "scripts"), file).split(path.sep).join("/");
  return own.has(rel) ? rel : null;
}

// V8's counts of the code the harness runs for a script (`script`) at the
// places of the extension's code they stand for (`places`, sourcePlaces()),
// under `url`. A range that comes out empty holds only what the harness put
// in and is left out, and so is a function whose own range does. Where an
// inner range comes out as the range around it, its count is the one of that
// code: what lay between them was put in.
function placed(script, places, url) {
  const functions = [];
  for (const fn of script.functions) {
    const ranges = [];
    for (const r of fn.ranges) {
      const startOffset = places.place(r.startOffset);
      const endOffset = places.place(r.endOffset);
      if (startOffset >= endOffset) {
        if (ranges.length === 0) break;
        continue;
      }
      const last = ranges[ranges.length - 1];
      if (last && last.startOffset === startOffset && last.endOffset === endOffset) {
        if (ranges.length > 1) last.count = r.count;
        continue;
      }
      ranges.push({ startOffset, endOffset, count: r.count });
    }
    if (ranges.length > 0) functions.push({ functionName: fn.functionName, ranges, isBlockCoverage: fn.isBlockCoverage });
  }
  return { scriptId: "0", url, functions };
}

// The V8 counts NODE_V8_COVERAGE left in `dir`, of the extension's own code:
// for each of its scripts that a process ran, the counts of all of them
// merged, at the places of its own code. A process names a script once,
// however many contexts ran it.
export function countsIn(dir) {
  const own = new Set(ownScripts());
  const byScript = new Map();
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const { result } = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const script of result) {
      const rel = scriptAt(script.url, own);
      if (!rel) continue;
      if (!byScript.has(rel)) byScript.set(rel, []);
      byScript.get(rel).push(script);
    }
  }
  const counts = new Map();
  for (const [rel, scripts] of byScript) {
    const places = sourcePlaces(rel);
    // The cache holds the code of the last run: other code than the harness
    // makes now means counts of a harness or an extension since changed.
    const cached = path.join(CACHE, "scripts", rel);
    if (fs.existsSync(cached) && fs.readFileSync(cached, "utf8") !== places.runs) {
      throw new Error(`${rel}: the counts in ${dir} are of other code than the harness runs now; count again`);
    }
    const url = pathToFileURL(path.join(EXT, rel)).href;
    counts.set(rel, mergeScriptCovs(scripts.map((s) => placed(s, places, url))));
  }
  return counts;
}

// The counts of several runs (countsIn()) together.
export function mergedCounts(list) {
  const counts = new Map();
  for (const one of list) {
    for (const [rel, script] of one) counts.set(rel, counts.has(rel) ? mergeScriptCovs([counts.get(rel), script]) : script);
  }
  return counts;
}

// What `counts` (countsIn()) reach of the extension's own code, as an
// istanbul coverage map of every script of it, a script no process ran
// reached by nothing.
export async function coverageOf(counts) {
  const map = libCoverage.createCoverageMap({});
  for (const rel of ownScripts()) {
    const code = read(rel);
    const url = pathToFileURL(path.join(EXT, rel)).href;
    const coverage = counts.get(rel) ||
      { url, functions: [{ functionName: "", ranges: [{ startOffset: 0, endOffset: code.length, count: 0 }], isBlockCoverage: true }] };
    const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script", locations: true });
    map.merge(await convert({ code, ast, coverage, wrapperLength: 0 }));
  }
  return map;
}

// The path of a file of the coverage map in the extension, as the reports
// name it.
export const inExtension = (file) => path.relative(EXT, file).split(path.sep).join("/");
