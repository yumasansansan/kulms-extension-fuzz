// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// Every rung reads an input alike (fuzz/lib.mjs): what the targets read of
// any input, and lib.mjs's values, on any rung, ask the provider the same
// questions and get the same answers, but for how many times a piece is
// repeated. A rung that read the input anew would be another input, and the
// growth from the rung below would say nothing of the extension's.
//
// The targets are loaded before any test runs, in a file of their own: a
// target calibrates itself as it loads (calibrate()), which runs ladders of
// its own on the state of fuzz/lib.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { answer, bytes, jsonText, reading, string, value } from "../fuzz/lib.mjs";

// What the provider is asked while `read` reads `data` on rung `m`, and what it
// answers, in order.
function questions(read, data, m) {
  const fdp = reading(data, m);
  const asked = [];
  const show = (x) => { try { return JSON.stringify(x, (k, y) => (typeof y === "bigint" ? `${y}n` : y)); } catch { return String(x); } };
  read(new Proxy(fdp, {
    get(target, name) {
      const v = Reflect.get(target, name, target);
      if (typeof v !== "function") return v;
      return (...args) => {
        const r = Reflect.apply(v, target, args);
        asked.push(`${String(name)}(${args.map(show).join(", ")}) = ${typeof r === "function" ? "a function" : show(r)}`);
        return r;
      };
    },
  }));
  return asked;
}

const FUZZ = path.join(import.meta.dirname, "..", "fuzz");
// lib.mjs's values, the answers first: a value of no bounds takes what is left
// of an input.
const READERS = { "lib.mjs's values": (fdp) => [answer(fdp, bytes(fdp), "text/html"), answer(fdp, string(fdp), "text/plain"), jsonText(fdp, value(fdp)), value(fdp)] };
for (const target of ["site-contact", "syllabus-detail", "syllabus-search", "background-message"]) {
  READERS[target] = (await import(pathToFileURL(path.join(FUZZ, "targets", `${target}.fuzz.mjs`)).href)).read;
}

for (const [name, read] of Object.entries(READERS)) {
  test(`every rung reads an input alike: ${name}`, () => {
    // The seeds that climb rungs, and inputs at random.
    const seeds = fs.readdirSync(path.join(FUZZ, "seeds")).flatMap((t) => fs.readdirSync(path.join(FUZZ, "seeds", t)).map((f) => fs.readFileSync(path.join(FUZZ, "seeds", t, f))));
    const alike = (data) => {
      const bottom = questions(read, data, 1);
      for (const m of [2, 8]) assert.deepEqual(questions(read, data, m), bottom, `rung ×${m} of ${Buffer.from(data).toString("hex")}`);
    };
    for (const data of seeds) alike(data);
    fc.assert(fc.property(fc.uint8Array({ maxLength: 600 }), (data) => alike(Buffer.from(data))), { numRuns: 2000 }); // the provider reads a Buffer
  });
}
