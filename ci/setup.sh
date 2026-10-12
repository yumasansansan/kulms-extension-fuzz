#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
# holder and its license, in the machine-readable form of the REUSE
# specification: the GNU General Public License, version 3 or any later version
# (LICENSES/GPL-3.0-or-later.txt).
#
# Sets up a GitHub Actions runner (Linux or Windows, x86-64) with Node and pnpm,
# which go first on PATH for the later steps:
#
# - Node: the newest release, as nodejs.org lists its releases
#   (dist/index.json). This repository runs on the newest Node, as the CI of
#   ADLplug-Next builds with the snapshot of LLVM, and so learns of a release
#   that breaks something the day it comes out. The archive is checked against
#   the SHASUMS256.txt of that release.
# - pnpm: the newest release too, for the same reason: the version the npm
#   registry tags latest (the dist-tags of pnpm), which is also what pnpm
#   self-update and Corepack take for the newest. GitHub's list of releases
#   does not say it as plainly: pnpm releases the next minor version there
#   before the registry tags it latest, and fixes of its older major versions
#   besides. package.json names no packageManager, which pnpm would switch to.
#   The archive comes from pnpm's release on GitHub and is checked against the
#   SHA-256 GitHub lists for it (gh, with the job's token in GH_TOKEN).
set -euo pipefail

tools=${RUNNER_TEMP:-$PWD/.tools}/kulms-tools
mkdir -p "$tools/pnpm"
cd "$tools"

sha256_of() {
  local sum
  sum=$(sha256sum "$1")
  echo "${sum%% *}"
}

check() {  # file expected-sha256 what
  local actual
  actual=$(sha256_of "$1")
  if [ -z "$2" ] || [ "$actual" != "$2" ]; then
    echo "error: $1 ($3) has SHA-256 $actual, expected ${2:-none}" >&2
    exit 1
  fi
}

get() {  # url file
  curl --fail --location --silent --show-error --retry 3 --retry-all-errors --output "$2" "$1"
}

# Pipelines here are written so that no command stops reading early: with
# pipefail, a writer whose reader has gone fails the script, whether SIGPIPE
# kills it or, where SIGPIPE is ignored (as on GitHub's runners), its write
# fails. So each list is saved first, and grep, which stops at its first match
# in the releases of Node, reads a file, not a pipe from curl.
get https://nodejs.org/dist/index.json index.json
get https://registry.npmjs.org/-/package/pnpm/dist-tags dist-tags.json
node_version=$(grep -m 1 -o '"version":"v[0-9.]*"' index.json | cut -d '"' -f 4)
pnpm_version=$(grep -o '"latest": *"[0-9.]*"' dist-tags.json | cut -d '"' -f 4)
if [ -z "$node_version" ] || [ -z "$pnpm_version" ]; then
  echo "error: no version of Node (from nodejs.org) or of pnpm (from the npm registry)" >&2
  exit 1
fi

case "$(uname -s)" in
  Linux) node_archive=node-$node_version-linux-x64.tar.xz; pnpm_archive=pnpm-linux-x64.tar.gz ;;
  MINGW* | MSYS* | CYGWIN*) node_archive=node-$node_version-win-x64.zip; pnpm_archive=pnpm-win32-x64.zip ;;
  *) echo "error: no Node or pnpm is set up for $(uname -s)" >&2; exit 1 ;;
esac

get "https://nodejs.org/dist/$node_version/SHASUMS256.txt" SHASUMS256.txt
get "https://nodejs.org/dist/$node_version/$node_archive" "$node_archive"
check "$node_archive" "$(grep " $node_archive\$" SHASUMS256.txt | cut -d ' ' -f 1)" "Node $node_version"

get "https://github.com/pnpm/pnpm/releases/download/v$pnpm_version/$pnpm_archive" "$pnpm_archive"
check "$pnpm_archive" "$(gh api "repos/pnpm/pnpm/releases/tags/v$pnpm_version" --jq ".assets[] | select(.name == \"$pnpm_archive\") | .digest" | sed 's/^sha256://')" "pnpm $pnpm_version"

case "$node_archive" in
  *.tar.xz)
    tar -xJf "$node_archive"
    node_bin=$tools/${node_archive%.tar.xz}/bin
    tar -xzf "$pnpm_archive" -C pnpm
    ;;
  *.zip)
    unzip -q "$node_archive"
    node_bin=$tools/${node_archive%.zip}
    unzip -q "$pnpm_archive" -d pnpm
    ;;
esac
rm -f "$node_archive" "$pnpm_archive" SHASUMS256.txt index.json dist-tags.json

export PATH="$node_bin:$tools/pnpm:$PATH"
if [ -n "${GITHUB_PATH:-}" ]; then
  for dir in "$node_bin" "$tools/pnpm"; do
    if command -v cygpath > /dev/null; then cygpath -w "$dir"; else echo "$dir"; fi >> "$GITHUB_PATH"
  done
fi
echo "node $(node --version), pnpm $(pnpm --version)"
