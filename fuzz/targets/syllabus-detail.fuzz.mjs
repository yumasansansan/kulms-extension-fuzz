// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// background.js's fetchSyllabusDetail(), which reads the textbooks and
// reference books out of a syllabus page of KULASIS with regular expressions.
// The page is the input: its first byte picks the charset the server names
// (Shift_JIS, UTF-8, EUC-JP, Windows-31J or none, which the code takes for
// Shift_JIS), the rest are the bytes of the page. What a teacher writes in a
// syllabus reaches this code, so the page is as much the teacher's as the
// university's.
//
// It fails when the parser throws, when a book it returns is not one (a title
// of three characters or more, the other fields strings, an ISBN of digits, a
// type of textbook or reference), or when a detector of the harness sees
// something (harness/detectors.mjs). An input that takes longer than the
// fuzzer's --timeout is a regular expression that backtracks.
import { Browser, Net, openBackground, watch } from "../../harness/index.mjs";
import { fail } from "../lib.mjs";

const CHARSETS = ["shift_jis", "utf-8", "euc-jp", "windows-31j", ""];
let page = { type: "text/html", body: new Uint8Array() };
const net = new Net().on("https://www.k.kyoto-u.ac.jp/external/open_syllabus/", () => ({ headers: { "content-type": page.type }, body: page.body }));
const bg = openBackground(new Browser(), { net });

export async function fuzz(data) {
  const charset = CHARSETS[data.length ? data[0] % CHARSETS.length : 0];
  page = { type: charset ? `text/html; charset=${charset}` : "text/html", body: data.subarray(1) };
  const w = watch(bg);
  const books = await bg.global.fetchSyllabusDetail("1", "2");
  if (!Array.isArray(books)) fail(`not a list: ${books}`);
  for (const b of books) {
    if (typeof b.title !== "string" || b.title.length <= 2) fail(`title ${JSON.stringify(b.title)}`);
    for (const k of ["author", "publisher", "isbn"]) if (typeof b[k] !== "string") fail(`${k} ${JSON.stringify(b[k])}`);
    if (!/^\d*$/.test(b.isbn)) fail(`isbn ${JSON.stringify(b.isbn)}`);
    if (b.type !== "textbook" && b.type !== "reference") fail(`type ${JSON.stringify(b.type)}`);
  }
  const problems = w.check();
  if (problems.length) fail(problems.join("\n"));
}
