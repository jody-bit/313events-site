// test/ended-by-clock-zero-length.test.js
//
// P1 discovery T3: a time range whose end is not after its start ("12:00 AM - 12:00 AM", "8:00 PM - 8:00 PM") was read as
// an already-ended range, so the event vanished from Today all day. It is a zero-length placeholder, not a known end.
// Real ends keep their meaning: an event whose stated end has passed is still over; the end minute itself still counts
// as on; a range ending on a past date is still expired. Real discovery.js / event-dates.js.
// Run: node test/ended-by-clock-zero-length.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
global.EventDates = require(`${REPO_DIR}/event-dates.js`);
const { Discovery: D } = require(`${REPO_DIR}/discovery.js`);
const ev = (id, time, o = {}) => Object.assign({ id, title: "E" + id, venue: "V", cat: "community", date: "2026-11-07", endDate: "2026-11-07", time }, o);
const at = (iso) => ({ now: new Date(iso) }); // 2026-11-07 EST = UTC-5
const today = D.change(D.defaults(), { when: "today" });
const shown = (e, iso) => D.matches(e, today, at(iso));

const ONE_PM = "2026-11-07T18:00:00Z", NINE_PM = "2026-11-08T02:00:00Z";
// the failures
assert.ok(shown(ev(1, "12:00 AM – 12:00 AM"), ONE_PM), "midnight-to-midnight placeholder is not over at 1 PM");
assert.ok(shown(ev(2, "12:00 AM – 12:00 AM"), NINE_PM), "...nor at 9 PM");
assert.ok(shown(ev(3, "8:00 PM – 8:00 PM"), NINE_PM), "an 8 PM - 8 PM zero-length range is not over at 9 PM");
// controls: real ends are unchanged
assert.ok(!shown(ev(4, "11:00 AM – 11:30 AM"), ONE_PM), "a real range that ended at 11:30 is over at 1 PM");
assert.ok(shown(ev(5, "11:00 AM – 1:00 PM"), ONE_PM), "end minute itself still counts as on (1:00 PM at 1:00 PM)");
assert.ok(!shown(ev(5, "11:00 AM – 1:00 PM"), "2026-11-07T18:01:00Z"), "...and is over one minute later");
assert.ok(shown(ev(6, "10:00 PM – 2:00 AM"), NINE_PM), "overnight range is unchanged (still tonight)");
assert.ok(shown(ev(7, "2:00 PM"), ONE_PM), "start-only time unchanged");
assert.ok(shown(ev(8, ""), ONE_PM), "no time unchanged");
// expired: the end DATE still governs
assert.ok(!shown(ev(9, "12:00 AM – 12:00 AM", { date: "2026-11-06", endDate: "2026-11-06" }), ONE_PM), "a placeholder on yesterday's date is expired");
assert.ok(!shown(ev(10, "12:00 AM – 12:00 AM", { date: "2026-11-06", endDate: "2026-11-06" }), NINE_PM), "...at any hour");
// last day of a range with a placeholder: stays through the day, gone next day
const multi = ev(11, "12:00 AM – 12:00 AM", { date: "2026-11-05", endDate: "2026-11-07", dateSemantics: "continuous" });
assert.ok(shown(multi, NINE_PM), "continuous range last day with placeholder stays all day");
assert.ok(!D.matches(multi, today, at("2026-11-08T17:00:00Z")), "...and is gone the next day");
// unconfirmedOn shares the rule
const unconf = ev(12, "12:00 AM – 12:00 AM", { date: "2026-11-05", endDate: "2026-11-07" });
assert.ok(D.unconfirmedOn(unconf, today, at(NINE_PM)), "unconfirmed range with a placeholder is offered on its last day");
console.log("PASS: zero-length time ranges no longer hide an event; real ends and expiry unchanged");
