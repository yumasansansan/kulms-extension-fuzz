// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The places the extension's code runs: its background (a vm context, as its
// service worker has no DOM), a tab of the LMS or of the university's login
// pages (a jsdom window, running the content scripts manifest.json gives that
// URL), and its popup (a jsdom window of popup.html).
//
// A context's IIFEs hand their internals to context.internals[file]
// (source.mjs). The scripts run with Fuzzer, Jazzer.js's global, when it is
// there, which the instrumented code reports its coverage to.
//
// A context fetches the extension's own files (chrome-extension://<id>/...)
// from the checkout, as Chrome serves them: a tab only those that
// web_accessible_resources opens to its page, the background and the popup
// any of them. Everything else goes to its Net.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { loadedSource } from "./source.mjs";
import { EXT, manifest, read } from "./paths.mjs";
import { globToRegExp, matchesPattern } from "./chrome.mjs";
import { Net, response } from "./net.mjs";

const EMPTY_PAGE = "<!doctype html><html><head></head><body></body></html>";
const TYPES = { ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png" };

// A console that keeps what the extension writes instead of printing it.
function quietConsole(context) {
  context.logs = [];
  const keep = (level) => (...args) => context.logs.push({ level, args });
  return { log: keep("log"), info: keep("info"), warn: keep("warn"), error: keep("error"), debug: keep("debug") };
}

function run(context, rel) {
  const { code, file } = loadedSource(rel);
  if (context.kind === "background") vm.runInContext(code, context.global, { filename: file });
  else context.global.eval(code + "\n//# sourceURL=" + pathToFileURL(file).href);
}

// The scripts manifest.json injects into a frame at `url`, in its order.
export function contentScriptsFor(url, topFrame = true) {
  return manifest.content_scripts
    .filter((cs) => (topFrame || cs.all_frames) && cs.matches.some((p) => matchesPattern(p, url)))
    .flatMap((cs) => cs.js || []);
}

function webAccessible(rel, pageUrl) {
  return (manifest.web_accessible_resources || []).some((r) =>
    r.matches.some((p) => matchesPattern(p, pageUrl)) && r.resources.some((g) => globToRegExp(g).test(rel)));
}

function fetchFor(browser, context) {
  const base = `chrome-extension://${browser.id}/`;
  const viaNet = context.net.fetchFor(context);
  return async (input, init) => {
    const raw = typeof input === "object" && input && "url" in input ? input.url : String(input);
    if (!raw.startsWith(base)) return viaNet(input, init);
    const rel = decodeURIComponent(new URL(raw).pathname.slice(1));
    const file = path.join(EXT, rel);
    const allowed = context.kind !== "tab" || webAccessible(rel, context.url);
    if (!allowed || !file.startsWith(EXT + path.sep) || !fs.existsSync(file)) throw new context.realm.TypeError("Failed to fetch");
    return response(context.realm, raw, { body: fs.readFileSync(file), headers: { "content-type": TYPES[path.extname(rel)] || "application/octet-stream" } });
  };
}

export function openBackground(browser, { net = new Net() } = {}) {
  const context = browser.register({ kind: "background", url: `chrome-extension://${browser.id}/background.js`, net });
  const g = vm.createContext({});
  context.global = g;
  // A vm context's global, seen from outside, holds only what was put on it;
  // its own built-ins (the realm values arrive in) are reached from inside.
  context.realm = vm.runInContext("({ JSON, Object, Array, Function, String, Uint8Array, TypeError, Error, Promise })", g);
  context.indexedDB = browser.indexedDB || (browser.indexedDB = new IDBFactory());
  Object.assign(g, {
    self: g,
    chrome: browser.apiFor(context),
    fetch: fetchFor(browser, context),
    indexedDB: context.indexedDB,
    navigator: { storage: { persist: async () => true, persisted: async () => true } },
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder, URL, URLSearchParams, btoa, atob,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    console: quietConsole(context),
    Fuzzer: globalThis.Fuzzer,
  });
  context.close = () => browser.unregister(context);
  run(context, "background.js");
  return context;
}

function openWindow(browser, context, html, url) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => browser.report(context, e, "script"));
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  context.global = w;
  context.realm = w;
  context.window = w;
  context.document = w.document;
  context.internals = {};
  w.chrome = browser.apiFor(context);
  w.fetch = fetchFor(browser, context);
  w.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  // jsdom has no SubtleCrypto, which the TOTP code uses; Node's stands in.
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, "crypto", { value: globalThis.crypto, configurable: true });
  w.Fuzzer = globalThis.Fuzzer;
  w.__kulmsExpose = (file, internals) => { context.internals[file] = internals; };
  w.console = quietConsole(context);
  // The page's timers do not keep Node running: a test or a fuzz target ends
  // when its own work does, though the extension leaves intervals behind (the
  // assignment panel fetches anew every two minutes). They run as Node's
  // timers, unreferenced, which a script uses as it would a browser's.
  const callable = (f) => (typeof f === "function" ? f : () => w.eval(String(f)));
  w.setTimeout = (f, ms, ...args) => setTimeout(callable(f), ms, ...args).unref();
  w.setInterval = (f, ms, ...args) => setInterval(callable(f), ms, ...args).unref();
  w.clearTimeout = (t) => clearTimeout(t);
  w.clearInterval = (t) => clearInterval(t);
  context.close = () => {
    browser.unregister(context);
    w.close();
  };
  return w;
}

// A tab at `url` with the page `html`, running the content scripts the
// manifest gives that URL (or `scripts`, when given), after `prepare(window)`
// has had its turn (to set the clock, say). A frame of a tab is opened with
// `frameOf` set to the tab's context.
export function openTab(browser, { url, html = EMPTY_PAGE, net = new Net(), scripts, frameOf = null, prepare } = {}) {
  const top = frameOf ? (frameOf.frameOf || frameOf) : null;
  const context = browser.register({
    kind: "tab",
    url,
    net,
    tabId: top ? top.tabId : browser.nextTabId++,
    frameId: top ? (top.nextFrameId = (top.nextFrameId || 0) + 1) : 0,
    topUrl: top ? top.url : url,
    frameOf: top,
  });
  const w = openWindow(browser, context, html, url);
  if (prepare) prepare(w);
  for (const rel of scripts || contentScriptsFor(url, !top)) run(context, rel);
  return context;
}

export function openPopup(browser, { net = new Net(), prepare } = {}) {
  const url = `chrome-extension://${browser.id}/popup.html`;
  const context = browser.register({ kind: "popup", url, net });
  const w = openWindow(browser, context, read("popup.html"), url);
  if (prepare) prepare(w);
  const loading = w.document.readyState === "loading";
  for (const rel of ["vendor/qrcode-gen.js", "popup.js"]) run(context, rel);
  // popup.js waits for DOMContentLoaded; it gets it, whether or not jsdom
  // sent it before the script ran.
  if (!loading) w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  return context;
}

// Waits `ms` for the timers and callbacks the extension started.
export const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until `condition()` holds, for `timeout` ms at most, and says whether
// it came to hold. Where a test waits for something the extension does, this
// holds on a runner slower than the machine the test was written on, which a
// wait of a fixed time need not.
export async function until(condition, { timeout = 5000 } = {}) {
  const end = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() >= end) return false;
    await settle(5);
  }
  return true;
}
