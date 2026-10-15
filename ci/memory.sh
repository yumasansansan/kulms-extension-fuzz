# SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
# holder and its license, in the machine-readable form of the REUSE
# specification: the GNU General Public License, version 3 or any later version
# (LICENSES/GPL-3.0-or-later.txt).
#
#   . ci/memory.sh
#
# Sourced by ci/fuzz.sh and ci/coverage.sh. Sets memory_mb, the memory in MiB
# that one process of theirs (the fuzzing of a target, or a replay) may hold:
# what the machine has available as the script starts, less RESERVE_MB below.
# What is available is MemAvailable of /proc/meminfo, which the kernel works
# out as what new allocations can be given without swapping [proc_meminfo(5)].
# libFuzzer stops an input whose process holds more (-rss_limit_mb), V8 one
# whose heap grows past it (--max-old-space-size), and either keeps the
# input; guard_memory() below stops a replay, which has no libFuzzer, should
# it and the processes under it hold more. KULMS_FUZZ_MEMORY_MB sets
# memory_mb instead, as on a desktop whose other programs need theirs.
#
# memory_mb was all the memory of the machine (MemTotal), so that an input
# could take all of it. But the system and the runner hold part of that, and
# on Ubuntu 26.04 so does what is written to /tmp, a tmpfs in memory
# [actions/runner-images, images/ubuntu/scripts/build/install-swift.sh]:
# neither limit could be reached before the machine ran out. GitHub stops a
# runner whose memory or processors run out ("The runner has received a
# shutdown signal"; actions/runner-images discussion #8640), and then the
# job's log ends where it was cut and no step after it runs, so nothing that
# the job found is kept: the daily run 38718496528 lost grading-bridge's job
# so, some eight minutes into its fuzzing, with not a word of what it was
# running.
#
# RESERVE_MB is what the machine must still have when a process reaches
# memory_mb, for what the process gains before it is stopped and for the
# processes around it:
# - libFuzzer and guard_memory() look at a process's memory once a second,
#   so a process may gain a second's growth past memory_mb: 1,540 MiB at the
#   most, the most that a process grew within one second while it replayed
#   the corpus and the seeds of each target that run 38718496528 kept (and
#   grading-bridge's of run 38674318671), its resident memory (VmRSS) read
#   every 100 ms with a heap of 4 GiB: submission's, on the input that
#   climbs to the rung of ×262144 (sidebar's 1,103, grading-pages' 901, no
#   other target's above 572). The resident memory includes V8's whole heap,
#   so --max-old-space-size is memory_mb as well;
# - the processes around it while it fuzzes: pnpm's two that start Jazzer.js
#   (60 MiB and 25 MiB), timeout, tee and the shells of ci/fuzz.sh, 117 MiB
#   in all, measured;
# 1,657 MiB in all.
RESERVE_MB=1657

total_mb=$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo)
available_mb=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo)
if [ -n "${KULMS_FUZZ_MEMORY_MB:-}" ]; then
  memory_mb=$KULMS_FUZZ_MEMORY_MB
else
  memory_mb=$(( available_mb - RESERVE_MB ))
fi
if ! [[ "$memory_mb" =~ ^[0-9]+$ ]] || [ "$memory_mb" -lt 1 ]; then
  echo "error: no memory left for the processes (memory_mb $memory_mb)" >&2
  exit 1
fi

# The memory, in MiB, that the process `pid` and those under it hold.
held_by() {
  ps -eo pid=,ppid=,rss= | awk -v root="$1" '
    { parent[$1] = $2; rss[$1] = $3 }
    END {
      for (p in rss) {
        q = p
        while (q != root && q in parent) q = parent[q]
        if (q == root) held += rss[p]
      }
      print int(held / 1024)
    }'
}

# The processes under the process `pid`, the deepest first.
under() {
  ps -eo pid=,ppid= | awk -v root="$1" '
    { parent[$1] = $2 }
    END {
      for (p in parent) {
        q = p
        depth = 0
        while (q != root && q in parent) { q = parent[q]; depth++ }
        if (q == root && p != root) print depth, p
      }
    }' | sort -rn | awk '{ print $2 }'
}

# Stops the process `pid` and those under it once they hold more than `limit`
# MiB, looked at once a second as libFuzzer looks at its process's
# (-rss_limit_mb), and says so, on standard output and in the file `marker`.
guard_memory() {
  local pid=$1 limit=$2 marker=$3 held
  while sleep 1 && kill -0 "$pid" 2>/dev/null; do
    held=$(held_by "$pid")
    if [ "$held" -gt "$limit" ]; then
      echo "The run held $held MiB, more than the $limit MiB that it may hold, and was stopped." | tee "$marker"
      kill -KILL $(under "$pid") "$pid" 2>/dev/null || true
      return
    fi
  done
}
