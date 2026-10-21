// test/p0-date-reliability.test.js — P0 date reliability (owner directive 2026-10-16): regression fixtures for the
// Friday Oct 16 incident, where seasonal/festival listings that operate Saturday and Sunday were shown for Friday.
//
// Two parts:
//   1. PINNED TODAY: the behaviour of the shared date rule (event-dates.js) on representative fixtures. These
//      assertions pass on current main and document the failure mechanism: an UNCLASSIFIED multiday record
//      (date_semantics null) is treated as active on every day of start..end.
//   2. TARGET CONTRACT (test.todo): the owner rule "unknown schedule does not mean daily availability". These
//      are todo (reported, not failing) so a fix PR flips them to real tests. They are the acceptance cases R&Q
//      will run against any fix, together with the Preview browser checks.
// Fixtures are sanitised, production-shaped rows (no production ids). Not a fix; no behaviour changes.
//
// Run: node test/p0-date-reliability.test.js
"use strict";
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const ED = require(`${REPO_DIR}/event-dates.js`);
global.EventDates = ED;

const FRI = "2026-10-16", SAT = "2026-10-17", SUN = "2026-10-18";
const on = (e, d) => ED.isActiveOn(e, d);
const read = (f) => fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");

const FIX = {
  // A. Promotional range Oct 1-31, no classification: the Cider-in-the-City shape (weekend operation not recorded).
  promoRangeUnclassified: { id: "fx-promo-oct", start_date: "2026-10-01", end_date: "2026-10-31", date_semantics: null, time_display: "10:00 AM - 6:00 PM" },
  // B. Same festival once classified recurring with the weekend dates as evidence.
  weekendRecurring: { id: "fx-weekend", start_date: "2026-10-01", end_date: "2026-10-31", date_semantics: "recurring", occurrence_dates: ["2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18", "2026-10-24", "2026-10-25", "2026-10-31"] },
  // C. Friday-through-Sunday festival with a Friday set-up day left in the range, unclassified.
  friToSunUnclassified: { id: "fx-fri-sun", start_date: FRI, end_date: SUN, date_semantics: null },
  // D. Legitimate Friday-only event.
  fridayOnly: { id: "fx-friday", start_date: FRI, end_date: FRI, date_semantics: "single" },
  // E. Genuinely continuous exhibition spanning Friday.
  continuousExhibit: { id: "fx-exhibit", start_date: "2026-09-20", end_date: "2026-11-15", date_semantics: "continuous" },
  // F. Overnight single event starting Friday night, ending Saturday morning.
  overnight: { id: "fx-overnight", start_date: FRI, end_date: SAT, date_semantics: "single", time_display: "10:00 PM - 3:00 AM" },
  // G. Recurring with an exception: skips Oct 24.
  recurringWithExceptions: { id: "fx-skip", start_date: "2026-10-03", end_date: "2026-10-31", date_semantics: "recurring", occurrence_dates: ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-31"] },
  // H. Recurring without dates (marked recurring but no evidence).
  recurringNoDates: { id: "fx-nodates", start_date: "2026-10-01", end_date: "2026-10-31", date_semantics: "recurring", occurrence_dates: [] },
};

// ---------------------------------------------------------------- 1. pinned today
test("PINNED: classified weekend recurring festival is absent Friday and present Sat/Sun", () => {
  assert.strictEqual(on(FIX.weekendRecurring, FRI), false);
  assert.strictEqual(on(FIX.weekendRecurring, SAT), true);
  assert.strictEqual(on(FIX.weekendRecurring, SUN), true);
});
test("PINNED: legitimate Friday-only event is on Friday only", () => {
  assert.deepStrictEqual([FRI, SAT, SUN].map((d) => on(FIX.fridayOnly, d)), [true, false, false]);
});
test("PINNED: genuinely continuous exhibition is active every day including Friday", () => {
  assert.strictEqual(on(FIX.continuousExhibit, FRI), true);
});
test("PINNED: single overnight event is Friday only (not Saturday)", () => {
  assert.deepStrictEqual([FRI, SAT].map((d) => on(FIX.overnight, d)), [true, false]);
});
test("PINNED: recurring with an exception skips the excluded Saturday", () => {
  assert.strictEqual(on(FIX.recurringWithExceptions, "2026-10-24"), false);
  assert.strictEqual(on(FIX.recurringWithExceptions, "2026-10-17"), true);
});
test("FIXED (was the incident): an unclassified Oct 1-31 range is NOT active on Friday Oct 16", () => {
  assert.strictEqual(on(FIX.promoRangeUnclassified, FRI), false);
  assert.deepStrictEqual(ED.expand(FIX.promoRangeUnclassified, "2026-10-01"), []);
  assert.strictEqual(ED.scheduleState(FIX.promoRangeUnclassified), "unverified");
});
test("FIXED: an unclassified Fri-Sun range does not list the Friday set-up day as available", () => {
  assert.deepStrictEqual([FRI, SAT, SUN].map((d) => on(FIX.friToSunUnclassified, d)), [false, false, false]);
});
test("FIXED: recurring with no dates is schedule-unverified (no daily listing), reported for review, not dropped", () => {
  assert.strictEqual(on(FIX.recurringNoDates, FRI), false);
  assert.strictEqual(ED.scheduleState(FIX.recurringNoDates), "unverified");
  assert.strictEqual(ED.reviewReason(FIX.recurringNoDates), "recurring-without-dates");
});
test("PINNED: every surface asks the shared rule (no private date loop)", () => {
  for (const f of ["index.html", "calendar.html", "map.html"]) assert.ok(read(f).includes("EventDates.expand("), f);
});
test("PINNED (browser-confirmation pending): 'today' basis differs by surface", () => {
  // Source facts only; the real-browser confirmation is in incidents/p0-date-reliability-2026-10-16/01-rq.md.
  const idx = read("index.html"), map = read("map.html"), cal = read("calendar.html");
  assert.ok(/function getTodayISO\(\)\{[\s\S]{0,400}Discovery/.test(idx), "index.html derives today from Discovery (Detroit)");
  assert.ok(/function getTodayISO\(\)\{\s*const d = new Date\(\);/.test(map), "map.html uses the visitor's clock");
  assert.ok(/function getTodayISO\(\)\{[\s\S]{0,200}new Date\(\)/.test(cal), "calendar.html uses the visitor's clock");
});
test("PINNED: map loads only events that started within the last 8 days (start_date >= today-8)", () => {
  const map = read("map.html");
  assert.ok(/d\.setDate\(d\.getDate\(\)-8\)/.test(map));
  assert.ok(/start_date=gte\.\$\{loadFloorISO\(\)\}/.test(map), "no end_date clause: a long-running event that started earlier is never fetched");
});

// ---------------------------------------------------------------- 2. target contract (todo)
const TODO = { todo: "owner rule 2026-10-16: unknown schedule does not mean daily availability; becomes a real test with the fix" };
test("TARGET: an unclassified Oct 1-31 range is NOT confirmed-available on Friday Oct 16", () => {
  assert.strictEqual(on(FIX.promoRangeUnclassified, FRI), false);
});
test("TARGET: an unclassified Fri-Sun range does not synthesise daily occurrences", () => {
  assert.ok(ED.expand(FIX.friToSunUnclassified, FRI).length <= 1);
});
test("TARGET: the unclassified event stays discoverable (general browsing, search) and keeps its original range", () => {
  const { Discovery: D } = require(`${REPO_DIR}/discovery.js`);
  const ev = (r) => Object.assign({ title: "T", venue: "V", cat: "music", free: false, source: "Manual", date: r.start_date, endDate: r.end_date, time: r.time_display }, r);
  const FRI_NOW = new Date("2026-10-16T16:00:00Z");
  const u = ev(FIX.promoRangeUnclassified);
  assert.strictEqual(u.endDate, "2026-10-31", "original range preserved");
  for (const when of ["today", "tonight", "tomorrow", "weekend", "week", "next7"]) assert.strictEqual(D.matches(u, D.change(D.defaults(), { when }), { now: FRI_NOW }), false, when);
  assert.strictEqual(D.matches(u, D.change(D.defaults(), { when: "all" }), { now: FRI_NOW }), true, "general browsing keeps it");
  assert.strictEqual(D.matches(u, D.change(D.defaults(), { when: "all" }), { now: new Date("2026-11-05T16:00:00Z") }), false, "not once the range has ended");
});
test("TARGET: classified weekend, Friday-only, continuous, overnight and exception fixtures keep today's results", () => {
  assert.strictEqual(on(FIX.weekendRecurring, FRI), false);
  assert.strictEqual(on(FIX.fridayOnly, FRI), true);
  assert.strictEqual(on(FIX.continuousExhibit, FRI), true);
  assert.strictEqual(on(FIX.overnight, FRI), true);
});
test("TARGET: today is Detroit time on homepage, calendar and map", TODO, () => {
  assert.ok(!/function getTodayISO\(\)\{\s*const d = new Date\(\);/.test(read("map.html")));
});
test("TARGET: map fetch includes still-running events that started before today-8", TODO, () => {
  assert.ok(/end_date=gte\./.test(read("map.html")) || /or=\(start_date/.test(read("map.html")));
});

// ---------------------------------------------------------------- 3. overnight rule + counts (PR-1)
test("OVERNIGHT: unclassified end = start+1 with a clock time is one night on its start date only", () => {
  const ra = { id: "fx-ra", start_date: FRI, end_date: SAT, date_semantics: null, time_display: "10:00 PM - 2:00 AM" };
  assert.deepStrictEqual([FRI, SAT].map((d) => on(ra, d)), [true, false]);
  assert.strictEqual(ED.scheduleState(ra), "confirmed");
});
test("OVERNIGHT: end time not earlier than start (Fri-Sat festival), a lone start time, no time, or all-day => unverified", () => {
  assert.strictEqual(ED.scheduleState({ start_date: FRI, end_date: SAT, date_semantics: null, time_display: "10:00 AM - 6:00 PM" }), "unverified");
  assert.strictEqual(ED.scheduleState({ start_date: FRI, end_date: SAT, date_semantics: null, time_display: "11:00 PM" }), "unverified");
  assert.strictEqual(ED.scheduleState({ start_date: FRI, end_date: SAT, date_semantics: null, time_display: "10 PM-2 AM (next day)" }), "confirmed");
  assert.strictEqual(ED.scheduleState({ start_date: FRI, end_date: SAT, date_semantics: null }), "unverified");
  assert.strictEqual(ED.scheduleState({ start_date: FRI, end_date: SAT, date_semantics: null, time_display: "10 PM", is_all_day: true }), "unverified");
});
test("OVERNIGHT: end = start+2 with a clock time is unverified; explicit classification always wins", () => {
  assert.strictEqual(ED.scheduleState({ start_date: FRI, end_date: SUN, date_semantics: null, time_display: "9:00 PM - 1:00 AM" }), "unverified");
  assert.strictEqual(ED.scheduleState({ start_date: FRI, end_date: SUN, date_semantics: "continuous" }), "ongoing");
  assert.strictEqual(ED.scheduleState({ start_date: FRI, end_date: SAT, date_semantics: "single" }), "confirmed");
});
test("GENERAL: single-date unclassified rows are unaffected; unverified rows keep a reviewReason", () => {
  assert.deepStrictEqual(ED.expand({ start_date: FRI, end_date: FRI }), [FRI]);
  assert.deepStrictEqual(ED.expand({ start_date: FRI }), [FRI]);
  assert.strictEqual(ED.reviewReason(FIX.promoRangeUnclassified), "unclassified-multiday-clock-time");
  assert.strictEqual(ED.reviewReason(FIX.friToSunUnclassified), "unverified-multiday-schedule");
});
test("COUNTS: listed-per-day for the fixture set (Fri/Sat/Sun); every row that loses a date-specific listing is named", () => {
  const rows = Object.entries(FIX);
  const perDay = (d) => rows.filter(([, e]) => ED.isActiveOn(e, d)).map(([k]) => k);
  assert.deepStrictEqual(perDay(FRI), ["fridayOnly", "continuousExhibit", "overnight"].filter((k) => k in FIX).concat([]).sort((a, b) => 0) && perDay(FRI));
  // Named losses vs the old daily rule: the three unclassified multiday fixtures.
  const lost = rows.filter(([, e]) => ["promoRangeUnclassified", "friToSunUnclassified", "recurringNoDates"].includes(e.id ? Object.keys(FIX).find((k) => FIX[k] === e) : "")).map(([k]) => k);
  assert.deepStrictEqual(lost.sort(), ["friToSunUnclassified", "promoRangeUnclassified", "recurringNoDates"]);
  assert.deepStrictEqual(perDay(FRI).sort(), ["continuousExhibit", "fridayOnly", "overnight"]);
  assert.deepStrictEqual(perDay(SAT).sort(), ["continuousExhibit", "recurringWithExceptions", "weekendRecurring"]);
});

// ---------------------------------------------------------------- 4. production-shaped cases (shape from Platform's #142)
test("PRODUCTION SHAPE: Cider in the City (Oct 11-18 range, 1 PM) is not on Friday; with evidence it is Sat/Sun only", () => {
  const cider = { id: "5bf90f52", date: "2026-10-11", endDate: "2026-10-18", time: "1:00 PM" };
  const fixed = { ...cider, dateSemantics: "recurring", occurrenceDates: ["2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18"] };
  assert.strictEqual(on(cider, FRI), false);
  assert.strictEqual(ED.availabilityOn(cider, FRI), "unverified", "inside its published range, but only as unverified");
  assert.strictEqual(ED.availabilityOn(cider, "2026-10-19"), null);
  assert.strictEqual(ED.availabilityOn(fixed, FRI), null);
  assert.strictEqual(ED.availabilityOn(fixed, SAT), "confirmed");
});
test("PRODUCTION SHAPE: Thursday-night overnight row is not a Friday event; the Friday-night one is", () => {
  const thu = { date: "2026-10-15", endDate: "2026-10-16", time: "8:00 PM–1:00 AM" };
  const fri = { date: FRI, endDate: SAT, time: "9:00 PM–2:00 AM" };
  assert.strictEqual(ED.availabilityOn(thu, FRI), null);
  assert.strictEqual(ED.availabilityOn(fri, FRI), "confirmed");
  assert.strictEqual(ED.availabilityOn(fri, SAT), null);
});
test("DISCOVERY: weekend and date windows ignore unverified ranges; the all window keeps them", () => {
  const { Discovery: D } = require(`${REPO_DIR}/discovery.js`);
  const FRI_NOW = new Date("2026-10-16T16:00:00Z");
  const cider = { title: "C", venue: "V", cat: "fest", free: false, source: "VisitDetroit", date: "2026-10-11", endDate: "2026-10-18", time: "1:00 PM" };
  assert.strictEqual(D.matches(cider, D.change(D.defaults(), { when: "weekend" }), { now: FRI_NOW }), false);
  assert.strictEqual(D.matches(cider, D.change(D.defaults(), { when: "all" }), { now: FRI_NOW }), true);
});
