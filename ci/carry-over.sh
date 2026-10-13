#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
# holder and its license, in the machine-readable form of the REUSE
# specification: the GNU General Public License, version 3 or any later version
# (LICENSES/GPL-3.0-or-later.txt).
#
#   ci/carry-over.sh <corpora> [<crashes>]
#
# Fetches into <corpora> the corpus that the last decided run of fuzz.yml
# grew and kept as an artifact, and, given <crashes>, the inputs that failed
# in it: the last run that fuzzed at all, which is one the schedule or a hand
# started, and that passed or failed. Without such a run, or with nothing
# kept, it says so and leaves the directories empty. fuzz.yml carries on from
# them; ci.yml counts what the corpus reaches (ci/coverage.sh).
#
# It needs gh, a token that may read the repository's actions (GH_TOKEN), and
# the repository (GITHUB_REPOSITORY, which GitHub sets; elsewhere, the one gh
# finds here).
set -euo pipefail

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
gh run download "$last" --repo "$repo" --name fuzz-corpora --dir "$corpora" \
  || echo "Run $last kept no corpus: the corpus starts from the seed inputs."
if [ -n "$crashes" ]; then
  gh run download "$last" --repo "$repo" --name fuzz-crashes --dir "$crashes" \
    || echo "Run $last kept no inputs that failed."
fi
