// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// Speculative loading (prerender.js): on a top page of the LMS, where the
// browser runs speculation rules (HTMLScriptElement.supports(), as Chrome's
// does) and the user has not turned it off (linkPrerender), the extension
// puts in rules by which the browser prerenders the pages of the links of the
// sidebar and of the bar of pinned courses once the pointer rests on one. What
// the rules have the browser load is read as the HTML Standard reads them
// (speculativeLoads() of harness/detectors.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { Browser, idle, openTab } from "../harness/index.mjs";
import { speculativeLoads } from "../harness/detectors.mjs";
import { LMS } from "./lms.mjs";

// Sakai's sidebar with a pinned course: its link to the site, and its tools'
// links, which reset the tool (/tool-reset/), as Sakai writes them and as the
// extension's own notes say (docs/sakai-network-requests.md there).
const SIDEBAR = '<nav id="portal-nav-sidebar"><ul id="pinned-site-list">' +
  '<li class="site-list-item" id="site-list-item-S1"><div class="site-list-item-head"><a href="/portal/site/S1" title="線形代数">線形代数</a></div>' +
  '<ul class="site-page-list"><li class="nav-item"><a href="/portal/site/S1/tool-reset/T1"><span>課題</span></a></li>' +
  '<li class="nav-item"><a href="/portal/site/S1/tool-reset/T2"><span>授業資料（リソース）</span></a></li></ul></li>' +
  "</ul></nav>";

// The page of a tool of S1, its content `content`, with the settings
// `settings` stored, once the extension has set itself up.
async function page(t, settings = {}, content = "") {
  const browser = new Browser();
  t.after(() => browser.close());
  browser.storage.local.load({ "kulms-settings": settings });
  const html = `<body>${SIDEBAR}<main id="content">${content}</main></body>`;
  const tab = openTab(browser, { url: `${LMS}/portal/site/S1/tool-reset/T1`, html, scripts: ["src/settings.js", "src/prerender.js"] });
  await idle();
  return tab;
}

const rulesOf = (tab) => tab.document.getElementById("kulms-speculation-rules");

test("the extension puts in its speculation rules, which take the sidebar's links, unless the user has turned them off", async (t) => {
  const on = await page(t);
  assert.equal(rulesOf(on)?.type, "speculationrules");
  assert.ok(speculativeLoads(on.document).includes(`${LMS}/portal/site/S1`));
  const off = await page(t, { linkPrerender: false });
  assert.equal(rulesOf(off), null);
});

// B28 (docs/findings.md): Sakai resets a tool, dropping what the user's
// session holds of it, as its tool-reset URL is loaded, which a prerender
// does on a hover. The rules take the links of the sidebar's tools, and those
// of any element with the sidebar's ID, wherever the page has one: a post in
// a tool that holds markup may put one in.
test("B28: the speculation rules have the browser prerender no link that resets a tool", { todo: "B28: /portal/site/* takes in the tools' links, /tool-reset/ among them" }, async (t) => {
  const post = '<div class="post"><div id="portal-nav-sidebar"><a href="/portal/site/S2/tool-reset/T9">資料はこちら</a></div></div>';
  const tab = await page(t, {}, post);
  assert.deepEqual(speculativeLoads(tab.document).filter((u) => new URL(u).pathname.includes("/tool-reset/")), []);
});

// B29 (docs/findings.md): Sakai records a visit of the user to a site as it
// serves a page of the site, which a prerender on a hover has it record
// though the user never went there. A rule whose eagerness is conservative
// loads a page once the user begins to follow its link (the pointer pressed
// on it), and no sooner; the eagerness of a rule that gives none is
// conservative for a document rule and immediate for a list rule (the HTML
// Standard's "parse a speculation rule").
test("B29: the speculation rules have the browser load a page only once the user begins to follow its link", { todo: "B29: eagerness moderate prerenders on a hover of about 200 ms" }, async (t) => {
  const tab = await page(t);
  const set = JSON.parse(rulesOf(tab).textContent);
  const rules = [...(set.prefetch || []), ...(set.prerender || [])];
  assert.ok(rules.length > 0);
  for (const rule of rules) assert.equal(rule.eagerness ?? (Object.hasOwn(rule, "urls") ? "immediate" : "conservative"), "conservative");
});
