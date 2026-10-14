// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The network the extension sees: fetch() answers from routes a test or a
// fuzz target gives, and a URL with no route fails as an unreachable host
// does. What a response holds comes out as objects of the realm of the
// context that fetched it.
//
// An answer may say it came by a redirect from elsewhere (its url). The data
// of KULMS and KULASIS carry no signature of their servers: what vouches for
// them is TLS alone (RFC 8446), which the browser checks, and which the
// extension can only see the end of, in where a response came from. A
// response from anywhere but the extension itself, or over https from an
// origin of its host permissions, is one TLS does not vouch for as theirs;
// when the extension reads its body, the browser's log says so
// (Browser.foreign), and the detectors report it (harness/detectors.mjs).
//
// Whether such a response reaches the extension at all, fetch() decides as the
// Fetch Standard says (https://fetch.spec.whatwg.org/) and as Chrome runs it
// for an extension
// (https://developer.chrome.com/docs/extensions/develop/concepts/network-requests):
// - The request's origin is the context's: the page's for a content script,
//   whose requests are the page's, "subject to the same origin policy" even
//   where the extension has host permissions; the extension's for its pages
//   and its service worker. Its mode is "cors", fetch()'s; its credentials
//   mode and redirect mode are init's, "same-origin" and "follow" unless it
//   says otherwise (Fetch §2.2.5, §5.4 Request class).
// - A URL of the request's origin is fetched as it is; so is one that the
//   extension's host permissions match, by host and by scheme, from an
//   extension page or the service worker (Chrome: "as long as the extension
//   requests host permissions"). Any other's response is the extension's only
//   if the CORS check passes (Fetch §4.10).
// - A redirect, with redirect mode "error", is a network error; with
//   "manual", an opaque-redirect filtered response; with "follow", a fetch of
//   its location (Fetch §4.4 HTTP fetch, step 6; §4.5 HTTP-redirect fetch): a
//   network error if the location is not HTTP(S), or if it carries
//   credentials where the response is CORS-tainted or the request's origin is
//   another (steps 6, 9, 10). The request's origin, serialized for the CORS
//   check, is "null" once a redirect has gone from an origin that is neither
//   the request's nor the location's (its redirect-taint, §2.2.5).
// - A content script's request to http: from its https page is mixed content,
//   which the browser blocks (W3C Mixed Content,
//   https://www.w3.org/TR/mixed-content/). Chrome documents no such block for
//   an extension's own pages and service worker, and its documentation warns
//   of "resources retrieved via HTTP" there: the harness lets those through,
//   and the CORS check decides, so that an extension that would read one is
//   found.
// A server of an attacker can always say what the CORS check asks for.
import { matchesPattern } from "./chrome.mjs";
import { record } from "./log.mjs";
import { handOver, step } from "./work.mjs";

const encoder = new TextEncoder();

// Whether TLS vouches for what comes from `url` as from where the extension
// may take it as it is: from the extension itself, or over https from an
// origin of its host permissions.
export function vouchedFor(browser, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === "chrome-extension:") return u.host === browser.id;
  return u.protocol === "https:" && (browser.manifest.host_permissions || []).some((p) => matchesPattern(p, u.href));
}

// The origin of a URL, serialized (Node's URL gives a chrome-extension: URL
// no origin of its own; Chrome's is the scheme and the extension's ID).
function originOf(url) {
  const u = new URL(url);
  return u.protocol === "chrome-extension:" ? `chrome-extension://${u.host}` : u.origin;
}

// The origin a context's requests go from: the page's for a content script,
// the extension's for its pages and its service worker.
function requesterOf(context) {
  return context.kind === "tab" ? originOf(context.url) : `chrome-extension://${context.browser.id}`;
}

// Whether `context` fetches `url` without CORS: a URL of its own origin, or,
// from an extension page or the service worker, one the extension's host
// permissions match by host and scheme.
function fetchedAsIs(context, url) {
  if (originOf(url) === requesterOf(context)) return true;
  return context.kind !== "tab" && (context.browser.manifest.host_permissions || []).some((p) => matchesPattern(p, url));
}

// A header of an answer, by its name in any case, or null (a header list's
// "get", Fetch §2.2.2).
function header(headers, name) {
  const found = Object.entries(headers || {}).find(([k]) => k.toLowerCase() === name);
  return found ? String(found[1]).trim() : null;
}

// The CORS check (Fetch §4.10) of an answer's headers, for a request whose
// origin serializes as `origin` and whose credentials mode is `credentials`.
function corsCheck(headers, origin, credentials) {
  const allowed = header(headers, "access-control-allow-origin");
  if (allowed === null) return false;
  if (credentials !== "include" && allowed === "*") return true;
  if (allowed !== origin) return false;
  if (credentials !== "include") return true;
  return header(headers, "access-control-allow-credentials") === "true";
}

// Whether a URL carries credentials (a username or a password, URL Standard).
const withCredentials = (u) => u.username !== "" || u.password !== "";

function matches(match, url) {
  if (typeof match === "string") return url.startsWith(match);
  if (match instanceof RegExp) return match.test(url);
  return match(url);
}

export class Net {
  constructor() {
    this.routes = [];
    this.requests = [];
    this.forgotten = 0; // how many times the requests were forgotten (forget())
  }

  // Forgets the requests it has answered (harness/log.mjs).
  forget() {
    this.requests.length = 0;
    this.forgotten++;
    return this;
  }

  // Answers the URLs that `match` (a prefix, a RegExp or a predicate) accepts
  // with what `handler(request)` returns: { status, headers, body, url }, body
  // a string or bytes, url the final URL after a redirect (or a function of
  // the URL asked for that gives it), or { failed: true } for a network that
  // fails (fetch() rejects, as it does when a host cannot be reached). The
  // newest route that matches wins.
  on(match, handler) {
    this.routes.unshift({ match, handler: typeof handler === "function" ? handler : () => handler });
    return this;
  }

  fetchFor(context) {
    return async (input, init) => {
      const options = init ?? {};
      const raw = typeof input === "object" && input && "url" in input ? input.url : String(input);
      const url = new URL(raw, context.url).href;
      const request = { url, method: (options.method || "GET").toUpperCase(), body: options.body, from: context.kind };
      record(this.requests, request);
      const route = this.routes.find((r) => matches(r.match, url));
      if (!route) throw new context.realm.TypeError("Failed to fetch");
      const answer = (await route.handler(request)) || {};
      const networkError = () => new context.realm.TypeError("Failed to fetch");
      if (answer.failed) throw networkError();
      const origin = requesterOf(context);
      const credentials = options.credentials === undefined ? "same-origin" : String(options.credentials);
      // Mixed content: a content script's request, the page's, to http: from
      // an https page (the head of this file).
      const mixed = (u) => context.kind === "tab" && new URL(context.url).protocol === "https:" && u.protocol === "http:";
      if (mixed(new URL(url))) throw networkError();
      const asIs = fetchedAsIs(context, url);
      const final = typeof answer.url === "function" ? answer.url(url) : answer.url;
      let serialized = origin;
      if (final && final !== url) {
        // A redirect (Fetch §4.4 step 6, §4.5).
        const mode = options.redirect === undefined ? "follow" : String(options.redirect);
        if (mode === "error") throw networkError();
        if (mode === "manual") return opaqueRedirect(context.realm, url);
        let location;
        try {
          location = new URL(final);
        } catch {
          throw networkError();
        }
        if (location.protocol !== "http:" && location.protocol !== "https:") throw networkError();
        if (withCredentials(location) && (originOf(location.href) !== origin || !asIs)) throw networkError();
        if (mixed(location)) throw networkError();
        // The request's redirect-taint (§2.2.5): a hop from an origin that is
        // neither the request's nor the location's hides the request's.
        if (originOf(location.href) !== originOf(url) && origin !== originOf(url)) serialized = "null";
        if (!fetchedAsIs(context, location.href) && !corsCheck(answer.headers, serialized, credentials)) throw networkError();
      } else if (!asIs && !corsCheck(answer.headers, serialized, credentials)) {
        throw networkError();
      }
      return response(context.realm, url, { ...answer, url: final }, context, answer);
    };
  }
}

// A response of `realm` to a request of `url`, which `context` (when given)
// made: reading its body, when TLS does not vouch for where it came from, is
// logged in the context's browser. The body of `given`, an answer of a route,
// is what the input hands the extension once the extension reads it
// (harness/work.mjs).
export function response(realm, url, { status = 200, headers = {}, body = "", url: finalUrl } = {}, context = null, given = null) {
  const bytes = typeof body === "string" ? encoder.encode(body) : Uint8Array.from(body);
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const from = finalUrl || url;
  const unvouched = context && !vouchedFor(context.browser, from);
  const reading = () => {
    if (given !== null) handOver(bytes.length, given);
    if (unvouched) record(context.browser.foreign, { where: `${context.kind} ${context.url || ""}`.trim(), url: from, redirected: !!finalUrl && finalUrl !== url });
  };
  return {
    type: finalUrl && finalUrl !== url && unvouched ? "cors" : "basic",
    ok: status >= 200 && status < 300,
    status,
    url: from,
    redirected: !!finalUrl && finalUrl !== url,
    headers: { get: (name) => (Object.hasOwn(lower, String(name).toLowerCase()) ? lower[String(name).toLowerCase()] : null) },
    // Reading the body goes through its bytes (decoded as UTF-8, or copied);
    // JSON.parse of the realm counts what it goes through itself.
    text: async () => (reading(), step(1 + bytes.length), new TextDecoder().decode(bytes)),
    json: async () => (reading(), step(1 + bytes.length), realm.JSON.parse(new TextDecoder().decode(bytes))),
    arrayBuffer: async () => {
      reading();
      step(1 + bytes.length);
      const copy = new realm.Uint8Array(bytes.length);
      copy.set(bytes);
      return copy.buffer;
    },
  };
}

// What fetch() gives for a redirect that the request keeps as it is
// (redirect: "manual"): a response of type "opaqueredirect", with status 0,
// no headers and no body.
function opaqueRedirect(realm, url) {
  return {
    type: "opaqueredirect",
    ok: false,
    status: 0,
    url,
    redirected: false,
    headers: { get: () => null },
    text: async () => "",
    json: async () => { throw new realm.SyntaxError("Unexpected end of JSON input"); },
    arrayBuffer: async () => new realm.ArrayBuffer(0),
  };
}
