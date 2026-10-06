// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The extension's build.sh, run on a copy of its commit with a node_modules of
// its own, as a developer's checkout has once the dependencies are installed.
// It needs bash, git, tar, zip and unzip, and is skipped where one is missing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { EXT } from "../harness/index.mjs";

const has = (tool) => {
  try { execFileSync("bash", ["-c", `command -v ${tool}`], { stdio: "ignore" }); return true; } catch { return false; }
};
const missing = ["bash", "git", "tar", "zip", "unzip"].filter((tool) => !has(tool));
const skip = missing.length ? `needs ${missing.join(", ")}` : false;
const posix = (p) => p.replace(/\\/g, "/");

let copy;
function build(target) {
  if (!copy) {
    copy = fs.mkdtempSync(path.join(os.tmpdir(), "kulms-build-"));
    execFileSync("bash", ["-c", 'git -C "$EXT" archive HEAD | tar -x -C "$COPY"'], { env: { ...process.env, EXT: posix(EXT), COPY: posix(copy) } });
    fs.mkdirSync(path.join(copy, "node_modules/eslint"), { recursive: true });
    fs.writeFileSync(path.join(copy, "node_modules/eslint/index.js"), "");
  }
  execFileSync("bash", ["build.sh", target], { cwd: copy, stdio: "ignore" });
  return copy;
}
test.after(() => { if (copy) fs.rmSync(copy, { recursive: true, force: true }); });

test("B6: the Chrome package holds only what the extension runs", { skip, todo: skip ? undefined : "B6: node_modules, package.json, bun.lock and eslint.config.js go in" }, () => {
  const dir = build("chrome");
  const names = execFileSync("unzip", ["-Z1", "kulms-extension-chrome.zip"], { cwd: dir, encoding: "utf8" }).split(/\r?\n/);
  assert.deepEqual(names.filter((n) => /^(?:node_modules\/|package\.json$|bun\.lock$|eslint\.config\.js$)/.test(n)), []);
});

test("B5: the Safari resources hold every file manifest.json names", { skip, todo: skip ? undefined : "B5: vendor/ is not synced" }, () => {
  const resources = path.join(build("safari"), "safari/KULMS+ Extension/Resources");
  const manifest = JSON.parse(fs.readFileSync(path.join(resources, "manifest.json"), "utf8"));
  const named = [
    ...manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]),
    ...manifest.web_accessible_resources.flatMap((r) => r.resources.filter((p) => !p.includes("*"))),
    manifest.background.service_worker, manifest.action.default_popup,
  ];
  assert.deepEqual(named.filter((p) => !fs.existsSync(path.join(resources, p))), []);
});
