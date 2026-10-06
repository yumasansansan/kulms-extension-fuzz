// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// A bug planted for the canary (fuzz/targets/canary.fuzz.mjs), in the shape of
// the extension's scripts: a classic script whose code is in an IIFE. It
// throws only on text that begins with "KULMS+", one character compared at a
// time, which random bytes reach about once in 2^48 tries and a fuzzer guided
// by coverage within seconds. So when the canary's fuzzing finds it, the
// harness's scripts are instrumented and the fuzzer is looking; when it does
// not, they are not, and no other target would have found anything either.
(function () {
  "use strict";

  function check(text) {
    if (text.charCodeAt(0) !== 0x4b) return; // K
    if (text.charCodeAt(1) !== 0x55) return; // U
    if (text.charCodeAt(2) !== 0x4c) return; // L
    if (text.charCodeAt(3) !== 0x4d) return; // M
    if (text.charCodeAt(4) !== 0x53) return; // S
    if (text.charCodeAt(5) !== 0x2b) return; // +
    throw new Error("planted bug of the canary: the fuzzer found KULMS+");
  }
})();
