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
// picks a key (one of messages.json's, or any string, fuzz/lib.mjs) and the
// values for its placeholders: none, one, or a list of any length. Every
// caller passes a list of strings, made with String() from the counts it
// works out, so a value is any string, or any number (NaN and ±Infinity
// among them, as a count can come out) as String() writes it.
//
// It fails when t() throws or returns what is not a string, or, for a key of
// messages.json, when the text is not the message with each placeholder that
// is given a value replaced by the value as it is (a placeholder given none is
// left as it is, as t() leaves it). The text is built and compared whole,
// since looking for each value in it takes time that grows with the product
// of their lengths, and a value can be millions of units long.
import { Browser, openTab, read, settle } from "../../harness/index.mjs";
import { FuzzedDataProvider, brief, fail, number, open, string } from "../lib.mjs";

const tab = openTab(new Browser(), { url: "https://lms.gakusei.kyoto-u.ac.jp/portal", scripts: ["src/settings.js"] });
await settle(200);
const messages = JSON.parse(read("_locales/ja/messages.json"));
const keys = Object.keys(messages);

const substitution = (fdp) => (fdp.consumeBoolean() ? string(fdp) : String(number(fdp)));

// The message of `entry` with each placeholder whose value is given replaced
// by it. A placeholder's content says which value ("$1" the first); in the
// message, its name is written in capitals between dollar signs. The message
// is gone through once, so that a value put in is not read again as a
// placeholder.
function expected(entry, values) {
  const given = [];
  for (const [name, p] of Object.entries(entry.placeholders || {})) {
    const index = parseInt(String(p.content).replace(/\$/g, ""), 10) - 1;
    if (index >= 0 && index < values.length) given.push([`$${name.toUpperCase()}$`, values[index]]);
  }
  let text = "";
  for (let at = 0; at < entry.message.length;) {
    const hit = given.find(([mark]) => entry.message.startsWith(mark, at));
    text += hit ? hit[1] : entry.message[at];
    at += hit ? hit[0].length : 1;
  }
  return text;
}

export function fuzz(data) {
  const fdp = new FuzzedDataProvider(data);
  const key = fdp.consumeBoolean() ? fdp.pickValue(keys) : string(fdp);
  // Known: B15 (docs/findings.md). While it is open, no key that every object
  // has (constructor, toString, ...) is asked for: t() looks it up through the
  // prototype and returns undefined.
  if (open("B15") && !Object.hasOwn(messages, key) && key in {}) return;
  let given;
  switch (fdp.consumeIntegralInRange(0, 2)) {
    case 0: given = undefined; break;
    case 1: given = substitution(fdp); break;
    default: given = Array.from({ length: fdp.consumeIntegralInRange(0, fdp.remainingBytes) }, () => substitution(fdp));
  }
  const text = tab.window.t(key, given);
  if (typeof text !== "string") fail(`t(${brief(key)}) gave ${brief(text)}`);
  if (!Object.hasOwn(messages, key)) return; // chrome.i18n's answer, or the key itself
  let values = given === undefined ? [] : Array.isArray(given) ? given : [given];
  // Known: B21. While it is open, a value given alone that is empty is taken
  // as no value, as t() takes it.
  if (open("B21") && given === "") values = [];
  // Known: B10. While it is open, a text with a value that has a dollar sign
  // in it, which the replacement mangles, is not looked at.
  if (open("B10") && values.some((v) => v.includes("$"))) return;
  const want = expected(messages[key], values);
  if (text !== want) {
    let at = 0;
    while (at < want.length && text[at] === want[at]) at++;
    fail(`t(${brief(key)}, ${brief(given)}) differs from ${brief(want)} at ${at}: ${brief(text.slice(Math.max(0, at - 20), at + 80))}`);
  }
}
