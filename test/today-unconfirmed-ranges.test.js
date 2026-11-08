// test/today-unconfirmed-ranges.test.js
//
// P1 discovery incident (2026-11-07): 25 of the 129 events whose range included Nov 7 were multiday rows with no
// date_semantics (schedule-unverified). Today dropped them, so Planet 9 Film Fest (Nov 7-8, 2 PM) and The World of
// Anna Sui were unreachable except at the foot of the whole upcoming list. Rule kept (owner decision 2026-10-16):
// they are NOT attendable days and are never counted or exported as such. Today / Tomorrow now also list them under
// "Dates not confirmed", after the dated rows. Runs the real streamRows() / Discovery / EventDates.
// Run: node test/today-unconfirmed-ranges.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");
const { Discovery } = require(`${REPO_DIR}/discovery.js`);
const EventDates = require(`${REPO_DIR}/event-dates.js`);
global.EventDates = EventDates;
const m = html.match(/function streamRows\(ctx\)\{[\s\S]*?\n\}\n/);
assert.ok(m, "streamRows not found");

const NOW = new Date("2026-11-07T18:00:00Z"); // Sat 1:00 PM Detroit (EST)
const ev = (o) => Object.assign({ id: o.title, venue: "V", cat: "community", free: false, source: "Manual", time: "", dateSemantics: null, occurrenceDates: null }, o,
  { date: o.start, endDate: o.end || o.start });
const EVENTS = [
  ev({ title: "Planet 9 Film Fest", cat: "film", start: "2026-11-07", end: "2026-11-08", time: "2:00 PM" }),
  ev({ title: "The World of Anna Sui", cat: "visual", start: "2026-10-21", end: "2027-02-28", time: "Regular museum hours (closed Mon-Tue)" }),
  ev({ title: "Glenn Barr", cat: "visual", start: "2026-10-09", end: "2026-12-30", dateSemantics: "continuous" }),
  ev({ title: "Firm That Built Detroit", cat: "museum", start: "2026-11-07", time: "2:00 PM – 3:30 PM" }),
  ev({ title: "DISKO overnight (started Nov 6)", cat: "nightlife", start: "2026-11-06", end: "2026-11-07", time: "10:00 PM–2:00 AM" }),
  ev({ title: "Ended last day", cat: "visual", start: "2026-10-01", end: "2026-11-07", time: "9:00 AM – 12:00 PM" }),
  ev({ title: "Over yesterday", cat: "visual", start: "2026-10-01", end: "2026-11-06" }),
  ev({ title: "Starts tomorrow only", cat: "fest", start: "2026-11-08", end: "2026-11-09" }),
];
const stateFor = (patch) => Discovery.change(Discovery.defaults(), patch);
const run = (state) => {
  const sb = { Discovery, EventDates, EVENTS, state, loadFloorISO: () => "2026-10-08", timeSortMinutes: () => 0, console };
  vm.createContext(sb);
  return Array.from(vm.runInContext(`${m[0]}\n;streamRows`, sb)({ now: NOW })).map((r) => `${r.day}|${r.event.title}`);
};
const ctx = { now: NOW };

// TODAY
const today = stateFor({ when: "today" });
const rows = run(today);
assert.deepStrictEqual(rows.filter((r) => !r.startsWith("null|")).sort(),
  ["2026-11-07|Firm That Built Detroit", "2026-11-07|Glenn Barr"].sort(), "dated rows unchanged: confirmed + continuous only");
assert.deepStrictEqual(rows.filter((r) => r.startsWith("null|")).sort(),
  ["null|Planet 9 Film Fest", "null|The World of Anna Sui"].sort(), "unclassified ranges covering today are offered, unconfirmed");
assert.ok(rows.findIndex((r) => r.startsWith("null|")) > rows.findIndex((r) => r.endsWith("Firm That Built Detroit")), "unconfirmed group comes after dated rows");
assert.ok(!rows.some((r) => /DISKO|Ended last day|Over yesterday|Starts tomorrow/.test(r)), "over, ended-today and not-yet-started ranges stay out");

// The count and matches() contract is unchanged: unconfirmed is never a confirmed event.
assert.strictEqual(Discovery.count(EVENTS, today, ctx), 2, "Today count = confirmed events only");
assert.ok(!Discovery.matches(EVENTS[0], today, ctx), "matches() still false for an unverified range");
assert.ok(Discovery.unconfirmedOn(EVENTS[0], today, ctx));

// TOMORROW
const tomorrowRows = run(stateFor({ when: "tomorrow" }));
assert.ok(tomorrowRows.includes("null|Planet 9 Film Fest") && tomorrowRows.includes("null|Starts tomorrow only"), "Tomorrow lists ranges covering Nov 8");
assert.ok(!tomorrowRows.includes("null|Ended last day"));

// Windows that need a verified day or evening do not get the group: nothing is inferred.
["tonight", "weekend", "next7", "week"].forEach((mode) => {
  assert.ok(!Discovery.unconfirmedOn(EVENTS[0], stateFor({ when: mode }), ctx), `${mode}: no unconfirmed group`);
});
assert.ok(!Discovery.unconfirmedOn(EVENTS[0], stateFor({ when: { mode: "dates", from: "2026-11-07", to: "2026-11-07" } }), ctx), "picked date: no unconfirmed group");

// Filters still apply.
const filmOnly = run(stateFor({ when: "today", what: { only: "film" } }));
assert.deepStrictEqual(filmOnly, ["null|Planet 9 Film Fest"], "category filter applies to the unconfirmed group");
assert.deepStrictEqual(run(stateFor({ when: "today", q: "anna sui" })), ["null|The World of Anna Sui"], "search applies too");

// A range that ends today at a known end time that has passed is not offered.
assert.ok(!Discovery.unconfirmedOn(EVENTS[5], today, ctx));
assert.ok(Discovery.unconfirmedOn(EVENTS[5], today, { now: new Date("2026-11-07T15:00:00Z") }), "still offered before its end time (10 AM)");

// Default view unchanged: each exactly once.
const all = run(Discovery.defaults());
assert.strictEqual(all.filter((r) => r.endsWith("Planet 9 Film Fest")).length, 1);
console.log("PASS: Today/Tomorrow offer unclassified ranges as 'Dates not confirmed'; counts, filters and other windows unchanged");

// FOLLOW-UP (owner decision 2026-11-08): a row listed under "Dates not confirmed" (dayIso === null) never exposes its
// start time; it says "Time not confirmed". Dated rows keep their time. The published range is untouched.
const rowM = html.match(/function streamRowHtml\(e, dayIso, ctx\)\{[\s\S]*?\n\}\n/);
assert.ok(rowM, "streamRowHtml not found");
assert.ok(/dayIso === null \? '<small class="evt-time-unconfirmed">Time not confirmed<\/small>' : timeCellHtml\(e\.time\)/.test(rowM[0]), "unconfirmed rows show 'Time not confirmed', dated rows show their time");
assert.ok(/Published \$\{escapeHtml\(formatRangeLabel/.test(html), "published range label preserved");
console.log("PASS: unconfirmed rows say 'Time not confirmed'");
// Experience 375px defect: the label must wrap at word boundaries only, and stay 9px where a later rule enlarges .evt-time small.
assert.ok(/\.evt-time small\.evt-time-unconfirmed\{[^}]*overflow-wrap:normal[^}]*hyphens:none[^}]*font-size:9px/.test(html), "unconfirmed time label wraps only between words at 375px");
console.log("PASS: unconfirmed time label never breaks mid-word");
