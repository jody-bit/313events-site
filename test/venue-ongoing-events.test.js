// test/venue-ongoing-events.test.js
//
// P1 discovery T7 (2026-11-08): a venue page listed only events with start_date >= today (and "today" was the UTC
// date), so an exhibition that opened last month and runs through January vanished from its own venue page
// (prod: 14 genuinely ongoing events at 13 venues). Runs the real helpers from venue-template.html.
// Run: node test/venue-ongoing-events.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/venue-template.html`, "utf8");
const EventDates = require(`${REPO_DIR}/event-dates.js`);
assert.ok(/<script src="\/event-dates\.js"><\/script>/.test(html), "venue page loads event-dates.js");
const grab = (re, what) => { const m = html.match(re); assert.ok(m, what + " not found"); return m[0]; };
const src = [
  grab(/function detroitTodayISO\([\s\S]*?\n\}\n/, "detroitTodayISO"),
  grab(/function venueEventsUrl\([\s\S]*?\n\}\n/, "venueEventsUrl"),
  grab(/function venueUpcomingEvents\([\s\S]*?\n\}\n/, "venueUpcomingEvents"),
].join("\n");
const sb = { EventDates, Intl, Date, Object, encodeURIComponent };
vm.createContext(sb); vm.runInContext(src, sb);
const up = (rows, today) => Array.from(sb.venueUpcomingEvents(rows, today));
const ids = (rows) => rows.map((r) => r.id);

// Detroit today, not UTC: Nov 7 8 PM EST is already Nov 8 in UTC.
assert.strictEqual(sb.detroitTodayISO(new Date("2026-11-08T01:00:00Z")), "2026-11-07");
assert.strictEqual(sb.detroitTodayISO(new Date("2026-11-07T18:00:00Z")), "2026-11-07");
assert.strictEqual(sb.detroitTodayISO(new Date("2026-07-08T03:30:00Z")), "2026-07-07"); // EDT

// Query: approved-only public view, venue-scoped, started-or-still-running, and the columns the filter needs.
const url = sb.venueEventsUrl("https://x.supabase.co", "v1", "2026-11-07");
assert.ok(url.includes("/rest/v1/events_public?venue_id=eq.v1"));
assert.ok(url.includes("or=(start_date.gte.2026-11-07,end_date.gte.2026-11-07)"));
for (const c of ["end_date", "date_semantics", "occurrence_dates", "time_display"]) assert.ok(url.includes(c), c);

const T = "2026-11-07";
const rows = [
  { id: "future", start_date: "2026-11-20", end_date: "2026-11-20", date_semantics: "single" },
  { id: "today", start_date: T, end_date: T, date_semantics: null },
  { id: "expo-ongoing", start_date: "2026-10-01", end_date: "2027-01-10", date_semantics: "continuous" },
  { id: "expo-last-day", start_date: "2026-10-01", end_date: T, date_semantics: "continuous" },       // boundary: end = today -> kept
  { id: "expo-ended-yesterday", start_date: "2026-10-01", end_date: "2026-11-06", date_semantics: "continuous" }, // expired control
  { id: "unverified-range", start_date: "2026-11-01", end_date: "2026-11-30", date_semantics: null },  // owner rule: not attendable
  { id: "recurring-past-start", start_date: "2026-10-01", end_date: "2026-12-01", date_semantics: "recurring", occurrence_dates: ["2026-10-03", "2026-11-14"] },
  { id: "no-end-continuous", start_date: "2026-10-01", end_date: null, date_semantics: "continuous" },
];
const got = up(rows, T);
// Pre-fix behaviour (start_date >= today only) kept just future + today.
assert.ok(ids(got).includes("expo-ongoing"), "an exhibition that opened earlier and has not ended is listed");
assert.ok(ids(got).includes("expo-last-day"), "end_date = today is still on view");
assert.ok(!ids(got).includes("expo-ended-yesterday"), "an exhibition that ended yesterday is not listed");
assert.ok(!ids(got).includes("unverified-range"), "unverified multi-day ranges that began earlier are not listed as attendable");
assert.ok(!ids(got).includes("recurring-past-start"), "recurring rows keep their existing treatment (not widened here)");
assert.ok(!ids(got).includes("no-end-continuous"), "no end date -> not provably ongoing");
assert.deepStrictEqual(ids(got).filter((i) => ["future", "today"].includes(i)), ["future", "today"], "today/future rows unchanged");
const ongoing = got.find((r) => r.id === "expo-ongoing");
assert.strictEqual(ongoing.ongoing, true, "flagged so the page labels it 'Through <end>' and omits the start-day time");
assert.ok(!got.find((r) => r.id === "future").ongoing && !got.find((r) => r.id === "today").ongoing);
// Evening case: UTC date would be tomorrow, so an exhibition ending today would have been dropped.
assert.ok(ids(up(rows, sb.detroitTodayISO(new Date("2026-11-08T01:00:00Z")))).includes("expo-last-day"));
console.log("venue-ongoing-events: ok");
