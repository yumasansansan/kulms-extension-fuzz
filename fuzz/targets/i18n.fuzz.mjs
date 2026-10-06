// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// t() of settings.js, which every content script writes its text with, with
// the messages it fetches from the extension as it does in Chrome. The input
// picks a key (one of messages.json's, or any string) and up to three values
// for its placeholders, given as a list or as one string.
//
// It fails when t() throws or returns what is not a string, or when a value
// does not appear in the text as it was given. While B10 is open
// (fuzz/open-findings.mjs), a value with a dollar sign in it, which B10 is
// known to mangle, is not looked for; while B15 is, no key that every object
// has (constructor, toString, ...) is asked for.
import { Browser, openTab, read, settle } from "../../harness/index.mjs";
import { FuzzedDataProvider, fail, open, string } from "../lib.mjs";

const tab = openTab(new Browser(), { url: "https://lms.gakusei.kyoto-u.ac.jp/portal", scripts: ["src/settings.js"] });
await settle(200);
const messages = JSON.parse(read("_locales/ja/messages.json"));
const keys = Object.keys(messages);

export function fuzz(data) {
  const fdp = new FuzzedDataProvider(data);
  const key = fdp.consumeBoolean() ? fdp.pickValue(keys) : string(fdp, 24);
  if (open("B15") && !Object.hasOwn(messages, key) && key in {}) return;
  const values = Array.from({ length: fdp.consumeIntegralInRange(0, 3) }, () => string(fdp, 16));
  const asList = fdp.consumeBoolean() || values.length === 0;
  const text = tab.window.t(key, asList ? values : values[0]);
  if (typeof text !== "string") fail(`t(${JSON.stringify(key)}) gave ${text}`);
  const entry = Object.hasOwn(messages, key) ? messages[key] : null;
  if (!entry || !entry.placeholders) return;
  for (const p of Object.values(entry.placeholders)) {
    const index = parseInt(String(p.content).replace(/\$/g, ""), 10) - 1;
    const value = asList ? values[index] : (index === 0 ? values[0] : undefined);
    if (value === undefined || (open("B10") && value.includes("$"))) continue;
    if (!text.includes(value)) fail(`t(${JSON.stringify(key)}, ${JSON.stringify(values)}) = ${JSON.stringify(text)} lost ${JSON.stringify(value)}`);
  }
}
