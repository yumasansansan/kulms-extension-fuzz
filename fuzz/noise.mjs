// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
//   node fuzz/noise.mjs [--jazzer] [--times <n>]
//
// Measures the noise of the clock on this machine, which NOISE and
// TIME_FLOOR of fuzz/lib.mjs are set from. The seeds that climb rungs
// (fuzz/inputs.mjs, those with doublings), their tops put as high as their
// repeats let a rung go (MAX_UNITS), are run on their targets <n> times each
// (3 by default) with the time unchecked, each rung written out
// (KULMS_FUZZ_RUNGS). For rungs a, b, c, each TIME_SPAN doublings up from the
// one before, it reports how much the degree of the time's growth from b to c
// passed the degree of the work's: the most of it among the spans that added
// at least 0.03, 0.1, 0.3 and 1 seconds from a to b. Work the counting does
// not see and that grows as the square passes it by 1; NOISE must stay well
// above what the noise of the clock reaches over spans of TIME_FLOOR seconds
// or more.
//
// With --jazzer, the targets run under Jazzer.js as ci/fuzz.sh runs them, its
// instrumentation included, which takes time of its own. A machine that is
// not as it is when it fuzzes (on a battery, under another power plan, busy
// with other work) measures noise of its own.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "./encode.mjs";
import { INPUTS } from "./inputs.mjs";
import { TIME_SPAN } from "./lib.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Jazzer.js's command, which `pnpm exec jazzer` runs, run with this Node.
const JAZZER = path.join(path.dirname(createRequire(import.meta.url).resolve("@jazzer.js/core/package.json")), "dist", "cli.js");
const args = process.argv.slice(2);
const jazzer = args.includes("--jazzer");
const times = args.includes("--times") ? Number(args[args.indexOf("--times") + 1]) : 3;

// A seed that climbs, its top as many doublings up as its repeats fit on the
// top rung (encode() finds no length for a plan whose repeats do not fit).
function highest(entry) {
  for (let d = 23; d > entry.doublings; d--) {
    try {
      return { d, data: encode(entry.plan, { doublings: d }) };
    } catch { /* too high for its repeats */ }
  }
  return { d: entry.doublings, data: encode(entry.plan, { doublings: entry.doublings }) };
}

// The rungs that the lines of KULMS_FUZZ_RUNGS tell of, input by input: those
// that climbed high enough for a span below a span.
function rungsIn(text) {
  const inputs = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^rung ×(\d+): (\d+) units, ([\d.e+]+) steps, ([\d.]+) s$/.exec(line);
    if (!m) continue;
    const rung = { m: Number(m[1]), units: Number(m[2]), work: Number(m[3]), time: Number(m[4]) };
    if (rung.m === 1) inputs.push((current = []));
    current.push(rung);
  }
  return inputs.filter((rungs) => rungs.length > 2 * TIME_SPAN);
}

const env = { ...process.env, KULMS_FUZZ_NOISE: "Infinity", KULMS_FUZZ_RUNGS: "1" };
const options = { cwd: ROOT, env, encoding: "utf8", maxBuffer: 1 << 28 };
const measured = [];
for (const entry of INPUTS.filter((i) => i.doublings)) {
  const target = entry.file.split("/")[1];
  const { d, data } = highest(entry);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kulms-noise-"));
  const input = path.join(dir, "input");
  fs.writeFileSync(input, data);
  // Under Jazzer.js, a run of its own each time (libFuzzer runs an input of
  // its corpus once), what libFuzzer writes of a slow input left in the
  // directory that goes; else the input replayed as many times in one run.
  const runs = jazzer
    ? Array.from({ length: times }, () => spawnSync(process.execPath,
      [JAZZER, `fuzz/targets/${target}.fuzz.mjs`, dir, "-i", ".harness", "-e", "vendor", "--timeout", "2147483647", "--", "-runs=0", `-artifact_prefix=${dir}${path.sep}`], options))
    : [spawnSync(process.execPath, ["fuzz/replay.mjs", target, ...Array(times).fill(input)], options)];
  fs.rmSync(dir, { recursive: true, force: true });
  const inputs = runs.flatMap((run) => rungsIn(`${run.stdout}\n${run.stderr}`));
  const failed = runs.filter((run) => run.status !== 0).length;
  console.log(`${entry.file}, ${d} doublings up: ${inputs.length} of ${times} runs climbed${failed ? `, ${failed} failed` : ""}`);
  for (const rungs of inputs) measured.push({ file: entry.file, rungs });
}

const spans = [];
for (const { file, rungs } of measured) {
  for (let i = 2 * TIME_SPAN; i < rungs.length; i++) {
    const [a, b, c] = [rungs[i - 2 * TIME_SPAN], rungs[i - TIME_SPAN], rungs[i]];
    const w1 = b.work - a.work;
    const w2 = c.work - b.work;
    const t1 = b.time - a.time;
    const t2 = c.time - b.time;
    if (!(w1 > 0) || !(t1 > 0) || !(t2 > 0)) continue;
    spans.push({ file, m: c.m, t1, faster: (Math.log2(t2 / t1) - Math.log2(Math.max(w2 / w1, 1))) / TIME_SPAN });
  }
}
console.log(`${os.cpus()[0].model}, Node ${process.version}${jazzer ? ", under Jazzer.js" : ""}, spans of ${TIME_SPAN} doublings:`);
for (const floor of [0.03, 0.1, 0.3, 1]) {
  const xs = spans.filter((x) => x.t1 >= floor);
  if (!xs.length) continue;
  const worst = xs.reduce((p, x) => (x.faster > p.faster ? x : p));
  console.log(`  spans that added ${floor} s or more: ${xs.length}; the time's degree passed the work's by ${worst.faster.toFixed(2)} at most (${worst.file}, ×${worst.m})`);
}
