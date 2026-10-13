#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
# holder and its license, in the machine-readable form of the REUSE
# specification: the GNU General Public License, version 3 or any later version
# (LICENSES/GPL-3.0-or-later.txt).
#
#   ci/coverage.sh [--report-only] [<corpora>]
#
# Measures which of the extension's own code the tests reach, and, given
# <corpora> (a directory with a corpus for each target, as ci/fuzz.sh leaves
# it), which of it the fuzz corpus reaches; then says it and writes it to
# coverage/ (ci/coverage.mjs).
#
# V8 counts it: each process started with NODE_V8_COVERAGE set writes, as it
# ends, how often each function and each block of every script it ran was
# entered (harness/coverage.mjs). The tests run as package.json has them, each
# test file in a process of its own, and the known inputs each in one of
# their own beneath it. A target's corpus, with the target's seeds, is
# replayed in a process of its own (fuzz/replay.mjs) with the settings of
# the fuzzing in CI, where the time of the rungs is not looked at.
#
# The number is not a gate: nothing here fails for a figure being low. It is
# read to know where the next test or fuzz target belongs. A test or an input
# that fails makes the script fail as it would elsewhere, after the report.
#
# With --report-only it reads the counts coverage/raw/ already holds rather
# than running anything, which is how the same run is looked at again without
# waiting for it twice.
set -euo pipefail

report_only=0
case "${1:-}" in
  --report-only) report_only=1; shift ;;
esac
corpora=${1:-}

out=coverage
raw=$out/raw
status=0
if [ "$report_only" -eq 0 ]; then
  rm -rf "$out"
  mkdir -p "$raw/tests"
  pnpm install --frozen-lockfile
  echo "kulms-extension at $(git -C kulms-extension log -1 --format='%h %s')"

  echo "== the tests, counting what they reach"
  NODE_V8_COVERAGE="$PWD/$raw/tests" node --test "tests/**/*.test.mjs" || status=$?

  if [ -n "$corpora" ]; then
    for dir in "$corpora"/*/; do
      [ -d "$dir" ] || continue
      target=$(basename "$dir")
      inputs=("$dir")
      if [ -d "fuzz/seeds/$target" ]; then
        inputs+=("fuzz/seeds/$target")
      fi
      echo "== the corpus of $target, counting what it reaches"
      mkdir -p "$raw/fuzz-$target"
      if ! KULMS_FUZZ_NOISE=Infinity NODE_V8_COVERAGE="$PWD/$raw/fuzz-$target" \
          node fuzz/replay.mjs "$target" "${inputs[@]}" > "$raw/fuzz-$target.log" 2>&1; then
        status=1
        grep -v '^ok' "$raw/fuzz-$target.log" | tail -n 20
      fi
      echo "   $(grep -c '^ok' "$raw/fuzz-$target.log") inputs passed"
    done
  fi
fi

parts=("tests=$raw/tests")
for dir in "$raw"/fuzz-*/; do
  if [ -d "$dir" ]; then
    target=$(basename "$dir")
    parts+=("fuzz:${target#fuzz-}=$dir")
  fi
done
node ci/coverage.mjs "$out" "${parts[@]}"
exit "$status"
