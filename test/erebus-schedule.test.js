// test/erebus-schedule.test.js — Erebus seasonal schedule (owner decision 2026-10-18).
//   * Erebus stays PUBLISHED and featured; the schedule is private entry data, no events-table row, no public layout or copy change
//   * season Sept 18 to Nov 7, 2026 with the owner-supplied weekly hours; explicit dark days override the recurring hours
//   * every field carries its provenance and confidence label, worded as the owner wrote them
"use strict";
const assert = require("assert");
const path = require("path");
const ED = require(path.join(__dirname, "..", "api/_lib/seasonal-editorial/editorial.js"));
const e = ED.entries().halloween.find((x) => x.id === "erebus");

assert.strictEqual(e.status, "PUBLISHED");
assert.strictEqual(e.featured, true);
assert.ok(ED.publishedProjection().halloween.some((x) => x.id === "erebus"), "still in the public Halloween collection");

assert.deepStrictEqual(e.schedule.provenance.season.confidence, "Corroborated by three sources");
assert.strictEqual(e.schedule.provenance.weeklyHours.confidence, "Owner-supplied, external verification pending");
assert.strictEqual(e.schedule.provenance.darkDays.confidence, "One secondary source");
assert.strictEqual(e.schedule.provenance.ticketingCalendar.confidence, "Not independently read");
assert.strictEqual(e.schedule.explicitClosuresOverrideHours, true);

const cal = ED.scheduleCalendar(e), by = Object.fromEntries(cal.map((d) => [d.date, d]));
assert.strictEqual(cal[0].date, "2026-09-18");
assert.strictEqual(cal[cal.length - 1].date, "2026-11-07");
assert.strictEqual(cal.length, 51, "Sept 18 to Nov 7 inclusive");
const dark = cal.filter((d) => d.dark).map((d) => d.date);
assert.deepStrictEqual(dark, ["2026-10-05", "2026-10-06", "2026-10-12", "2026-10-19", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
for (const d of dark) assert.deepStrictEqual(by[d], { date: d, open: false, hours: null, dark: true }, d + ": closed, hours overridden");
// weekly hours (2026-10-18 is a Sunday)
assert.strictEqual(by["2026-10-18"].hours, "6:00 PM-11:00 PM");
assert.strictEqual(by["2026-10-20"].hours, "7:30 PM-10:30 PM", "Tuesday");
assert.strictEqual(by["2026-10-23"].hours, "7:00 PM-12:00 AM", "Friday");
assert.strictEqual(by["2026-10-24"].hours, "6:00 PM-12:00 AM", "Saturday");
assert.strictEqual(by["2026-11-06"].hours, "7:00 PM-12:00 AM", "Friday");
assert.strictEqual(by["2026-11-07"].hours, "6:00 PM-12:00 AM", "Saturday, last night");
// forward view from today: Oct 18 to Nov 7 less the dark days (Oct 19, Nov 2-5)
const fwd = ED.scheduleCalendar(e, "2026-10-18");
assert.strictEqual(fwd.length, 21);
assert.deepStrictEqual(fwd.filter((d) => d.dark).map((d) => d.date), ["2026-10-19", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
assert.strictEqual(fwd.filter((d) => d.open).length, 16);
// no entry without a schedule gets a calendar
assert.deepStrictEqual(ED.scheduleCalendar({}), []);
console.log("erebus-schedule: all assertions passed");
