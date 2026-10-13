// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The page where a student submits an assignment: submit-detect.js marks the
// assignment done when the student posts it (it leaves the assignment's ID in
// the page's sessionStorage for the panel to read), and file-drop.js puts a
// zone on the page that takes files dropped on it into the form's file input.
// The input gives
// - the settings the two read as the page loads (autoComplete, fileDrop),
//   each a boolean or any value the store's JSON carries;
// - the page: the site in its URL, the form (there or not), its assignment
//   reference (Sakai's placeholder, a reference to an assignment, or any
//   string), its post button (either of Sakai's or none), the headings the
//   page shows, the attachments panel and the file input, each there or not;
// - what the page's sessionStorage holds of the extension's keys: none, the
//   JSON of any value, or any string, and how much of it the page's own data
//   takes besides, as with localStorage (fuzz/targets/sidebar.fuzz.mjs);
// - what the user does: a click on the post button or on the zone, drags over
//   the zone, a drop of files (any names, types and contents) on it, the page
//   changing (a part of the form taken away or put back), the sessionStorage
//   written by the page's scripts, or another tab of it, at any time, time
//   going by.
// Each input opens the page anew, as both scripts act as it loads and watch it
// after. The page has a clock of its own (harness/clock.mjs).
//
// It fails when the scripts throw, when a promise is rejected with nothing to
// handle it, when a detector of the harness sees something
// (harness/detectors.mjs), when the extension warns of a slip of its code, or
// when its timeouts do not run out; and when the extension's work grows
// faster than n log n from rung to rung of the input, or passes what linear
// code does with an input of its size (ladder() and judge() of fuzz/lib.mjs).
import { Browser, Clock, Net, idle, openTab, uncounted, watch } from "../../harness/index.mjs";
import { LMS } from "../../tests/lms.mjs";
import { bytes, calibrate, fail, json, jsonText, judge, ladder, open, provider, seen, string, value, warnings } from "../lib.mjs";

const SCRIPTS = ["src/settings.js", "src/submit-detect.js", "src/file-drop.js"];
const SETTINGS = ["autoComplete", "fileDrop"];
const KEYS = ["kulms-submitted-ids", "kulms-submitted"];
const ACTIONS = ["post", "zone", "dragenter", "dragover", "dragleave", "drop", "take", "put", "storage", "time"];
const PARTS = ["form", "reference", "post", "panel", "heading", "input"];
const MINUTE = 60e3;
const RUN_ON = 10 * MINUTE;
const QUOTA = 5000000;

function list(fdp, make) {
  const out = [];
  for (let n = fdp.consumeIntegralInRange(0, fdp.remainingBytes); n > 0 && fdp.remainingBytes > 0; n--) out.push(make(fdp));
  return out;
}

const stored = (fdp) => fdp.pickValue([() => null, () => jsonText(value(fdp)), () => string(fdp)])();

function action(fdp) {
  const a = { kind: fdp.pickValue(ACTIONS), at: fdp.consumeIntegral(2) };
  if (a.kind === "drop") a.files = list(fdp, (f) => ({ name: string(f), type: string(f), body: bytes(f) }));
  if (a.kind === "take" || a.kind === "put") a.part = fdp.pickValue(PARTS);
  if (a.kind === "storage") {
    a.write = fdp.pickValue(["set", "remove", "clear"]);
    if (a.write !== "clear") a.key = fdp.consumeBoolean() ? fdp.pickValue(KEYS) : string(fdp);
    if (a.write === "set") a.value = fdp.pickValue([() => jsonText(value(fdp)), () => string(fdp)])();
    a.another = fdp.consumeBoolean();
  }
  if (a.kind === "time") a.ms = fdp.consumeIntegralInRange(0, RUN_ON);
  return a;
}

// What the target reads of an input, in the order it reads it.
export function read(fdp) {
  const settings = {};
  for (const key of SETTINGS) settings[key] = fdp.consumeBoolean() ? fdp.consumeBoolean() : json(value(fdp)).value;
  const site = string(fdp);
  const form = fdp.consumeBoolean();
  const reference = fdp.pickValue([() => "$assignmentReference", () => `/assignment/a/${string(fdp)}/${string(fdp)}`, () => string(fdp)])();
  const post = fdp.pickValue(["post", "save", "none"]);
  const headings = list(fdp, (f) => ({ title: f.consumeBoolean(), text: string(f) }));
  const panel = fdp.consumeBoolean();
  const input = fdp.consumeBoolean();
  const session = {};
  for (const key of KEYS) session[key] = stored(fdp);
  const free = fdp.pickValue([() => Infinity, () => fdp.consumeIntegralInRange(0, 65535), () => 0])();
  const actions = list(fdp, action);
  return { settings, site, form, reference, post, headings, panel, input, session, free, actions };
}

const attribute = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const text = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// The page, as Sakai's Assignments tool writes it.
function page(input) {
  const headings = input.headings.map((h) => (h.title ? `<div class="page-header"><h3>${text(h.text)}</h3></div>` : `<h3>${text(h.text)}</h3>`)).join("");
  const post = input.post === "post" ? '<input type="submit" name="post" value="提出">' : input.post === "save" ? '<input type="submit" name="eventSubmit_doSave_submission" value="提出">' : "";
  const panel = input.panel ? `<div id="attachmentspanel"><h3>添付</h3>${input.input ? '<input type="file" id="clonableUpload" name="upload">' : ""}</div>` : "";
  const form = input.form ? `<form id="addSubmissionForm" method="post" action=""><input type="hidden" name="assignmentId" value="${attribute(input.reference)}">${panel}${post}</form>` : panel;
  return `<!doctype html><html><head></head><body>${headings}${form}</body></html>`;
}

// Whether the submitted IDs the page stored set off B12: what submit-detect.js
// reads them as (JSON) is not a list, whose indexOf and push it calls.
function setsOffB12(text) {
  let ids;
  try {
    ids = JSON.parse(text || "[]");
  } catch {
    return false;
  }
  return !Array.isArray(ids);
}

const browser = new Browser();
const net = new Net();
let tab = null;
// The parts of the page an input took away, to put back.
let taken = new Map();

// The element `a.at` picks of those `selector` finds, or null. Finding what
// the user clicks is the target's work, not the extension's.
function pick(selector, a) {
  return uncounted(() => {
    const found = tab.document.querySelectorAll(selector);
    return found.length ? found[a.at % found.length] : null;
  });
}

const PART_SELECTORS = { form: "#addSubmissionForm", reference: "[name='assignmentId']", post: "[name='post'], [name='eventSubmit_doSave_submission']", panel: "#attachmentspanel", heading: "h3", input: "#clonableUpload" };

async function act(a, clock) {
  const w = tab.window;
  const d = tab.document;
  const drag = (type, init = {}) => {
    const zone = d.querySelector(".kulms-file-drop-zone");
    if (zone) zone.dispatchEvent(new w.DragEvent(type, { bubbles: true, cancelable: true, ...init }));
  };
  switch (a.kind) {
    case "post": {
      const button = pick(PART_SELECTORS.post, a);
      if (button) button.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
      break;
    }
    case "zone": {
      const zone = d.querySelector(".kulms-file-drop-zone");
      if (zone) zone.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
      break;
    }
    case "dragenter": case "dragover": case "dragleave": drag(a.kind, { dataTransfer: new w.DataTransfer() }); break;
    case "drop": {
      const dt = uncounted(() => {
        const t = new w.DataTransfer();
        for (const f of a.files) t.items.add(new w.File([Uint8Array.from(f.body)], f.name, { type: f.type }));
        return t;
      });
      drag("drop", { dataTransfer: dt });
      break;
    }
    // The page takes a part of itself away, or puts back what it took: the
    // scripts watch it change.
    case "take": {
      const el = pick(PART_SELECTORS[a.part], a);
      if (el && el.parentNode) {
        taken.set(a.part, { el, parent: el.parentNode, next: el.nextSibling });
        el.remove();
      }
      break;
    }
    case "put": {
      const t = taken.get(a.part);
      if (t && t.parent.isConnected) {
        t.parent.insertBefore(t.el, t.next && t.next.parentNode === t.parent ? t.next : null);
        taken.delete(a.part);
      }
      break;
    }
    // The page's own scripts write its sessionStorage, or another tab of it
    // does, which this page hears of as a storage event.
    case "storage": {
      // Known: B12 (docs/findings.md). While it is open, submitted IDs of a
      // shape that sets it off (setsOffB12()) are not written.
      if (open("B12") && a.write === "set" && a.key === "kulms-submitted-ids" && setsOffB12(a.value)) break;
      const old = a.key === undefined ? null : uncounted(() => w.sessionStorage.getItem(a.key));
      uncounted(() => {
        try {
          if (a.write === "set") w.sessionStorage.setItem(a.key, a.value);
          else if (a.write === "remove") w.sessionStorage.removeItem(a.key);
          else w.sessionStorage.clear();
        } catch (e) {
          if (!(e && e.name === "QuotaExceededError")) throw e;
        }
      });
      if (a.another) {
        w.dispatchEvent(new w.StorageEvent("storage", { key: a.write === "clear" ? null : a.key, oldValue: old, newValue: a.write === "set" ? a.value : null, url: tab.url, storageArea: w.sessionStorage }));
      }
      break;
    }
    case "time": await clock.advance(a.ms); break;
  }
  await idle();
}

async function run(data) {
  const input = read(provider(data));
  browser.forget();
  net.forget();
  taken = new Map();
  uncounted(() => {
    if (tab) tab.close();
    browser.storage.local.unload(["kulms-settings"]);
    browser.storage.local.load({ "kulms-settings": input.settings });
  });
  const clock = new Clock(Date.UTC(2026, 9, 14, 1, 0));
  // The page's sessionStorage as the input leaves it, before the scripts read
  // it: what does not fit it cannot be there. Known: B12, as in act().
  const prepare = (w) => uncounted(() => {
    for (const key of KEYS) {
      const v = input.session[key];
      if (v === null || (open("B12") && key === "kulms-submitted-ids" && setsOffB12(v))) continue;
      try {
        w.sessionStorage.setItem(key, v);
      } catch (e) {
        if (!(e && e.name === "QuotaExceededError")) throw e;
      }
    }
    if (input.free !== Infinity) {
      let used = 0;
      for (let i = 0; i < w.sessionStorage.length; i++) {
        const key = w.sessionStorage.key(i);
        used += key.length + w.sessionStorage.getItem(key).length;
      }
      const size = QUOTA - used - "page-data".length - input.free;
      if (size > 0) w.sessionStorage.setItem("page-data", "x".repeat(size));
    }
  });
  let url;
  try {
    url = new URL(`/portal/site/${input.site}/tool/A`, LMS).href;
  } catch {
    url = `${LMS}/portal/site/S/tool/A`;
  }
  tab = openTab(browser, { url, html: page(input), scripts: SCRIPTS, clock, net, prepare });
  // jsdom does not follow links nor submit forms: a click that the extension
  // leaves to the browser goes nowhere, as one that is not followed.
  tab.window.addEventListener("click", (e) => e.preventDefault());
  tab.window.addEventListener("submit", (e) => e.preventDefault());
  const watcher = watch(tab);
  const log = warnings(tab);
  await idle();
  for (const a of input.actions) await act(a, clock);
  await clock.advance(RUN_ON);
  if (!(await clock.settle(RUN_ON))) fail(`the page's scripts still set timeouts ${(2 * RUN_ON) / MINUTE} minutes on: work that never ends`);
  for (const line of log.slips()) fail(`a slip of the code: ${line}`);
  // Known: B23. While it is open, a QuotaExceededError that the extension's
  // code lets out is not counted: submit-detect.js writes the page's
  // sessionStorage, which the page may have filled, as the finding says.
  const problems = seen(watcher).filter((p) => !(open("B23") && /: QuotaExceededError: /.test(p)));
  if (problems.length) fail(problems.join("\n"));
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run, browser);
}

await calibrate(fuzz);
