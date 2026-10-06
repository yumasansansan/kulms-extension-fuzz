// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// ESLint for the extension in the submodule, with the rules that look for what
// the fuzzing looks for, read off the source instead of found by running it:
// eslint-plugin-no-unsanitized (Mozilla's, which addons.mozilla.org applies to
// extensions) for markup put into a page from what is not a literal, which is
// how a DOM XSS gets in, and eslint-plugin-regexp for regular expressions that
// backtrack beyond linear time (ReDoS) and their other faults. The extension's
// scripts are classic scripts of a browser and of an extension.
//
// What it reports is the extension's, which this repository does not change;
// ci/lint.sh prints it without failing on it, and the fork's branches that fix
// a finding are where the count is meant to fall.
import globals from "globals";
import nounsanitized from "eslint-plugin-no-unsanitized";
import regexp from "eslint-plugin-regexp";

export default [
  { ignores: ["kulms-extension/vendor/**", "kulms-extension/safari/**", "kulms-extension/docs/**", "kulms-extension/gas/**"] },
  {
    files: ["kulms-extension/**/*.js"],
    plugins: { "no-unsanitized": nounsanitized, regexp },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...globals.browser, ...globals.serviceworker, ...globals.webextensions, jsQR: "readonly", qrcode: "readonly", bootstrap: "readonly" },
    },
    rules: {
      ...nounsanitized.configs.recommended.rules,
      ...regexp.configs["flat/recommended"].rules,
    },
  },
];
