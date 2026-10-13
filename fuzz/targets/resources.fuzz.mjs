// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The folders of the Resources tool (tree-view.js): on the tool's page, it
// marks each row of the table as a folder or a file and its depth, indents
// the rows and puts an arrow on each folder, takes the arrow keys to move
// between rows, and opens or closes a folder, or all of them, by posting the
// page's form with fetch and putting the table body of the answer in place of
// the page's. The input gives
// - the settings tree-view.js reads as the page loads (folderExpand,
//   autoExpandAll, treeViewEnhanced, hideResourceColumns), each a boolean or
//   any value the store's JSON carries;
// - the page: its form (there or not, its action, its fields), and the rows of
//   its table, each with a title cell or not, marked as Sakai marks a folder
//   (a link that expands it or collapses it, an icon, an image) or not, the
//   folder's collection ID and the form's action in that link's onclick as
//   Sakai writes them, or any onclick, a name and a link;
// - the server's answers to the posts, in turn: a page with a table of such
//   rows, or any bytes, with any status and type (answer() of fuzz/lib.mjs);
// - what the user does: a click on an arrow, on a folder's link or on a row,
//   a key, time going by.
// Each input opens the page anew, as tree-view.js does its work as the page
// loads. The page has a clock of its own (harness/clock.mjs), which runs ten
// minutes on after the actions.
//
// It fails when the scripts throw, when a promise is rejected with nothing to
// handle it, when the extension asks the server again, before the user does
// anything, for what it asked of a folder before, when a detector of the
// harness sees something
// (harness/detectors.mjs), when the extension warns of a slip of its code, or
// when its timeouts do not run out. A table body the server answers is the
// page's own markup, the onclick of its folders' links among them, and the
// page shows it as it is: what of it the extension puts in the page as it
// came is not counted (featuresIn()); what it makes of it besides is. It also
// fails when the extension's work grows faster than n log n from rung to
// rung of the input, or passes what linear code does with an input of its
// size (ladder() and judge() of fuzz/lib.mjs, harness/work.mjs).
import { Browser, Clock, Net, idle, openTab, uncounted, watch } from "../../harness/index.mjs";
import { featuresIn } from "../../harness/detectors.mjs";
import { LMS } from "../../tests/lms.mjs";
import { answer, bytes, calibrate, fail, json, judge, ladder, open, provider, seen, string, value, warnings } from "../lib.mjs";

const SCRIPTS = ["src/settings.js", "src/tree-view.js"];
const URL_OF_PAGE = `${LMS}/portal/site/S/tool/R`;
const SETTINGS = ["folderExpand", "autoExpandAll", "treeViewEnhanced", "hideResourceColumns"];
const MARKS = ["expand", "collapse", "icon", "image", "none"];
const ACTIONS = ["arrow", "link", "row", "key", "time"];
const KEYS = ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Enter"];
const MINUTE = 60e3;
const RUN_ON = 10 * MINUTE;

// As many of make() as the input has bytes for.
function list(fdp, make) {
  const out = [];
  for (let n = fdp.consumeIntegralInRange(0, fdp.remainingBytes); n > 0 && fdp.remainingBytes > 0; n--) out.push(make(fdp));
  return out;
}

function row(fdp) {
  const r = { title: fdp.consumeBoolean(), flex: fdp.consumeBoolean(), mark: fdp.pickValue(MARKS), name: string(fdp), href: fdp.consumeBoolean() ? string(fdp) : null };
  if (fdp.consumeBoolean()) r.onclick = string(fdp);
  else r.sakai = { action: fdp.consumeBoolean() ? string(fdp) : null, id: string(fdp) };
  return r;
}

function action(fdp) {
  const a = { kind: fdp.pickValue(ACTIONS), at: fdp.consumeIntegral(2) };
  if (a.kind === "key") a.key = fdp.consumeBoolean() ? fdp.pickValue(KEYS) : string(fdp);
  if (a.kind === "time") a.ms = fdp.consumeIntegralInRange(0, RUN_ON);
  return a;
}

// What the target reads of an input, in the order it reads it.
export function read(fdp) {
  const settings = {};
  for (const key of SETTINGS) settings[key] = fdp.consumeBoolean() ? fdp.consumeBoolean() : json(value(fdp)).value;
  const form = fdp.consumeBoolean() ? {
    action: fdp.pickValue([() => null, () => `${URL_OF_PAGE}?panel=Main`, () => string(fdp)])(),
    fields: list(fdp, (f) => ({ name: string(f), value: string(f) })),
    sakai: fdp.consumeBoolean(),
  } : null;
  const rows = list(fdp, row);
  const answers = list(fdp, (f) => answer(f, f.consumeBoolean() ? page({ form: null, rows: list(f, row) }) : bytes(f), "text/html"));
  const actions = list(fdp, action);
  return { settings, form, rows, answers, actions };
}

// `s` in markup, as a server escapes it: in an attribute value, or as text.
const attribute = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const text = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// A row's markup, as Sakai's Resources tool writes it.
function rowMarkup(r) {
  if (!r.title) return `<tr><td>${text(r.name)}</td></tr>`;
  const onclick = r.onclick !== undefined ? r.onclick
    : `javascript:document.getElementById('sakai_action').value='${r.sakai.action === null ? (r.mark === "collapse" ? "doCollapse_collection" : "doExpand_collection") : r.sakai.action}';` +
      `document.getElementById('collectionId').value='${r.sakai.id}';document.getElementById('showForm').submit();`;
  const mark = r.mark === "expand" || r.mark === "collapse" ? `<a href="#" onclick="${attribute(onclick)}"><span class="fa fa-folder"></span></a>`
    : r.mark === "icon" ? '<span class="fa fa-folder"></span>'
    : r.mark === "image" ? '<img src="/library/image/sakai/folder.gif" alt="">'
    : "";
  const link = `<a href="${attribute(r.href === null ? "#" : r.href)}"${r.mark === "icon" || r.mark === "image" ? ` onclick="${attribute(onclick)}"` : ""}>${text(r.name)}</a>`;
  const inner = `${mark}${link}`;
  return `<tr><td class="checkbox"></td><td class="title">${r.flex ? `<div class="d-flex align-items-center">${inner}</div>` : inner}</td><td class="size">1</td></tr>`;
}

// A page of the tool, as Sakai writes it.
function page({ form, rows }) {
  const fields = form ? [
    ...(form.sakai ? ['<input type="hidden" name="sakai_action" id="sakai_action" value="">', '<input type="hidden" name="collectionId" id="collectionId" value="">'] : []),
    ...form.fields.map((f) => `<input type="hidden" name="${attribute(f.name)}" value="${attribute(f.value)}">`),
  ].join("") : "";
  const table = `<table class="resourcesList"><tbody>${rows.map(rowMarkup).join("")}</tbody></table>`;
  const body = form ? `<form id="showForm" method="post"${form.action === null ? "" : ` action="${attribute(form.action)}"`}>${fields}${table}</form>` : table;
  return `<!doctype html><html><head></head><body>${body}</body></html>`;
}

const browser = new Browser();
const net = new Net();
const NOT_FOUND = { status: 404, headers: { "content-type": "text/html" }, body: "" };
let answers = [];
let posts = 0;
// What the extension asked the server to do to a folder (a post's sakai_action
// and collectionId), what it asked again before the user did anything, and
// whether the user has begun to.
let asked = new Set();
let again = [];
let acting = false;

// What a post of the form asks of a folder, or null for another request.
function folderAsked(request) {
  return uncounted(() => {
    if (request.method !== "POST" || request.body === undefined || request.body === null) return null;
    try {
      const body = new URLSearchParams(String(request.body));
      return JSON.stringify([body.get("sakai_action"), body.get("collectionId")]);
    } catch {
      return null;
    }
  });
}

net.on(LMS, (request) => {
  const key = folderAsked(request);
  if (key !== null && !acting && asked.has(key)) {
    // Known: P2 (docs/findings.md). While it is open, the server answers what
    // the extension asks again, before the user does anything, of a folder it
    // asked of before with a 404: expandAllFolders() asks again for a folder
    // that an answer still shows closed, up to 30 times, and goes through the
    // whole listing each time.
    if (open("P2")) return NOT_FOUND;
    again.push(key);
  }
  if (key !== null) asked.add(key);
  return answers.length ? answers[posts++ % answers.length] : NOT_FOUND;
});
let tab = null;

const click = (el) => el && el.dispatchEvent(new tab.window.MouseEvent("click", { bubbles: true, cancelable: true }));
// The element `a.at` picks of those `selector` finds, or null. Finding what
// the user clicks is the target's work, not the extension's.
function pick(selector, a) {
  return uncounted(() => {
    const found = tab.document.querySelectorAll(selector);
    return found.length ? found[a.at % found.length] : null;
  });
}

async function run(data) {
  const input = read(provider(data));
  browser.forget();
  net.forget();
  posts = 0;
  answers = input.answers;
  asked = new Set();
  again = [];
  acting = false;
  // The page of the last input closed, and the settings of this one stored.
  uncounted(() => {
    if (tab) tab.close();
    browser.storage.local.unload(["kulms-settings"]);
    browser.storage.local.load({ "kulms-settings": input.settings });
  });
  const clock = new Clock(Date.UTC(2026, 9, 14, 1, 0));
  tab = openTab(browser, { url: URL_OF_PAGE, html: page(input), scripts: SCRIPTS, clock, net });
  // jsdom does not follow links: a click that the extension leaves to the
  // browser goes nowhere, as one that is not followed.
  tab.window.addEventListener("click", (e) => e.preventDefault());
  const watcher = watch(tab);
  const log = warnings(tab);
  await idle();
  acting = true;
  for (const a of input.actions) {
    if (a.kind === "arrow") click(pick(".kulms-tree-arrow", a));
    else if (a.kind === "link") click(pick('a[onclick*="doExpand_collection"], a[onclick*="doCollapse_collection"]', a));
    else if (a.kind === "row") click(pick("table.resourcesList tbody tr", a));
    else if (a.kind === "key") {
      const table = tab.document.querySelector("table.resourcesList");
      if (table) table.dispatchEvent(new tab.window.KeyboardEvent("keydown", { key: a.key, bubbles: true, cancelable: true }));
    } else await clock.advance(a.ms);
    await idle();
  }
  await clock.advance(RUN_ON);
  if (!(await clock.settle(RUN_ON))) fail(`the page's scripts still set timeouts ${(2 * RUN_ON) / MINUTE} minutes on: work that never ends`);
  for (const line of log.slips()) fail(`a slip of the code: ${line}`);
  if (again.length) {
    const [action, id] = JSON.parse(again[0]);
    fail(`the extension asked the server again, before the user did anything, for ${JSON.stringify(action)} of the folder ${JSON.stringify(id)}, which it had asked for before (${again.length} times again in all)`);
  }
  // The server's own markup, which the page shows as it came.
  const own = uncounted(() => {
    const out = new Set();
    for (const a of answers) {
      const body = typeof a.body === "string" ? a.body : new TextDecoder().decode(Uint8Array.from(a.body || []));
      for (const f of featuresIn(body, tab.document, new URL(URL_OF_PAGE).origin, `chrome-extension://${browser.id}`)) out.add(f);
    }
    return out;
  });
  const problems = seen(watcher).filter((p) => {
    const m = /^markup that runs script, loads from elsewhere or sends the page elsewhere: [^\n]* \(([^\n]*)\)$/.exec(p);
    return !(m && own.has(m[1]));
  });
  if (problems.length) fail(problems.join("\n"));
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run, browser);
}

await calibrate(fuzz);
