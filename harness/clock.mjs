// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// A clock of a page's own, which a test or a fuzz target moves (openTab()'s
// `clock`). The timers the page sets (setTimeout, setInterval,
// requestAnimationFrame) come due by it and run when the clock is moved past
// them, in the order of their times, those due at once in the order they were
// set, each in the asynchronous context of what moves the clock; and the
// page's Date, Date.now() and performance.now() read it. A timer is set as the
// HTML Standard's timer initialization steps set one (§8.7,
// https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timer-initialisation-steps):
// its timeout is a long (Web IDL), 0 if it is less, and at least 4 ms when the
// timer task that sets it is nested more than five deep; a repeating timer is
// set again, one deeper, after each run.
//
// A browser runs a timer when its time comes, whatever else goes on. A fuzz
// target needs the timers that an input sets going to run within the input,
// so that their work counts toward it and does not reach into a later one,
// and in the same order on every rung of it; a page's timers that run on
// Node's clock do neither. Moved far enough, the clock also shows work that
// never ends: a timeout that sets the next one, and that one the next, for
// as long as the page is open (B4 of docs/findings.md), as a page left open
// for minutes would.
import { idle } from "./work.mjs";

export class Clock {
  // `now`: the time the page starts at, in ms since the epoch.
  constructor(now = Date.UTC(2026, 3, 1)) {
    this.now = now;
    this.origin = now; // where performance.now() counts from
    this.timers = new Map(); // id → { run, timeout, repeat, due, level, order }
    this.nextId = 1;
    this.order = 0;
    this.fired = 0; // the timeouts run, all told
    this.level = 0; // the timer nesting level of the timer task running, 0 when none (§8.7)
    this.beforeRun = null; // f(timer), called before each timer runs: a fuzz target pays a timer's fixed cost there (allow() of harness/work.mjs)
  }

  // When a timer that the task running sets with `timeout` (a long) comes
  // due, and the nesting level of the task that runs it (§8.7's steps).
  initialized(timeout) {
    let wait = timeout < 0 ? 0 : timeout;
    if (this.level > 5 && wait < 4) wait = 4;
    return { due: this.now + wait, level: this.level + 1 };
  }

  // A timer that runs `run` after `timeout` (a long, timeOf()), again after
  // each run if `repeat`. Its id.
  set(run, timeout, repeat) {
    const id = this.nextId++;
    this.timers.set(id, { run, timeout, repeat, ...this.initialized(timeout), order: this.order++ });
    return id;
  }

  clear(id) {
    this.timers.delete(id);
  }

  // The timer that comes due first, by `until`, or null.
  next(until) {
    let first = null;
    for (const [id, t] of this.timers) {
      if (t.due > until) continue;
      if (!first || t.due < first.t.due || (t.due === first.t.due && t.order < first.t.order)) first = { id, t };
    }
    return first;
  }

  // Moves the clock by `ms`, running each timer that comes due by then, and
  // between two, what the harness and the page have left to do (idle()), as
  // a browser runs what is queued between two of its tasks.
  async advance(ms) {
    const until = this.now + Math.max(0, ms);
    for (let due = this.next(until); due; due = this.next(until)) {
      const { id, t } = due;
      this.now = Math.max(this.now, t.due);
      if (!t.repeat) {
        this.timers.delete(id);
        this.fired++;
      }
      // The task runs at the timer's nesting level, its microtasks too; a
      // repeating timer is set again after it, from the task (§8.7), unless
      // it cleared itself.
      const outer = this.level;
      this.level = t.level;
      try {
        if (this.beforeRun) this.beforeRun(t);
        t.run();
        if (t.repeat && this.timers.get(id) === t) Object.assign(t, this.initialized(t.timeout), { order: this.order++ });
        await idle();
      } finally {
        this.level = outer;
      }
    }
    this.now = until;
  }

  // Starts the clock anew at `now`, as each input of a fuzz target does: the
  // timeouts still to come keep how long they have to go, and each interval
  // starts its period, so that what comes due within an input depends on the
  // input alone.
  restart(now) {
    for (const t of this.timers.values()) {
      const nesting = t.level - 1;
      const wait = Math.max(0, t.timeout) < 4 && nesting > 5 ? 4 : Math.max(0, t.timeout);
      t.due = now + (t.repeat ? wait : Math.max(0, t.due - this.now));
    }
    this.now = now;
    this.origin = now;
  }

  // Drops the timeouts still to come, leaving the intervals.
  dropTimeouts() {
    for (const [id, t] of this.timers) if (!t.repeat) this.timers.delete(id);
  }

  // Runs on while timeouts are left, for `limit` ms at most, the intervals
  // running as they come due; whether none is left. What a page set going
  // ends, unless each timeout sets the next: a timeout set just before the
  // clock stopped is not work that never ends.
  async settle(limit) {
    const end = this.now + Math.max(0, limit);
    while (this.pending() > 0) {
      let next = Infinity;
      for (const t of this.timers.values()) if (!t.repeat && t.due < next) next = t.due;
      if (next > end) return false;
      await this.advance(next - this.now);
    }
    return true;
  }

  // The timeouts still to come: what keeps the page busy once the intervals,
  // which a page sets to run for as long as it is open, are left aside.
  pending() {
    let n = 0;
    for (const t of this.timers.values()) if (!t.repeat) n++;
    return n;
  }
}

// A timer's timeout as Web IDL converts a value to the long that the HTML
// Standard's setTimeout() and setInterval() take (Web IDL's ConvertToInt,
// https://webidl.spec.whatwg.org/#abstract-opdef-converttoint): ToNumber (a
// BigInt or a Symbol throws the realm's TypeError), 0 for NaN and the
// infinities, the integer part, and that modulo 2^32 as a signed 32-bit
// number. A delay of 2^31 ms or more so comes out negative, and runs at once.
export function timeOf(v, realm = globalThis) {
  if (v === undefined) return 0;
  if (typeof v === "bigint" || typeof v === "symbol") throw new realm.TypeError(`Cannot convert a ${typeof v === "bigint" ? "BigInt" : "Symbol"} value to a number`);
  let x = Number(v);
  if (!Number.isFinite(x)) return 0;
  x = Math.trunc(x);
  x = ((x % 2 ** 32) + 2 ** 32) % 2 ** 32;
  return x >= 2 ** 31 ? x - 2 ** 32 : x;
}

// Gives window `w` the clock `clock`: its timers, Date and performance.now().
// `report(error)` takes what a timer's code throws, as a browser reports it.
export function install(w, clock, report) {
  const callable = (f) => (typeof f === "function" ? f : () => w.eval(String(f)));
  const timer = (repeat) => (f, ms, ...args) => clock.set(() => {
    try {
      callable(f)(...args);
    } catch (e) {
      report(e);
    }
  }, timeOf(ms, w), repeat);
  w.setTimeout = timer(false);
  w.setInterval = timer(true);
  w.clearTimeout = (id) => clock.clear(id);
  w.clearInterval = (id) => clock.clear(id);
  w.requestAnimationFrame = (f) => clock.set(() => {
    try {
      f(clock.now - clock.origin);
    } catch (e) {
      report(e);
    }
  }, 16, false);
  w.cancelAnimationFrame = (id) => clock.clear(id);
  const RealDate = w.Date;
  function PageDate(...args) {
    if (!new.target) return new RealDate(clock.now).toString();
    return Reflect.construct(RealDate, args.length === 0 ? [clock.now] : args, new.target);
  }
  Object.setPrototypeOf(PageDate, RealDate);
  PageDate.prototype = RealDate.prototype;
  Object.defineProperty(PageDate, "name", { value: "Date" });
  Object.defineProperty(PageDate, "length", { value: 7 });
  PageDate.now = () => clock.now;
  PageDate.parse = RealDate.parse;
  PageDate.UTC = RealDate.UTC;
  w.Date = PageDate;
  if (w.performance) Object.defineProperty(w.performance, "now", { value: () => clock.now - clock.origin, configurable: true, writable: true });
}
