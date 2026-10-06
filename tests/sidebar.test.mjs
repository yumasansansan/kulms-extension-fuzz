// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The sidebar of the LMS with every content script of the manifest running,
// tool visibility (tool-visibility.js) turned on.
import test from "node:test";
import assert from "node:assert/strict";
import { Browser, openTab, settle } from "../harness/index.mjs";
import { LMS } from "./lms.mjs";

const course = (id, tools) => `<li class="site-list-item" id="site-list-item-${id}"><ul class="site-page-list">` +
  tools.map((t, i) => `<li class="nav-item"><a href="/portal/site/${id}/tool/${i}"><span>${t}</span></a></li>`).join("") +
  "</ul></li>";

// How many batches of DOM changes the page sees in `ms` after one change of
// its own, which any LMS page makes all the time.
async function batchesAfterOneChange(t, courses, ms) {
  const browser = new Browser();
  t.after(() => browser.close());
  browser.storage.local.load({ "kulms-settings": { toolVisibility: true } });
  const tab = openTab(browser, { url: `${LMS}/portal`, html: `<body><nav id="portal-nav-sidebar"><ul>${courses}</ul></nav></body>` });
  await settle(800);
  let batches = 0;
  new tab.window.MutationObserver(() => batches++).observe(tab.document.body, { childList: true, subtree: true });
  tab.document.body.appendChild(tab.document.createElement("div"));
  await settle(ms);
  return batches;
}

test("a sidebar where every course hides a tool settles", async (t) => {
  assert.ok(await batchesAfterOneChange(t, course("C2", ["概要", "お知らせ"]), 1500) <= 2);
});

test("B4: a course with every tool shown does not keep the sidebar busy", { todo: "B4: it is moved again every 200 ms, for as long as the page is open" }, async (t) => {
  const batches = await batchesAfterOneChange(t, course("C1", ["概要", "授業資料（リソース）", "課題"]) + course("C2", ["概要", "お知らせ"]), 1500);
  assert.ok(batches <= 2, `${batches} batches of changes in 1.5 s`);
});
