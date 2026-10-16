// test/event-dates.test.js — issue #48: one shared "which days is this event
// active on?" rule (event-dates.js), and the surfaces that must use it.
//
// Covers the production cases that motivated it: Glenn Barr (exhibition whose
// opening reception was being shown nightly), The Worst of Kent Myers
// (unclassified range with a clock time), Harvest Festival (genuinely
// recurring, Sat/Sun only), an RA late-night row (single, ends after
// midnight), and unclassified legacy rows (never dropped, never changed).
//
// Run: node test/event-dates.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const ED = require(`${REPO_DIR}/event-dates.js`);
// Pages load /event-dates.js as a global before /discovery.js; do the same here.
global.EventDates = ED;
const { Discovery: D } = require(`${REPO_DIR}/discovery.js`);

const read = (f) => fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");

// The pre-#48 loop, copied verbatim from the pages, as the compatibility oracle.
function legacyExpand(startIso, endIso, floorIso) {
  if (!endIso || endIso <= startIso) return [startIso];
  const firstIso = (floorIso && floorIso > startIso && floorIso <= endIso) ? floorIso : startIso;
  const dates = [];
  let cur = new Date(firstIso + "T12:00:00");
  const end = new Date(endIso + "T12:00:00");
  let guard = 0;
  while (cur <= end && guard < 60) {
    const y = cur.getFullYear(), m = String(cur.getMonth() + 1).padStart(2, "0"), d = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return dates;
}

const ROWS = {
  // Production row 15c5c165 today: unclassified, range + reception time.
  glennBarrLegacy: { id: "gb", date: "2026-10-09", endDate: "2026-12-30", time: "Opening reception 7:00–10:00 PM", title: "Glenn Barr: The Beautiful and the Banal" },
  // After correction: the exhibition is continuous; the reception is its own single (past) event.
  glennBarrExhibition: { id: "gb", date: "2026-10-09", endDate: "2026-12-30", dateSemantics: "continuous", isAllDay: true },
  glennBarrReception: { id: "gb-r", date: "2026-10-09", endDate: "2026-10-09", dateSemantics: "single", time: "7:00 PM" },
  kentMyers: { id: "km", date: "2026-11-14", endDate: "2027-01-06", time: "7:00 PM", title: "The Worst of Kent Myers" },
  harvestFestival: {
    id: "hf", date: "2026-10-03", endDate: "2026-10-31", time: "10:00 AM", dateSemantics: "recurring",
    occurrenceDates: ["2026-10-31", "2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18", "2026-10-24", "2026-10-25"],
  },
  raLateNight: { id: "ra", date: "2026-10-10", endDate: "2026-10-11", time: "11:00 PM", dateSemantics: "single" },
  recurringNoDates: { id: "rn", date: "2026-10-15", endDate: "2026-11-08", time: "6:00 PM", dateSemantics: "recurring" },
};

function run() {
  // ---------------------------------------------------------------
  // Single: only its date, even when its hours cross midnight.
  // ---------------------------------------------------------------
  assert.deepStrictEqual(ED.expand(ROWS.raLateNight), ["2026-10-10"], "an after-midnight RA row is one night");
  assert.ok(!ED.isActiveOn(ROWS.raLateNight, "2026-10-11"));
  assert.strictEqual(ED.reviewReason(ROWS.raLateNight), null);

  // ---------------------------------------------------------------
  // Recurring: only the evidenced dates, sorted, never the gaps.
  // ---------------------------------------------------------------
  const hf = ED.expand(ROWS.harvestFestival);
  assert.deepStrictEqual(hf, ["2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18", "2026-10-24", "2026-10-25", "2026-10-31"]);
  assert.ok(!ED.isActiveOn(ROWS.harvestFestival, "2026-10-09"), "Friday Oct 9 is not a Harvest Festival day");
  assert.ok(ED.isActiveOn(ROWS.harvestFestival, "2026-10-10"));
  assert.deepStrictEqual(ED.expand(ROWS.harvestFestival, "2026-10-11"), hf.slice(3), "floor drops past occurrences");
  assert.strictEqual(ED.reviewReason(ROWS.harvestFestival), null);
  // Duplicate / invalid occurrence dates are ignored, not trusted.
  assert.deepStrictEqual(ED.expand({ date: "2026-10-03", endDate: "2026-10-31", dateSemantics: "recurring", occurrenceDates: ["2026-10-04", "2026-10-04", "bad", null] }), ["2026-10-04"]);

  // An occurrence outside start..end is still listed (evidence wins) but flagged.
  const outside = { date: "2026-10-03", endDate: "2026-10-10", dateSemantics: "recurring", occurrenceDates: ["2026-10-03", "2026-10-17"] };
  assert.deepStrictEqual(ED.expand(outside), ["2026-10-03", "2026-10-17"]);
  assert.strictEqual(ED.reviewReason(outside), "occurrence-outside-range");

  // Recurring with no usable dates: unverified (owner decision 2026-10-16), routed to review, never expanded.
  assert.deepStrictEqual(ED.expand(ROWS.recurringNoDates), []);
  assert.strictEqual(ED.scheduleState(ROWS.recurringNoDates), "unverified");
  assert.strictEqual(ED.reviewReason(ROWS.recurringNoDates), "recurring-without-dates");

  // ---------------------------------------------------------------
  // Glenn Barr: reception is not an upcoming event once it has passed; the
  // exhibition stays listed; the legacy row is flagged, not removed.
  // ---------------------------------------------------------------
  const TODAY = "2026-10-13";
  assert.deepStrictEqual(ED.expand(ROWS.glennBarrReception).filter((d) => d >= TODAY), [], "the Oct 9 reception is not listed as upcoming");
  const gbEx = ED.expand(ROWS.glennBarrExhibition, TODAY);
  assert.strictEqual(gbEx[0], TODAY, "the exhibition is listed from today");
  assert.ok(gbEx.length > 1, "the exhibition stays visible while it runs");
  assert.strictEqual(ED.reviewReason(ROWS.glennBarrExhibition), null, "classified continuous: nothing to review");
  // The 60-day cap must not make a long exhibition vanish before it ends: with
  // the page's floor (calendar/map/index pass one), it is still listed on Dec 29/30.
  const gbLate = ED.expand(ROWS.glennBarrExhibition, "2026-12-15");
  assert.strictEqual(gbLate[gbLate.length - 1], "2026-12-30", "exhibition still listed through its end date");
  assert.ok(ED.expand(ROWS.glennBarrExhibition).slice(-1)[0] < "2026-12-30", "without a floor the cap ends the list early (why pages pass one)");
  assert.strictEqual(ED.reviewReason(ROWS.glennBarrLegacy), "unclassified-multiday-clock-time");
  assert.deepStrictEqual(ED.expand(ROWS.glennBarrLegacy, TODAY), [], "unclassified row is not expanded into daily dates");
  assert.strictEqual(ED.availabilityOn(ROWS.glennBarrLegacy, "2026-10-20"), "unverified", "but its range stays discoverable as unverified");

  // ---------------------------------------------------------------
  // Kent Myers: unclassified range is unverified (not daily), kept, and flagged.
  // ---------------------------------------------------------------
  assert.deepStrictEqual(ED.expand(ROWS.kentMyers), []);
  assert.strictEqual(ED.availabilityOn(ROWS.kentMyers, "2026-12-01"), "unverified");
  assert.strictEqual(ED.reviewReason(ROWS.kentMyers), "unclassified-multiday-clock-time");
  // Classifying it continuous (once its source says so) clears the review flag.
  assert.strictEqual(ED.reviewReason({ ...ROWS.kentMyers, dateSemantics: "continuous" }), null);

  // ---------------------------------------------------------------
  // Backwards compatibility: single-date rows and `continuous` rows list exactly as before; an unclassified
  // multi-day range is unverified and lists no daily dates.
  // ---------------------------------------------------------------
  const starts = ["2026-01-01", "2026-09-30", "2026-10-13", "2026-12-31", "2027-02-28"];
  const spans = [0, 1, 2, 7, 59, 60, 61, 120, 364];
  const floors = [null, "2026-10-13", "2026-12-01", "2027-06-01"];
  let compared = 0;
  for (const s of starts) for (const n of spans) for (const f of floors) {
    const end = n === 0 ? undefined : new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n)).toISOString().slice(0, 10);
    const e = { date: s, endDate: end || s, dateSemantics: n === 0 ? undefined : "continuous" };
    const multi = !!e.endDate && e.endDate > e.date;
    assert.deepStrictEqual(ED.expand(e, multi ? f : null), legacyExpand(s, e.endDate, multi ? f : null), `${s}+${n} floor ${f}`);
    if (multi) assert.deepStrictEqual(ED.expand({ date: s, endDate: e.endDate }, f), [], `${s}+${n}: unclassified range is not expanded`);
    compared++;
  }
  assert.ok(compared >= 100);
  assert.strictEqual(ED.MAX_SPAN_DAYS, 60, "the 60-day listing cap is unchanged");
  assert.strictEqual(ED.expand({ date: "2026-01-01", endDate: "2026-12-31", dateSemantics: "continuous" }).length, 60);

  // Missing/odd input never throws and never invents a date.
  assert.deepStrictEqual(ED.expand({}), []);
  assert.deepStrictEqual(ED.expand({ date: "nope" }), []);
  assert.strictEqual(ED.reviewReason({}), null);

  // ---------------------------------------------------------------
  // Discovery (Today / This Weekend / etc.) uses the same rule.
  // ---------------------------------------------------------------
  const FRI = new Date("2026-10-09T16:00:00Z");  // Friday 12:00 PM Detroit
  const SAT = new Date("2026-10-10T16:00:00Z");  // Saturday 12:00 PM Detroit
  const toEv = (r) => Object.assign({ title: "T", venue: "V", cat: "music", free: false, source: "Manual" }, r);
  const today = D.change(D.defaults(), { when: "today" });
  assert.strictEqual(D.matches(toEv(ROWS.harvestFestival), today, { now: FRI }), false, "recurring: not on an unlisted weekday");
  assert.strictEqual(D.matches(toEv(ROWS.harvestFestival), today, { now: SAT }), true, "recurring: on a listed Saturday");
  assert.strictEqual(D.matches(toEv(ROWS.kentMyers), D.change(D.defaults(), { when: "all" }), { now: FRI }), true, "legacy rows still match");
  assert.strictEqual(D.matches(toEv(ROWS.glennBarrExhibition), today, { now: FRI }), true, "continuous: active on any day of its run");
  assert.strictEqual(D.matches(toEv(ROWS.raLateNight), D.change(D.defaults(), { when: "tomorrow" }), { now: SAT }), false, "single: its 'through' day is not a second night");
  assert.strictEqual(D.matches(toEv(ROWS.raLateNight), D.change(D.defaults(), { when: "tomorrow" }), { now: FRI }), true, "single: it is on tomorrow's list on its own night");

  // ---------------------------------------------------------------
  // The surfaces use the shared file; none keeps a private range loop.
  // ---------------------------------------------------------------
  for (const page of ["index.html", "calendar.html", "map.html"]) {
    const src = read(page);
    assert.ok(src.includes('<script src="/event-dates.js"></script>'), `${page} loads /event-dates.js`);
    assert.ok(!/function expandDateRange\s*\(/.test(src), `${page} has no private expandDateRange()`);
    assert.ok(!/MAX_EVENT_SPAN_DAYS/.test(src), `${page} has no private span cap`);
    assert.ok(/EventDates\.expand\(/.test(src), `${page} lists days through EventDates.expand()`);
    assert.ok(/dateSemantics:\s*row\.date_semantics/.test(src), `${page} maps date_semantics when present`);
  }
  // map and calendar must pass a floor so long exhibitions are not truncated by the cap.
  assert.ok(/EventDates\.expand\(e, multiDay \? loadFloorISO\(\) : null\)/.test(read("map.html")), "map.html passes the load floor");
  assert.ok(/EventDates\.expand\(e, floor\)/.test(read("calendar.html")), "calendar.html passes a floor for long running events");
  assert.ok(read("index.html").indexOf('/event-dates.js') < read("index.html").indexOf('/discovery.js'), "index.html loads event-dates.js before discovery.js");

  // The migration and the anon column grant (2026-10-13_events_date_columns_anon_grant.sql) are applied,
  // so every page's main event query asks for the two columns: index.html through the owner-rights view
  // events_public, calendar.html and map.html through the raw events table (anon column grant).
  const sel = { "index.html": /events_public\?[^`]*select=[^`]*date_semantics,occurrence_dates/, "calendar.html": /rest\/v1\/events\?status=eq\.approved&select=[^`]*date_semantics,occurrence_dates/, "map.html": /rest\/v1\/events\?status=eq\.approved&start_date[^`]*select=[^`]*date_semantics,occurrence_dates/ };
  for (const page of Object.keys(sel)) assert.ok(sel[page].test(read(page)), `${page}: main query selects date_semantics and occurrence_dates`);
  // recurrence_evidence is internal and must never be selected by a page.
  for (const page of ["index.html", "calendar.html", "map.html"]) assert.ok(!/recurrence_evidence/.test(read(page)), `${page}: does not select recurrence_evidence`);

  // ---------------------------------------------------------------
  // P0 date reliability (2026-10-16): unknown schedule is never daily availability.
  // Production fixtures: ids and fields as read on 2026-10-16.
  // ---------------------------------------------------------------
  const CIDER = { id: "5bf90f52", title: "Cider in the City", date: "2026-10-11", endDate: "2026-10-18", time: "1:00 PM" };
  const CIDER_FIXED = { ...CIDER, dateSemantics: "recurring", occurrenceDates: ["2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18"] };
  const OCT = { id: "oct", date: "2026-10-01", endDate: "2026-10-31", time: "10:00 AM" };
  const FRI16 = new Date("2026-10-16T16:00:00Z");   // Friday 12:00 PM Detroit
  const SAT17 = new Date("2026-10-17T16:00:00Z");
  const todayD = D.change(D.defaults(), { when: "today" });
  const allD = D.change(D.defaults(), { when: "all" });
  // 1 Saturday/Sunday-only: published as an Oct 11-18 range it is NOT active on Friday; with evidence it is Sat/Sun only.
  assert.strictEqual(ED.isActiveOn(CIDER, "2026-10-16"), false);
  assert.strictEqual(ED.availabilityOn(CIDER, "2026-10-16"), "unverified");
  assert.strictEqual(D.matches(toEv(CIDER), todayD, { now: FRI16 }), false, "Cider is not on Friday's Today list");
  assert.strictEqual(D.matches(toEv(CIDER), allD, { now: FRI16 }), true, "but stays in the unrestricted upcoming list");
  assert.strictEqual(ED.availabilityOn(CIDER_FIXED, "2026-10-16"), null);
  assert.strictEqual(ED.availabilityOn(CIDER_FIXED, "2026-10-17"), "confirmed");
  assert.strictEqual(D.matches(toEv(CIDER_FIXED), todayD, { now: SAT17 }), true);
  assert.strictEqual(D.matches(toEv(CIDER_FIXED), todayD, { now: FRI16 }), false);
  // Oct 1-31 unclassified: absent from date views, present in the range browse, flagged for review.
  assert.deepStrictEqual(ED.expand(OCT), []);
  assert.strictEqual(ED.availabilityOn(OCT, "2026-10-16"), "unverified");
  assert.strictEqual(ED.availabilityOn(OCT, "2026-11-01"), null);
  assert.strictEqual(ED.reviewReason(OCT), "unclassified-multiday-clock-time");
  assert.strictEqual(ED.reviewReason({ ...OCT, isAllDay: true }), "unverified-multiday-schedule");
  // 2 Friday setup + Saturday opening: only the evidenced public days.
  assert.deepStrictEqual(ED.expand({ date: "2026-10-16", endDate: "2026-10-18", dateSemantics: "recurring", occurrenceDates: ["2026-10-17", "2026-10-18"] }), ["2026-10-17", "2026-10-18"]);
  // 3 Friday evening + weekend afternoons: Friday is a listed occurrence.
  assert.strictEqual(ED.isActiveOn({ date: "2026-10-16", endDate: "2026-10-18", dateSemantics: "recurring", occurrenceDates: ["2026-10-16", "2026-10-17", "2026-10-18"] }, "2026-10-16"), true);
  // 4 Multiday continuous (exhibition) is not suppressed.
  assert.strictEqual(ED.availabilityOn({ date: "2026-10-09", endDate: "2026-12-30", dateSemantics: "continuous" }, "2026-10-16"), "ongoing");
  assert.strictEqual(ED.scheduleState({ date: "2026-10-09", endDate: "2026-12-30", dateSemantics: "continuous" }), "ongoing");
  // 6 Skipped dates: an excluded day is absent.
  assert.strictEqual(ED.isActiveOn({ date: "2026-10-01", endDate: "2026-10-31", dateSemantics: "recurring", occurrenceDates: ["2026-10-03", "2026-10-10"] }, "2026-10-04"), false);
  // 8 Overnight (RA/POSH): one night, listed on its start date only; Thursday-night rows leave Friday.
  const RA_FRI = { id: "ra", date: "2026-10-16", endDate: "2026-10-17", time: "9:00 PM–2:00 AM" };
  const RA_THU = { id: "ra2", date: "2026-10-15", endDate: "2026-10-16", time: "8:00 PM–1:00 AM" };
  assert.strictEqual(ED.scheduleState(RA_FRI), "confirmed");
  assert.strictEqual(ED.availabilityOn(RA_FRI, "2026-10-16"), "confirmed");
  assert.strictEqual(ED.availabilityOn(RA_FRI, "2026-10-17"), null);
  assert.strictEqual(ED.availabilityOn(RA_THU, "2026-10-16"), null, "a Thursday night is not a Friday event");
  assert.strictEqual(ED.scheduleState({ date: "2026-10-16", endDate: "2026-10-17", time: "11:59 PM–5:00 AM" }), "confirmed");
  assert.strictEqual(ED.scheduleState({ date: "2026-10-16", endDate: "2026-10-17", time: "10 PM" }), "confirmed", "single evening start, next-day end");
  // A one-day-longer span that does NOT cross midnight (daytime) is not assumed to be one night.
  assert.strictEqual(ED.scheduleState({ date: "2026-10-15", endDate: "2026-10-16", time: "11:00 AM" }), "unverified");
  assert.strictEqual(ED.scheduleState({ date: "2026-10-15", endDate: "2026-10-16", time: "9:00 PM–2:00 AM", isAllDay: true }), "unverified");
  assert.strictEqual(ED.scheduleState({ date: "2026-10-15", endDate: "2026-10-17", time: "9:00 PM–2:00 AM" }), "unverified", "a 3-day span is never assumed to be one night");
  // 9 Timezone boundary: the pure ISO-date rule carries no time zone.
  assert.strictEqual(ED.isActiveOn({ date: "2026-10-16" }, "2026-10-16"), true);
  assert.strictEqual(ED.isActiveOn({ date: "2026-10-16" }, "2026-10-17"), false);
  // 12 Source date-range ambiguity: classification wins; the range itself is only a bound.
  assert.deepStrictEqual(ED.bounds(CIDER_FIXED).dates, ["2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18"]);
  // 18 Missing operating hours / 22 nothing fabricated: expand never invents dates for unverified rows.
  assert.deepStrictEqual(ED.expand({ date: "2026-10-01", endDate: "2026-10-31" }), []);
  assert.strictEqual(ED.availabilityOn({ date: "bad" }, "2026-10-16"), null);
  // The Discovery windows: weekend picks a Saturday-evidenced row and ignores an unverified range.
  const weekend = D.change(D.defaults(), { when: "weekend" });
  assert.strictEqual(D.matches(toEv(CIDER_FIXED), weekend, { now: FRI16 }), true);
  assert.strictEqual(D.matches(toEv(CIDER), weekend, { now: FRI16 }), false, "unverified range is not a 'this weekend' event");

  console.log("PASS: event-dates — single / continuous / recurring / legacy, Glenn Barr, Kent Myers, Harvest Festival, discovery, surfaces");
}

run();
