// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// Every fuzz target, run without the fuzzer on the inputs this repository
// keeps for it (fuzz/README.md):
//
// - An input of no bytes at all must pass, and so must fuzz/seeds/<target>/
//   and fuzz/regressions/<target>/: a seed is an input that works, and a
//   regression input is one that once failed and was fixed.
// - fuzz/known/<target>/<ID>-<name> is an input that fails while the finding
//   ID of docs/findings.md stands. Its test is marked todo, so that it fails
//   without failing the run; once the fix is in the submodule it passes, and
//   the input moves to fuzz/regressions/. It runs with ID taken off the list
//   of open findings (fuzz/open-findings.mjs), as the targets keep away from
//   what an open finding sets off.
// - While ID is on that list, its known input must also pass as the list
//   stands and fail with ID taken off it: it sets off ID and nothing else.
//   An input that the targets come to read another way would otherwise pass
//   its todo test as if ID were fixed. This holds of the submodule's
//   extension, whose findings the list is of, and is not checked of another
//   (KULMS_EXTENSION_DIR).
// - A known input runs in a process of its own (node fuzz/replay.mjs), as the
//   fuzzer runs a target and ci/fuzz.sh replays an input that failed: an
//   input that fails may leave work of the extension's under way, which
//   rejects once its work has passed what it may be (harness/work.mjs) and
//   would fail whatever ran next in the same process.
// - The seeds, the known inputs and the regression inputs are what
//   fuzz/inputs.mjs writes, and a target that has read() reads each of them
//   as its plan says.
// - The canary must fail on the bug planted in it, without the fuzzer as with.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { replay } from "../fuzz/replay.mjs";
import { OPEN } from "../fuzz/open-findings.mjs";
import { INPUTS, problems } from "../fuzz/inputs.mjs";
import { reading } from "../fuzz/lib.mjs";
import { EXT, ROOT } from "../harness/index.mjs";

const FUZZ = path.join(ROOT, "fuzz");
const targets = fs.readdirSync(path.join(FUZZ, "targets")).filter((f) => f.endsWith(".fuzz.mjs")).map((f) => f.replace(/\.fuzz\.mjs$/, ""));
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith(".")).map((f) => path.join(dir, f)) : []);
const quiet = { log() {} };
const submodule = EXT === path.join(ROOT, "kulms-extension");

// Runs `start()` when fewer runs than the machine has processors are under
// way, and when it has, once one ends.
const slots = Math.max(1, os.availableParallelism());
let busy = 0;
const waiting = [];
function inTurn(start) {
  return new Promise((resolve, reject) => {
    const go = () => {
      busy++;
      start().then(resolve, reject).finally(() => {
        busy--;
        if (waiting.length) waiting.shift()();
      });
    };
    if (busy < slots) go();
    else waiting.push(go);
  });
}

// Runs `file` on `target` in a process of its own, with `id` also taken off
// the list of open findings when it is given (KULMS_FUZZ_LOOK_FOR), and keeps
// the run for every test that asks for it. What the run comes to: the first
// line of each failure that fuzz/replay.mjs writes (none when it passed), and
// all it wrote.
const runs = new Map();
function alone(target, file, id = "") {
  const key = `${target} ${file} ${id}`;
  if (!runs.has(key)) {
    const lookFor = [process.env.KULMS_FUZZ_LOOK_FOR, id].filter(Boolean).join(",");
    runs.set(key, inTurn(() => new Promise((resolve) => {
      execFile(process.execPath, [path.join(FUZZ, "replay.mjs"), target, file], { env: { ...process.env, KULMS_FUZZ_LOOK_FOR: lookFor }, maxBuffer: 2 ** 26 }, (error, stdout, stderr) => {
        const lines = stdout.split("\n");
        const failures = lines.flatMap((line, i) => (line.startsWith("FAIL") ? [lines[i + 1]] : []));
        resolve({ failures, output: stdout + stderr });
      });
    })));
  }
  return runs.get(key);
}

for (const target of targets.filter((t) => t !== "canary")) {
  test(`${target}: an input of no bytes at all passes`, async () => {
    const { fuzz } = await import(pathToFileURL(path.join(FUZZ, "targets", `${target}.fuzz.mjs`)).href);
    await fuzz(Buffer.alloc(0));
  });
  const inputs = [...files(path.join(FUZZ, "seeds", target)), ...files(path.join(FUZZ, "regressions", target))];
  if (inputs.length) {
    test(`${target}: its seeds and regression inputs pass`, async () => {
      const failures = await replay(target, inputs, quiet);
      assert.deepEqual(failures.map((f) => `${path.relative(ROOT, f.file)}: ${f.error && f.error.message}`), []);
    });
  }
  for (const file of files(path.join(FUZZ, "known", target))) {
    const id = path.basename(file).split("-")[0];
    const skip = !OPEN.has(id) ? `${id} is off the list of open findings` : !submodule ? "the extension under test is not the submodule's" : false;
    // Both runs begin now, and as many others at once as there are processors.
    const found = alone(target, file, id);
    const kept = skip ? null : alone(target, file);
    test(`${target}: ${path.basename(file)} passes`, { todo: `${id} stands (docs/findings.md)` }, async () => {
      const { failures, output } = await found;
      assert.deepEqual(failures, [], output);
    });
    test(`${target}: ${path.basename(file)} sets off ${id} and nothing else`, { skip }, async () => {
      const open = await kept;
      assert.deepEqual(open.failures, [], `the target does not keep away from what ${file} sets off while ${id} is open:\n${open.output}`);
      const { failures, output } = await found;
      assert.equal(failures.length, 1, `${file} no longer sets off ${id}: write it anew (fuzz/inputs.mjs)\n${output}`);
    });
  }
}

test("the inputs kept for the targets are what fuzz/inputs.mjs writes", () => {
  assert.deepEqual(problems(), []);
});

for (const { file, expect } of INPUTS.filter((i) => i.expect)) {
  test(`fuzz/${file} reads as its plan says`, async () => {
    const target = file.split("/")[1];
    const { read } = await import(pathToFileURL(path.join(FUZZ, "targets", `${target}.fuzz.mjs`)).href);
    assert.deepEqual(read(reading(fs.readFileSync(path.join(FUZZ, file)))), expect);
  });
}

test("the canary fails on the bug planted in it", async () => {
  const failures = await replay("canary", [path.join(FUZZ, "canary", "planted-input")], quiet);
  assert.equal(failures.length, 1);
  assert.match(failures[0].error.message, /planted bug of the canary/);
});
