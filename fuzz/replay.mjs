// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
//   node fuzz/replay.mjs <target> <input file or directory>...
//
// Runs a fuzz target on inputs without the fuzzer, one after another, and
// says for each whether it passed and, if not, why, with the error's stack.
// It exits with 1 when any input failed. tests/fuzz-inputs.test.mjs runs every
// target on its seeds and regression inputs this way, and so does a reader
// who wants to see what an input the fuzzer kept does.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function replay(target, inputs, { log = console.log } = {}) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const { fuzz } = await import(pathToFileURL(path.join(here, "targets", `${target}.fuzz.mjs`)).href);
  const files = inputs.flatMap((p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).sort().map((f) => path.join(p, f)) : [p]))
    .filter((f) => fs.statSync(f).isFile() && !/^\.|\.(?:md|license)$/.test(path.basename(f)));
  const failures = [];
  for (const file of files) {
    try {
      await fuzz(fs.readFileSync(file));
      log(`ok    ${file}`);
    } catch (e) {
      failures.push({ file, error: e });
      log(`FAIL  ${file}\n${e && e.stack ? e.stack : e}`);
    }
  }
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [target, ...inputs] = process.argv.slice(2);
  if (!target || inputs.length === 0) {
    console.error("usage: node fuzz/replay.mjs <target> <input file or directory>...");
    process.exit(2);
  }
  const failures = await replay(target, inputs);
  process.exit(failures.length ? 1 : 0);
}
