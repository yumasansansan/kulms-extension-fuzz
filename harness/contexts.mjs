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
import { IDBDatabase, IDBFactory } from "fake-indexeddb";
import { loadedSource } from "./source.mjs";
import { EXT, manifest, read } from "./paths.mjs";
import { globToRegExp, matchesPattern } from "./chrome.mjs";
import { record } from "./log.mjs";
import { Net, response } from "./net.mjs";
import { backtrackingRegExp, costedClass, costedFunction, installCosts } from "./install.mjs";
import { compare, finished, forIn, has, instanceOf, key, random, spread, started, step, tracked, trackedCrypto, uncounted } from "./work.mjs";

// What the extension's code calls to count its work (harness/work.mjs,
// harness/install.mjs), in each context.
const COUNTING = {
  __kulmsWork: step,
  __kulmsBacktracking: backtrackingRegExp,
  __kulmsCompare: compare,
  __kulmsKey: key,
  __kulmsSpread: spread,
  __kulmsInstanceOf: instanceOf,
  __kulmsIn: has,
  __kulmsForIn: forIn,
};

// The units of a value as IndexedDB keeps it, which its structured clone
// goes through: strings, elements, properties and bytes, at any depth.
function cloneUnits(root) {
  let n = 0;
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const v = stack.pop();
    n++;
    if (typeof v === "string") n += v.length;
    if (v === null || typeof v !== "object" || seen.has(v)) continue;
    seen.add(v);
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) {
      n += v.byteLength;
      continue;
    }
    for (const k of Reflect.ownKeys(v)) {
      n += typeof k === "string" ? k.length : 1;
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (d && "value" in d) stack.push(d.value);
    }
  }
  return n;
}

// IndexedDB's requests to open or delete a database, and its transactions,
// are followed until they end (idle() of harness/work.mjs).
function follow(target, events) {
  started();
  let done = false;
  const end = () => {
    if (!done) {
      done = true;
      finished();
    }
  };
  target.addEventListener("success", () => {
    const result = uncounted(() => target.result);
    if (result !== undefined && (typeof result !== "object" || result === null || !("objectStoreNames" in result))) step(1 + uncounted(() => cloneUnits(result)));
  });
  for (const e of events) target.addEventListener(e, end);
  return target;
}
for (const name of ["open", "deleteDatabase"]) {
  const original = IDBFactory.prototype[name];
  IDBFactory.prototype[name] = function (...args) {
    return follow(Reflect.apply(original, this, args), ["success", "error"]);
  };
}
{
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    return follow(Reflect.apply(transaction, this, args), ["complete", "abort"]);
  };
}

const EMPTY_PAGE = "<!doctype html><html><head></head><body></body></html>";
const TYPES = { ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png" };

// A console that keeps what the extension writes instead of printing it.
function quietConsole(context) {
  context.logs = [];
  const keep = (level) => (...args) => record(context.logs, { level, args });
  return { log: keep("log"), info: keep("info"), warn: keep("warn"), error: keep("error"), debug: keep("debug") };
}

function run(context, rel) {
  const { code, file } = loadedSource(rel);
  if (context.kind === "background") vm.runInContext(code, context.global, { filename: file });
  else context.evaluate(code + "\n//# sourceURL=" + pathToFileURL(file).href);
}

// Whether `url` matches `glob` of a content script's include_globs or
// exclude_globs: * stands for any characters, ? for one, the rest for itself.
function globMatches(glob, url) {
  return new RegExp("^" + [...glob].map((c) => (c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.+^${}()|[\]\\]/g, "\\$&"))).join("") + "$").test(url);
}

// The scripts manifest.json injects into a frame at `url`, in its order: of
// the content scripts whose matches it is in, and none of whose
// exclude_matches; and, where they are given, one of whose include_globs and
// none of whose exclude_globs.
export function contentScriptsFor(url, topFrame = true) {
  return manifest.content_scripts
    .filter((cs) => (topFrame || cs.all_frames) && cs.matches.some((p) => matchesPattern(p, url)) &&
      !(cs.exclude_matches || []).some((p) => matchesPattern(p, url)) &&
      (!cs.include_globs || cs.include_globs.some((g) => globMatches(g, url))) &&
      !(cs.exclude_globs || []).some((g) => globMatches(g, url)))
    .flatMap((cs) => cs.js || []);
}

function webAccessible(rel, pageUrl) {
  return (manifest.web_accessible_resources || []).some((r) =>
    r.matches.some((p) => matchesPattern(p, pageUrl)) && r.resources.some((g) => globToRegExp(g).test(rel)));
}

function fetchFor(browser, context) {
  const base = `chrome-extension://${browser.id}/`;
  const viaNet = context.net.fetchFor(context);
  const fetch = async (input, init) => {
    const raw = typeof input === "object" && input && "url" in input ? input.url : String(input);
    if (!raw.startsWith(base)) return viaNet(input, init);
    const rel = decodeURIComponent(new URL(raw).pathname.slice(1));
    const file = path.join(EXT, rel);
    const allowed = context.kind !== "tab" || webAccessible(rel, context.url);
    if (!allowed || !file.startsWith(EXT + path.sep) || !fs.existsSync(file)) throw new context.realm.TypeError("Failed to fetch");
    return response(context.realm, raw, { body: fs.readFileSync(file), headers: { "content-type": TYPES[path.extname(rel)] || "application/octet-stream" } });
  };
  return (input, init) => tracked(fetch(input, init));
}

export function openBackground(browser, { net = new Net() } = {}) {
  const context = browser.register({ kind: "background", url: `chrome-extension://${browser.id}/background.js`, net });
  const g = vm.createContext({});
  context.global = g;
  // A vm context's global, seen from outside, holds only what was put on it;
  // its own built-ins (the realm values arrive in) are on its global object,
  // reached from inside.
  context.realm = vm.runInContext("globalThis", g);
  context.indexedDB = browser.indexedDB || (browser.indexedDB = new IDBFactory());
  Object.assign(g, {
    self: g,
    chrome: browser.apiFor(context),
    fetch: fetchFor(browser, context),
    indexedDB: context.indexedDB,
    navigator: { storage: { persist: async () => true, persisted: async () => true } },
    crypto: trackedCrypto,
    // Node's own, which the harness and jsdom use as well: subclasses that
    // count, by the rules of their web interfaces.
    TextEncoder: costedClass(TextEncoder, "TextEncoder"),
    TextDecoder: costedClass(TextDecoder, "TextDecoder"),
    URL: costedClass(URL, "URL"),
    URLSearchParams: costedClass(URLSearchParams, "URLSearchParams"),
    btoa: costedFunction(btoa),
    atob: costedFunction(atob),
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    console: quietConsole(context),
    Fuzzer: globalThis.Fuzzer,
    ...COUNTING,
  });
  context.realm.Math.random = random; // an input's draws, the same on each of its rungs (harness/work.mjs)
  installCosts(context.realm);
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
  Object.defineProperty(w, "crypto", { value: trackedCrypto, configurable: true });
  w.Fuzzer = globalThis.Fuzzer;
  Object.assign(w, COUNTING);
  // The harness runs the extension's scripts with the window's own eval, not
  // the counted one: loading a script is not the extension's work.
  context.evaluate = w.eval.bind(w);
  w.Math.random = random; // an input's draws, the same on each of its rungs (harness/work.mjs)
  installCosts(w, { web: w });
  w.__kulmsExpose = (file, internals) => { context.internals[file] = internals; };
  w.console = quietConsole(context);
  // The page's timers do not keep Node running: a test or a fuzz target ends
  // when its own work does, though the extension leaves intervals behind (the
  // assignment panel fetches anew every two minutes). They run as Node's
  // timers, unreferenced, which a script uses as it would a browser's, and
  // stop when the page closes, as a closed tab's do.
  const callable = (f) => (typeof f === "function" ? f : () => w.eval(String(f)));
  const timers = new Set();
  w.setTimeout = (f, ms, ...args) => {
    const t = setTimeout((...a) => {
      timers.delete(t);
      callable(f)(...a);
    }, ms, ...args).unref();
    timers.add(t);
    return t;
  };
  w.setInterval = (f, ms, ...args) => {
    const t = setInterval(callable(f), ms, ...args).unref();
    timers.add(t);
    return t;
  };
  w.clearTimeout = (t) => {
    timers.delete(t);
    clearTimeout(t);
  };
  w.clearInterval = (t) => {
    timers.delete(t);
    clearInterval(t);
  };
  context.close = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
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
