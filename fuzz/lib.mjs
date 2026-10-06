// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// What the fuzz targets share: the provider that turns the fuzzer's bytes
// into values, a JSON value made from them (what a message, a stored value or
// an API's answer can be), and a failure that names the input's problem.
import { FuzzedDataProvider } from "@jazzer.js/core";

export { FuzzedDataProvider };
export { open } from "./open-findings.mjs";

// Strings the extension looks for, mixed in so that the fuzzer reaches the
// branches behind them sooner than bytes alone would.
const WORDS = [
  "提出済", "評定済", "採点済", "返却", "再提出", "未開始", "取組中", "submitted", "graded", "returned",
  "kulms-totp-load", "kulms-totp-save", "kulms-totp-has", "kulms-totp-delete", "fetchTextbooks",
  "epochSecond", "time", "id", "type", "text", "deadline", "repeat", "weekly", "memo-", "active",
  "__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "length", "",
];

export function string(fdp, max = 24) {
  if (fdp.remainingBytes === 0) return "";
  return fdp.consumeBoolean() ? fdp.pickValue(WORDS) : fdp.consumeString(max);
}

// A JSON value: what can cross between the extension's contexts, be stored by
// it, or come back from an API.
export function jsonValue(fdp, depth = 0) {
  if (fdp.remainingBytes === 0) return null;
  switch (fdp.consumeIntegralInRange(0, depth > 3 ? 4 : 6)) {
    case 0: return null;
    case 1: return fdp.consumeBoolean();
    case 2: return fdp.pickValue([0, 1, -1, 2 ** 31, -(2 ** 31), 2 ** 53, 1e21, 0.5, Date.now(), fdp.consumeIntegral(4, true)]);
    case 3: return string(fdp);
    case 4: return String.fromCharCode(...fdp.consumeIntegrals(32, 2)); // any UTF-16, lone surrogates too
    case 5: return Array.from({ length: fdp.consumeIntegralInRange(0, 4) }, () => jsonValue(fdp, depth + 1));
    default: {
      const o = {};
      for (let n = fdp.consumeIntegralInRange(0, 5); n > 0 && fdp.remainingBytes > 0; n--) o[string(fdp, 12)] = jsonValue(fdp, depth + 1);
      return o;
    }
  }
}

// Fails the input, saying what went wrong with it.
export function fail(message) {
  throw new Error(message);
}
