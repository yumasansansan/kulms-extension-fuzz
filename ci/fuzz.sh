#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
# holder and its license, in the machine-readable form of the REUSE
# specification: the GNU General Public License, version 3 or any later version
# (LICENSES/GPL-3.0-or-later.txt).
#
#   ci/fuzz.sh [--canary] [--merge] [--only <targets>] [--until <time>] <seconds> <corpora> <crashes> [<earlier crashes>]
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
# No input is judged by the time it takes. The extension's work is counted on
# rungs of the input, each repeating what the input repeats twice as many
# times as the rung below: an input fails when its work grows faster than
# n log n from rung to rung, or passes what linear code does with an input of
# its size, and its time, compared with its counted work from rung to rung,
# checks the counting (fuzz/lib.mjs, harness/work.mjs). <seconds> is the
# fuzzing's own time, after which libFuzzer starts no input. libFuzzer makes an
# input as long as the bottom rung of one may make (BOTTOM of fuzz/lib.mjs);
# its rungs make it larger.
#
# What is left to a clock is what does not end where nothing is counted
# (inside jsdom, say). Given --until, the time (in seconds since the epoch) by
# which the job needs the script to have ended, each target may take an equal
# share of the time left for the targets yet to run, itself among them, from
# when it starts, and its runs (the replays, the fuzzing, the merge) what is
# left of that share as each starts:
# - the fuzzing's own time is <seconds>, or less where the share would not
#   hold it and then one more input as slow as the slowest that the earlier
#   crashes hold (the slow units of the run before, replayed first, and
#   timed), or than RESERVE where none is slower: libFuzzer starts no input
#   after that time, but ends the one under way, which may be a slow one. A
#   slower input than that, new, still overruns; it is a slow unit of this
#   run, and timed in the next;
# - libFuzzer stops an input that alone takes all that its run may take, and
#   keeps it, so that it can be replayed (fuzz/replay.mjs);
# - a run that outlasts what it may take is stopped, and counted as a
#   failure, so that the targets after it still run.
# No input or run that ends within a target's share of the job's time is
# stopped. Without --until, no clock stops anything.
#
# Nor is an input judged by its memory, but for one that takes all the memory
# that a process may hold (ci/memory.sh): libFuzzer or V8 then stops it, and it
# is kept as an input that failed.
#
# What a run prints goes to the job's log as it comes, and every minute a line
# says how much memory the run holds and how much the machine has left: when
# GitHub stops a runner whose resources run out, the log up to then is all
# that is left of the job (ci/memory.sh). A copy goes to a file on disk, for
# what is read back of it; not to /tmp, which is in memory on Ubuntu 26.04.
#
# The script fails when any target fails.
set -euo pipefail

canary=0
merge=0
only=
until_time=
while [ $# -gt 0 ]; do
  case "$1" in
    --canary) canary=1; shift ;;
    --merge) merge=1; shift ;;
    --only)
      if [ -z "${2:-}" ]; then echo "error: --only takes the names of targets, joined by commas" >&2; exit 2; fi
      only=$2
      shift 2
      ;;
    --until)
      if ! [[ "${2:-}" =~ ^[0-9]+$ ]]; then echo "error: --until takes a time, in seconds since the epoch" >&2; exit 2; fi
      until_time=$2
      shift 2
      ;;
    *) break ;;
  esac
done
if [ $# -lt 3 ]; then
  echo "usage: ci/fuzz.sh [--canary] [--merge] [--only <targets>] [--until <time>] <seconds> <corpora> <crashes> [<earlier crashes>]" >&2
  exit 2
fi
seconds=$1
corpora=$2
crashes=$3
earlier=${4:-}

# The longest input libFuzzer makes (it makes none longer than 4,096 bytes
# unless told): as many bytes as the bottom rung of an input may make units
# (BOTTOM of fuzz/lib.mjs). The rungs above it repeat what it repeats up to as
# much as one runtime message of Chrome carries. libFuzzer starts with short
# inputs and lets them grow as the short ones stop finding anything new.
max_len=$(node --input-type=module -e 'import { BOTTOM } from "./fuzz/lib.mjs"; console.log(BOTTOM)')

# The memory a process may hold (memory_mb, ci/memory.sh): libFuzzer stops an
# input whose process holds more, and keeps it, and V8's heap may grow as far.
. "$(dirname "$0")/memory.sh"
export NODE_OPTIONS="--max-old-space-size=$memory_mb"
echo "The machine has $total_mb MiB of memory, $available_mb MiB of it available; a process may hold $memory_mb MiB."

# Where the copies of what the runs print go: a directory on disk, which the
# script removes as it ends (on a runner, under the job's own temporary
# directory).
logs=$(mktemp -d -p "${RUNNER_TEMP:-/var/tmp}" kulms-fuzz.XXXXXX)
trap 'rm -rf "$logs"' EXIT

# The seconds a run that is told to end has to end, before it is killed.
grace=60

# The seconds a target keeps of its share, at least, for one more input after
# its fuzzing's own time: the slow inputs of the daily runs end within five
# minutes, but for one of submission's, of 466 seconds (daily run
# 38462363590), which its earlier crashes hold and time.
RESERVE=300

# When (seconds since the epoch) the next of `n` targets yet to run must end:
# an equal share of what is left until --until, less the grace of its runs;
# nothing without --until.
deadline_of() {
  local n=$1
  if [ -z "$until_time" ]; then return; fi
  local now
  now=$(date +%s)
  local left=$(( until_time - now - grace ))
  if [ "$left" -lt 0 ]; then left=0; fi
  echo $(( now + left / n ))
}

# The seconds left until `deadline`, at least one.
seconds_to() {
  local left=$(( $1 - $(date +%s) ))
  if [ "$left" -lt 1 ]; then left=1; fi
  echo "$left"
}

# Runs the command given until `deadline` at most, and `grace` seconds more
# for it to end once told to; without a deadline, as long as it takes. A net
# (the head of this file).
run_until() {
  local deadline=$1
  shift
  if [ -z "$deadline" ]; then
    "$@"
  else
    timeout --kill-after="$grace" "$(seconds_to "$deadline")" "$@"
  fi
}

# The number of files under the directories given.
files_in() {
  find "$@" -type f 2>/dev/null | wc -l
}

# Sets `cmd` to the command that runs Jazzer.js on fuzz/targets/<target>.fuzz.mjs,
# libFuzzer stopping an input that alone takes all that the run may take until
# `deadline` (the head of this file), or none without one:
#   command_for <target> <deadline> [corpus directories...] -- [libFuzzer's options...]
command_for() {
  local target=$1 deadline=$2
  shift 2
  local dirs=() options=() seen=0 a timeout_ms
  for a in "$@"; do
    if [ "$seen" = 0 ] && [ "$a" = -- ]; then seen=1
    elif [ "$seen" = 0 ]; then dirs+=("$a")
    else options+=("$a")
    fi
  done
  # Jazzer.js stops an input after five seconds unless told otherwise: without
  # a deadline, after as long as a timer of Node can wait.
  if [ -n "$deadline" ]; then timeout_ms=$(( $(seconds_to "$deadline") * 1000 )); else timeout_ms=2147483647; fi
  cmd=(pnpm exec jazzer "fuzz/targets/$target.fuzz.mjs" "${dirs[@]}")
  if ! grep -q '^export async function fuzz' "fuzz/targets/$target.fuzz.mjs"; then cmd+=(--sync); fi
  cmd+=(-i .harness -e vendor --timeout "$timeout_ms" -- "${options[@]}")
}

# What a run stopped by its deadline is told of.
stopped() {
  echo "$1 did not end by its share of the time that --until gives, and was stopped: something does not end where no work is counted."
}

# Says every minute, while the process `pid` lasts, how much memory it holds
# with those under it, and how much the machine has available and has
# swapped.
say_memory() {
  local pid=$1
  while sleep 60 && kill -0 "$pid" 2>/dev/null; do
    echo "[memory $(date -u +%H:%M:%S)] the run holds $(held_by "$pid") MiB; the machine has $(awk '
      /^MemAvailable:/ { available = $2 } /^SwapTotal:/ { swap = $2 } /^SwapFree:/ { free = $2 }
      END { printf "%d MiB available and %d MiB swapped", available / 1024, (swap - free) / 1024 }' /proc/meminfo)"
  done
}

# Runs `run_until "$@"` (the deadline, then the command), what it prints going
# to the job's log as it comes and to `log`, with say_memory() beside it, and
# sets `status` to how it ended. Given --guard first, guard_memory()
# (ci/memory.sh) stops it too, as libFuzzer stops the fuzzing, should it hold
# more than a process may: a replay has no libFuzzer to stop it, and V8's
# heap limit leaves out what is held outside the heap. `status` is then 137,
# and `$log.memory` says so.
observed() {
  local guard=0
  if [ "$1" = --guard ]; then guard=1; shift; fi
  status=0
  rm -f "$log.memory"
  { run_until "$@" 2>&1 | tee "$log"; } &
  local run=$!
  say_memory "$run" &
  local watchers=($!)
  if [ "$guard" = 1 ]; then
    guard_memory "$run" "$memory_mb" "$log.memory" &
    watchers+=($!)
  fi
  wait "$run" || status=$?
  local w
  for w in "${watchers[@]}"; do
    kill $(under "$w") "$w" 2>/dev/null || true
  done
  wait "${watchers[@]}" 2>/dev/null || true
}

if [ "$canary" = 1 ]; then
  mkdir -p "$crashes/canary"
  log=$logs/canary.log
  deadline=$(deadline_of 1)
  command_for canary "$deadline" -- -max_total_time="$seconds" -rss_limit_mb="$memory_mb" -artifact_prefix="$crashes/canary/"
  observed "$deadline" "${cmd[@]}"
  if [ "$status" -ne 0 ] && grep -q "planted bug of the canary" "$log"; then
    rm -rf "$crashes/canary"
    echo "The fuzzer found the canary's planted bug: the harness's code is instrumented and steers it."
    exit 0
  fi
  if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then stopped "The canary" >&2; fi
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
left=${#targets[@]}
for target in "${targets[@]}"; do
  echo
  echo "== $target"
  mkdir -p "$corpora/$target" "$crashes/$target"
  deadline=$(deadline_of "$left")
  left=$((left - 1))

  slowest=$RESERVE # the seconds of the slowest input of the earlier crashes, RESERVE at least
  if [ -n "$earlier" ] && [ -d "$earlier/$target" ] && [ -n "$(ls -A "$earlier/$target")" ]; then
    still=0
    for input in "$earlier/$target"/*; do
      log=$logs/$target.replay.log
      start=$(date +%s)
      observed --guard "$deadline" node fuzz/replay.mjs "$target" "$input"
      took=$(( $(date +%s) - start ))
      if [ "$took" -gt "$slowest" ]; then slowest=$took; fi
      if [ "$status" -ne 0 ]; then
        if [ ! -e "$log.memory" ] && { [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; }; then stopped "The replay of $input"; fi
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
  fuzz_seconds=$seconds
  if [ -n "$deadline" ]; then
    room=$(( $(seconds_to "$deadline") - slowest ))
    if [ "$room" -lt 60 ]; then room=60; fi
    if [ "$room" -lt "$fuzz_seconds" ]; then
      fuzz_seconds=$room
      echo "$target fuzzes for $fuzz_seconds seconds, what its share leaves for one more input of $slowest seconds."
    fi
  fi
  options=(-max_total_time="$fuzz_seconds" -max_len="$max_len" -rss_limit_mb="$memory_mb" -artifact_prefix="$crashes/$target/" -print_final_stats=1)
  if [ -f "fuzz/dict/$target.dict" ]; then options+=(-dict="fuzz/dict/$target.dict"); fi
  before=$(files_in "$corpora/$target")
  log=$logs/$target.log
  command_for "$target" "$deadline" "${dirs[@]}" -- "${options[@]}"
  observed "$deadline" "${cmd[@]}"
  if [ "$status" -ne 0 ]; then
    if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then stopped "$target"; fi
    echo "$target failed (status $status); the input is in $crashes/$target/."
    failed+=("$target")
    continue
  fi

  after=$(files_in "$corpora/$target")
  if [ "$merge" = 1 ] && [ "$after" -ne "$before" ]; then
    rm -rf "$corpora/$target.merged"
    mkdir -p "$corpora/$target.merged"
    command_for "$target" "$deadline" "$corpora/$target.merged" "$corpora/$target" -- -merge=1 -max_len="$max_len" -rss_limit_mb="$memory_mb"
    log=$logs/$target.merge.log
    if run_until "$deadline" "${cmd[@]}" > "$log" 2>&1; then
      rm -rf "$corpora/$target"
      mv "$corpora/$target.merged" "$corpora/$target"
      echo "Merged the corpus of $target from $after inputs to $(files_in "$corpora/$target")."
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
