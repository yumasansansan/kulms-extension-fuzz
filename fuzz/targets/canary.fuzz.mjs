// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The canary: a target that must fail. It runs fuzz/canary/planted.js the way
// the other targets run the extension's scripts (through the harness's loader,
// in a vm context), and the CI checks that the fuzzer finds the bug planted in
// it within a minute (ci/fuzz.sh --canary). The fuzzing of the other targets
// says nothing when it finds nothing, and silence cannot tell that from a
// fuzzer that never saw their code.
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadedFile } from "../../harness/index.mjs";

const planted = path.join(path.dirname(fileURLToPath(import.meta.url)), "../canary/planted.js");
const { code, file } = loadedFile(planted, "canary/planted.js");
let internals;
const context = vm.createContext({ Fuzzer: globalThis.Fuzzer });
context.__kulmsExpose = (name, i) => { internals = i; };
vm.runInContext(code, context, { filename: file });

export function fuzz(data) {
  internals.check(data.toString("latin1"));
}
