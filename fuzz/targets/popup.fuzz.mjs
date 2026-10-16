// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The popup (popup.html, popup.js): it shows the assignments that the content
// script keeps in chrome.storage.local, grouped by urgency, with the user's
// memos, checks and dismissals, coloured and grouped as the settings say, and
// a section for the TOTP secret, which the background keeps. The input gives
// - what chrome.storage.local holds as the popup opens, under each key the
//   popup reads (the settings, the cache of assignments, the checked and the
//   dismissed ones, the memos): nothing, a value shaped as the extension writes
//   it (each of its fields as the extension writes it, or any value), or any
//   value JSON carries; a check or a dismissal names an assignment or a memo
//   of the input, or any key;
// - the TOTP secret the background keeps: none, or any string;
// - the tabs open in the popup's window, each at a page of the LMS, of the
//   authentication server, of elsewhere, or Chrome's new tab page, with what
//   the content script of the page answers the popup's request to refresh
//   (no content script, no answer, {ok: true}, {ok: false}, or any value),
//   and which of them is active (none, if the active tab is another page);
// - the page of the active tab, in which a scan for a QR code runs a function
//   of the popup's (chrome.scripting.executeScript, which the harness runs as
//   Chrome does): its images and canvases, each its width and its pixels
//   (bytes, as many rows as they fill), whether its data comes from another
//   origin (which makes a canvas that has it not origin-clean), and what jsQR
//   finds in its pixels (nothing, an otpauth URI with any secret, or any
//   string). jsQR, which the extension bundles (vendor/) and which is not its
//   own code, is stood in for by that; the canvas is the harness's
//   (harness/canvas.mjs).
// - what the user does: a click on a section's header, on a card's link, on
//   refresh, on the link to the LMS, on the TOTP section's header and its
//   buttons (save, show, delete, QR, scan), typing in its input, time going
//   by, and the content script writing a key anew (as a refresh does).
// Each input opens the popup anew, on a clock of its own (harness/clock.mjs)
// that begins at the same time and runs ten minutes on after the actions.
//
// It fails when the scripts throw, when a promise is rejected with nothing to
// handle it, when a detector of the harness sees something
// (harness/detectors.mjs), when the extension warns of a slip of its code, or
// when its timeouts do not run out. It also fails when the extension's work
// grows faster than n log n from rung to rung of the input, or passes what
// linear code does with an input of its size (ladder() and judge() of
// fuzz/lib.mjs, harness/work.mjs).
import { Browser, Clock, Net, allow, aside, idle, installCanvas, measure, openBackground, openBareTab, openPopup, openTab, uncounted, watch, work } from "../../harness/index.mjs";
import { bytes, calibrate, fail, json, judge, ladder, number, open, provider, seen, string, unconvertible, value, warnings } from "../lib.mjs";

const KEYS = {
  settings: "kulms-settings",
  cache: "kulms-assignments",
  checked: "kulms-checked-assignments",
  dismissed: "kulms-dismissed-assignments",
  memos: "kulms-memos",
};
const LMS = "https://lms.gakusei.kyoto-u.ac.jp";
const AUTH = "https://auth.iimc.kyoto-u.ac.jp";
const MINUTE = 60e3;
const DAY = 24 * 60 * MINUTE;
const NOW = Date.UTC(2026, 9, 14, 1, 0);
const RUN_ON = 10 * MINUTE;
const STATUSES = ["", "提出済", "評定済", "未提出", "取組中", "Submitted", "Graded"];
const TYPES = ["assignment", "quiz", "memo"];
const LANGUAGES = ["auto", "ja", "en"];
const MARKS = [true, "active", NOW];
const ACTIONS = ["section", "card", "refresh", "open-lms", "totp-header", "totp-type", "totp-save", "totp-show", "totp-delete",
  "totp-qrgen", "totp-scan", "time", "store"];

// As many of make() as the input has bytes for.
function list(fdp, make) {
  const out = [];
  for (let n = fdp.consumeIntegralInRange(0, fdp.remainingBytes); n > 0 && fdp.remainingBytes > 0; n--) out.push(make(fdp));
  return out;
}

// A field as the extension writes it, or, as the input says, any value.
const or = (fdp, make) => (fdp.consumeBoolean() ? make(fdp) : value(fdp));

// A time as the extension keeps one: near when the popup opens (sixty days
// either way, to the millisecond), or any number.
const when = (fdp) => (fdp.consumeBoolean() ? NOW + fdp.consumeIntegralInRange(-60 * DAY, 60 * DAY) : number(fdp));

const assignment = (fdp) => ({
  courseName: or(fdp, string),
  courseId: or(fdp, string),
  name: or(fdp, string),
  url: or(fdp, (f) => (f.consumeBoolean() ? `https://lms.gakusei.kyoto-u.ac.jp/portal/site/${string(f)}/tool/${string(f)}` : string(f))),
  deadline: or(fdp, when),
  closeTime: or(fdp, when),
  status: or(fdp, (f) => (f.consumeBoolean() ? f.pickValue(STATUSES) : string(f))),
  grade: or(fdp, string),
  entityId: or(fdp, string),
  type: or(fdp, (f) => f.pickValue(TYPES)),
  allowResubmission: or(fdp, (f) => f.consumeBoolean()),
});

const memo = (fdp) => (fdp.consumeBoolean() ? string(fdp) : {
  id: or(fdp, (f) => f.consumeIntegral(6)),
  text: or(fdp, string),
  courseName: or(fdp, string),
  courseId: or(fdp, string),
  deadline: or(fdp, when),
  repeat: or(fdp, (f) => (f.consumeBoolean() ? null : string(f))),
  created: or(fdp, when),
});

const settings = (fdp) => ({
  dangerHours: or(fdp, number),
  warningDays: or(fdp, number),
  successDays: or(fdp, number),
  colorDanger: or(fdp, string),
  colorWarning: or(fdp, string),
  colorSuccess: or(fdp, string),
  colorOther: or(fdp, string),
  language: or(fdp, (f) => f.pickValue(LANGUAGES)),
  memos: or(fdp, (f) => f.consumeBoolean()),
});

const cache = (fdp) => ({ timestamp: or(fdp, when), assignments: or(fdp, (f) => list(f, assignment)) });

// Checks or dismissals: each a key, which names an assignment or a memo of the
// input (by its place among them, resolved when the store is filled) or is any
// string, and a mark as the extension writes one or any value.
const marks = (fdp) => list(fdp, (f) => [f.consumeBoolean() ? { of: f.consumeIntegralInRange(0, 255) } : string(f), or(f, (g) => g.pickValue(MARKS))]);

const SHAPES = { settings, cache, checked: marks, dismissed: marks, memos: (fdp) => list(fdp, memo) };

// What a key holds: nothing, a value shaped as the extension writes it, or any
// value that JSON carries (what chrome.storage keeps).
function held(fdp, key) {
  switch (fdp.consumeIntegralInRange(0, 2)) {
    case 0: return { absent: true };
    case 1: return { shaped: SHAPES[key](fdp) };
    default: return { any: json(value(fdp)).value };
  }
}

// `path` read against `base` as the URL parser reads it (a lone surrogate
// becomes U+FFFD, as a USVString), or `base` where it is no URL. A path of
// the LMS that begins with "/" stays on the LMS; any other string may name
// any URL.
function at(base, path) {
  try {
    return new URL(path, base).href;
  } catch {
    return base;
  }
}

// A tab of the popup's window: its page, and what the content script of the
// page answers the popup's request to refresh: no content script, a listener
// that answers nothing, one that keeps the request open and never answers (a
// fetch that does not end), or a value (assignments.js answers {ok: true} once
// it has fetched anew, {ok: false} when the fetch fails).
function tab(fdp) {
  const url = fdp.pickValue([
    () => at(LMS, `/portal/site/${string(fdp)}/tool/${string(fdp)}`),
    () => `${LMS}/portal`,
    () => `${AUTH}/user/index.php?app=qrsecret`,
    () => at("https://example.com/", string(fdp)),
    () => "chrome://newtab/",
  ])();
  const answers = fdp.pickValue([() => ({ none: true }), () => ({ silent: true }), () => ({ hangs: true }),
    () => ({ value: { ok: true } }), () => ({ value: { ok: false } }), () => ({ value: json(value(fdp)).value })])();
  return { url, answers };
}

// An image or a canvas of the active tab's page (openPage()).
function picture(fdp) {
  return {
    width: fdp.consumeIntegralInRange(1, 4096),
    pixels: bytes(fdp),
    foreign: fdp.consumeBoolean(),
    found: fdp.pickValue([() => null, () => `otpauth://totp/KULMS?secret=${string(fdp)}&issuer=KULMS`, () => string(fdp)])(),
  };
}

function action(fdp) {
  const a = { kind: fdp.pickValue(ACTIONS), at: fdp.consumeIntegralInRange(0, 65535) };
  if (a.kind === "totp-type") a.text = string(fdp);
  if (a.kind === "time") a.ms = fdp.consumeIntegralInRange(0, RUN_ON);
  if (a.kind === "store") {
    a.key = fdp.pickValue(Object.keys(KEYS));
    a.held = held(fdp, a.key);
  }
  return a;
}

// What the target reads of an input, in the order it reads it.
export function read(fdp) {
  const stored = {};
  for (const key of Object.keys(KEYS)) stored[key] = held(fdp, key);
  const secret = fdp.consumeBoolean() ? string(fdp) : null;
  const tabs = list(fdp, tab);
  const active = tabs.length > 0 && fdp.consumeBoolean() ? fdp.consumeIntegralInRange(0, tabs.length - 1) : null;
  const page = active === null ? null : { images: list(fdp, picture), canvases: list(fdp, picture) };
  const actions = list(fdp, action);
  return { stored, secret, tabs, active, page, actions };
}

// The key a check or a dismissal of the popup has for an assignment or a memo
// (getCheckedKey() of popup.js, and "memo-" and its ID for a memo).
function keyOf(item) {
  if (typeof item === "string") return null; // a memo of its text alone has an ID made as the popup reads it
  if (item === null || typeof item !== "object") return null;
  if ("text" in item && "created" in item) return `memo-${item.id}`;
  return item.entityId ? String(item.entityId) : `${item.courseId}:${item.name}`;
}

// The value a key holds, a mark's key resolved against what the store holds,
// as chrome.storage keeps it (JSON: nothing, if JSON cannot hold it).
function valueOf(key, h, stored) {
  if (h.absent) return undefined;
  if ("any" in h) return h.any;
  if (!isMarks(key)) return json(h.shaped).value;
  // Checks or dismissals: an object of the keys.
  const v = h.shaped;
  const items = [];
  const c = stored.cache && stored.cache.shaped;
  if (c && Array.isArray(c.assignments)) items.push(...c.assignments);
  const m = stored.memos && stored.memos.shaped;
  if (Array.isArray(m)) items.push(...m);
  const out = {};
  for (const [k, mark] of v) {
    const name = typeof k === "string" ? k : items.length ? keyOf(items[k.of % items.length]) : null;
    if (name !== null) out[name] = mark;
  }
  return json(out).value;
}
function isMarks(key) {
  return key === "checked" || key === "dismissed";
}
const stored = (key, h, all) => valueOf(key, h, all);

// Known: B17 (docs/findings.md). Whether memos as stored set it off: a value
// that is not an array where there are memos to read, a list with a null, or
// a memo that holds a value that cannot be made a string or a number
// (unconvertible() of lib.mjs) where the popup makes one of it: its ID, for
// every memo (the key of its dismissal), and, for a memo with a deadline
// (listed among the assignments), its deadline, text, course's ID and
// course's name. A memo without a deadline is not shown with those.
const DEADLINE_MEMO_FIELDS = ["deadline", "text", "courseId", "courseName"];
function setsOffB17(memos) {
  if (memos === undefined || memos === null || memos === false || memos === 0 || memos === "") return false;
  return !Array.isArray(memos) || memos.some((m) => m === null || (typeof m === "object" && (unconvertible(m.id) || (m.deadline && DEADLINE_MEMO_FIELDS.some((k) => unconvertible(m[k]))))));
}

// Known: B25. Whether a cache of assignments as stored sets it off: a list of
// them that is not an array, or one that holds what is not an object, or an
// assignment whose status is not a string, or one that holds a value that
// cannot be made a string or a number in a field that the popup shows, joins
// or compares: its course's name and ID, its name, URL and entity ID, its
// deadline and its closing time.
const SHOWN_FIELDS = ["courseName", "courseId", "name", "url", "entityId", "deadline", "closeTime"];
function setsOffB25(cache) {
  if (cache === null || typeof cache !== "object" || !cache.assignments) return false;
  const list = cache.assignments;
  if (!Array.isArray(list)) return true;
  return list.some((a) => a === null || typeof a !== "object" || (a.status && typeof a.status !== "string") || SHOWN_FIELDS.some((k) => unconvertible(a[k])));
}

// Known: B22. Whether a secret is longer than the background can save.
const LONG_SECRET = 2 ** 15;
const tooLong = (s) => typeof s === "string" && new TextEncoder().encode(s).length > LONG_SECRET;

const browser = new Browser();
const net = new Net();
const bg = openBackground(browser, { net });
await idle();
let popup = null;
let tabs = [];
let current = null; // the canvas of the active tab's page, and what jsQR finds in each of its pictures

// jsQR in the page of the active tab: it finds in pixels what the input says
// it finds in the image or the canvas they are of.
browser.standIns["vendor/jsqr.min.js"] = (w) => {
  w.jsQR = (data) => {
    const source = current ? current.sourceOf(data) : null;
    const found = source ? current.found.get(source) : null;
    return found === null || found === undefined ? null : { data: found, binaryData: [], chunks: [], version: 1, location: {} };
  };
};

// The page of the active tab at `url`, as the input has it (read()): its
// images and canvases, each of the size its pixels make (its width, and as
// many rows as the bytes fill), its data of this origin or of another. The
// content scripts the manifest gives the page do not run in it: the targets
// of the content scripts fuzz them.
function openPage(url, { images, canvases }) {
  const sized = (list) => list.map((p) => {
    const height = Math.max(1, Math.ceil(p.pixels.length / 4 / p.width));
    const data = new Uint8ClampedArray(p.width * height * 4);
    data.set(p.pixels.subarray(0, data.length));
    return { ...p, height, data };
  });
  const imgs = sized(images);
  const cvs = sized(canvases);
  const html = "<!doctype html><html><head></head><body>" +
    imgs.map((p, i) => `<img id="image-${i}" src="${p.foreign ? `https://images.example.org/qr-${i}.png` : `/qr-${i}.png`}" alt="">`).join("") +
    cvs.map((p, i) => `<canvas id="canvas-${i}" width="${p.width}" height="${p.height}"></canvas>`).join("") +
    "</body></html>";
  const prepare = (w) => {
    const found = new WeakMap();
    const byImage = new WeakMap();
    imgs.forEach((p, i) => {
      const el = w.document.getElementById(`image-${i}`);
      byImage.set(el, p);
      found.set(el, p.found);
      Object.defineProperty(el, "naturalWidth", { value: p.width, configurable: true });
      Object.defineProperty(el, "naturalHeight", { value: p.height, configurable: true });
    });
    const byCanvas = new WeakMap();
    cvs.forEach((p, i) => {
      const el = w.document.getElementById(`canvas-${i}`);
      byCanvas.set(el, p);
      found.set(el, p.found);
    });
    const { sourceOf } = installCanvas(w, {
      pixelsOf: (img) => byImage.get(img) || null,
      foreign: (img) => Boolean(byImage.get(img) && byImage.get(img).foreign),
      drawn: (canvas) => {
        const p = byCanvas.get(canvas);
        return p ? { data: p.data, foreign: p.foreign } : null;
      },
    });
    current = { sourceOf, found };
  };
  return openTab(browser, { url, html, scripts: [], net, prepare });
}

// Where background.js keeps the TOTP secret (fuzz/targets/background-message.fuzz.mjs).
const TOTP_DB = "kulms-totp-db";
const TOTP_LEGACY = "kulms-totp-encrypted";
async function totpStore(secret) {
  await new Promise((resolve, reject) => {
    const req = bg.indexedDB.deleteDatabase(TOTP_DB);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`${TOTP_DB} is still open`));
  });
  browser.storage.local.unload([TOTP_LEGACY]);
  if (secret !== null) await bg.global.saveTotpSecret(secret);
}

// What two things the popup does cost whatever the input's size, measured as
// calibrate() of fuzz/lib.mjs measures the base of the target: the input pays
// them on top of what linear code may do with it (allow() of
// harness/work.mjs). A click that makes the QR code of the kept secret has
// the bundled qrcode-gen make the code and try its eight masks over all of it
// (the shortest secret, "A", makes a code of version 4, some 600,000 steps);
// and the code shown runs on a schedule of its own, once a second for as long
// as it is shown, each run decoding the secret and taking an HMAC. What a
// longer secret adds to either is the input's, and is judged.
async function costOf(secret, kind) {
  await aside(() => totpStore(secret));
  const clock = new Clock(NOW);
  const page = openPopup(browser, { net, clock });
  await idle();
  const click = (id) => page.document.getElementById(id).dispatchEvent(new page.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  let cost;
  if (kind === "qr") {
    cost = await measure(async () => {
      click("totp-qrgen-btn");
      await idle();
    });
  } else {
    click("totp-show-btn");
    await idle();
    cost = await measure(() => clock.advance(1000));
  }
  uncounted(() => page.close());
  return cost;
}
const QR_COST = await costOf("A", "qr");
const TICK_COST = await costOf("A".repeat(16), "tick"); // the shortest secret whose code is shown (S6)
// Known: P8 (docs/findings.md). What a second of the code shown costs for each
// character of the secret past sixteen: the popup decodes the secret and
// makes its HMAC key anew every second.
const TICK_PER_CHAR = ((await costOf("A".repeat(16 + 1024), "tick")) - TICK_COST) / 1024;

async function run(data) {
  const input = read(provider(data));
  browser.forget();
  net.forget();
  const values = {};
  for (const [key, h] of Object.entries(input.stored)) values[key] = stored(key, h, input.stored);
  // Known: B17. While it is open, memos stored as a value that is not an
  // array, as a list with a null, or with a memo that holds a value the popup
  // cannot make a string or a number of (setsOffB17()), are not put in the
  // store, at the start or by a write of the actions: the popup's render()
  // stops on them, as the assignment panel's does.
  if (open("B17") && (setsOffB17(values.memos) || input.actions.some((a) => a.kind === "store" && a.key === "memos" && setsOffB17(stored("memos", a.held, input.stored))))) return;
  // Known: B25. While it is open, a cache of assignments that sets it off
  // (setsOffB25()) is not put in the store, at the start or by a write of the
  // actions.
  if (open("B25") && (setsOffB25(values.cache) || input.actions.some((a) => a.kind === "store" && a.key === "cache" && setsOffB25(stored("cache", a.held, input.stored))))) return;
  // Known: S6. While it is open, an input that keeps a secret of what is not
  // base32 and shows its QR code is left out: popup.js percent-encodes such a
  // secret into the code's URI, up to nine bytes a character, and the bundled
  // qrcode-gen makes the code of that, more work than linear code does with
  // the input, as the finding says.
  if (open("S6") && input.secret !== null && !/^[A-Z2-7=\s-]*$/i.test(input.secret) && input.actions.some((a) => a.kind === "totp-qrgen")) return;
  // Known: B22. While it is open, no secret longer than the background can save
  // is kept or typed: the input is left out.
  if (open("B22") && (tooLong(input.secret) || input.actions.some((a) => a.kind === "totp-type" && tooLong(a.text.replace(/[\s-]/g, ""))))) return;
  uncounted(() => {
    if (popup) popup.close();
    popup = null;
    for (const t of tabs) t.close();
    tabs = [];
    current = null;
  });
  await aside(() => totpStore(input.secret));
  uncounted(() => {
    browser.storage.local.unload(Object.values(KEYS));
    const items = {};
    for (const [key, v] of Object.entries(values)) if (v !== undefined) items[KEYS[key]] = v;
    browser.storage.local.load(items);
  });
  // The tabs of the window, opened before the popup, as the user had them, and
  // the active one. The page of the active tab is made (openPage()), those of
  // the others are not: the content scripts that run in them, which the
  // targets of the content scripts fuzz, are stood in for by what the input
  // says they answer.
  uncounted(() => {
    for (const [i, t] of input.tabs.entries()) {
      const tab = i === input.active ? openPage(t.url, input.page) : openBareTab(browser, { url: t.url, net });
      if (!t.answers.none) {
        tab.events.onMessage.addListener((message, sender, sendResponse) => {
          if (!message || message.type !== "kulms-refresh-assignments" || t.answers.silent) return undefined;
          if (t.answers.hangs) return true;
          sendResponse(t.answers.value);
          return undefined;
        });
      }
      tabs.push(tab);
    }
    browser.activeTabId = input.active === null ? null : tabs[input.active].tabId;
  });
  const clock = new Clock(NOW);
  popup = openPopup(browser, { net, clock });
  const w = popup.window;
  const d = popup.document;
  // jsdom does not follow links: a click that the extension leaves to the
  // browser goes nowhere, as one that is not followed.
  w.addEventListener("click", (e) => e.preventDefault());
  const watcher = watch(popup);
  const log = warnings(popup);
  await idle();
  const click = (el) => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  // Finding what the user clicks is the target's work, not the extension's.
  const pick = (selector, at) => uncounted(() => {
    const found = d.querySelectorAll(selector);
    return found.length ? found[at % found.length] : null;
  });
  const byId = (id) => uncounted(() => d.getElementById(id));
  const hidden = (id) => uncounted(() => byId(id).style.display === "none");
  // Each run of the schedule of the code shown pays its fixed cost (costOf()).
  // Known: P8. While it is open, it also pays what the secret shown adds to
  // it, as the finding says: the popup decodes the secret anew every second.
  const shownLength = () => uncounted(() => byId("totp-debug-secret").textContent.length - "Secret: ".length);
  clock.beforeRun = (t) => {
    if (!t.repeat || hidden("totp-debug")) return;
    allow(TICK_COST + (open("P8") ? TICK_PER_CHAR * Math.max(0, shownLength() - 16) : 0));
  };
  // Known: P9. What making the code of each secret cost, past the fixed cost,
  // the first time in this input (the case "totp-qrgen" below).
  const made = new Map();
  for (const a of input.actions) {
    switch (a.kind) {
      case "section": click(pick(".section-header", a.at)); break;
      case "card": click(pick(".card-name a", a.at)); break;
      case "refresh": click(byId("refresh-btn")); break;
      case "open-lms": click(byId("open-lms")); break;
      case "totp-header": click(byId("totp-header")); break;
      case "totp-type": {
        const field = byId("totp-input");
        uncounted(() => { field.value = a.text; });
        field.dispatchEvent(new w.Event("input", { bubbles: true }));
        break;
      }
      case "totp-save": click(byId("totp-save-btn")); break;
      case "totp-show": click(byId("totp-show-btn")); break;
      case "totp-delete": click(byId("totp-delete-btn")); break;
      case "totp-qrgen": {
        // A click that makes the code pays its fixed cost (costOf()); one that
        // hides the code shown does not make it.
        const makes = hidden("totp-qr-display");
        if (makes) allow(QR_COST);
        // Known: P9 (docs/findings.md). While it is open, a click that makes
        // the code of a secret whose code the popup has made before in this
        // input also pays, past the fixed cost, what making it cost then: the
        // popup asks the background for the secret and makes its code anew
        // each time the code is shown, as the finding says. The secret is the
        // one the background holds as the click comes.
        let first = null;
        if (makes && open("P9")) {
          const secret = await aside(() => bg.global.loadTotpSecret());
          if (secret && made.has(secret)) allow(made.get(secret));
          else if (secret) first = { secret, before: uncounted(() => work.done) };
        }
        click(byId("totp-qrgen-btn"));
        if (first) {
          await idle();
          if (!hidden("totp-qr-display")) made.set(first.secret, Math.max(0, uncounted(() => work.done) - first.before - QR_COST));
        }
        break;
      }
      case "totp-scan": click(byId("totp-qr-btn")); break;
      case "time": await clock.advance(a.ms); break;
      default: {
        const v = stored(a.key, a.held, input.stored);
        const api = browser.storage.local.api(bg);
        if (v === undefined) await api.remove(KEYS[a.key]);
        else await api.set({ [KEYS[a.key]]: v });
      }
    }
    await idle();
  }
  await clock.advance(RUN_ON);
  if (!(await clock.settle(RUN_ON))) fail(`the popup's scripts still set timeouts ${(2 * RUN_ON) / MINUTE} minutes on: work that never ends`);
  for (const line of log.slips()) fail(`a slip of the code: ${line}`);
  // Known: S6 (docs/findings.md). While it is open, the rejection of a key of
  // no bytes is not counted: the popup shows the code of a kept secret of
  // fewer than eight bits (one base32 character, which its form lets be
  // saved), and generateTOTPPopup() hands Web Crypto an HMAC key of no bytes
  // each second, which it rejects with nothing to handle it, as the finding
  // says.
  const problems = seen(watcher).filter((p) => !(open("S6") && ZERO_KEY.test(p)));
  if (problems.length) fail(problems.join("\n"));
  judge();
}

// Known: S6. The rejection of the code of a secret that decodes to no bytes.
const ZERO_KEY = /^unhandled rejection: DataError: Zero-length key is not supported\n[\s\S]*\bat generateTOTPPopup /;

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run, browser);
}

await calibrate(fuzz);
