// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The TOTP registration helper (auth-totp-register.js) on the pages of the
// university's authentication server. On the page that registers a TOTP
// secret (app=qrsecret), it reads the secret from the page's QR codes (jsQR)
// or, failing that, from the page's text after a click on the link that shows
// it, keeps it in the page's sessionStorage, and fills in the one-time code;
// on any page that says the registration is done, it has the background save
// the secret it kept. The input gives
// - the page's URL: the registration page, or any path and query of the
//   server;
// - its body: paragraphs, each any string or one of the server's ("設定が完了
//   しました", "シークレット: " and a secret); links, each with its text (the
//   server's "QRコードを読み込めない場合" or any), its href (javascript:void(0)
//   or any) and what a click on it shows, as the page's own script does (a
//   paragraph, or nothing); images, each its width and its pixels (bytes);
//   and a field for the code (type number) or none;
// - what jsQR finds in each image: nothing, an otpauth URI with any secret,
//   or any string;
// - the page's sessionStorage: the secret the helper keeps (none, or any
//   string), and how much of it the page's own data leaves free (the quota is
//   jsdom's 5,000,000 code units; the Storage Standard recommends 5 MiB).
// jsQR, which the extension bundles (vendor/) and which is not its own code,
// is stood in for by what the input says it finds in each image. The
// background is the extension's own, and saves what the helper asks it to; it
// begins each input with no secret saved. The page's canvas is the harness's
// (harness/canvas.mjs: the HTML Standard's drawImage() and getImageData(),
// their work counted).
//
// It fails when the scripts throw, when a promise is rejected with nothing to
// handle it, when a detector of the harness sees something
// (harness/detectors.mjs), when the extension warns of a slip of its code,
// when the code it fills in is not six digits, or when the secret it has the
// background save is not the one the page's sessionStorage held. It also
// fails when the extension's work grows faster than n log n from rung to rung
// of the input, or passes what linear code does with an input of its size
// (ladder() and judge() of fuzz/lib.mjs, harness/work.mjs).
import { Browser, aside, idle, installCanvas, openBackground, openTab, uncounted, watch } from "../../harness/index.mjs";
import { bytes, calibrate, fail, judge, ladder, open, provider, seen, string, warnings } from "../lib.mjs";

const AUTH = "https://auth.iimc.kyoto-u.ac.jp";
const SCRIPTS = ["src/auth-totp-register.js"];
const KEY = "kulms-totp-pending-secret";
const QUOTA = 5000000;
const DONE = "設定が完了しました"; // 設定が完了しました
const SECRET = "シークレット"; // シークレット
const NO_QR = "QRコードを読み込めない場合";

// As many of make() as the input has bytes for.
function list(fdp, make) {
  const out = [];
  for (let n = fdp.consumeIntegralInRange(0, fdp.remainingBytes); n > 0 && fdp.remainingBytes > 0; n--) out.push(make(fdp));
  return out;
}

// A paragraph: the server's words, or any string.
const paragraph = (fdp) => fdp.pickValue([() => DONE, () => `${SECRET}: ${string(fdp)}`, () => string(fdp)])();

function link(fdp) {
  return {
    text: fdp.consumeBoolean() ? NO_QR : string(fdp),
    href: fdp.consumeBoolean() ? "javascript:void(0)" : string(fdp),
    shows: fdp.consumeBoolean() ? paragraph(fdp) : null,
  };
}

function image(fdp) {
  return {
    width: fdp.consumeIntegralInRange(1, 4096),
    pixels: bytes(fdp),
    found: fdp.pickValue([() => null, () => `otpauth://totp/KULMS?secret=${string(fdp)}&issuer=x`, () => string(fdp)])(),
  };
}

// What the target reads of an input, in the order it reads it.
export function read(fdp) {
  const registering = fdp.consumeBoolean();
  const path = registering ? "/user/index.php?app=qrsecret" : `/${string(fdp)}?${string(fdp)}`;
  const paragraphs = list(fdp, paragraph);
  const links = list(fdp, link);
  const images = list(fdp, image);
  const field = fdp.consumeBoolean();
  const pending = fdp.consumeBoolean() ? string(fdp) : null;
  const free = fdp.pickValue([() => Infinity, () => fdp.consumeIntegralInRange(0, 65535), () => 0])();
  return { path, paragraphs, links, images, field, pending, free };
}

// `s` in markup, as the server escapes it: in an attribute value, or as text.
const attribute = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const text = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function page({ paragraphs, links, images, field }) {
  return "<!doctype html><html><head></head><body>" +
    paragraphs.map((p) => `<p>${text(p)}</p>`).join("") +
    links.map((l, i) => `<a id="link-${i}" href="${attribute(l.href)}">${text(l.text)}</a>`).join("") +
    images.map((im, i) => `<img id="image-${i}" src="/user/qr-${i}.png" alt="">`).join("") +
    (field ? '<input type="number" id="code">' : "") +
    "</body></html>";
}

const browser = new Browser();
const bg = openBackground(browser);
await idle();
let tab = null;

// Where background.js keeps the TOTP secret (fuzz/targets/background-message.fuzz.mjs):
// emptied at the start of each input.
const TOTP_DB = "kulms-totp-db";
const TOTP_LEGACY = "kulms-totp-encrypted";
async function noSecretSaved() {
  await new Promise((resolve, reject) => {
    const req = bg.indexedDB.deleteDatabase(TOTP_DB);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`${TOTP_DB} is still open`));
  });
  browser.storage.local.unload([TOTP_LEGACY]);
}

async function run(data) {
  const input = read(provider(data));
  browser.forget();
  uncounted(() => {
    if (tab) tab.close();
  });
  await aside(noSecretSaved);
  const images = input.images.map((im) => {
    const height = Math.max(1, Math.ceil(im.pixels.length / 4 / im.width));
    const pixels = new Uint8ClampedArray(im.width * height * 4);
    pixels.set(im.pixels.subarray(0, pixels.length));
    return { width: im.width, height, data: pixels, found: im.found };
  });
  const prepare = (w) => uncounted(() => {
    // jsdom does not follow links: a click that the extension leaves to the
    // browser goes nowhere, as one that is not followed. What a link shows,
    // the page's own script puts in.
    w.addEventListener("click", (e) => e.preventDefault());
    input.links.forEach((l, i) => {
      if (l.shows === null) return;
      w.document.getElementById(`link-${i}`).addEventListener("click", () => {
        const p = w.document.createElement("p");
        p.textContent = l.shows;
        w.document.body.append(p);
      });
    });
    const byElement = new WeakMap();
    images.forEach((im, i) => {
      const el = w.document.getElementById(`image-${i}`);
      byElement.set(el, im);
      Object.defineProperty(el, "naturalWidth", { value: im.width, configurable: true });
      Object.defineProperty(el, "naturalHeight", { value: im.height, configurable: true });
    });
    const { sourceOf } = installCanvas(w, { pixelsOf: (img) => byElement.get(img) || null });
    // What jsQR finds in pixels: what the input says it finds in the image
    // they are of.
    w.jsQR = (data) => {
      const image = byElement.get(sourceOf(data));
      const found = image ? image.found : null;
      return found === null ? null : { data: found, binaryData: [], chunks: [], version: 1, location: {} };
    };
    if (input.pending !== null) {
      try {
        w.sessionStorage.setItem(KEY, input.pending);
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
    url = new URL(input.path, AUTH).href;
  } catch {
    url = `${AUTH}/`;
  }
  if (!url.startsWith(`${AUTH}/`)) url = `${AUTH}/`;
  const kept = uncounted(() => input.pending);
  tab = openTab(browser, { url, html: page(input), scripts: SCRIPTS, prepare });
  const watcher = watch(tab);
  const log = warnings(tab);
  await idle();
  uncounted(() => {
    const field = tab.document.getElementById("code");
    if (field && field.value !== "" && !/^\d{6}$/.test(field.value)) fail(`the helper filled in ${JSON.stringify(field.value.slice(0, 80))}, which is no six-digit code`);
    for (const { message } of browser.traffic) {
      if (!message || message.type !== "kulms-totp-save") continue;
      if (message.secret !== kept) fail(`the helper had the background save ${JSON.stringify(String(message.secret).slice(0, 80))}, not the secret the page's sessionStorage held (${JSON.stringify(String(kept).slice(0, 80))})`);
    }
  });
  for (const line of log.slips()) fail(`a slip of the code: ${line}`);
  // Known: B23 (docs/findings.md). While it is open, a QuotaExceededError that
  // the extension's code lets out is not counted: the helper writes the page's
  // sessionStorage, which the page may have filled, as the finding says.
  // Known: S6. While it is open, the rejection of a secret too short to make a
  // key of is not counted: the helper takes from the page's text a secret it
  // does not check, as the finding says.
  const problems = seen(watcher).filter((p) => !(open("B23") && /: QuotaExceededError: /.test(p)) &&
    !(open("S6") && /^unhandled rejection: DataError: Zero-length key is not supported/.test(p)));
  if (problems.length) fail(problems.join("\n"));
  judge();
}

// The target's work for an input, on each of its rungs (fuzz/lib.mjs).
export async function fuzz(data) {
  await ladder(data, run, browser);
}

await calibrate(fuzz);
