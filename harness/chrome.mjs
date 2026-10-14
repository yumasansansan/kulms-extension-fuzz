// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The browser the extension runs in: the chrome API its scripts call, shared
// by every context of one Browser — the background, each tab and its frames,
// the popup — as one profile of Chrome shares it.
//
// What crosses between contexts goes as JSON, and comes out as objects of the
// realm it arrives in, as Chrome serializes messages and stored values.
// Callbacks and listeners run on a later turn, never inside the call that
// caused them. A callback that Chrome would give an error sees it in
// chrome.runtime.lastError while it runs. An exception a listener throws is
// kept in browser.errors rather than lost, and so is a promise of any
// context that is rejected with nothing to handle it.
import { record } from "./log.mjs";
import { codeGrew, finished, started, step, tracked } from "./work.mjs";
import { manifest, read } from "./paths.mjs";

export const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";

// Whether the URLs `a` and `b` are of the same origin: an opaque origin (a
// chrome:, data: or about: page) is the same as no other
// (https://html.spec.whatwg.org/multipage/browsers.html#same-origin).
function sameOrigin(a, b) {
  let x;
  let y;
  try {
    x = new URL(a).origin;
    y = new URL(b).origin;
  } catch {
    return false;
  }
  return x !== "null" && x === y;
}
const later = (f) => {
  started();
  setTimeout(() => {
    try {
      f();
    } finally {
      finished();
    }
  }, 0);
};

class ChromeEvent {
  constructor() { this.listeners = []; }
  addListener(f) {
    if (typeof f !== "function") throw new TypeError("addListener takes a function");
    if (!this.listeners.includes(f)) this.listeners.push(f);
  }
  removeListener(f) { this.listeners = this.listeners.filter((g) => g !== f); }
  hasListener(f) { return this.listeners.includes(f); }
  hasListeners() { return this.listeners.length > 0; }
}

// A value as it arrives in `realm` (a window or a vm context's global).
function copyInto(realm, value) {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value);
  return json === undefined ? undefined : (realm && realm.JSON ? realm.JSON : JSON).parse(json);
}

// Chrome's i18n: $1 to $9 and named placeholders, $$ for a dollar sign.
function formatMessage(entry, substitutions) {
  if (!entry) return "";
  const subs = substitutions == null ? [] : (Array.isArray(substitutions) ? substitutions : [substitutions]).map(String);
  const positional = (s) => s.replace(/\$(\d)/g, (m, d) => (subs[d - 1] !== undefined ? subs[d - 1] : ""));
  let text = String(entry.message).replace(/\$([\w@]+)\$/g, (m, name) => {
    const ph = entry.placeholders && Object.keys(entry.placeholders).find((k) => k.toLowerCase() === name.toLowerCase());
    return ph ? positional(String(entry.placeholders[ph].content)) : m;
  });
  return text.replace(/\$\$/g, "$");
}

export function globToRegExp(glob) {
  return new RegExp("^" + glob.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
}

// Whether `url` matches the match pattern `pattern` (scheme://host/path).
export function matchesPattern(pattern, url) {
  if (pattern === "<all_urls>") return /^(?:https?|file):/.test(url);
  const m = /^(\*|https?|file|chrome-extension):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!m) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  const scheme = u.protocol.slice(0, -1);
  if (m[1] === "*" ? !/^https?$/.test(scheme) : m[1] !== scheme) return false;
  const host = m[2];
  if (host !== "*" && !(host.startsWith("*.") ? (u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1))) : u.hostname === host)) return false;
  return globToRegExp(m[3]).test(u.pathname + u.search);
}

class StorageArea {
  constructor(browser, name) {
    this.browser = browser;
    this.name = name;
    this.data = new Map();
  }

  // The area as `context` sees it.
  api(context) {
    const realm = () => context.realm;
    const answer = (cb, value) => this.browser.answer(context, cb, value);
    return {
      get: (keys, cb) => {
        if (typeof keys === "function") { cb = keys; keys = null; }
        const out = {};
        const take = (k, fallback) => {
          if (this.data.has(k)) out[k] = copyInto(realm(), this.data.get(k));
          else if (fallback !== undefined) out[k] = copyInto(realm(), fallback);
        };
        if (keys == null) for (const k of this.data.keys()) take(k);
        else if (typeof keys === "string") take(keys);
        else if (Array.isArray(keys)) keys.forEach((k) => take(String(k)));
        else if (typeof keys === "object") Object.entries(keys).forEach(([k, v]) => take(k, v));
        return answer(cb, copyInto(realm(), out));
      },
      set: (items, cb) => {
        const changes = {};
        for (const [k, v] of Object.entries(items || {})) {
          const value = copyInto(null, v);
          if (value === undefined) continue;
          changes[k] = { newValue: value };
          if (this.data.has(k)) changes[k].oldValue = this.data.get(k);
          this.data.set(k, value);
        }
        this.browser.changed(changes, this.name);
        return answer(cb);
      },
      remove: (keys, cb) => {
        const changes = {};
        for (const k of [].concat(keys).map(String)) {
          if (!this.data.has(k)) continue;
          changes[k] = { oldValue: this.data.get(k) };
          this.data.delete(k);
        }
        this.browser.changed(changes, this.name);
        return answer(cb);
      },
      clear: (cb) => this.api(context).remove([...this.data.keys()], cb),
    };
  }

  // What the area holds, as plain values (for tests and targets to read and
  // seed, telling no listener).
  dump() { return Object.fromEntries([...this.data].map(([k, v]) => [k, copyInto(null, v)])); }
  load(items) { for (const [k, v] of Object.entries(items)) this.data.set(k, copyInto(null, v)); }
  unload(keys) { for (const k of keys) this.data.delete(k); }
}

export class Browser {
  constructor({ uiLanguage = "ja" } = {}) {
    this.id = EXTENSION_ID;
    this.manifest = manifest;
    this.uiLanguage = uiLanguage;
    this.messages = JSON.parse(read(`_locales/${uiLanguage === "ja" ? "ja" : "en"}/messages.json`));
    this.storage = { local: new StorageArea(this, "local"), session: new StorageArea(this, "session") };
    this.contexts = [];
    this.errors = [];
    this.caught = []; // what the extension caught and went on from (harness/detectors.mjs)
    this.untrusted = []; // what it passed a sink of Trusted Types that was no trusted value (harness/contexts.mjs)
    this.foreign = []; // the bodies it read of responses TLS does not vouch for as its servers' (harness/net.mjs)
    this.traffic = []; // runtime messages, as deliver() keeps them
    this.created = []; // tabs the extension asked to open
    this.injected = []; // what chrome.scripting.executeScript was asked to run
    this.scripts = new Set(); // the extension's scripts its contexts have run
    this.sites = 0; // their counting sites (harness/work.mjs)
    this.nextTabId = 1;
    this.standIns = {}; // the libraries the extension bundles that a test or a fuzz target stands in for, by path: f(window) puts one in a page (inject())
    this.activeTabId = null; // the tab in front in the window (tabOf())
    this.granted = new Set(); // the tabs that activeTab gives the extension (openPopup() of contexts.mjs)
    this.forgotten = 0; // how many times the logs were forgotten (forget())
    this.onRejection = (reason) => this.errors.push({ where: "unhandled rejection", error: reason });
    process.on("unhandledRejection", this.onRejection);
  }

  // Adds a context (made by contexts.mjs) and gives it its chrome API.
  register(context) {
    context.browser = this;
    context.lastError = undefined;
    context.events = { onMessage: new ChromeEvent(), onInstalled: new ChromeEvent(), onStartup: new ChromeEvent(), onChanged: new ChromeEvent() };
    this.contexts.push(context);
    // A tab the user opens comes to the front of the window.
    if (context.kind === "tab" && context.frameId === 0) this.activeTabId = context.tabId;
    return context;
  }

  unregister(context) {
    this.contexts = this.contexts.filter((c) => c !== context);
    // What activeTab gave ends when the tab closes.
    if (context.kind === "tab" && context.frameId === 0) {
      this.granted.delete(context.tabId);
      if (this.activeTabId === context.tabId) this.activeTabId = null;
    }
  }

  // The tabs.Tab that the extension is given of the tab of `context`
  // (https://developer.chrome.com/docs/extensions/reference/api/tabs#type-Tab):
  // its place among the tabs of its window, the one window there is, and
  // whether it is in front; its URL only where the extension may see the
  // page, as it has no "tabs" permission.
  tabOf(context) {
    const tops = this.contexts.filter((c) => c.kind === "tab" && c.frameId === 0);
    const tab = { id: context.tabId, index: tops.findIndex((c) => c.tabId === context.tabId), windowId: 1, active: context.tabId === this.activeTabId };
    if (this.sees(context.tabId, context.topUrl)) tab.url = context.topUrl;
    return tab;
  }

  // Whether the extension may see the page at `url` of tab `tabId`: one its
  // host permissions name, or one of the origin of the tab that activeTab
  // gave it.
  sees(tabId, url) {
    if ((this.manifest.host_permissions || []).some((p) => matchesPattern(p, url))) return true;
    const top = this.contexts.find((c) => c.kind === "tab" && c.tabId === tabId && c.frameId === 0);
    return this.granted.has(tabId) && Boolean(top) && sameOrigin(url, top.url);
  }

  // chrome.scripting.executeScript() of the context `from`, as Chrome does it
  // (https://developer.chrome.com/docs/extensions/reference/api/scripting):
  // the files or the function of `injection` run, a turn later, in the frames
  // of its target (the main frame, those of `frameIds`, or all of them with
  // `allFrames`), main frame first, each a page the extension may script
  // (host permissions, or activeTab: sees()). A function is serialized and
  // compiled anew in the page, so nothing it closed over comes along; its
  // `args` are copied as JSON. What it gives, a promise settled, is the
  // frame's result, and for files what the last one came to; results come
  // back as JSON does. The harness has one world to a page, so ISOLATED and
  // MAIN are one. What a function that throws gives, the documentation
  // leaves open: the throw is the extension's error, and the frame is left
  // out of the results, which hold the frames "where the injection
  // succeeded".
  inject(from, injection, cb) {
    record(this.injected, injection);
    const { target, files, func, args = [] } = injection || {};
    const fail = (message) => this.answer(from, cb, undefined, message);
    if (!target || !Number.isInteger(target.tabId)) return fail("Error in invocation of scripting.executeScript(): the target needs a tabId.");
    if ((files === undefined) === (func === undefined)) return fail("Exactly one of 'func' and 'files' must be specified");
    const tab = this.contexts.filter((c) => c.kind === "tab" && c.tabId === target.tabId);
    if (!tab.some((c) => c.frameId === 0)) return fail(`No tab with id: ${target.tabId}.`);
    const ids = Array.isArray(target.frameIds) ? target.frameIds : null;
    for (const id of ids || []) if (!tab.some((c) => c.frameId === id)) return fail(`No frame with id ${id} in tab with id ${target.tabId}.`);
    const frames = tab.filter((c) => (target.allFrames ? true : ids ? ids.includes(c.frameId) : c.frameId === 0)).sort((a, b) => a.frameId - b.frameId);
    for (const frame of frames) {
      if (!frame.inject) throw new Error(`tab ${target.tabId} has no page in the harness (openBareTab()): nothing can run in it`);
      if (new URL(frame.url).protocol === "chrome:") return fail("Cannot access a chrome:// URL");
      if (!this.sees(frame.tabId, frame.url)) return fail("Cannot access contents of the page. Extension manifest must request permission to access the respective host.");
    }
    const source = func === undefined ? null : Function.prototype.toString.call(func);
    const runAll = async () => {
      const results = [];
      for (const frame of frames) {
        try {
          let result;
          if (source === null) for (const rel of [].concat(files)) result = frame.inject.file(String(rel));
          else result = frame.inject.func(source, from)(...copyInto(frame.realm, args));
          results.push({ frameId: frame.frameId, result: await result });
        } catch (e) {
          this.report(frame, e, "injected script");
        }
      }
      return copyInto(from.realm, results);
    };
    const done = tracked(new Promise((resolve) => setTimeout(resolve, 0)).then(runAll));
    if (typeof cb === "function") {
      done.then((results) => this.answer(from, cb, results));
      return undefined;
    }
    return done.then((results) => this.answer(from, undefined, results));
  }

  // A context of this browser runs the extension's script `rel`, of `sites`
  // counting sites: the code of the browser, which bounds the work of an
  // input run in it (harness/work.mjs), counts them once.
  loaded(rel, sites) {
    if (this.scripts.has(rel)) return;
    this.scripts.add(rel);
    this.sites += sites;
    codeGrew(this);
  }

  // Forgets what the logs hold: the messages, the tabs opened, the scripts
  // run, what each context wrote to its console (harness/log.mjs), and what
  // the detectors look through: the errors, what the extension caught, what
  // it passed the sinks of Trusted Types, the responses it read from where
  // TLS does not vouch for them. An error holds the realm it was made
  // in, and with it the window and its document, and a string passed to a
  // sink can be as large as the input's top rung makes it: kept from input to
  // input, they would fill the memory of a target that opens a page for each
  // input. A watcher made before (harness/detectors.mjs) looks through the
  // whole of each log from then on.
  forget() {
    for (const log of [this.traffic, this.created, this.injected, this.errors, this.caught, this.untrusted, this.foreign]) log.length = 0;
    for (const c of this.contexts) if (c.logs) c.logs.length = 0;
    this.forgotten++;
  }

  close() {
    for (const c of [...this.contexts]) c.close();
    process.off("unhandledRejection", this.onRejection);
  }

  report(context, error, where = "listener") {
    this.errors.push({ where: `${where} in ${context.kind} ${context.url || ""}`.trim(), error });
  }

  // The extension's code in `context` caught `error` at `site` ("<file>:<line>
  // in <function>", harness/source.mjs) and went on.
  caughtBy(context, error, site) {
    this.caught.push({ where: `${site} in ${context.kind} ${context.url || ""}`.trim(), error });
  }

  // Calls back on a later turn, or makes a promise if there is no callback.
  answer(context, cb, value, lastError) {
    if (typeof cb === "function") {
      later(() => {
        context.lastError = lastError ? { message: lastError } : undefined;
        try { cb(value); } catch (e) { this.report(context, e, "callback"); }
        context.lastError = undefined;
      });
      return undefined;
    }
    return new Promise((resolve, reject) => later(() => (lastError ? reject(new Error(lastError)) : resolve(value))));
  }

  changed(changes, area) {
    if (Object.keys(changes).length === 0) return;
    later(() => {
      for (const c of this.contexts) {
        for (const f of c.events.onChanged.listeners) {
          try { f(copyInto(c.realm, changes), area); } catch (e) { this.report(c, e); }
        }
      }
    });
  }

  senderOf(context) {
    if (context.kind === "tab") {
      return {
        id: this.id,
        url: context.url,
        origin: new URL(context.url).origin,
        frameId: context.frameId,
        tab: this.tabOf(context),
      };
    }
    return { id: this.id, url: context.url, origin: `chrome-extension://${this.id}` };
  }

  // Delivers `message` from `from` to the onMessage listeners of `targets`.
  // Every exchange is kept in browser.traffic: who sent what, and what came
  // back (as plain values), so a test can ask what reached a content script.
  deliver(from, targets, message, cb) {
    const payload = JSON.stringify(message === undefined ? null : message); // throws as Chrome does on what JSON cannot hold
    const exchange = { from: from.kind, url: from.url, message: JSON.parse(payload) };
    record(this.traffic, exchange);
    const pending = new Promise((resolve) => later(() => {
      let responded = false;
      let open = false;
      let listeners = 0;
      // The answer arrives whatever its copy throws: once the extension's
      // work has passed what it may do (harness/work.mjs), every counted step
      // throws, the copy's into the sender's realm among them, and an answer
      // lost there would be told of as none.
      const sendResponse = (response) => {
        if (responded) return;
        responded = true;
        let copy;
        try {
          exchange.response = copyInto(null, response);
          copy = copyInto(from.realm, response);
        } finally {
          resolve({ response: copy });
        }
      };
      for (const t of targets) {
        for (const f of t.events.onMessage.listeners) {
          listeners++;
          try {
            if (f(t.realm.JSON.parse(payload), this.senderOf(from), sendResponse) === true) open = true;
          } catch (e) {
            this.report(t, e);
          }
        }
      }
      if (!responded && !open) {
        responded = true;
        exchange.error = listeners ? "The message port closed before a response was received." : "Could not establish connection. Receiving end does not exist.";
        resolve({ error: exchange.error });
      }
    }));
    if (typeof cb === "function") {
      pending.then(({ response, error }) => {
        from.lastError = error ? { message: error } : undefined;
        try { cb(response); } catch (e) { this.report(from, e, "callback"); }
        from.lastError = undefined;
      });
      return undefined;
    }
    return pending.then(({ response, error }) => {
      if (error) throw new Error(error);
      return response;
    });
  }

  // The chrome object a context's scripts see.
  apiFor(context) {
    const browser = this;
    const extensionPages = () => this.contexts.filter((c) => c !== context && (c.kind === "background" || c.kind === "popup"));
    const runtime = {
      id: this.id,
      get lastError() { return context.lastError; },
      getURL: (p) => `chrome-extension://${this.id}/${String(p).replace(/^\//, "")}`,
      getManifest: () => copyInto(context.realm, this.manifest),
      onMessage: context.events.onMessage,
      onInstalled: context.events.onInstalled,
      onStartup: context.events.onStartup,
      sendMessage(...args) {
        if (typeof args[0] === "string" && args.length > 1 && typeof args[1] !== "function") args.shift(); // an extension id
        const message = args[0];
        const cb = args.find((a, i) => i > 0 && typeof a === "function");
        return browser.deliver(context, extensionPages(), message, cb);
      },
    };
    const tabs = {
      // The tabs that match each property `info` gives: active, the window
      // (the current one, the last focused one, or its id: the browser has
      // one window, of id 1, windows.WINDOW_ID_CURRENT being -2), and the URL
      // patterns, which only a page the extension may see can match.
      query(info, cb) {
        const q = info || {};
        const patterns = q.url ? [].concat(q.url) : null;
        const inWindow = (v) => v === undefined || Boolean(v);
        const found = browser.contexts
          .filter((c) => c.kind === "tab" && c.frameId === 0)
          .map((c) => browser.tabOf(c))
          .filter((tab) => (q.active === undefined || tab.active === Boolean(q.active)) &&
            inWindow(q.currentWindow) && inWindow(q.lastFocusedWindow) &&
            (q.windowId === undefined || q.windowId === 1 || q.windowId === -2) &&
            (!patterns || (tab.url !== undefined && patterns.some((p) => matchesPattern(p, tab.url)))));
        return browser.answer(context, cb, copyInto(context.realm, found));
      },
      create(props, cb) {
        record(browser.created, copyInto(null, props));
        return browser.answer(context, cb, copyInto(context.realm, { id: 1000 + browser.created.length, url: props && props.url }));
      },
      sendMessage(tabId, message, ...rest) {
        const options = rest.find((a) => a && typeof a === "object") || {};
        const cb = rest.find((a) => typeof a === "function");
        const targets = browser.contexts.filter((c) => c.kind === "tab" && c.tabId === tabId &&
          (options.frameId === undefined || c.frameId === options.frameId));
        return browser.deliver(context, targets, message, cb);
      },
    };
    const scripting = {
      executeScript: (injection, cb) => browser.inject(context, injection, cb),
    };
    const i18n = {
      // Finding the message hashes its key; formatting it goes through it and
      // what is put in it.
      getMessage: (key, subs) => {
        const text = formatMessage(this.messages[key], subs);
        step(1 + String(key).length + (this.messages[key] ? String(this.messages[key].message).length : 0) + text.length);
        return text;
      },
      getUILanguage: () => this.uiLanguage,
    };
    const storage = {
      local: this.storage.local.api(context),
      session: this.storage.session.api(context),
      onChanged: context.events.onChanged,
    };
    return { runtime, tabs, scripting, i18n, storage };
  }
}
