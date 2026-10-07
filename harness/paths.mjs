// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// Where the extension and the harness's own files are.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The extension's checkout: KULMS_EXTENSION_DIR when it is set, else the
// submodule of this repository.
export const EXT = path.resolve(process.env.KULMS_EXTENSION_DIR || path.join(ROOT, "kulms-extension"));
if (!fs.existsSync(path.join(EXT, "manifest.json"))) {
  throw new Error(`no extension at ${EXT}: run git submodule update --init, or set KULMS_EXTENSION_DIR`);
}

// What the harness writes for itself (the scripts as it runs them), in a
// directory of each checkout of the extension, so that runs on several
// checkouts at once (KULMS_EXTENSION_DIR) do not write over one another's
// scripts. Git ignores it.
const checkout = EXT === path.join(ROOT, "kulms-extension") ? "submodule"
  : `${path.basename(EXT)}-${createHash("sha256").update(EXT).digest("hex").slice(0, 8)}`;
export const CACHE = path.join(ROOT, ".harness", checkout);

export const read = (rel) => fs.readFileSync(path.join(EXT, rel), "utf8");
export const manifest = JSON.parse(read("manifest.json"));
