#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
# holder and its license, in the machine-readable form of the REUSE
# specification: the GNU General Public License, version 3 or any later version
# (LICENSES/GPL-3.0-or-later.txt).
#
# Installs the dependencies as pnpm-lock.yaml has them, says which commit of
# the extension the submodule is at, and runs the tests (tests/): the harness
# itself, the findings of docs/findings.md (marked todo while they stand,
# which fail without failing the run), and every fuzz target on the inputs
# kept for it.
set -euo pipefail

pnpm install --frozen-lockfile
echo "kulms-extension at $(git -C kulms-extension log -1 --format='%h %s')"
pnpm test
