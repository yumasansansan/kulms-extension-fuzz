// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The harness itself: that it changes no line of a script it exposes, that its
// chrome API behaves as Chrome's does where the extension depends on it, and
// that its detectors see what they are for.
import test from "node:test";
import assert from "node:assert/strict";
import { Browser, contentScriptsFor, exposeInternals, openBackground, openTab, read, settle, watch } from "../harness/index.mjs";
import { LMS } from "./lms.mjs";

test("exposing an IIFE's internals moves no line and keeps its directive first", () => {
  const code = '(function () {\n  "use strict";\n  var a = 1;\n  let b = 2;\n  const c = 3;\n  function f() { return a + b + c; }\n  if (true) return;\n})();\n';
  const out = exposeInternals(code, "x.js");
  assert.equal(out.split("\n").length, code.split("\n").length);
  assert.match(out.split("\n")[1], /^ {2}"use strict"; if \(globalThis\.__kulmsExpose\)/);
  let internals;
  const g = { __kulmsExpose: (file, i) => { internals = i; } };
  new Function("g", out.replace(/globalThis/g, "g"))(g);
  assert.equal(internals.f(), 6);
  internals.a = 10;
  assert.equal(internals.f(), 15);
  assert.equal(Object.getOwnPropertyDescriptor(internals, "c").set, undefined);
});

test("exposing every script of the extension moves no line of it", () => {
  const scripts = [...new Set(contentScriptsFor(`${LMS}/portal`).concat(["background.js", "popup.js", "src/auth-totp.js", "src/auth-totp-register.js"]))]
    .filter((s) => !s.startsWith("vendor/"));
  for (const s of scripts) {
    const code = read(s);
    assert.equal(exposeInternals(code, s).split("\n").length, code.split("\n").length, s);
  }
});

test("a message with no listener to take it gives lastError, as Chrome does", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  const seen = await new Promise((resolve) => tab.window.chrome.runtime.sendMessage({ type: "x" }, () => resolve(tab.window.chrome.runtime.lastError)));
  assert.match(seen.message, /Receiving end does not exist/);
  assert.equal(tab.window.chrome.runtime.lastError, undefined);
});

test("what one tab stores another reads, and is told of", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const a = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  const b = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  const changes = [];
  b.window.chrome.storage.onChanged.addListener((c, area) => changes.push([Object.keys(c), area]));
  a.window.chrome.storage.local.set({ k: { v: [1, 2] } });
  await settle(10);
  const got = await new Promise((resolve) => b.window.chrome.storage.local.get("k", resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(got)), { k: { v: [1, 2] } });
  assert.ok(Array.isArray(got.k.v) && got.k.v instanceof b.window.Array, "the value comes out in the reader's realm");
  assert.deepEqual(changes, [[["k"], "local"]]);
});

test("a tab may fetch only the extension's files that web_accessible_resources opens to it", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  const ok = await tab.window.fetch(tab.window.chrome.runtime.getURL("_locales/ja/messages.json"));
  assert.ok((await ok.json()).extName);
  await assert.rejects(tab.window.fetch(tab.window.chrome.runtime.getURL("background.js")));
});

test("the detectors see markup that runs script, a polluted prototype and an error of a listener", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const tab = openTab(browser, { url: `${LMS}/portal`, html: '<body><a href="javascript:void(0)" onclick="x()">kept</a></body>', scripts: [] });
  const bg = openBackground(browser);
  const w = watch(tab);
  assert.deepEqual(w.check(), [], "what the page had before is not reported");
  tab.document.body.insertAdjacentHTML("beforeend", '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>');
  tab.window.eval("Object.prototype.polluted = 1");
  bg.events.onMessage.addListener(() => { throw new Error("boom"); });
  await browser.deliver(tab, [bg], {}).catch(() => {});
  const problems = w.check().join("\n");
  assert.match(problems, /<img src="x" onerror="alert\(1\)">/);
  assert.match(problems, /<a href="javascript:alert\(1\)">/);
  assert.match(problems, /prototype gained Object\.prototype\.polluted/);
  assert.match(problems, /boom/);
});
