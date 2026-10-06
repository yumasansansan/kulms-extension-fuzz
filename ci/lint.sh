#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
# holder and its license, in the machine-readable form of the REUSE
# specification: the GNU General Public License, version 3 or any later version
# (LICENSES/GPL-3.0-or-later.txt).
#
# Reads this repository's code with ESLint (eslint.config.js) and fails on
# anything it reports, and the shell scripts of ci/ with bash -n. Then it reads
# the extension in the submodule with the rules of eslint.extension.config.js —
# markup put into a page from what is not a literal, regular expressions that
# backtrack beyond linear time — and prints what they find, by rule, without
# failing on it: the code is the extension's, and its findings are tracked in
# docs/findings.md.
set -euo pipefail

pnpm exec eslint .
for script in ci/*.sh; do
  bash -n "$script"
done
echo "This repository's code: no problems."

echo
echo "== The extension at $(git -C kulms-extension log -1 --format='%h'), read for DOM XSS and ReDoS (not a gate)"
report=$(mktemp)
pnpm exec eslint --config eslint.extension.config.js --no-warn-ignored --format json --output-file "$report" kulms-extension || true
node --input-type=module -e '
  import fs from "node:fs";
  const results = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const byRule = new Map();
  for (const r of results) for (const m of r.messages) {
    const where = r.filePath.replace(/\\/g, "/").replace(/^.*\/kulms-extension\//, "") + ":" + m.line;
    if (!byRule.has(m.ruleId)) byRule.set(m.ruleId, []);
    byRule.get(m.ruleId).push(where);
  }
  for (const [rule, places] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${String(places.length).padStart(4)}  ${rule}`);
    for (const p of places) console.log(`        ${p}`);
  }
' "$report"
