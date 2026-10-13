// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// An input's work is its own, whatever ran before it in the same browser: a
// fuzz target takes away what the extension kept or drew for an earlier
// input, as the extension has it on a page just opened, before the input
// begins. The fuzzer runs millions of inputs one after another, the daily
// fuzzing's corpus in the order of its files at the start, and an input whose
// work counted an earlier one's would fail or pass by what ran before it.
//
// The assignment panel's target (fuzz/targets/assignments.fuzz.mjs): a fetch
// reads the course links of the whole page, the links of the cards that the
// panel drew among them, and a card whose assignment has no tool links to its
// course's page. The background's target (fuzz/targets/background-message.
// fuzz.mjs): the TOTP store keeps a secret from message to message, and a
// load decrypts what it holds.
import test from "node:test";
import assert from "node:assert/strict";
import { answer, encode, repeated, string, value } from "../fuzz/encode.mjs";
import { emptyAnswers } from "../fuzz/inputs.mjs";
import { fuzz } from "../fuzz/targets/assignments.fuzz.mjs";

// One course in the sidebar, its ID a piece of 40 units repeated, 2,560 units
// on the top rung six doublings up; one assignment of it, which pages.json
// names no tool for, so that its card links to the course's page; no memos,
// checks or hidden assignments.
const LONG_COURSE = encode((w) => {
  w.int(0, w.remaining, 1); repeated(w, "x".repeat(40), 1); string(w, "線形代数");
  w.int(0, 7, 0); value(w, { assignment_collection: [{ title: "レポート1", entityId: "A1" }] }); answer(w);
  emptyAnswers(w);
  w.bool(false); value(w, undefined);
  value(w, undefined); value(w, undefined);
}, { doublings: 6 });

test("an assignments input's work is its own, whatever the panel drew for the input before it", async () => {
  await fuzz(LONG_COURSE);
  // The input of no bytes, held to the bound of its own size: the card of the
  // course above, drawn on its top rung, is not read for it.
  await assert.doesNotReject(fuzz(Buffer.alloc(0)));
});

// The popup saves a TOTP secret of a piece of 64 units repeated 32 times,
// 32,768 units on the top rung four doublings up (as long as B22 lets a
// secret be); then a content script of the LMS asks for the secret, in six
// units, with nothing stored as its input begins. kulms-totp-save and
// kulms-totp-load are the first and the second of the TOTP messages the
// target picks from.
const SAVE_LONG_SECRET = encode((w) => {
  w.int(0, 2, 2); w.int(0, 3, 1); w.int(0, 4, 0);
  w.bool(true); w.bool(true); repeated(w, "A".repeat(64), 32);
}, { doublings: 4 });
const LOAD = encode((w) => { w.int(0, 2, 0); w.int(0, 3, 1); w.int(0, 4, 1); w.bool(false); });

test("a background-message input's work is its own, whatever an input before it saved", async () => {
  // Imported here, once the assignments target has calibrated itself: two
  // targets calibrating at once would run their ladders on the same state of
  // fuzz/lib.mjs.
  const { fuzz: fuzzBackground } = await import("../fuzz/targets/background-message.fuzz.mjs");
  await fuzzBackground(SAVE_LONG_SECRET);
  // The load, held to the bound of its six units: the secret saved above is
  // not the one it decrypts.
  await assert.doesNotReject(fuzzBackground(LOAD));
});
