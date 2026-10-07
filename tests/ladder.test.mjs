// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The rungs of an input (ladder() of fuzz/lib.mjs), on a target of the
// tests' own whose work for a string of n units is what each test says,
// counted a step at a time as the extension's code is counted: work that
// grows as n or n log n, or that steps up once, climbs to the top rung; work
// that grows as the square stops on the second rung in a row where that
// shows; and time that grows faster than the counted work fails as work the
// counting does not see. What goes wrong after the work passed what it may be
// is told as the work's passing, and a rung that reads the input otherwise
// than the bottom rung fails as such.
import test from "node:test";
import assert from "node:assert/strict";
import { fail, judge, ladder, provider, string } from "../fuzz/lib.mjs";
import { encode, repeated, string as written } from "../fuzz/encode.mjs";
import { addSites, step, work } from "../harness/work.mjs";

// The bound of linear code (harness/work.mjs) as if a script of a thousand
// counting sites were loaded, as a target loads the extension's.
addSites(1000);

// An input whose bottom rung repeats "ab" `times` times, its top rung
// `doublings` doublings up.
const input = (doublings, times = 4) => encode((w) => repeated(w, "ab", times), { doublings });

// The target: work(n) steps for the string of n units it reads, and as long as
// wait(n) says, in milliseconds, which nothing counts. It catches what the
// counting throws, as the extension may; judge() fails the input all the same.
// The length of the string on each rung run goes into `rungs`.
function target(work, rungs, wait = () => 0) {
  return async (data) => {
    const s = string(provider(data));
    rungs.push(s.length);
    const until = performance.now() + wait(s.length);
    while (performance.now() < until);
    try {
      for (let i = work(s.length); i > 0; i--) step(1);
    } catch { /* what the counting threw */ }
    judge();
  };
}

test("linear work climbs to the top rung", async () => {
  const rungs = [];
  await ladder(input(6), target((n) => 10 * n + 100, rungs));
  assert.deepEqual(rungs, [8, 16, 32, 64, 128, 256, 512]);
});

test("work that grows as n log n climbs to the top rung", async () => {
  const rungs = [];
  await ladder(input(6), target((n) => Math.ceil(n * Math.log2(n + 2)) + n, rungs));
  assert.equal(rungs.length, 7);
});

test("work that does not grow with the input climbs to the top rung", async () => {
  const rungs = [];
  await ladder(input(6), target(() => 50, rungs));
  assert.equal(rungs.length, 7);
});

test("an input that repeats nothing is run once, however high its top rung", async () => {
  const rungs = [];
  await ladder(encode((w) => written(w, "abababab"), { doublings: 6 }), target((n) => 10 * n, rungs));
  assert.deepEqual(rungs, [8]);
});

test("work that grows as the square stops on the second rung in a row where that shows", async () => {
  const rungs = [];
  await assert.rejects(ladder(input(6), target((n) => n * n + 10 * n, rungs)), /on the rung of ×8 passed .*on two rungs in a row/);
  assert.deepEqual(rungs, [8, 16, 32, 64]);
});

test("a step in the work, where the code first reads what the rungs add, climbs to the top rung", async () => {
  const rungs = [];
  await ladder(input(6), target((n) => (n >= 64 ? 30 * n : 50), rungs));
  assert.equal(rungs.length, 7);
});

test("work that grows by less than what the rungs add is not read for growth", async () => {
  const rungs = [];
  await ladder(input(6), target((n) => 100 + Math.floor(n / 64) * Math.floor(n / 64), rungs));
  assert.equal(rungs.length, 7);
});

test("time that grows faster than the counted work fails as work the counting does not see", async () => {
  const rungs = [];
  await assert.rejects(ladder(input(5), target((n) => 10 * n, rungs, (n) => (n * n) / 10)), /time grew faster than its counted work|time on the rung of ×32 passed/);
  assert.equal(rungs.length, 6);
});

test("a rung that reads the input otherwise than the bottom rung fails as such", async () => {
  // A cut read as a place up to the length of a string the rungs repeat: one
  // more byte to say it once the length passes 255.
  const rungs = [];
  const run = async (data) => {
    const fdp = provider(data);
    const s = string(fdp);
    rungs.push(s.length);
    fdp.consumeIntegralInRange(0, s.length);
    judge();
  };
  await assert.rejects(ladder(encode((w) => { repeated(w, "ab", 64); w.int(0, 128, 0); }, { doublings: 3 }), run), /the rung of ×2 read the input otherwise than the bottom rung: its read \d+ was consumeIntegralInRange\(0, 256\)/);
  assert.deepEqual(rungs, [128, 256]);
});

test("what goes wrong after the work passed what it may be is told as the work's passing", async () => {
  // A step more than the bound of linear code allows, caught as the extension
  // catches what the counting throws, and then an answer that never came.
  const run = async (data) => {
    string(provider(data));
    try {
      for (let i = 0; i <= work.bound; i++) step(1);
    } catch { /* what the counting threw */ }
    fail("no answer");
  };
  await assert.rejects(ladder(input(0), run), /the extension's work passed .*the most that linear code does/);
});
