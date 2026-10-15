#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
# holder and its license, in the machine-readable form of the REUSE
# specification: the GNU General Public License, version 3 or any later version
# (LICENSES/GPL-3.0-or-later.txt).
#
#   ci/coverage.sh [--report-only] [--until <time>] [<corpora>]
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
# replayed (fuzz/replay.mjs) with the settings of the fuzzing in CI, where the
# time of the rungs is not looked at, in lots of a few inputs, each lot in a
# process of its own, as many lots at once as the machine has room for
# (below).
#
# The number is not a gate: nothing here fails for a figure being low. It is
# read to know where the next test or fuzz target belongs. A test or an input
# that fails makes the script fail as it would elsewhere, after the report.
#
# With --until <time> (seconds since the epoch: when the job must be done),
# no lot of inputs starts after that time, and a lot still under way then is
# stopped. The inputs that were not replayed are named, and fail nothing: the
# daily fuzzing replays the corpus it carries on from before it fuzzes
# (ci/fuzz.sh). Without --until no clock stops anything.
#
# With --report-only it reads the counts coverage/raw/ already holds rather
# than running anything, which is how the same run is looked at again without
# waiting for it twice.
set -euo pipefail

report_only=0
until_time=
while [ $# -gt 0 ]; do
  case "$1" in
    --report-only) report_only=1; shift ;;
    --until) until_time=$2; shift 2 ;;
    *) break ;;
  esac
done
corpora=${1:-}

out=coverage
raw=$out/raw
status=0

# The inputs a process replays. A process that counts keeps every script it
# compiled, with its counts, and a target that opens a page for each input
# compiles the extension's scripts anew for each input and each of its rungs:
# one process for a whole corpus ran out of memory as the corpus grew (the
# popup's 405 inputs passed the heap's 4 GB), and so did one for a hundred of
# submission's inputs, among them one that climbs to the rung of ×262144 (CI
# run 38495804127). The counts of all the processes are merged
# (harness/coverage.mjs).
chunk=10

# How many lots run at once, and the heap each may take. A few slow inputs
# take most of the time (CI run 38504368910 spent 38 of its 60 minutes on
# sidebar's corpus, most of them on one input that climbs to ×262144, and was
# stopped in submission's), so the lots of all the targets run side by side:
# as many at once as the machine has processors, and 4 GiB of memory for (the
# heap V8 takes by itself on a machine of 16 GiB). Three quarters of the
# memory are for the heaps, shared among the lots under way; the rest is left
# to what is not heap. A lot whose memory runs out (V8 aborts it, or it holds
# more than its share of all the memory, and it writes no counts) is replayed
# again once the others are done, alone, with all the memory that a process
# may hold, as ci/fuzz.sh fuzzes: one of submission's inputs takes more than
# 4 GiB uncounted. Should the memory run out still, the inputs it did not
# replay are named, and fail nothing: the fuzzing judges memory (ci/fuzz.sh),
# not this. KULMS_COVERAGE_JOBS sets how many lots run at once. The memory is
# what the machine has available as the script starts, not all that it has
# (ci/memory.sh): a heap of all of it could take the runner down with it.
. "$(dirname "$0")/memory.sh"
processors=$(node -p 'require("node:os").availableParallelism()')
room=$((memory_mb / 4096))
at_once=${KULMS_COVERAGE_JOBS:-$((processors < room ? processors : room))}
if [ "$at_once" -lt 1 ]; then
  at_once=1
fi
share_mb=$((memory_mb * 3 / 4 / at_once))

# The seconds a lot under way at the time has to end, before it is killed.
grace=30

# Replays the inputs "$@" of the target $1 as its lot $2 (the place of the
# lot's first input) with a heap of $3 MiB, stopped should it hold more than
# $4 MiB in all (guard_memory() of ci/memory.sh: V8's heap limit leaves out
# what is held outside the heap), and keeps what the replay wrote,
# raw/fuzz-<target>.<lot>.log, and how it ended, raw/fuzz-<target>.<lot>.end:
# passed, failed (an input failed), memory (the memory ran out), or time (the
# time ran out first).
replay_lot() {
  local target=$1 lot=$2 heap=$3 hold=$4
  shift 4
  local limit=()
  if [ -n "$until_time" ]; then
    local left=$((until_time - $(date +%s)))
    if [ "$left" -le 0 ]; then
      : > "$raw/fuzz-$target.$lot.log"
      echo time > "$raw/fuzz-$target.$lot.end"
      return 0
    fi
    limit=(timeout --kill-after="$grace" "$left")
  fi
  local code=0 marker=$raw/fuzz-$target.$lot.memory
  rm -f "$marker"
  KULMS_FUZZ_NOISE=Infinity NODE_V8_COVERAGE="$PWD/$raw/fuzz-$target" NODE_OPTIONS="--max-old-space-size=$heap" \
    "${limit[@]}" node fuzz/replay.mjs "$target" "$@" > "$raw/fuzz-$target.$lot.log" 2>&1 &
  local run=$!
  guard_memory "$run" "$hold" "$marker" &
  local guard=$!
  wait "$run" || code=$?
  kill $(under "$guard") "$guard" 2>/dev/null || true
  wait "$guard" 2>/dev/null || true
  local end=failed
  if [ "$code" -eq 0 ]; then
    end=passed
  elif [ -e "$marker" ]; then
    end=memory
  elif [ -n "$until_time" ] && { [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; } && [ "$(date +%s)" -ge "$until_time" ]; then
    end=time
  elif [ "$code" -eq 137 ] || grep -q 'JavaScript heap out of memory' "$raw/fuzz-$target.$lot.log"; then
    end=memory
  fi
  echo "$end" > "$raw/fuzz-$target.$lot.end"
}

if [ "$report_only" -eq 0 ]; then
  rm -rf "$out"
  mkdir -p "$raw/tests"
  pnpm install --frozen-lockfile
  echo "kulms-extension at $(git -C kulms-extension log -1 --format='%h %s')"

  echo "== the tests, counting what they reach"
  NODE_V8_COVERAGE="$PWD/$raw/tests" node --test "tests/**/*.test.mjs" || status=$?

  if [ -n "$corpora" ]; then
    echo "== the corpora, $chunk inputs to a process, $at_once at once, each with a heap of $share_mb MiB"
    targets=()
    running=0
    for dir in "$corpora"/*/; do
      [ -d "$dir" ] || continue
      target=$(basename "$dir")
      targets+=("$target")
      mkdir -p "$raw/fuzz-$target"
      inputs=("$dir")
      if [ -d "fuzz/seeds/$target" ]; then
        inputs+=("fuzz/seeds/$target")
      fi
      files=()
      for d in "${inputs[@]}"; do
        while IFS= read -r -d '' f; do files+=("$f"); done < <(find "$d" -maxdepth 1 -type f ! -name '.*' ! -name '*.md' ! -name '*.license' -print0 | LC_ALL=C sort -z)
      done
      echo "${#files[@]}" > "$raw/fuzz-$target.inputs"
      for ((i = 0; i < ${#files[@]}; i += chunk)); do
        if [ "$running" -ge "$at_once" ]; then
          wait -n || true
          running=$((running - 1))
        fi
        printf '%s\0' "${files[@]:i:chunk}" > "$raw/fuzz-$target.$i.files"
        replay_lot "$target" "$i" "$share_mb" "$((memory_mb / at_once))" "${files[@]:i:chunk}" &
        running=$((running + 1))
      done
    done
    wait || true

    for target in "${targets[@]}"; do
      n=$(cat "$raw/fuzz-$target.inputs")
      for ((i = 0; i < n; i += chunk)); do
        if [ "$(cat "$raw/fuzz-$target.$i.end")" = memory ]; then
          echo "   the lot of $target from its input $i ran out of its share of the memory: replayed again, alone"
          mapfile -d '' -t again < "$raw/fuzz-$target.$i.files"
          replay_lot "$target" "$i" "$memory_mb" "$memory_mb" "${again[@]}"
        fi
      done
    done

    for target in "${targets[@]}"; do
      echo "== the corpus of $target, counting what it reaches"
      n=$(cat "$raw/fuzz-$target.inputs")
      : > "$raw/fuzz-$target.log"
      failed=0
      left=()
      for ((i = 0; i < n; i += chunk)); do
        cat "$raw/fuzz-$target.$i.log" >> "$raw/fuzz-$target.log"
        end=$(cat "$raw/fuzz-$target.$i.end")
        case "$end" in
          passed) ;;
          time | memory)
            # The inputs of the lot that the replay did not say it ended.
            mapfile -d '' -t lot < "$raw/fuzz-$target.$i.files"
            for f in "${lot[@]}"; do
              if ! grep -qxF -e "ok    $f" -e "FAIL  $f" "$raw/fuzz-$target.$i.log"; then
                left+=("$f (the $end ran out)")
              fi
            done
            if grep -q '^FAIL' "$raw/fuzz-$target.$i.log"; then
              failed=1
            fi
            ;;
          *) failed=1 ;;
        esac
      done
      if [ "$failed" -ne 0 ]; then
        status=1
        grep -v '^ok' "$raw/fuzz-$target.log" | tail -n 20
      fi
      echo "   $(grep -c '^ok' "$raw/fuzz-$target.log" || true) inputs passed"
      if [ "${#left[@]}" -gt 0 ]; then
        echo "   ${#left[@]} inputs not replayed:"
        printf '     %s\n' "${left[@]}"
      fi
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
