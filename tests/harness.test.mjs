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
import vm from "node:vm";
import { Browser, Net, contentScriptsFor, exposeInternals, openBackground, openTab, read, settle, watch } from "../harness/index.mjs";
import { beginInput, endInput } from "../harness/work.mjs";
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

test("the extension's draws of chance begin anew with each input, the same from the same seed", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const bg = openBackground(browser);
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  // Three draws in the background and three in the tab, as an input whose
  // seed is `seed` draws them.
  const draws = (seed) => {
    beginInput(0, { judge: false, seed });
    const got = [...vm.runInContext("[Math.random(), Math.random(), Math.random()]", bg.global), ...tab.window.eval("[Math.random(), Math.random(), Math.random()]")];
    endInput();
    return got;
  };
  const first = draws(7);
  assert.deepEqual(draws(7), first);
  assert.notDeepEqual(draws(8), first);
  for (const x of first) assert.ok(x >= 0 && x < 1, `${x} is a draw in [0, 1)`);
  assert.equal(new Set(first).size, first.length);
});

test("an answer arrives even when copying it passes what the input's work may be", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const bg = openBackground(browser);
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  // A listener that answers, and answers again with the error when its answer
  // throws, as the extension's listeners catch what their work throws.
  vm.runInContext(`chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    try { sendResponse({ books: ["${"x".repeat(1000)}"] }); } catch (e) { sendResponse({ error: String(e) }); }
  });`, bg.global);
  // Enough work for the message to reach the listener, not for the answer's
  // copy into the tab's realm, which counts its thousand units.
  beginInput(0, { cap: 200 });
  const answered = await Promise.race([browser.deliver(tab, [bg], { type: "x" }).then(() => true, () => true), settle(2000).then(() => false)]);
  const work = endInput();
  assert.ok(work.over, "the answer's copy passed the work it may be");
  assert.ok(answered, "the answer was lost where its copy threw");
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

// A fuzz target runs millions of inputs in one browser; the daily fuzzing ran
// out of its 4 GB when these logs kept every entry.
test("the logs of the console, of the network and of the messages are forgotten when asked", async (t) => {
  const net = new Net().on("https://www.k.kyoto-u.ac.jp/", { body: "" });
  const browser = new Browser();
  t.after(() => browser.close());
  const bg = openBackground(browser, { net });
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  bg.global.console.log("line");
  await bg.global.fetch("https://www.k.kyoto-u.ac.jp/");
  await browser.deliver(tab, [bg], { type: "x" }).catch(() => {}); // no listener answers it
  for (const [name, log] of [["console", bg.logs], ["network", net.requests], ["messages", browser.traffic]]) assert.equal(log.length, 1, name);
  browser.forget();
  net.forget();
  for (const [name, log] of [["console", bg.logs], ["network", net.requests], ["messages", browser.traffic]]) assert.equal(log.length, 0, name);
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
