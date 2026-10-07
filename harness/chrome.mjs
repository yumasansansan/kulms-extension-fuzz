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
import { finished, started, step } from "./work.mjs";
import { manifest, read } from "./paths.mjs";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
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

  // What the area holds, as plain values (for tests to read and seed).
  dump() { return Object.fromEntries([...this.data].map(([k, v]) => [k, copyInto(null, v)])); }
  load(items) { for (const [k, v] of Object.entries(items)) this.data.set(k, copyInto(null, v)); }
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
    this.traffic = []; // runtime messages, as deliver() keeps them
    this.created = []; // tabs the extension asked to open
    this.injected = []; // what chrome.scripting.executeScript was asked to run
    this.nextTabId = 1;
    this.onRejection = (reason) => this.errors.push({ where: "unhandled rejection", error: reason });
    process.on("unhandledRejection", this.onRejection);
  }

  // Adds a context (made by contexts.mjs) and gives it its chrome API.
  register(context) {
    context.browser = this;
    context.lastError = undefined;
    context.events = { onMessage: new ChromeEvent(), onInstalled: new ChromeEvent(), onStartup: new ChromeEvent(), onChanged: new ChromeEvent() };
    this.contexts.push(context);
    return context;
  }

  unregister(context) {
    this.contexts = this.contexts.filter((c) => c !== context);
  }

  // Forgets what the logs hold: the messages, the tabs opened, the scripts
  // run, and what each context wrote to its console (harness/log.mjs).
  forget() {
    for (const log of [this.traffic, this.created, this.injected]) log.length = 0;
    for (const c of this.contexts) if (c.logs) c.logs.length = 0;
  }

  close() {
    for (const c of [...this.contexts]) c.close();
    process.off("unhandledRejection", this.onRejection);
  }

  report(context, error, where = "listener") {
    this.errors.push({ where: `${where} in ${context.kind} ${context.url || ""}`.trim(), error });
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
        tab: { id: context.tabId, url: context.topUrl, active: true, windowId: 1, index: context.tabId - 1 },
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
      const sendResponse = (response) => {
        if (responded) return;
        responded = true;
        exchange.response = copyInto(null, response);
        resolve({ response: copyInto(from.realm, response) });
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
      query(info, cb) {
        const patterns = info && info.url ? [].concat(info.url) : null;
        const found = browser.contexts
          .filter((c) => c.kind === "tab" && c.frameId === 0)
          .filter((c) => !patterns || patterns.some((p) => matchesPattern(p, c.url)))
          .map((c) => browser.senderOf(c).tab);
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
      executeScript(injection, cb) {
        record(browser.injected, injection);
        return browser.answer(context, cb, copyInto(context.realm, []), "Cannot access contents of the page.");
      },
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
