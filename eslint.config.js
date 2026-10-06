// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// ESLint for this repository's own code: the harness, the tests, the fuzz
// targets. ESLint's recommended rules and those of eslint-plugin-regexp, with
// every report an error (ci/lint.sh fails on any). The extension in the
// submodule is read by eslint.extension.config.js instead.
import js from "@eslint/js";
import globals from "globals";
import regexp from "eslint-plugin-regexp";

export default [
  { ignores: ["kulms-extension/**", ".harness/**", "node_modules/**", "fuzz-run/**", "fuzz/canary/planted.js"] },
  js.configs.recommended,
  regexp.configs["flat/recommended"],
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
    },
  },
];
