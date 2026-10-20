// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The LMS's sidebar and what the extension does to it: course-name.js cleans
// the courses' names, sorts the pinned ones and marks the course of the hour,
// course-click.js opens a course's tools on a click of its row,
// tool-visibility.js moves the tools a user hides under a toggle,
// sidebar-resize.js lets the sidebar be dragged wider, top-favbar.js copies
// the pinned courses into a bar at the top with a dropdown of their tools,
// preload.js hides the courses' names until course-name.js has looked at them
// (and the page until the scripts have set themselves up), and prerender.js
// puts in speculation rules by which the browser prerenders the pages of the
// links of the sidebar and of the bar. These are the scripts of the manifest
// that act on the sidebar; the others act elsewhere and have targets of their
// own. preload.js and prerender.js do their work as the page loads, which is
// no input's (below). The input gives
// - the courses of the pinned list and of the list of all sites, as many as
//   it has bytes for: each with any ID, name and title, any classes, any of
//   the parts of Sakai's markup or not, and any tools (any IDs, names and
//   icons); a page holds only strings;
// - each setting the scripts read as they go (window.__kulmsSettings), kept
//   or any value the store's JSON carries, and a change of the stored
//   settings, which the bar listens to;
// - the tool config of the page's localStorage, which the page's own scripts
//   can write: none, the JSON of any value, or any string; and how much of
//   the storage the page's own data takes besides: none, all but a few
//   units, or all of it, so that the extension's own writing may find it
//   full;
// - the time of the page, any minute of any day of the week (the page has a
//   clock of its own, harness/clock.mjs);
// - what the user does, in order: clicks on course rows, on tool toggles, on
//   the toggle of other tools, on the bar's items and on its dropdown, and
//   elsewhere; keys; a resize of the window; a drag of the sidebar's handle;
//   the page turning visible; time going by; a course pinned or unpinned;
//   the stored settings changed; and the page's localStorage written, any of
//   its keys set to any string, taken away or all of it cleared, as the page's
//   own scripts or another of its tabs may do at any time (that tab's write
//   comes as a storage event).
// The page's clock then runs ten minutes on, which runs what the scripts set
// going (timeouts, intervals, frames), as a page left open would.
//
// One tab serves every input; each input sets the page and the state it
// gives, and takes away what an earlier one left (the bar and its dropdown,
// the classes of the body, the width the drag set, what the scripts keep of
// the last sort), so that its work is its own.
//
// It fails when the scripts throw, when a promise is rejected with nothing to
// handle it, when a detector of the harness sees something
// (harness/detectors.mjs), when the extension warns of a slip of its code,
// or when the timeouts left after the ten minutes do not run out within ten
// more, each setting the next: work that never ends. It also fails when the extension's work grows faster than n log n
// from rung to rung of the input, or passes what linear code does with an
// input of its size (ladder() and judge() of fuzz/lib.mjs, harness/work.mjs).
// A regular expression's work is the steps of a backtracking engine
// (harness/backtrack.mjs), but for those of a finding that stands, which run
// on V8's linear engine (fuzz/lib.mjs).
import { Browser, Clock, Net, aside, idle, openTab, uncounted, watch } from "../../harness/index.mjs";
import { LMS } from "../../tests/lms.mjs";
import { calibrate, fail, json, jsonText, judge, ladder, number, open, provider, seen, string, value, warnings } from "../lib.mjs";

// The scripts of the manifest that act on the sidebar, in the order they run
// (contentScriptsFor() of harness/contexts.mjs): preload.js at document_start,
// the rest at document_end.
const SCRIPTS = ["src/preload.js", "src/settings.js", "src/course-name.js", "src/course-click.js", "src/tool-visibility.js", "src/sidebar-resize.js", "src/top-favbar.js", "src/prerender.js"];
// A portal page as Sakai lays it out: the sidebar in a grid, a header above,
// the area of system banners.
const PAGE = `<!doctype html><html><head></head><body>
<header class="portal-header"></header>
<div class="portal-pasystem"></div>
<div class="portal-container" style="display: grid; grid-template-columns: 300px 1fr">
<nav id="portal-nav-sidebar"><ul id="pinned-site-list"></ul><ul id="site-list"></ul></nav>
<main id="content"></main>
</div></body></html>`;
// The settings stored when the page loads: every script that acts on the
// sidebar on, so that each sets itself up.
const LOADED = { courseNameCleanup: true, pinSort: true, currentPeriodHighlight: true, courseRowClick: true, toolVisibility: true, sidebarResize: true, topFavbar: true, topFavbarSize: "medium", tabColorStyle: "border", linkPrerender: true };
// The settings the scripts read as they go; prerender.js reads linkPrerender
// as the page loads, and not after.
const LIVE = Object.keys(LOADED).filter((key) => key !== "linkPrerender");
const CLASSES = ["cs-tab-danger", "cs-tab-warning", "cs-tab-success", "cs-tab-other", "is-current-site"];
const ACTIONS = ["row", "tool toggle", "other toggle", "bar item", "dropdown", "elsewhere", "key", "resize", "drag", "visible", "time", "pin", "unpin", "settings", "storage"];
// The keys of the page's localStorage that the extension writes and reads.
const KEYS = ["kulms-tool-config", "kulms-sidebar-width", "kulms-sidebar-v3"];
const MINUTE = 60e3;
// What a page's localStorage takes, in UTF-16 units of keys and values: as
// Chrome's, and jsdom's.
const QUOTA = 5000000;
const RUN_ON = 10 * MINUTE;

const browser = new Browser();
browser.storage.local.load({ "kulms-settings": LOADED });
const clock = new Clock();
const tab = openTab(browser, { url: `${LMS}/portal`, html: PAGE, scripts: SCRIPTS, clock, net: new Net() });
const w = tab.window;
const d = tab.document;
await idle();
// What the scripts set going as the page loads (the sort after 600 ms, the
// clock of the course of the hour after 800 ms) is no input's.
await aside(() => clock.advance(2000));
const names = tab.internals["src/course-name.js"];
const tools = tab.internals["src/tool-visibility.js"];
const bar = tab.internals["src/top-favbar.js"];
if (!names || !tools || !bar || !d.querySelector(".kulms-sidebar-handle")) throw new Error("the sidebar's scripts did not set themselves up");
const pinnedList = d.getElementById("pinned-site-list");
const siteList = d.getElementById("site-list");
const resizeStyle = d.getElementById("kulms-sidebar-resize");
// jsdom does not follow links: a click that the extension leaves to the
// browser goes nowhere, as one that is not followed.
w.addEventListener("click", (e) => e.preventDefault());

// As many of make() as the input has bytes for.
function list(fdp, make) {
  const out = [];
  for (let n = fdp.consumeIntegralInRange(0, fdp.remainingBytes); n > 0 && fdp.remainingBytes > 0; n--) out.push(make(fdp));
  return out;
}

function tool(fdp) {
  return { id: string(fdp), name: string(fdp), icon: fdp.consumeBoolean() ? string(fdp) : null };
}

// A course as Sakai's sidebar shows it; each part of the markup there or not.
function course(fdp) {
  const c = { id: string(fdp), name: string(fdp), title: fdp.consumeBoolean() ? string(fdp) : null };
  c.classes = list(fdp, (f) => (f.consumeBoolean() ? f.pickValue(CLASSES) : string(f)));
  c.parts = { head: fdp.consumeBoolean(), block: fdp.consumeBoolean(), link: fdp.consumeBoolean(), title: fdp.consumeBoolean(), chevron: fdp.consumeBoolean(), pin: fdp.consumeBoolean(), badge: fdp.consumeIntegralInRange(0, 2), tools: fdp.consumeBoolean() };
  c.tools = list(fdp, tool);
  return c;
}

function action(fdp) {
  const kind = fdp.consumeIntegralInRange(0, ACTIONS.length - 1);
  const a = { kind: ACTIONS[kind], at: fdp.consumeIntegral(2) };
  if (a.kind === "key") a.key = fdp.consumeBoolean() ? "Escape" : string(fdp);
  if (a.kind === "drag") a.x = number(fdp);
  if (a.kind === "time") a.ms = fdp.consumeIntegralInRange(0, RUN_ON);
  if (a.kind === "pin") a.course = course(fdp);
  if (a.kind === "settings") a.settings = json(value(fdp)).value;
  if (a.kind === "storage") {
    a.write = fdp.pickValue(["set", "remove", "clear"]);
    if (a.write !== "clear") a.key = fdp.consumeBoolean() ? fdp.pickValue(KEYS) : string(fdp);
    if (a.write === "set") a.value = fdp.pickValue([() => jsonText(value(fdp)), () => string(fdp)])();
    a.another = fdp.consumeBoolean();
  }
  return a;
}

// What the target reads of an input, in the order it reads it.
export function read(fdp) {
  const settings = {};
  for (const key of LIVE) if (fdp.consumeBoolean()) settings[key] = json(value(fdp)).value;
  const config = fdp.pickValue([() => null, () => jsonText(value(fdp)), () => string(fdp)])();
  // The units the page's own data leaves free: all of them (none of its
  // data), a few, or none.
  const free = fdp.pickValue([() => Infinity, () => fdp.consumeIntegralInRange(0, 65535), () => 0])();
  const day = fdp.consumeIntegralInRange(0, 6);
  const minute = fdp.consumeIntegralInRange(0, 24 * 60 - 1);
  const pinned = list(fdp, course);
  const sites = list(fdp, course);
  const actions = list(fdp, action);
  return { settings, config, free, day, minute, pinned, sites, actions };
}

// The element of course `c` in a list (`pinned` or not), as Sakai writes it.
function courseItem(c, pinned) {
  const li = d.createElement("li");
  li.className = ["site-list-item", ...c.classes].join(" ");
  li.id = `${pinned ? "site-list-pinned-item-" : "site-list-item-"}${c.id}`;
  if (c.parts.head) {
    const head = d.createElement("div");
    head.className = "site-list-item-head";
    const block = c.parts.block ? d.createElement("div") : head;
    if (c.parts.block) {
      block.className = "site-link-block";
      head.append(block);
    }
    if (c.parts.link) {
      const a = d.createElement("a");
      a.setAttribute("href", `/portal/site/${c.id}`);
      if (c.title !== null) a.setAttribute("title", c.title);
      const label = c.parts.title ? d.createElement("span") : a;
      if (c.parts.title) {
        label.className = "sidebar-site-title";
        a.append(label);
      }
      label.append(c.name);
      if (c.parts.badge === 1) label.append(Object.assign(d.createElement("span"), { className: "kulms-now-badge", textContent: "NOW" }));
      if (c.parts.badge === 2) label.append(Object.assign(d.createElement("span"), { className: "kulms-notification-badge", textContent: "1" }));
      block.append(a);
    }
    if (c.parts.chevron) block.append(Object.assign(d.createElement("button"), { type: "button", className: "btn site-list-item-collapse" }));
    if (c.parts.pin) head.append(Object.assign(d.createElement("button"), { type: "button", className: "site-favorite-btn" }));
    li.append(head);
  }
  if (c.parts.tools) {
    const ul = d.createElement("ul");
    ul.className = "site-page-list";
    for (const t of c.tools) {
      const item = d.createElement("li");
      item.className = "nav-item";
      const a = d.createElement("a");
      a.setAttribute("href", `/portal/site/${c.id}/tool/${t.id}`);
      if (t.icon !== null) a.append(Object.assign(d.createElement("i"), { className: t.icon }));
      a.append(Object.assign(d.createElement("span"), { textContent: t.name }));
      item.append(a);
      ul.append(item);
    }
    li.append(ul);
  }
  return li;
}

// Whether the tool config `text` that the page stored sets off B12: what
// tool-visibility.js and top-favbar.js read it as (JSON, or nothing) is a
// value that is not an object, onto which a toggle would put a property, or
// an object with an entry of that kind, or with a key hasOwnProperty, which
// the reading calls.
function setsOffB12(text) {
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    return false;
  }
  if (!config) return false;
  if (typeof config !== "object") return true;
  return Object.values(config).some((entry) => entry && (typeof entry !== "object" || Object.hasOwn(entry, "hasOwnProperty")));
}

// The URIError that B27 makes, as the detectors tell it: top-favbar.js decodes
// the site ID of the link of a bar's item (getSiteIdFromUrl()) as the user
// clicks the item to open its dropdown, and decodeURIComponent() throws on an
// ID that holds a % not followed by two hex digits, or bytes that are not
// UTF-8. The frames of decodeURIComponent() are the engine's and the harness's
// wrapper of it.
const B27 = /: URIError: URI malformed\n(?:\s+at decodeURIComponent [^\n]*\n)+\s+at getSiteIdFromUrl /;

// The element `a.at` picks of those `selector` finds, or null. Finding what
// the user clicks is the target's work, not the extension's.
function pick(selector, a) {
  return uncounted(() => {
    const found = d.querySelectorAll(selector);
    return found.length ? found[a.at % found.length] : null;
  });
}

const click = (el, init = {}) => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ...init }));

async function act(a) {
  switch (a.kind) {
    case "row": click(pick(".site-list-item-head", a)); break;
    case "tool toggle": click(pick(".kulms-tool-toggle", a)); break;
    case "other toggle": click(pick(".kulms-other-toggle", a)); break;
    case "bar item": click(pick(".kulms-top-favbar-item", a)); break;
    case "dropdown": click(pick(".kulms-favbar-dropdown a, .kulms-favbar-dropdown button", a)); break;
    case "elsewhere": click(uncounted(() => d.getElementById("content"))); break;
    case "key": d.dispatchEvent(new w.KeyboardEvent("keydown", { key: a.key, bubbles: true })); break;
    case "resize": w.dispatchEvent(new w.Event("resize")); break;
    case "drag": {
      const handle = d.querySelector(".kulms-sidebar-handle");
      if (!handle) break;
      handle.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      d.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: Number.isFinite(a.x) ? a.x : 0 }));
      d.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
      break;
    }
    case "visible": d.dispatchEvent(new w.Event("visibilitychange")); break;
    case "time": await clock.advance(a.ms); break;
    case "pin": pinnedList.append(uncounted(() => courseItem(a.course, true))); break;
    case "unpin": {
      const li = pick("#pinned-site-list > li", a);
      if (li) li.remove();
      break;
    }
    // The settings stored anew, as the popup or another tab stores them: every
    // context hears of it (storage.onChanged).
    case "settings": await browser.storage.local.api(tab).set({ "kulms-settings": a.settings }); break;
    // The page's own scripts write its localStorage, or another tab of it
    // does, which this page hears of as a storage event. What does not fit
    // the storage is not written, as a browser writes nothing then.
    case "storage": {
      // Known: B12, as in run(): a tool config of a shape that sets it off is
      // not written.
      if (open("B12") && a.write === "set" && a.key === "kulms-tool-config" && setsOffB12(a.value)) break;
      const old = a.key === undefined ? null : uncounted(() => w.localStorage.getItem(a.key));
      uncounted(() => {
        try {
          if (a.write === "set") w.localStorage.setItem(a.key, a.value);
          else if (a.write === "remove") w.localStorage.removeItem(a.key);
          else w.localStorage.clear();
        } catch (e) {
          if (!(e && e.name === "QuotaExceededError")) throw e;
        }
      });
      if (a.another) {
        w.dispatchEvent(new w.StorageEvent("storage", {
          key: a.write === "clear" ? null : a.key,
          oldValue: old,
          newValue: a.write === "set" ? a.value : null,
          url: `${LMS}/portal`,
          storageArea: w.localStorage,
        }));
      }
      break;
    }
  }
  await idle();
}

async function run(data) {
  browser.forget();
  const input = read(provider(data));
  // What an earlier input left, taken away: the bar, its dropdown and the
  // observers of their size (removeBar()), what course-name.js keeps of the
  // last sort and of the work it has set going, the classes of the body, the
  // width the last drag set, the page's storage and the stored settings.
  uncounted(() => {
    bar.removeBar();
    names.lastSortSignature = "";
    names.sorting = false;
    names.sortTimer = null;
    names.updatingNowBadges = false;
    tools.processing = false;
    tools.processTimer = null;
    bar.syncScheduled = false;
    d.body.className = "";
    if (resizeStyle) resizeStyle.textContent = "";
    d.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
    w.localStorage.clear();
    browser.storage.local.unload(["kulms-settings"]);
    browser.storage.local.load({ "kulms-settings": LOADED });
    Object.assign(w.__kulmsSettings, LOADED);
  });
  Object.assign(w.__kulmsSettings, input.settings);
  // Known: B12 (docs/findings.md). While it is open, a tool config of a shape
  // that sets it off (setsOffB12()) is not stored: tool-visibility.js and
  // top-favbar.js call hasOwnProperty() of an entry, and a toggle puts a
  // property on what is not an object, which throws, as the finding says.
  if (input.config !== null && !(open("B12") && setsOffB12(input.config))) {
    // A config past what the page's storage takes (5,000,000 units, as
    // Chrome's) cannot be there: none is stored.
    uncounted(() => {
      try {
        w.localStorage.setItem("kulms-tool-config", input.config);
      } catch (e) {
        if (!(e && e.name === "QuotaExceededError")) throw e;
      }
    });
  }
  // The page's own data, which takes what the input does not leave free.
  if (input.free !== Infinity) {
    uncounted(() => {
      let used = 0;
      for (let i = 0; i < w.localStorage.length; i++) {
        const key = w.localStorage.key(i);
        used += key.length + w.localStorage.getItem(key).length;
      }
      const key = "page-data";
      const size = QUOTA - used - key.length - input.free;
      if (size > 0) w.localStorage.setItem(key, "x".repeat(size));
    });
  }
  clock.restart(new Date(2026, 9, 11 + input.day, Math.floor(input.minute / 60), input.minute % 60).getTime());
  // Known: B4. While it is open, tool-visibility.js's reprocessing, which it
  // sets going 200 ms after each change of the page, is kept from being set
  // (a value it takes for a timer already set), and the target calls it itself,
  // once the page is set and after each action: a course with every tool
  // shown makes the reprocessing change the page, which sets it going again,
  // for as long as the page is open, as the finding says.
  if (open("B4")) tools.processTimer = true;
  const reprocess = async () => {
    if (open("B4")) {
      tools.processAll();
      await idle();
    }
  };
  const pinned = uncounted(() => input.pinned.map((c) => courseItem(c, true)));
  const sites = uncounted(() => input.sites.map((c) => courseItem(c, false)));
  const watcher = watch(tab);
  const log = warnings(tab);
  // The page puts its courses in: the scripts see the change as they would
  // Sakai's, and their work on it counts.
  pinnedList.replaceChildren(...pinned);
  siteList.replaceChildren(...sites);
  await idle();
  await reprocess();
  for (const a of input.actions) {
    await act(a);
    await reprocess();
  }
  await clock.advance(RUN_ON);
  await reprocess();
  // What the scripts set going ends: timeouts left once the page has been open
  // ten minutes run out within ten more, unless each sets the next.
  if (!(await clock.settle(RUN_ON))) fail(`the page's scripts still set timeouts ${(2 * RUN_ON) / MINUTE} minutes on: work that never ends`);
  for (const line of log.slips()) fail(`a slip of the code: ${line}`);
  // Known: B23 (docs/findings.md). While it is open, a QuotaExceededError
  // that the extension's code lets out is not counted: tool-visibility.js and
  // sidebar-resize.js, the scripts here that write the page's localStorage,
  // do not meet a storage that the page has filled, as the finding says.
  // Known: B27. While it is open, the URIError that top-favbar.js lets out as
  // it decodes the site ID of a bar's item is not counted: the page's links
  // may hold any ID, and the script decodes it without catching what
  // decodeURIComponent() throws, as the finding says (daily run 38959386385).
  const problems = seen(watcher).filter((p) => !(open("B23") && /: QuotaExceededError: /.test(p)) &&
    !(open("B27") && B27.test(p)));
  if (problems.length) fail(problems.join("\n"));
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run, browser);
}

await calibrate(fuzz);
