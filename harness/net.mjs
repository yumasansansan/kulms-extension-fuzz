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
import { record } from "./log.mjs";

const encoder = new TextEncoder();

function matches(match, url) {
  if (typeof match === "string") return url.startsWith(match);
  if (match instanceof RegExp) return match.test(url);
  return match(url);
}

export class Net {
  constructor() {
    this.routes = [];
    this.requests = [];
  }

  // Answers the URLs that `match` (a prefix, a RegExp or a predicate) accepts
  // with what `handler(request)` returns: { status, headers, body, url }, body
  // a string or bytes, url the final URL after a redirect. The newest route
  // that matches wins.
  on(match, handler) {
    this.routes.unshift({ match, handler: typeof handler === "function" ? handler : () => handler });
    return this;
  }

  fetchFor(context) {
    return async (input, init = {}) => {
      const raw = typeof input === "object" && input && "url" in input ? input.url : String(input);
      const url = new URL(raw, context.url).href;
      const request = { url, method: (init.method || "GET").toUpperCase(), body: init.body, from: context.kind };
      record(this.requests, request);
      const route = this.routes.find((r) => matches(r.match, url));
      if (!route) throw new context.realm.TypeError("Failed to fetch");
      const answer = (await route.handler(request)) || {};
      return response(context.realm, url, answer);
    };
  }
}

export function response(realm, url, { status = 200, headers = {}, body = "", url: finalUrl } = {}) {
  const bytes = typeof body === "string" ? encoder.encode(body) : Uint8Array.from(body);
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl || url,
    redirected: !!finalUrl && finalUrl !== url,
    headers: { get: (name) => (Object.hasOwn(lower, String(name).toLowerCase()) ? lower[String(name).toLowerCase()] : null) },
    text: async () => new TextDecoder().decode(bytes),
    json: async () => realm.JSON.parse(new TextDecoder().decode(bytes)),
    arrayBuffer: async () => {
      const copy = new realm.Uint8Array(bytes.length);
      copy.set(bytes);
      return copy.buffer;
    },
  };
}
