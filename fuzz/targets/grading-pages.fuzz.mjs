// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The TA's grading support on Sakai's grading pages (grading-ta.js). On the
// grader of a submission, it marks each student of the grader's list with the
// status of their submission, which it asks of the bridge it puts in the page
// (grading-ta-page.js, which reads the grader's originalSubmissions) or,
// failing that, reads from the list of submissions it fetches; it shows how
// many wait for a grade, puts buttons that jump to the next or the previous
// one that does, keeps the statuses in the page's sessionStorage, and asks
// before the user leaves a grade unsaved. On the list of submissions, it marks
// the status of each row. The input gives
// - the page's URL: the page of a site's tool (the site and the tool any
//   strings), with the query Sakai gives the grader or any query, or a page
//   of no tool;
// - the grader, or none: its element (<sakai-grader> with the ID Sakai gives
//   it or any, or another element); its panel (#grader: shown, showing,
//   hiding, neither, or none) and the controls in it (inputs, and buttons
//   that say what Sakai's say or anything); the count of what is graded
//   ("採点済み 41 / 54", "Graded 3 / 5", or any text), in #grader-total or
//   elsewhere; the list of students (each an ID, as Sakai gives one or any,
//   and a name, with status icons or not), the one selected; Sakai's button
//   to the next submission; a link to the assignment;
// - the submissions the grader holds (originalSubmissions), which the bridge
//   reads: none, or each with the fields Sakai gives (its ID the ID of a
//   student of the list, or any), each shaped as Sakai gives it or any value
//   JSON carries;
// - the tables of the page: each the list of submissions (#submissionList) or
//   another table, its header (Sakai's words or any) in a thead or not, and
//   its rows, each of cells: a status (Sakai's words, with icons or not, or
//   any), a student's link to the grader (as Sakai writes it, or any), or any
//   text;
// - the server's answers to the fetches of the list of submissions, in turn:
//   a page of such tables, or any bytes, with any status and type (answer()
//   of fuzz/lib.mjs);
// - what the page's sessionStorage holds under the extension's key of the
//   page's assignment: nothing, statuses as the extension keeps them, or any
//   JSON or text;
// - what the user answers each time the extension asks whether to leave a
//   grade unsaved, and after the answers the input gives;
// - what the user does: a click on a jump button, the choice of another
//   student, typing in the grader, a click on a button of the grader or on a
//   link or a button of the page, time going by; and what the page does:
//   Sakai drawing the list of students anew, opening and closing the panel,
//   changing a status in a table, writing the extension's key of
//   sessionStorage.
// Each input opens the page anew, on a clock of its own (harness/clock.mjs)
// that runs ten minutes on after the actions. A navigation that the extension
// or the user starts is kept (harness/contexts.mjs, and the clicks of links
// here): the page would be gone, so no action follows it.
//
// It fails when the scripts throw, when a promise is rejected with nothing to
// handle it, when the extension leaves the page after the user answered to
// stay, when it leaves for another origin, when the user is asked twice
// whether to leave, when a detector of the harness sees something
// (harness/detectors.mjs), when the extension warns of a slip of its code, or
// when its timeouts do not run out. It also fails when the extension's work
// grows faster than n log n from rung to rung of the input, or passes what
// linear code does with an input of its size (ladder() and judge() of
// fuzz/lib.mjs, harness/work.mjs).
import { Browser, Clock, Net, idle, openTab, uncounted, watch } from "../../harness/index.mjs";
import { LMS } from "../../tests/lms.mjs";
import { answer, bytes, calibrate, fail, json, judge, ladder, open, provider, seen, string, value, warnings } from "../lib.mjs";

const SCRIPTS = ["src/settings.js", "src/grading-ta.js"];
const MINUTE = 60e3;
const RUN_ON = 10 * MINUTE;
const NOW = Date.UTC(2026, 9, 14, 1, 0);
const STATUSES = ["未採点 - 提出済み", "未採点 - 取組中", "未提出", "採点済み", "返却済み", "再提出済み", "Ungraded - Submitted",
  "Ungraded - In Progress", "Awaiting Grade", "Submitted, Awaiting Grade", "No Submission", "Not Submitted", "Honor Pledge Accepted",
  "Returned", "Graded"];
const ICONS = ["🟡", "🟠", "⚪", "🟨", "✅"];
const HEADERS = ["状態", "Status", "提出日時", "Submitted", "受講者", "学生番号", "Student", "氏名", "Name", "成績", "Grade", "開示", "Release", "再提出"];
const BUTTONS = ["保存", "Save", "返却", "Return", "提出", "Submit", "保存して返却", "Release", ""];
const CONTROLS = ["前の提出物を表示", "次の提出物を表示", "一覧へ戻る", "設定", "previous submission", "next submission", "Back to list", "Settings"];
const PANELS = ["show", "showing", "hiding", ""];
const ACTIONS = ["jump-next", "jump-prev", "select", "type", "grader-button", "page-control", "redraw", "panel", "status", "storage", "resize", "time"];

// As many of make() as the input has bytes for.
function list(fdp, make) {
  const out = [];
  for (let n = fdp.consumeIntegralInRange(0, fdp.remainingBytes); n > 0 && fdp.remainingBytes > 0; n--) out.push(make(fdp));
  return out;
}

// One of `words`, as Sakai writes them, or any string.
const word = (fdp, words) => (fdp.consumeBoolean() ? fdp.pickValue(words) : string(fdp));

// An ID as Sakai gives a submission one (lowercase hex and dashes), or any
// string.
const id = (fdp) => (fdp.consumeBoolean() ? [...bytes(fdp)].map((b) => b.toString(16).padStart(2, "0")).join("") : string(fdp));

// A status as Sakai shows it: icons the extension put before it (as when the
// page is drawn again) or not, and Sakai's words with a time or any string.
function status(fdp) {
  const icons = list(fdp, (f) => `${f.pickValue(ICONS)}${f.consumeBoolean() ? " " : ""}`).join("");
  const words = fdp.consumeBoolean() ? `${fdp.pickValue(STATUSES)}${fdp.consumeBoolean() ? ` ${string(fdp)}` : ""}` : string(fdp);
  return icons + words;
}

// A link to the grader of a submission, as Sakai writes one, or any string.
function gradeLink(fdp) {
  if (!fdp.consumeBoolean()) return string(fdp);
  const site = string(fdp);
  const assignment = string(fdp);
  return `/portal/site/${site}/tool/${string(fdp)}?assignmentId=/assignment/a/${site}/${assignment}` +
    `&submissionId=/assignment/s/${site}/${assignment}/${id(fdp)}&panel=Main&sakai_action=doGrade_submission`;
}

function url(fdp) {
  switch (fdp.consumeIntegralInRange(0, 2)) {
    case 0: {
      const site = string(fdp);
      const assignment = string(fdp);
      return `/portal/site/${site}/tool/${string(fdp)}?assignmentId=/assignment/a/${site}/${assignment}` +
        `&submissionId=/assignment/s/${site}/${assignment}/${id(fdp)}&panel=Main&sakai_action=doGrade_submission`;
    }
    case 1: return `/portal/site/${string(fdp)}/tool/${string(fdp)}?${string(fdp)}`;
    default: return `/portal/${string(fdp)}`;
  }
}

const option = (fdp) => ({ value: id(fdp), name: status(fdp) });

const control = (fdp) => (fdp.consumeBoolean() ? { input: true } : { button: word(fdp, BUTTONS), label: fdp.consumeBoolean() ? word(fdp, BUTTONS) : null });

// A submission of the grader's originalSubmissions: the fields Sakai gives,
// each as Sakai gives it or any value JSON carries; its ID that of the
// student `of` picks, or any.
function submission(fdp) {
  const or = (make) => (fdp.consumeBoolean() ? make() : json(value(fdp)).value);
  return {
    id: or(() => (fdp.consumeBoolean() ? { of: fdp.consumeIntegralInRange(0, 255) } : string(fdp))),
    firstSubmitterName: or(() => string(fdp)),
    status: or(() => (fdp.consumeBoolean() ? fdp.pickValue(STATUSES) : string(fdp))),
    submittedTime: or(() => string(fdp)),
    submitted: or(() => fdp.consumeBoolean()),
    draft: or(() => fdp.consumeBoolean()),
    hasHistory: or(() => fdp.consumeBoolean()),
    grade: or(() => string(fdp)),
    graded: or(() => fdp.consumeBoolean()),
    returned: or(() => fdp.consumeBoolean()),
  };
}

function grader(fdp) {
  if (!fdp.consumeBoolean()) return null;
  const g = {
    tag: fdp.pickValue(["sakai-grader", "div"]),
    id: fdp.pickValue([() => `sakai-grader-${string(fdp)}`, () => string(fdp), () => null])(),
    panel: fdp.consumeBoolean() ? { class: fdp.pickValue(PANELS), controls: list(fdp, control) } : null,
    total: fdp.pickValue([() => null, () => ({ inTotal: fdp.consumeBoolean(), text: progress(fdp) })])(),
    options: list(fdp, option),
    next: fdp.consumeBoolean(),
    link: fdp.consumeBoolean() ? gradeLink(fdp) : null,
    submissions: fdp.consumeBoolean() ? list(fdp, submission) : null,
  };
  g.selected = g.options.length > 0 && fdp.consumeBoolean() ? fdp.consumeIntegralInRange(0, g.options.length - 1) : null;
  return g;
}

// The count of what is graded, as Sakai shows it, or any text.
const progress = (fdp) => (fdp.consumeBoolean() ? `${fdp.pickValue(["採点済み", "Graded"])} ${fdp.consumeIntegral(2)} / ${fdp.consumeIntegral(2)}` : string(fdp));

function cell(fdp) {
  switch (fdp.consumeIntegralInRange(0, 2)) {
    case 0: return { status: status(fdp) };
    case 1: return { link: gradeLink(fdp), name: string(fdp) };
    default: return { text: string(fdp) };
  }
}

const table = (fdp) => ({
  list: fdp.consumeBoolean(),
  thead: fdp.consumeBoolean(),
  headers: list(fdp, (f) => word(f, HEADERS)),
  rows: list(fdp, (f) => list(f, cell)),
});

// What the page's sessionStorage holds under the extension's key: nothing,
// statuses as the extension keeps them (an entry for students of the list or
// any key, each of a kind and a source as the extension writes them, or any
// value), or any value JSON carries, or any text.
function cache(fdp) {
  switch (fdp.consumeIntegralInRange(0, 3)) {
    case 0: return null;
    case 1: {
      const map = list(fdp, (f) => [f.consumeBoolean() ? { of: f.consumeIntegralInRange(0, 255) } : string(f), f.consumeBoolean() ? {
        name: string(f),
        status: word(f, STATUSES),
        kind: f.pickValue(["pendingGrade", "inProgress", "notSubmitted", "graded", "returned", "unknown"]),
        submitTime: string(f),
        source: f.pickValue(["submissionList", "originalSubmissions", "localReturn"]),
        statusSource: f.pickValue(["explicit", "derived", "localAction"]),
        cachedAt: NOW - f.consumeIntegralInRange(0, 10 * MINUTE),
      } : json(value(f)).value]);
      return { shaped: map };
    }
    case 2: return { json: json(value(fdp)).value };
    default: return { text: string(fdp) };
  }
}

function action(fdp) {
  const a = { kind: fdp.pickValue(ACTIONS), at: fdp.consumeIntegralInRange(0, 65535) };
  if (a.kind === "type") a.text = string(fdp);
  if (a.kind === "redraw") a.options = list(fdp, option);
  if (a.kind === "panel") a.class = fdp.pickValue(PANELS);
  if (a.kind === "status") a.status = status(fdp);
  if (a.kind === "storage") a.cache = cache(fdp);
  if (a.kind === "time") a.ms = fdp.consumeIntegralInRange(0, RUN_ON);
  return a;
}

// What the target reads of an input, in the order it reads it.
export function read(fdp) {
  const path = url(fdp);
  const g = grader(fdp);
  const controls = list(fdp, (f) => ({ link: f.consumeBoolean() ? string(f) : null, text: word(f, CONTROLS) }));
  const tables = list(fdp, table);
  const answers = list(fdp, (f) => answer(f, f.consumeBoolean() ? listPage(list(f, table)) : bytes(f), "text/html"));
  const stored = cache(fdp);
  const confirms = list(fdp, (f) => f.consumeBoolean());
  const leave = fdp.consumeBoolean();
  const actions = list(fdp, action);
  return { path, grader: g, controls, tables, answers, stored, confirms, leave, actions };
}

// `s` in markup, as the server escapes it: in an attribute value, or as text.
const attribute = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const text = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function tableHtml(t, i) {
  const head = `<tr>${t.headers.map((h) => `<th>${text(h)}</th>`).join("")}</tr>`;
  const rows = t.rows.map((cells) => `<tr>${cells.map((c) => `<td>${
    "status" in c ? text(c.status) : "link" in c ? `<a href="${attribute(c.link)}">${text(c.name)}</a>` : text(c.text)}</td>`).join("")}</tr>`).join("");
  return `<table${t.list ? ' id="submissionList"' : ` id="table-${i}"`}>${t.thead ? `<thead>${head}</thead><tbody>${rows}</tbody>` : `<tbody>${head}${rows}</tbody>`}</table>`;
}

// A page of the list of submissions, as the server answers the fetch of one.
function listPage(tables) {
  return `<!doctype html><html><head></head><body>${tables.map(tableHtml).join("")}</body></html>`;
}

function graderHtml(g) {
  const options = g.options.map((o, i) => `<option value="${attribute(o.value)}"${i === g.selected ? " selected" : ""}>${text(o.name)}</option>`).join("");
  const total = g.total && g.total.inTotal ? `<div id="grader-total">${text(g.total.text)}</div>` : "";
  const panel = g.panel ? `<div id="grader" class="offcanvas ${attribute(g.panel.class)}">${total}${g.panel.controls.map((c, i) =>
    c.input ? `<input type="text" id="grader-input-${i}">` : `<button type="button" id="grader-button-${i}"${c.label === null ? "" : ` aria-label="${attribute(c.label)}"`}>${text(c.button)}</button>`).join("")}</div>` : total;
  const progressElsewhere = g.total && !g.total.inTotal ? `<span class="grader-progress">${text(g.total.text)}</span>` : "";
  return `<${g.tag}${g.id === null ? "" : ` id="${attribute(g.id)}"`}>${panel}${progressElsewhere}` +
    `<div class="submitter"><button type="button" aria-label="前の提出物を表示">&lt;</button><select id="grader-submitter-select">${options}</select>` +
    `${g.next ? '<button type="button" aria-label="次の提出物を表示">&gt;</button>' : ""}</div>` +
    `${g.link === null ? "" : `<a href="${attribute(g.link)}">課題</a>`}</${g.tag}>`;
}

function page(input) {
  return "<!doctype html><html><head></head><body>" +
    (input.grader ? graderHtml(input.grader) : "") +
    input.controls.map((c, i) => (c.link === null ? `<button type="button" id="control-${i}">${text(c.text)}</button>` : `<a id="control-${i}" href="${attribute(c.link)}">${text(c.text)}</a>`)).join("") +
    input.tables.map(tableHtml).join("") +
    "</body></html>";
}

// A URL of the LMS of `path` as the URL parser reads it, or the LMS's own.
function at(path) {
  try {
    return new URL(path, LMS).href;
  } catch {
    return `${LMS}/`;
  }
}

const browser = new Browser();
const net = new Net();
let tab = null;
let answers = [];
// The server answers the fetches of the list of submissions in turn, and then
// as a network that fails.
net.on(LMS, () => answers.shift() || { failed: true });

// What the extension would write of the statuses of `ids` (the students of
// the list), as the page's sessionStorage keeps it: JSON text, or the text
// the input gives.
function cacheText(c, ids) {
  if (c === null) return null;
  if ("text" in c) return c.text;
  if ("json" in c) return JSON.stringify(c.json) ?? "null";
  const map = {};
  for (const [k, entry] of c.shaped) {
    const key = typeof k === "string" ? k : ids.length ? ids[k.of % ids.length] : null;
    if (key !== null) map[key] = entry;
  }
  return JSON.stringify({ version: 1, map });
}

// The extension's key of the page's statuses: the site of the page's path and
// the assignment of its grader (the grader's ID, else the query, else a link
// to the assignment), as grading-ta.js finds them, or null.
function keyOf(w, g) {
  const site = w.location.pathname.match(/\/portal\/site\/([^/]+)\/tool\/([^/]+)/);
  if (!site || !g) return null;
  const byId = typeof g.id === "string" ? g.id.match(/^sakai-grader-(.+)$/) : null;
  let assignment = byId ? byId[1] : null;
  const decode = (s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return null;
    }
  };
  if (assignment === null) {
    const q = w.location.search.match(/assignmentId=\/assignment\/a\/[^/]+\/([^&]+)/);
    if (q) assignment = decode(q[1]);
  }
  if (assignment === null && g.link !== null) {
    const l = w.document.createElement("a");
    l.href = g.link;
    const m = l.href.match(/assignmentId=\/assignment\/a\/[^/]+\/([^&]+)/);
    if (m) assignment = decode(m[1]);
  }
  return assignment ? `kulms-ta-status-map:${site[1]}:${assignment}` : null;
}

// Known: B16 (docs/findings.md). Whether the page has a %-sequence that
// decodeURIComponent() cannot decode where grading-ta.js decodes one: the
// assignment of the page's query and of the link to the assignment
// (findAssignmentId()), and the site and the assignment of the links of a
// table (parseGradeLinkIds()). A page the server answers is read in a promise
// whose rejection the extension catches, and is not counted.
const ASSIGNMENT = /assignmentId=\/assignment\/a\/[^/]+\/([^&]+)/;
function malformed(s) {
  try {
    decodeURIComponent(s);
    return false;
  } catch {
    return true;
  }
}
function setsOffB16(input) {
  const query = new URL(at(input.path)).search.match(ASSIGNMENT);
  if (query && malformed(query[1])) return true;
  if (input.grader && input.grader.link !== null) {
    const link = new URL(input.grader.link, at(input.path)).href.match(ASSIGNMENT);
    if (link && malformed(link[1])) return true;
  }
  return input.tables.some((t) => t.rows.some((cells) => cells.some((c) => {
    if (!("link" in c)) return false;
    const a = c.link.match(/assignmentId=\/assignment\/a\/([^/]+)\/([^/&]+)/);
    const sub = c.link.match(/submissionId=\/assignment\/s\/([^/]+)\/([^/]+)\/([0-9a-f-]+)/);
    return [sub && sub[1], sub && sub[2], !sub && a && a[1], !sub && a && a[2]].some((x) => typeof x === "string" && malformed(x));
  })));
}

// Known: B26 (docs/findings.md). The TypeError that parseSubmissionListGroups()
// throws on a row of a list of submissions with no cell at the column of the
// submission time, where it is let out and where the extension catches it.
const B26 = /TypeError: Cannot read properties of undefined \(reading 'textContent'\)\n\s+at parseSubmissionListGroups /;

async function run(data) {
  const input = read(provider(data));
  // Known: B16. While it is open, a page whose query, link to the assignment
  // or links of a table hold a %-sequence that cannot be decoded where
  // grading-ta.js decodes one is left out: decodeURIComponent() throws a
  // URIError on it, as the finding says.
  if (open("B16") && setsOffB16(input)) return;
  browser.forget();
  net.forget();
  uncounted(() => {
    if (tab) tab.close();
    tab = null;
  });
  answers = [...input.answers];
  const g = input.grader;
  const confirms = [...input.confirms];
  let answered = []; // what the user answered during the action under way
  const clock = new Clock(NOW);
  const prepare = (w) => uncounted(() => {
    // What the user answers when the extension asks whether to leave.
    w.confirm = () => {
      const yes = confirms.length ? confirms.shift() : input.leave;
      answered.push(yes);
      return yes;
    };
    if (g && g.submissions !== null) {
      const ids = g.options.map((o) => o.value);
      const submissions = g.submissions.map((s) => {
        const copy = { ...s };
        if (copy.id && typeof copy.id === "object" && "of" in copy.id && Object.keys(copy.id).length === 1) copy.id = ids.length ? ids[copy.id.of % ids.length] : "";
        return copy;
      });
      w.document.body.firstElementChild.originalSubmissions = w.JSON.parse(JSON.stringify(submissions));
    }
    const key = keyOf(w, g);
    const stored = cacheText(input.stored, g ? g.options.map((o) => o.value) : []);
    if (key !== null && stored !== null) w.sessionStorage.setItem(key, stored);
    // jsdom does not follow links: a click that leaves to a link is kept as a
    // navigation, after asking the page whether it may be unloaded, as
    // harness/contexts.mjs keeps one a script asks for.
    w.addEventListener("click", (e) => {
      const link = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (e.defaultPrevented || !link) return;
      e.preventDefault();
      const href = link.href;
      if (href.startsWith("javascript:") || href.split("#")[0] === w.location.href.split("#")[0]) return;
      const unload = new w.Event("beforeunload", { cancelable: true });
      w.dispatchEvent(unload);
      browser.navigations.push({ where: w.location.href, url: href, prompted: unload.defaultPrevented });
    });
  });
  tab = openTab(browser, { url: at(input.path), html: page(input), scripts: SCRIPTS, net, prepare, clock });
  const w = tab.window;
  const d = tab.document;
  const watcher = watch(tab);
  const log = warnings(tab);
  await idle();
  await clock.advance(0);
  const click = (el) => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  // Finding what the user acts on is the target's work, not the extension's.
  const pick = (selector, at) => uncounted(() => {
    const found = d.querySelectorAll(selector);
    return found.length ? found[at % found.length] : null;
  });
  const left = () => browser.navigations.length > 0;
  for (const a of input.actions) {
    if (left()) break;
    answered = [];
    const before = browser.navigations.length;
    switch (a.kind) {
      case "jump-next": click(pick(".kulms-ta-jump-next", a.at)); break;
      case "jump-prev": click(pick(".kulms-ta-jump-prev", a.at)); break;
      case "select": {
        const select = pick("#grader-submitter-select", 0);
        const options = select ? uncounted(() => select.options.length) : 0;
        if (options > 0) {
          uncounted(() => { select.selectedIndex = a.at % options; });
          select.dispatchEvent(new w.Event("change", { bubbles: true }));
        }
        break;
      }
      case "type": {
        const field = pick("#grader input", a.at);
        if (field) {
          uncounted(() => { field.value = a.text; });
          field.dispatchEvent(new w.Event("input", { bubbles: true }));
        }
        break;
      }
      case "grader-button": click(pick("#grader button", a.at)); break;
      case "page-control": click(pick("[id^='control-']", a.at)); break;
      case "redraw": {
        // Sakai draws the list of students anew.
        const select = pick("#grader-submitter-select", 0);
        if (select) {
          const html = a.options.map((o) => `<option value="${attribute(o.value)}">${text(o.name)}</option>`).join("");
          uncounted(() => { select.innerHTML = html; });
        }
        break;
      }
      case "panel": {
        const panel = pick("#grader", 0);
        if (panel) uncounted(() => { panel.className = `offcanvas ${a.class}`; });
        break;
      }
      case "status": {
        const cellOf = pick("td", a.at);
        if (cellOf) uncounted(() => { cellOf.textContent = a.status; });
        break;
      }
      case "storage": {
        const key = uncounted(() => keyOf(w, g));
        const stored = cacheText(a.cache, g ? g.options.map((o) => o.value) : []);
        if (key !== null) uncounted(() => (stored === null ? w.sessionStorage.removeItem(key) : w.sessionStorage.setItem(key, stored)));
        break;
      }
      case "resize": w.dispatchEvent(new w.Event("resize")); break;
      default: await clock.advance(a.ms);
    }
    await idle();
    await clock.advance(0);
    uncounted(() => {
      for (const n of browser.navigations.slice(before)) {
        if (answered.includes(false)) fail(`the extension left for ${n.url} though the user answered to stay`);
        if (answered.includes(true) && n.prompted) fail(`the user, who had answered to leave, was asked again whether to leave for ${n.url}`);
        let origin = null;
        try {
          origin = new URL(n.url).origin;
        } catch { /* no URL */ }
        if (origin !== LMS) fail(`the extension left for ${n.url}, not a page of the LMS`);
      }
    });
  }
  // The page runs on, unless it was left.
  if (!left()) {
    await clock.advance(RUN_ON);
    if (!(await clock.settle(RUN_ON))) fail(`the page's scripts still set timeouts ${(2 * RUN_ON) / MINUTE} minutes on: work that never ends`);
  }
  for (const line of log.slips()) fail(`a slip of the code: ${line}`);
  // Known: B26. While it is open, the TypeError of a row of a list of
  // submissions with no cell at the column of the submission time is not
  // counted: the extension reads that cell without looking whether the row
  // has it, and the list's statuses are not read, as the finding says.
  const problems = seen(watcher).filter((p) => !(open("B26") && B26.test(p)));
  if (problems.length) fail(problems.join("\n"));
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run, browser);
}

await calibrate(fuzz);
