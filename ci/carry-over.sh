#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
# holder and its license, in the machine-readable form of the REUSE
# specification: the GNU General Public License, version 3 or any later version
# (LICENSES/GPL-3.0-or-later.txt).
#
#   ci/carry-over.sh [--only <targets>] <corpora> [<crashes>]
#
# Fetches into <corpora> the corpora that the last decided run of fuzz.yml
# grew and kept as artifacts, and, given <crashes>, the inputs that failed in
# it: the last run that fuzzed at all, which is one the schedule or a hand
# started, and that passed or failed. Without such a run, or with nothing
# kept, it says so and leaves the directories empty. fuzz.yml carries on from
# them; ci.yml counts what the corpora reach (ci/coverage.sh).
#
# A run keeps each target's corpus and failed inputs as artifacts of their
# own (fuzz-corpora-<target>, fuzz-crashes-<target>), and the runs until
# 2026-10-14, which fuzzed the targets one after another in one job, kept all
# the targets' in one (fuzz-corpora, fuzz-crashes), a directory for each
# target in it: this takes the targets' directories from whichever the run
# has. --only takes the targets named (joined by commas) and leaves the
# others alone, so that a job that fuzzes one target carries along nothing
# that another grows.
#
# It needs gh, a token that may read the repository's actions (GH_TOKEN), and
# the repository (GITHUB_REPOSITORY, which GitHub sets; elsewhere, the one gh
# finds here).
set -euo pipefail

only=
if [ "${1:-}" = --only ]; then
  if [ -z "${2:-}" ]; then echo "error: --only takes the names of targets, joined by commas" >&2; exit 2; fi
  only=$2
  shift 2
fi
corpora=$1
crashes=${2:-}
repo=${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}

mkdir -p "$corpora"
if [ -n "$crashes" ]; then
  mkdir -p "$crashes"
fi
last=$(gh run list --repo "$repo" --workflow fuzz.yml --branch main \
  --status completed --limit 20 --json conclusion,databaseId,event \
  --jq '[.[] | select(.event == "schedule" or .event == "workflow_dispatch")
             | select(.conclusion == "success" or .conclusion == "failure")][0].databaseId // empty')
if [ -z "$last" ]; then
  echo "No earlier run: the corpus starts from the seed inputs."
  exit 0
fi
echo "Carrying over from run $last."

kept=$(mktemp -d)
trap 'rm -rf "$kept"' EXIT

# Moves into `into` the directories of the targets wanted that the artifacts
# downloaded under `from` hold, each artifact in a directory of its own name.
gather() {
  local from=$1 into=$2 artifact dir target
  shopt -s nullglob
  for artifact in "$from"/*/; do
    for dir in "$artifact"*/; do
      target=$(basename "$dir")
      if [ -n "$only" ] && [[ ",$only," != *",$target,"* ]]; then
        continue
      fi
      mkdir -p "$into/$target"
      cp -R "$dir." "$into/$target/"
    done
  done
  shopt -u nullglob
}

# With a pattern, gh puts each artifact in a directory of its own name, and
# with the old name and the pattern given, whichever the run has.
if gh run download "$last" --repo "$repo" --dir "$kept/corpora" --name fuzz-corpora --pattern 'fuzz-corpora-*'; then
  gather "$kept/corpora" "$corpora"
else
  echo "Run $last kept no corpus: the corpus starts from the seed inputs."
fi
if [ -n "$crashes" ]; then
  if gh run download "$last" --repo "$repo" --dir "$kept/crashes" --name fuzz-crashes --pattern 'fuzz-crashes-*'; then
    gather "$kept/crashes" "$crashes"
  else
    echo "Run $last kept no inputs that failed."
  fi
fi
