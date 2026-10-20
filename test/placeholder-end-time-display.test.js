// test/placeholder-end-time-display.test.js
//
// DQ sweep 2026-10-19: 245 approved rows carry an aggregator placeholder end "11:59 PM" (7:30 PM – 11:59 PM). Display rule:
// that end is unknown, so show the start only; Add to Calendar then uses the existing 2-hour default (no explicit end).
// Only a trailing 11:59 PM after a real start time is dropped; no layout change, only the time text.
// Runs the shipped EventDates.displayTime, the four row mappers' use of it, and the real index.html export block.
// Run: node test/placeholder-end-time-display.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const EventDates = require(`${REPO_DIR}/event-dates.js`);

// 1. The rule.
const d = EventDates.displayTime;
assert.strictEqual(d("7:30 PM – 11:59 PM"), "7:30 PM");
assert.strictEqual(d("7:30 PM - 11:59 PM"), "7:30 PM");
assert.strictEqual(d("7 PM to 11:59 PM"), "7 PM");
assert.strictEqual(d("11:30 AM–11:59 PM"), "11:30 AM");
["11:59 PM", "7:30 PM", "10:00 PM – 2:00 AM", "11:00 AM – 3:00 PM", "7:00 PM – 11:00 PM", "11:59 PM – 2:00 AM", "Evening", "All day", ""].forEach((t) => assert.strictEqual(d(t), t, `unchanged: ${t}`));
assert.strictEqual(d(null), null);
assert.strictEqual(d(undefined), undefined);
// EI test list (PLACEHOLDER-END-11-59PM-NON-VD, 2026-10-19): the four cases and the formats seen in production.
assert.strictEqual(d("7:00 PM\u201311:59 PM"), "7:00 PM", "Resident Advisor format, no spaces around the dash");
assert.strictEqual(d("12:00 PM \u2013 11:59 PM"), "12:00 PM", "Redford Senior Club");
assert.strictEqual(d("6:00 PM \u2013 11:59 PM"), "6:00 PM", "Richmond / GottaGacha shape");
assert.strictEqual(d("10:00 PM \u2013 2:00 AM"), "10:00 PM \u2013 2:00 AM", "a real late end survives");
assert.strictEqual(d("7:00 PM \u2013 11:30 PM"), "7:00 PM \u2013 11:30 PM", "a real 11:30 PM end survives");
console.log("PASS: only a trailing 11:59 PM after a real start time is dropped");

// 2. Every page that maps events_public rows passes time_display through the rule.
for (const f of ["index.html", "event-template.html", "calendar.html", "map.html"]) {
  const h = fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
  assert.ok(/time: EventDates\.displayTime\(row\.time_display \|\| ""\),/.test(h), `${f}: row mapping uses displayTime`);
  assert.ok(!/time: row\.time_display \|\| ""/.test(h), `${f}: no raw time_display mapping left`);
  assert.ok(/<script src="\/event-dates\.js"><\/script>/.test(h), `${f}: loads event-dates.js`);
}
console.log("PASS: index, event page, calendar and map map time_display through displayTime");

// 3. Add to Calendar: raw placeholder gives DTEND 23:59, the displayed (start-only) time gives the 2-hour default.
const html = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");
const a = html.indexOf("// ---- Add to Calendar ----"), b = html.indexOf("// ---- Share ----", a);
assert.ok(a >= 0 && b > a);
const ctx = {
  CalendarLocation: require(`${REPO_DIR}/calendar-location.js`).CalendarLocation, EventDates, getTodayISO: () => "2026-10-16",
  URL, URLSearchParams, Date, Math, String, Array, Object, JSON, Number, RegExp, Blob: class { constructor(p) { this.text = p.join(""); } },
  window: { location: { href: "https://313.events/" }, open: () => null }, EVENTS: [], setTimeout, document: undefined,
  truncateText: (s) => s, shouldShowSource: () => false, safeUrl: (u) => u, eventUrl: () => "event.html?id=abc", escapeHtml: (s) => String(s),
};
vm.createContext(ctx);
const { eventDateTimeParts } = vm.runInContext(`${html.slice(a, b)}\n;({ eventDateTimeParts })`, ctx);
const ev = (time) => ({ id: "x", title: "Fixture", venue: "V", date: "2026-10-17", endDate: "2026-10-17", time, dateSemantics: null, occurrenceDates: null });
const raw = eventDateTimeParts(ev("7:30 PM – 11:59 PM"));
assert.strictEqual(raw.endTime, "235900", "unmapped placeholder would export an end at 11:59 PM");
const shown = eventDateTimeParts(ev(d("7:30 PM – 11:59 PM")));
assert.strictEqual(shown.startTime, "193000");
assert.strictEqual(shown.endTime, "213000", "start-only: 2-hour default end");
assert.strictEqual(shown.endDate, "20261017");
const late = eventDateTimeParts(ev(d("10:30 PM – 11:59 PM")));
assert.strictEqual(late.startTime, "223000");
assert.strictEqual(late.endTime, "003000", "10:30 PM start: default end rolls past midnight");
assert.strictEqual(late.endDate, "20261018");
console.log("PASS: Add to Calendar uses the 2-hour default once the placeholder end is dropped");
