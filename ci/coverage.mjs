// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
//   node ci/coverage.mjs <out> <part>=<dir>...
//
// Says what the V8 counts in the <dir>s reach of the extension's own code,
// between them and part by part (harness/coverage.mjs), and writes it to
// <out>. Each <dir> is what one part of a run left with NODE_V8_COVERAGE set:
// "tests" for the tests, "fuzz:<target>" for the replay of a target's corpus
// (ci/coverage.sh).
//
// What it says, in this order: what all of it reaches; each script, with what
// the tests, the fuzz corpus and both reach of it, the least reached first;
// what each part reaches; the scripts nothing reaches; and, script by
// script, the functions nothing reaches. What to aim the next test or fuzz
// target at is meant to be read off the last of those. <out>/report.txt holds
// it, and the run's summary on GitHub too (GITHUB_STEP_SUMMARY).
//
// <out>/html/ is the page that shows every script line by line, and
// <out>/lcov.info and <out>/coverage-final.json are the same for other tools.
import fs from "node:fs";
import path from "node:path";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";
import { countsIn, coverageOf, inExtension, mergedCounts, ownScripts } from "../harness/coverage.mjs";

const [out, ...given] = process.argv.slice(2);
if (!out || given.length === 0 || given.some((g) => !/^[^=]+=./.test(g))) {
  console.error("usage: node ci/coverage.mjs <out> <part>=<dir>...");
  process.exit(2);
}
const parts = given.map((g) => {
  const at = g.indexOf("=");
  return { name: g.slice(0, at), counts: countsIn(g.slice(at + 1)) };
});
const tests = parts.filter((p) => p.name === "tests");
const fuzz = parts.filter((p) => p.name.startsWith("fuzz:"));

const all = await coverageOf(mergedCounts(parts.map((p) => p.counts)));
const byTests = tests.length ? await coverageOf(mergedCounts(tests.map((p) => p.counts))) : null;
const byFuzz = fuzz.length ? await coverageOf(mergedCounts(fuzz.map((p) => p.counts))) : null;

const percent = (s) => (s.total === 0 ? "—" : `${s.pct.toFixed(1)}%`);
const fraction = (s) => `${percent(s)} (${s.covered}/${s.total})`;
const summaryOf = (map, rel) => map.fileCoverageFor(map.files().find((f) => inExtension(f) === rel)).toSummary();
const lines = [];
const say = (line = "") => lines.push(line);

const total = all.getCoverageSummary();
say(`== what ${[tests.length && "the tests", fuzz.length && "the fuzz corpus"].filter(Boolean).join(" and ")} reach of the extension's own code (${ownScripts().length} scripts)`);
say(`   statements ${fraction(total.statements)}, branches ${fraction(total.branches)}, functions ${fraction(total.functions)}, lines ${fraction(total.lines)}`);

say();
say("== script by script, the least reached first: statements reached by the tests, by the fuzz corpus, by both; then branches and functions reached by both");
const rows = ownScripts().map((rel) => ({ rel, both: summaryOf(all, rel) }))
  .sort((a, b) => a.both.statements.pct - b.both.statements.pct || a.rel.localeCompare(b.rel));
const width = Math.max(...rows.map((r) => r.rel.length));
say(`   ${"script".padEnd(width)}  ${"tests".padStart(6)}  ${"fuzz".padStart(6)}  ${"both".padStart(6)}  ${"branches".padStart(8)}  ${"functions".padStart(9)}`);
for (const { rel, both } of rows) {
  const t = byTests ? percent(summaryOf(byTests, rel).statements) : "—";
  const f = byFuzz ? percent(summaryOf(byFuzz, rel).statements) : "—";
  say(`   ${rel.padEnd(width)}  ${t.padStart(6)}  ${f.padStart(6)}  ${percent(both.statements).padStart(6)}  ${percent(both.branches).padStart(8)}  ${percent(both.functions).padStart(9)}`);
}

say();
say("== what each part reaches: statements, branches, functions");
const partLine = (name, s) => say(`   ${name.padEnd(width)}  ${percent(s.statements).padStart(6)}  ${percent(s.branches).padStart(6)}  ${percent(s.functions).padStart(6)}`);
if (byTests) partLine("the tests", byTests.getCoverageSummary());
if (byFuzz) {
  partLine("the fuzz corpus", byFuzz.getCoverageSummary());
  for (const p of fuzz) partLine(`  ${p.name.slice("fuzz:".length)}`, (await coverageOf(p.counts)).getCoverageSummary());
}

say();
say("== reached by nothing at all");
const none = rows.filter((r) => r.both.statements.covered === 0);
for (const { rel } of none) say(`   ${rel}`);
if (none.length === 0) say("   (none)");

say();
say("== functions reached by nothing, script by script (all of them on the page)");
const SHOWN = 12;
for (const { rel } of rows) {
  const fc = all.fileCoverageFor(all.files().find((f) => inExtension(f) === rel));
  const missed = Object.keys(fc.fnMap).filter((id) => fc.f[id] === 0)
    .map((id) => fc.fnMap[id])
    .sort((a, b) => a.decl.start.line - b.decl.start.line)
    .map((fn) => `L${fn.decl.start.line} ${/^\(anonymous_\d+\)$/.test(fn.name) ? "(anonymous)" : fn.name}`);
  if (missed.length === 0) continue;
  say(`   ${rel}, ${missed.length} of ${Object.keys(fc.fnMap).length}:`);
  say(`     ${missed.slice(0, SHOWN).join(", ")}${missed.length > SHOWN ? `, and ${missed.length - SHOWN} more` : ""}`);
}

fs.mkdirSync(out, { recursive: true });
const context = libReport.createContext({ dir: out, coverageMap: all });
reports.create("html", { subdir: "html" }).execute(context);
reports.create("lcovonly", { file: "lcov.info" }).execute(context);
reports.create("json", { file: "coverage-final.json" }).execute(context);
say();
say(`== the page: ${path.join(out, "html", "index.html")}`);

const report = lines.join("\n") + "\n";
fs.writeFileSync(path.join(out, "report.txt"), report);
process.stdout.write(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### What the tests and the fuzz corpus reach of the extension's own code\n\n```\n" + report + "```\n");
}
