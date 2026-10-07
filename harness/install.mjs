// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The costs of harness/costs.mjs and harness/web-costs.mjs, put in a realm: each
// built-in and web member whose steps grow is replaced by one that does what
// it did and then counts its steps (harness/work.mjs), worked out with the
// counting paused, so that what working them out calls is not counted too.
// A member of the platform called while the counting is paused (by the
// harness itself, or by a rule) only does what it did.
//
// A member of the web APIs that the platform calls while it does its own
// work (jsdom's selector engine reads the tree through the DOM's members) is
// part of the steps its own rule counts, and is not counted again: only a
// call from code that is not the platform's (the extension's, a test's) is.
//
// A regular expression's exec() counts the steps of the backtracking matcher
// (harness/backtrack.mjs), which must find what V8 finds; one that runs on
// V8's linear engine (the l flag: one of a finding a fuzz target keeps away
// from) counts how far it went.
import { compile, run } from "./backtrack.mjs";
import { BACKTRACKING_EXEC, COLLATOR_COMPARE, STOPS, builtIns, ruleOf, units } from "./costs.mjs";
import { onLinearEngine } from "./regexp.mjs";
import { ALIASES, WEB_CONSTRUCTORS, liveView, ownerOf, viewOf, webRuleOf } from "./web-costs.mjs";
import { isPaused, step, uncounted } from "./work.mjs";

const integer = (x) => (typeof x === "number" && x > 0 ? Math.floor(x) : 0);

// Whether the code that called `f` (the first frame below it that is in a
// named script) is the platform's: jsdom's and its packages', or Node's own.
const PLATFORM = /[\\/]node_modules[\\/]|^node:/;
const holder = {};
const callSites = (e, sites) => sites;
function fromPlatform(f) {
  const limit = Error.stackTraceLimit;
  const prepare = Error.prepareStackTrace;
  Error.stackTraceLimit = 8;
  Error.prepareStackTrace = callSites;
  Error.captureStackTrace(holder, f);
  const sites = holder.stack;
  Error.prepareStackTrace = prepare;
  Error.stackTraceLimit = limit;
  if (!Array.isArray(sites)) return false;
  for (const site of sites) {
    // A script the harness ran with eval (the extension's, in a window) is named
    // by its sourceURL; code made by new Function (jsdom's selector engine)
    // has no name of its own, and the frame below it names its maker.
    const file = site.getScriptNameOrSourceURL() || site.getFileName();
    if (file) return PLATFORM.test(file);
  }
  return false;
}

// The steps of `rule` for a call, worked out with the counting paused.
function steps(rule, self, args, result, before, call) {
  return uncounted(() => (typeof rule === "function" ? rule(self, args, result, call) : rule.after(self, args, result, before)));
}

function beforeOf(rule, self, args) {
  return rule && typeof rule === "object" && rule.before ? uncounted(() => rule.before(self, args)) : undefined;
}

// What a result needs before the code gets it: a live collection a counting
// view of itself; an Intl.Collator's compare a counted one.
let wrapResult = (r) => r;

// `original`, a method at `path`, counting `rule`; `web` for a member of the
// web APIs, which the platform calls too.
function costedMethod(original, rule, path, web = false) {
  const stops = STOPS.has(path);
  const includes = /\.includes$/.test(path);
  const name = typeof original.name === "string" ? original.name : "";
  const counted = {
    [name](...args) {
      if (isPaused() || (web && fromPlatform(counted))) return Reflect.apply(original, this, args);
      const before = beforeOf(rule, this, args);
      const call = {};
      let callArgs = args;
      if (stops && typeof args[0] === "function") {
        const f = args[0];
        call.last = -1;
        callArgs = [function (v, i) { call.last = i; return Reflect.apply(f, this, arguments); }, ...args.slice(1)];
      }
      const result = Reflect.apply(original, this, callArgs);
      if (includes) {
        call.found = uncounted(() => {
          try {
            return typeof this === "string" || this instanceof String
              ? String.prototype.indexOf.call(this, args[0], args[1])
              : Array.prototype.indexOf.call(this, args[0]);
          } catch {
            return -1;
          }
        });
      }
      step(1 + steps(rule, this, args, result, before, call));
      return wrapResult(result);
    },
  }[name];
  return counted;
}

// The accessor `d` of `owner` at `key`, counting `get` and `set`; `web` as
// for costedMethod().
function costedAccessor(owner, key, d, get, set, web = false) {
  const getter = function () {
    if (isPaused() || (web && fromPlatform(getter))) return Reflect.apply(d.get, this, []);
    const result = Reflect.apply(d.get, this, []);
    step(1 + steps(get, this, [], result));
    return wrapResult(result);
  };
  const setter = function (value) {
    if (isPaused() || (web && fromPlatform(setter))) return Reflect.apply(d.set, this, [value]);
    const before = beforeOf(set, this, [value]);
    Reflect.apply(d.set, this, [value]);
    step(1 + steps(set, this, [value], undefined, before));
  };
  Object.defineProperty(owner, key, {
    ...d,
    ...(d.get && get !== undefined && get !== null ? { get: getter } : {}),
    ...(d.set && set !== undefined && set !== null ? { set: setter } : {}),
  });
}

// A constructor (and function) at `name` of global `g`, counting `rule`: a
// proxy of it, which makes what it made.
function costedConstructor(g, name, C, rule) {
  const proxy = new Proxy(C, {
    apply(target, self, args) {
      if (isPaused()) return Reflect.apply(target, self, args);
      const result = Reflect.apply(target, self, args);
      step(1 + steps(rule, self, args, result));
      return result;
    },
    construct(target, args, newTarget) {
      if (isPaused()) return Reflect.construct(target, args, newTarget === proxy ? target : newTarget);
      const result = Reflect.construct(target, args, newTarget === proxy ? target : newTarget);
      step(1 + steps(rule, undefined, args, result));
      return result;
    },
  });
  g[name] = proxy;
}

// --- Regular expressions: exec() by the backtracking matcher.

function costedExec(original) {
  return {
    exec(...args) {
      if (isPaused()) return Reflect.apply(original, this, args);
      const before = integer(this.lastIndex);
      const s = String(args[0]);
      if (this.flags.includes("l")) {
        // On the linear engine (a finding kept away from): how far it went.
        const result = Reflect.apply(original, this, [s]);
        const end = result ? result.index + result[0].length : s.length;
        step(1 + Math.max(0, end - (this.global || this.sticky ? before : 0)));
        return result;
      }
      const p = uncounted(() => compile(this.source, this.flags));
      const found = run(p, s, before, step);
      const result = Reflect.apply(original, this, [s]);
      const index = result ? result.index : -1;
      const end = result ? result.index + result[0].length : -1;
      if (index !== found.index || end !== found.end) {
        throw new Error(`harness/backtrack.mjs: /${this.source}/${this.flags} found ${JSON.stringify(found)} in ${s.length} units from ${before}, V8 ${JSON.stringify({ index, end })}`);
      }
      step(1 + (result ? units(result[0]) : 0));
      return result;
    },
  }.exec;
}

// A regular expression of a finding, as the extension's code hands it here
// where it makes one (harness/source.mjs): while a fuzz target keeps away from
// the finding (avoidBacktracking()), it runs on V8's linear engine instead,
// which finds what it finds in time linear in the input.
const avoided = new Set();
export function backtrackingRegExp(re, id, source, flags) {
  return avoided.has(id) ? onLinearEngine(re, source, flags) : re;
}

// A fuzz target keeps away from finding `id`, which stands (fuzz/lib.mjs).
export function avoidBacktracking(id) {
  avoided.add(id);
}

// --- Live collections, data maps and Intl's compare.

const views = new WeakMap();

// A live collection as the code sees it: an index read goes through its view
// as length does; its own methods run on it, Array.prototype's (forEach,
// values) on the view, so that their reads are counted.
function countingView(collection, generic) {
  if (views.has(collection)) return views.get(collection);
  const view = new Proxy(collection, {
    get: function read(target, key) {
      if (typeof key === "string" && /^\d+$/.test(key) && !isPaused() && !fromPlatform(read)) step(1 + uncounted(() => viewOf.get(target)()));
      const v = Reflect.get(target, key, target);
      return typeof v === "function" && !generic.has(v) ? v.bind(target) : v;
    },
  });
  views.set(collection, view);
  return view;
}

// An element's data map as the code sees it: setting a name sets an
// attribute, reading one finds it.
function countingData(map) {
  if (views.has(map)) return views.get(map);
  const view = new Proxy(map, {
    get: function read(target, key) {
      const el = ownerOf.get(target);
      if (typeof key === "string" && el && !isPaused() && !fromPlatform(read)) step(1 + uncounted(() => el.attributes.length * (1 + key.length)));
      return Reflect.get(target, key, target);
    },
    set: function write(target, key, value) {
      const el = ownerOf.get(target);
      if (typeof key === "string" && el && !isPaused() && !fromPlatform(write)) step(1 + uncounted(() => el.attributes.length * (1 + key.length) + units(String(value)) + 1));
      return Reflect.set(target, key, value, target);
    },
  });
  views.set(map, view);
  return view;
}

function countingCompare(compare) {
  if (views.has(compare)) return views.get(compare);
  const counted = function (a, b) {
    if (isPaused()) return Reflect.apply(compare, this, arguments);
    const r = Reflect.apply(compare, this, arguments);
    step(1 + uncounted(() => COLLATOR_COMPARE(this, [a, b])));
    return r;
  };
  views.set(compare, counted);
  return counted;
}

// --- A realm.

// Puts the costs in the realm whose global object is `g`: its built-ins, and,
// given `web` (a jsdom window, or the background's global with the web
// interfaces it has), the members of its web interfaces.
export function installCosts(g, { web = null } = {}) {
  const generic = new Set();
  const A = g.Array && g.Array.prototype;
  if (A) for (const k of ["forEach", "values", "keys", "entries", Symbol.iterator]) generic.add(A[k]);
  const realmWrap = (r) => {
    if (r === null || (typeof r !== "object" && typeof r !== "function")) return r;
    if (viewOf.has(r)) return countingView(r, generic);
    if (ownerOf.has(r) && Object.prototype.toString.call(r) === "[object DOMStringMap]") return countingData(r);
    return r;
  };
  const previousWrap = wrapResult;
  wrapResult = (r) => realmWrap(previousWrap(r));

  // ECMAScript's built-ins.
  for (const b of builtIns(g)) {
    const rule = ruleOf(b.path);
    if (rule === null || rule === undefined) continue;
    const d = Object.getOwnPropertyDescriptor(b.owner, b.key);
    if (!d || !d.configurable && !d.writable) continue;
    if (rule === BACKTRACKING_EXEC) {
      Object.defineProperty(b.owner, b.key, { ...d, value: costedExec(d.value) });
      continue;
    }
    if (b.kind === "value") {
      if (b.owner === g && typeof d.value === "function" && d.value.prototype && /^[A-Z]/.test(String(b.key))) costedConstructor(g, b.key, d.value, rule);
      else Object.defineProperty(b.owner, b.key, { ...d, value: costedMethod(d.value, rule, b.path) });
    } else if (b.kind === "get") {
      costedAccessor(b.owner, b.key, d, b.path === "Intl.Collator.prototype.compare (get)" ? (self, a, r) => 0 : rule, undefined);
      if (b.path === "Intl.Collator.prototype.compare (get)") {
        const d2 = Object.getOwnPropertyDescriptor(b.owner, b.key);
        Object.defineProperty(b.owner, b.key, { ...d2, get() { return countingCompare(Reflect.apply(d2.get, this, [])); } });
      }
    } else {
      costedAccessor(b.owner, b.key, d, undefined, rule);
    }
  }

  if (!web) return;
  // The web interfaces: every member of every interface the window has, by
  // its rule (those with none are not the extension's: tests/costs.test.mjs
  // checks that the extension names none of them).
  const es = new Set(builtIns(g).map((b) => b.owner));
  for (const iface of Object.getOwnPropertyNames(web)) {
    if (Object.hasOwn(ALIASES, iface)) continue;
    let C;
    try {
      C = web[iface];
    } catch {
      continue;
    }
    if (typeof C !== "function" || !C.prototype || es.has(C) || es.has(C.prototype)) continue;
    for (const [owner, isStatic] of [[C.prototype, false], [C, true]]) {
      for (const key of Object.getOwnPropertyNames(owner)) {
        if (key === "constructor" || key === "prototype" || (isStatic && ["length", "name"].includes(key))) continue;
        const d = Object.getOwnPropertyDescriptor(owner, key);
        if (!d.configurable && !d.writable) continue;
        if (typeof d.value === "function") {
          const rule = webRuleOf(iface, key, "value", isStatic);
          if (rule) Object.defineProperty(owner, key, { ...d, value: costedMethod(d.value, rule, `${iface}.${key}`, true) });
        } else if (d.get || d.set) {
          const get = d.get ? webRuleOf(iface, key, "get", isStatic) : undefined;
          const set = d.set ? webRuleOf(iface, key, "set", isStatic) : undefined;
          if (get || set) costedAccessor(owner, key, d, get, set, true);
        }
      }
    }
    if (Object.hasOwn(WEB_CONSTRUCTORS, iface) && WEB_CONSTRUCTORS[iface]) costedConstructor(web, iface, C, WEB_CONSTRUCTORS[iface]);
  }
}

// Classes of Node's own that a realm is given (the background's TextDecoder,
// TextEncoder, URL and URLSearchParams), as subclasses that count, by the
// rules of their web interfaces: Node's own stay as they are for the harness
// and jsdom.
export function costedClass(Base, iface) {
  const Sub = class extends Base {};
  Object.defineProperty(Sub, "name", { value: Base.name });
  for (const key of Object.getOwnPropertyNames(Base.prototype)) {
    if (key === "constructor") continue;
    const d = Object.getOwnPropertyDescriptor(Base.prototype, key);
    if (typeof d.value === "function") {
      const rule = webRuleOf(iface, key, "value");
      if (rule) Object.defineProperty(Sub.prototype, key, { ...d, value: costedMethod(d.value, rule, `${iface}.${key}`) });
    } else if (d.get || d.set) {
      const get = d.get ? webRuleOf(iface, key, "get") : undefined;
      const set = d.set ? webRuleOf(iface, key, "set") : undefined;
      if (get || set) costedAccessor(Sub.prototype, key, d, get, set);
    }
  }
  const make = WEB_CONSTRUCTORS[iface];
  if (!make) return Sub;
  return new Proxy(Sub, {
    construct(target, args, newTarget) {
      const result = Reflect.construct(target, args, newTarget);
      if (!isPaused()) step(1 + steps(make, undefined, args, result));
      return result;
    },
  });
}

// A function of Node's own that a realm is given (atob, btoa), counting what
// it goes through.
export function costedFunction(f) {
  return {
    [f.name](...args) {
      if (isPaused()) return Reflect.apply(f, this, args);
      const r = Reflect.apply(f, this, args);
      step(1 + units(args[0]) + units(r));
      return r;
    },
  }[f.name];
}

export { liveView };
