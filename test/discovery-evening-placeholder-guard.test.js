// test/discovery-evening-placeholder-guard.test.js
//
// P1 discovery T4 (2026-11-08), HELD behind the time-confidence contract (build hold). Eight current/future rows (Ticketmaster) carry the
// literal time "Evening": a placeholder, not a start time. Tonight deliberately counts it today (discovery.js: "Evening" counts). This guard
// adds config.eveningPlaceholderCounts, DEFAULT true, so nothing changes until the contract is built and the flag is flipped by decision.
// Flag false: only a parseable start at 5 PM or later counts. Run: node test/discovery-evening-placeholder-guard.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { Discovery: D, _build, _defaultConfig } = require(`${REPO_DIR}/discovery.js`);
assert.strictEqual(_defaultConfig.eveningPlaceholderCounts, true, "the guard ships OFF: default behaviour unchanged");

// Sat Nov 7 2026, 2 PM Detroit (19:00Z)
const CTX = { now: new Date("2026-11-07T19:00:00Z") };
const ev = (time, extra) => Object.assign({ id: "x", title: "T", category: "music", date: "2026-11-07", endDate: null, time }, extra || {});
const OFF = _build(Object.assign({}, _defaultConfig, { eveningPlaceholderCounts: false }));
const tonightOn = D.change(D.defaults(), { when: "tonight" });
const tonightOff = OFF.change(OFF.defaults(), { when: "tonight" });

// default (flag on): identical to today
assert.strictEqual(D.matches(ev("Evening"), tonightOn, CTX), true, "default: 'Evening' still counts for Tonight (unchanged)");
assert.strictEqual(D.matches(ev("8:00 PM"), tonightOn, CTX), true);
assert.strictEqual(D.matches(ev("10:00 AM"), tonightOn, CTX), false);
assert.strictEqual(D.matches(ev(null), tonightOn, CTX), false);
// an explicit flag value of true behaves as the default
const ON = _build(Object.assign({}, _defaultConfig, { eveningPlaceholderCounts: true }));
assert.strictEqual(ON.matches(ev("Evening"), ON.change(ON.defaults(), { when: "tonight" }), CTX), true);

// flag off: the placeholder no longer counts; real evening starts and every other control are unchanged
assert.strictEqual(OFF.matches(ev("Evening"), tonightOff, CTX), false, "flag off: the 'Evening' placeholder is not an evening start");
assert.strictEqual(OFF.matches(ev("evening"), tonightOff, CTX), false, "case-insensitive");
assert.strictEqual(OFF.matches(ev("8:00 PM"), tonightOff, CTX), true, "a real 8 PM start still counts");
assert.strictEqual(OFF.matches(ev("5:00 PM"), tonightOff, CTX), true, "boundary: 5 PM counts");
assert.strictEqual(OFF.matches(ev("4:59 PM"), tonightOff, CTX), false, "boundary: 4:59 PM does not");
assert.strictEqual(OFF.matches(ev("10:00 AM"), tonightOff, CTX), false);
assert.strictEqual(OFF.matches(ev(null), tonightOff, CTX), false, "no time still does not count");
assert.strictEqual(OFF.matches(ev("7:00 PM - 10:00 PM"), tonightOff, CTX), true, "a real evening range still counts");
// other windows are untouched by the flag: Today still shows the placeholder row
const todayOff = OFF.change(OFF.defaults(), { when: "today" });
assert.strictEqual(OFF.matches(ev("Evening"), todayOff, CTX), true, "Today still lists 'Evening' rows");
// default object untouched by building a flag-off instance
assert.strictEqual(D.matches(ev("Evening"), tonightOn, CTX), true);
console.log("discovery-evening-placeholder-guard: ok");
