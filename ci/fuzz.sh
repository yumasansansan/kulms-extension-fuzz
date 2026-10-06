#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
# holder and its license, in the machine-readable form of the REUSE
# specification: the GNU General Public License, version 3 or any later version
# (LICENSES/GPL-3.0-or-later.txt).
#
#   ci/fuzz.sh [--canary] [--merge] [--only <targets>] <seconds> <corpora> <crashes> [<earlier crashes>]
#
# Fuzzes every target of fuzz/targets/ (the canary aside) for <seconds> each
# with Jazzer.js, one after another. A target fuzzes a corpus of its own,
# <corpora>/<target>/, given first, which it grows and which may carry over
# from an earlier run, with its seeds (fuzz/seeds/<target>/) after it and its
# dictionary (fuzz/dict/<target>.dict) when it has one; an input that fails is
# written to <crashes>/<target>/. Only the extension's scripts as the harness
# runs them (.harness/) are instrumented, and of them not the libraries the
# extension bundles (vendor/): coverage of anything else would steer the
# fuzzer toward the harness rather than the extension. A target whose fuzz
# function is not async runs with --sync, which Jazzer.js runs faster.
#
# Given <earlier crashes>, each target first runs once, without the fuzzer
# (fuzz/replay.mjs), on the inputs under <earlier crashes>/<target>/ that failed
# in an earlier run. One that still fails is kept in <crashes>/<target>/ again
# and the target is not fuzzed: fuzzing looks for inputs at random, and a later
# run need not come upon the same one, so it is replayed until it is fixed.
#
# --merge merges a target's corpus down, after it has run, to the fewest
# inputs that reach what all of it reached, when the run added to it. --only
# runs the targets named (joined by commas) and no other; a name that is no
# target is an error, so that a renamed target cannot fall out without a word.
#
# --canary fuzzes the canary instead (fuzz/targets/canary.fuzz.mjs), which has
# a bug planted in it, and fails when the fuzzer does not find the bug in
# <seconds>: then the harness's code is not instrumented, or the fuzzer is not
# steered by it, and the fuzzing of every other target would have found
# nothing however long it ran.
#
# No run lasts longer than <seconds> and five minutes more, which is room for
# Jazzer.js to load jsdom and replay a corpus; one that does not end by then is
# stopped and counted as a failure, so that the targets after it still run.
# The script fails when any target fails.
set -euo pipefail

canary=0
merge=0
only=
while [ $# -gt 0 ]; do
  case "$1" in
    --canary) canary=1; shift ;;
    --merge) merge=1; shift ;;
    --only)
      if [ -z "${2:-}" ]; then echo "error: --only takes the names of targets, joined by commas" >&2; exit 2; fi
      only=$2
      shift 2
      ;;
    *) break ;;
  esac
done
if [ $# -lt 3 ]; then
  echo "usage: ci/fuzz.sh [--canary] [--merge] [--only <targets>] <seconds> <corpora> <crashes> [<earlier crashes>]" >&2
  exit 2
fi
seconds=$1
corpora=$2
crashes=$3
earlier=${4:-}
grace=300
per_input_ms=10000

# Sets `cmd` to the command that runs Jazzer.js on fuzz/targets/<target>.fuzz.mjs:
#   command_for <target> [corpus directories...] -- [libFuzzer's options...]
command_for() {
  local target=$1
  shift
  local dirs=() options=() seen=0 a
  for a in "$@"; do
    if [ "$seen" = 0 ] && [ "$a" = -- ]; then seen=1
    elif [ "$seen" = 0 ]; then dirs+=("$a")
    else options+=("$a")
    fi
  done
  cmd=(pnpm exec jazzer "fuzz/targets/$target.fuzz.mjs" "${dirs[@]}")
  if ! grep -q '^export async function fuzz' "fuzz/targets/$target.fuzz.mjs"; then cmd+=(--sync); fi
  cmd+=(-i .harness -e vendor --timeout "$per_input_ms" -- "${options[@]}")
}

if [ "$canary" = 1 ]; then
  mkdir -p "$crashes/canary"
  log=$(mktemp)
  status=0
  command_for canary -- -max_total_time="$seconds" -artifact_prefix="$crashes/canary/"
  timeout --kill-after=30 $((seconds + grace)) "${cmd[@]}" > "$log" 2>&1 || status=$?
  tail -n 20 "$log"
  if [ "$status" -ne 0 ] && grep -q "planted bug of the canary" "$log"; then
    rm -rf "$crashes/canary"
    echo "The fuzzer found the canary's planted bug: the harness's code is instrumented and steers it."
    exit 0
  fi
  echo "error: the fuzzer did not find the canary's planted bug in $seconds seconds (status $status):" >&2
  echo "the extension's code as the harness runs it is not instrumented, and fuzzing would find nothing." >&2
  exit 1
fi

mapfile -t targets < <(find fuzz/targets -name '*.fuzz.mjs' ! -name 'canary.fuzz.mjs' -printf '%f\n' | sed 's/\.fuzz\.mjs$//' | sort)
if [ -n "$only" ]; then
  IFS=, read -r -a wanted <<< "$only"
  for name in "${wanted[@]}"; do
    if [[ ! " ${targets[*]} " == *" $name "* ]]; then echo "error: $name is no fuzz target" >&2; exit 2; fi
  done
  targets=("${wanted[@]}")
fi

failed=()
for target in "${targets[@]}"; do
  echo
  echo "== $target"
  mkdir -p "$corpora/$target" "$crashes/$target"

  if [ -n "$earlier" ] && [ -d "$earlier/$target" ] && [ -n "$(ls -A "$earlier/$target")" ]; then
    still=0
    for input in "$earlier/$target"/*; do
      if ! node fuzz/replay.mjs "$target" "$input"; then
        cp "$input" "$crashes/$target/"
        still=1
      fi
    done
    if [ "$still" = 1 ]; then
      echo "An input that failed before fails still; $target is not fuzzed until it is fixed."
      failed+=("$target")
      continue
    fi
  fi

  dirs=("$corpora/$target")
  if [ -d "fuzz/seeds/$target" ]; then dirs+=("fuzz/seeds/$target"); fi
  options=(-max_total_time="$seconds" -rss_limit_mb=4096 -artifact_prefix="$crashes/$target/" -print_final_stats=1)
  if [ -f "fuzz/dict/$target.dict" ]; then options+=(-dict="fuzz/dict/$target.dict"); fi
  before=$(find "$corpora/$target" -type f | wc -l)
  log=$(mktemp)
  status=0
  command_for "$target" "${dirs[@]}" -- "${options[@]}"
  timeout --kill-after=30 $((seconds + grace)) "${cmd[@]}" > "$log" 2>&1 || status=$?
  grep -E '^(#[0-9]+[[:space:]]+(INITED|DONE)|stat::number_of_executed_units|Done [0-9]+ runs|==[0-9]+==)' "$log" || true
  if [ "$status" -ne 0 ]; then
    if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
      echo "$target did not end within $((seconds + grace)) seconds and was stopped."
    fi
    tail -n 40 "$log"
    failed+=("$target")
    continue
  fi

  after=$(find "$corpora/$target" -type f | wc -l)
  if [ "$merge" = 1 ] && [ "$after" -ne "$before" ]; then
    rm -rf "$corpora/$target.merged"
    mkdir -p "$corpora/$target.merged"
    command_for "$target" "$corpora/$target.merged" "$corpora/$target" -- -merge=1
    if timeout --kill-after=30 $((seconds + grace)) "${cmd[@]}" > "$log" 2>&1; then
      rm -rf "$corpora/$target"
      mv "$corpora/$target.merged" "$corpora/$target"
      echo "Merged the corpus of $target from $after inputs to $(find "$corpora/$target" -type f | wc -l)."
    else
      tail -n 20 "$log"
      echo "The merge of $target's corpus failed; the corpus is kept as it was."
      rm -rf "$corpora/$target.merged"
    fi
  fi
done

echo
if [ "${#failed[@]}" -ne 0 ]; then
  echo "Targets that failed: ${failed[*]}. The inputs are in $crashes/." >&2
  exit 1
fi
echo "Every target ran for $seconds seconds without a failure."
