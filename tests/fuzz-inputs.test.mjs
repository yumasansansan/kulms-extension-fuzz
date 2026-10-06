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
// - fuzz/seeds/<target>/ and fuzz/regressions/<target>/ must pass: a seed is
//   an input that works, and a regression input is one that once failed and
//   was fixed.
// - fuzz/known/<target>/<ID>-<name> is an input that fails while the finding
//   ID of docs/findings.md stands. Its test is marked todo, so that it fails
//   without failing the run; once the fix is in the submodule it passes, and
//   the input moves to fuzz/regressions/. It runs with ID taken off the list
//   of open findings (fuzz/open-findings.mjs), as the targets keep away from
//   what an open finding sets off.
// - The canary must fail on the bug planted in it, without the fuzzer as with.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { replay } from "../fuzz/replay.mjs";
import { OPEN } from "../fuzz/open-findings.mjs";
import { ROOT } from "../harness/index.mjs";

const FUZZ = path.join(ROOT, "fuzz");
const targets = fs.readdirSync(path.join(FUZZ, "targets")).filter((f) => f.endsWith(".fuzz.mjs")).map((f) => f.replace(/\.fuzz\.mjs$/, ""));
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith(".")).map((f) => path.join(dir, f)) : []);
const quiet = { log() {} };

for (const target of targets.filter((t) => t !== "canary")) {
  const inputs = [...files(path.join(FUZZ, "seeds", target)), ...files(path.join(FUZZ, "regressions", target))];
  if (inputs.length) {
    test(`${target}: its seeds and regression inputs pass`, async () => {
      const failures = await replay(target, inputs, quiet);
      assert.deepEqual(failures.map((f) => `${path.relative(ROOT, f.file)}: ${f.error && f.error.message}`), []);
    });
  }
  for (const file of files(path.join(FUZZ, "known", target))) {
    const id = path.basename(file).split("-")[0];
    test(`${target}: ${path.basename(file)} passes`, { todo: `${id} stands (docs/findings.md)` }, async () => {
      const wasOpen = OPEN.delete(id);
      try {
        const failures = await replay(target, [file], quiet);
        assert.deepEqual(failures.map((f) => f.error && f.error.message), []);
      } finally {
        if (wasOpen) OPEN.add(id);
      }
    });
  }
}

test("the canary fails on the bug planted in it", async () => {
  const failures = await replay("canary", [path.join(FUZZ, "canary", "planted-input")], quiet);
  assert.equal(failures.length, 1);
  assert.match(failures[0].error.message, /planted bug of the canary/);
});
