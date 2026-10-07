// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// fuzz/encode.mjs against fuzz/lib.mjs: what a Writer is handed, the
// generators of lib.mjs read back from the input it writes, whatever comes
// before and after and however long it is.
import test from "node:test";
import assert from "node:assert/strict";
import { FuzzedDataProvider, answer, bytes, number, string, value } from "../fuzz/lib.mjs";
import * as write from "../fuzz/encode.mjs";

const back = (plan, readAll) => readAll(new FuzzedDataProvider(write.encode(plan)));

const LONE = String.fromCharCode(0xd800);
const LATIN1 = String.fromCharCode(0, 0x41, 0xff);
const STRINGS = ["", "a", "%", LATIN1, "線形代数", "🟡", `${LONE}x`, "x".repeat(300), "y".repeat(70000)];
const holds = { latin1: (s) => [...s].every((c) => c.charCodeAt(0) <= 0xff), utf8: (s) => s.isWellFormed(), units: () => true };

test("a string is read back as it was written, by each decoding that holds it", () => {
  for (const s of STRINGS) {
    for (const how of [undefined, "latin1", "utf8", "units"]) {
      if (how && !holds[how](s)) continue;
      for (const rest of [false, true]) {
        assert.equal(back((w) => write.string(w, s, { how, rest }), (fdp) => string(fdp)), s, `${how} ${rest} ${s.slice(0, 20)}`);
      }
    }
  }
  assert.equal(back((w) => write.string(w, "hasOwnProperty", { word: true }), (fdp) => string(fdp)), "hasOwnProperty");
});

test("numbers, values and bytes are read back as they were written", () => {
  for (const x of [0, -0, NaN, Infinity, 1.5, -1e-300, 2 ** 53 + 2, 123456789]) {
    assert.ok(Object.is(back((w) => write.number(w, x), (fdp) => number(fdp)), x), String(x));
  }
  const values = [undefined, null, true, false, 0.25, "線", 12n, -(2n ** 63n), [], {}, [null, [1, ["a"]], { b: false }],
    { assignment_collection: [null, { title: "レポート1", entityId: "A1" }] }, { toString: 0, "": LONE, 10: "x" }];
  for (const v of values) assert.deepEqual(back((w) => { write.value(w, v); w.bool(true); }, (fdp) => [value(fdp), fdp.consumeBoolean()]), [v, true]);
  for (const n of [0, 1, 255, 256, 70000]) {
    const data = Uint8Array.from({ length: n }, (_, i) => i & 0xff);
    for (const rest of [false, true]) assert.deepEqual(back((w) => write.bytes(w, data, { rest }), (fdp) => bytes(fdp)), data);
  }
});

test("a sequence is read back in order, the lengths around those at which an integer takes another byte", () => {
  for (const n of [0, 1, 200, 250, 251, 252, 253, 254, 255, 256, 257, 300, 65530, 65536, 70000]) {
    const page = new Uint8Array(n).fill(0x41);
    const v = { list: [1, null, "x", true, -0.5, NaN, 7n], name: `${LONE}名` };
    const got = back((w) => {
      write.string(w, "鍵");
      write.value(w, v);
      w.bool(true);
      w.int(0, w.remaining, 3);
      write.bytes(w, page);
      write.number(w, 1.5);
      write.answer(w, { utf8: true });
      write.string(w, "end", { rest: true });
      write.answer(w);
    }, (fdp) => [string(fdp), value(fdp), fdp.consumeBoolean(), fdp.consumeIntegralInRange(0, fdp.remainingBytes), bytes(fdp), number(fdp),
      answer(fdp, "body", "text/html"), string(fdp), answer(fdp, "rest", "text/html")]);
    assert.deepEqual(got, ["鍵", v, true, 3, page, 1.5, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "body" }, "end",
      { status: 200, headers: { "content-type": "text/html" }, body: "rest" }], `length ${n}`);
  }
});

test("a plan that asks for a value after the rest of the input is taken is refused", () => {
  assert.throws(() => write.encode((w) => { write.bytes(w, [1], { rest: true }); w.bool(true); }), /after the rest/);
});
