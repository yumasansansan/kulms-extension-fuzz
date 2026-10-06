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
import { Browser, openTab, settle, until } from "../harness/index.mjs";
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

// The sidebar with course C2, its tool config in localStorage being `config`
// as the page left it there (the page's own scripts can write it), once
// tool-visibility.js has moved "お知らせ" under the toggle for other tools.
async function sidebarWithConfig(t, config) {
  const browser = new Browser();
  t.after(() => browser.close());
  browser.storage.local.load({ "kulms-settings": { toolVisibility: true } });
  const tab = openTab(browser, {
    url: `${LMS}/portal`,
    html: `<body><nav id="portal-nav-sidebar"><ul>${course("C2", ["概要", "お知らせ"])}</ul></nav></body>`,
    prepare: (w) => w.localStorage.setItem("kulms-tool-config", config),
  });
  const notices = () => [...tab.document.querySelectorAll(".nav-item")].find((li) => li.textContent.includes("お知らせ"));
  await until(() => notices() && notices().classList.contains("kulms-hidden-tool"), { timeout: 2000 });
  return { tab, notices };
}

test("B12: a tool config in which the page has put a key hasOwnProperty is read", { todo: "B12: config[siteId].hasOwnProperty(…) is not a function" }, async (t) => {
  const { notices } = await sidebarWithConfig(t, JSON.stringify({ C2: { hasOwnProperty: 1 } }));
  assert.ok(notices().classList.contains("kulms-hidden-tool"), "お知らせ is not moved under the toggle");
});

test("B12: a tool shown from a course whose config the page has made a string is shown", { todo: "B12: a property is set on the string, which throws in strict mode" }, async (t) => {
  const { tab, notices } = await sidebarWithConfig(t, JSON.stringify({ C2: "x" }));
  notices().querySelector(".kulms-tool-toggle").click();
  assert.equal(notices().classList.contains("kulms-hidden-tool"), false);
  assert.deepEqual(JSON.parse(tab.window.localStorage.getItem("kulms-tool-config")), { C2: { "お知らせ": true } });
});
