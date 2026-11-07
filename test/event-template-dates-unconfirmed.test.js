// test/event-template-dates-unconfirmed.test.js
//
// P0 date reliability PR-3 (2026-10-16): the event detail page and its Add to Calendar export must not present an
// unclassified multiday range as daily availability. Extracts the real shipped functions from event-template.html.
//   - heading text keeps the range and appends " · days not confirmed" for unverified rows only
//   - an unverified row has no Add to Calendar controls (option B, 2026-10-17); Share stays
//   - confirmed rows (single date, overnight night, classified) export exactly as before
// Run: node test/event-template-dates-unconfirmed.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/event-template.html`, "utf8");
const grab = (re, label) => { const m = html.match(re); if (!m) throw new Error(label + " not found"); return m[0]; };

global.window = { location: { href: "https://313.events/event.html?id=x" } };
global.EventDates = require(`${REPO_DIR}/event-dates.js`);
const src = [
  grab(/function safeUrl\([\s\S]*?\n\}\n/, "safeUrl"),
  grab(/function shouldShowSource\([\s\S]*?\n\}\n/, "shouldShowSource"),
  grab(/function truncateText\([\s\S]*?\n\}\n/, "truncateText"),
  grab(/function parseTimeRange\([\s\S]*?\n\}\n/, "parseTimeRange"),
  grab(/function detroitNow\([\s\S]*?\n\}\n/, "detroitNow"),
  grab(/function detroitTodayIso\([^\n]*\n/, "detroitTodayIso"),
  grab(/function isoPlusOneDay\([\s\S]*?\n\}\n/, "isoPlusOneDay"),
  grab(/function occurrenceEnded\([\s\S]*?\n\}\n/, "occurrenceEnded"),
  grab(/function calendarExportAvailable\([\s\S]*?\n\}\n/, "calendarExportAvailable"),
  grab(/function occurrenceDays\([\s\S]*?\n\}\n/, "occurrenceDays"),
  grab(/function nextOccurrence\([\s\S]*?\n\}\n/, "nextOccurrence"),
  grab(/function upcomingOccurrences\([\s\S]*?\n\}\n/, "upcomingOccurrences"),
  grab(/function pad2\([^\n]*\n/, "pad2"),
  grab(/function isDatesUnconfirmed\([\s\S]*?\n\}\n/, "isDatesUnconfirmed"),
  grab(/function eventDateTimeParts\([\s\S]*?\n\}\n/, "eventDateTimeParts"),
  grab(/function buildEventDescription\([\s\S]*?\n\}\n/, "buildEventDescription"),
].join("\n");
// eslint-disable-next-line no-new-func
// "Now" is pinned to Fri Oct 16 2026 12:00 Detroit so the occurrence helpers are deterministic.
const RealDate = Date;
let NOW = "2026-10-16T16:00:00Z";
const at = (iso) => { NOW = iso; };
class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } }
const F = new Function("Date", `${src}\nreturn { isDatesUnconfirmed, eventDateTimeParts, buildEventDescription, nextOccurrence, upcomingOccurrences, calendarExportAvailable };`)(FakeDate);

const ev = (o) => Object.assign({ date: "2026-10-01", endDate: "2026-10-31", time: "9:00 AM", dateSemantics: null, occurrenceDates: null, source: "Manual" }, o);

// 1. Cider-shaped row: unclassified month range with a start time is unverified, and has no calendar export at all
// (owner decision 2026-10-17, option B): neither a span over the stored range nor a substituted day.
const cider = ev({});
assert.strictEqual(F.isDatesUnconfirmed(cider), true);
assert.ok(!/Dates not confirmed/.test(F.buildEventDescription(cider)), "the export-only description line is gone with the export");
const actionsSrc = grab(/Dates not confirmed \(owner decision 2026-10-17[\s\S]*?id="evtShareBtn"/, "actions block");
const guard = actionsSrc.match(/if\(calendarExportAvailable\(e\)\)\{([\s\S]*?)\n  \}\n/);
assert.ok(guard, "calendar buttons sit inside a calendarExportAvailable(e) guard");
assert.ok(/buildGoogleCalUrl\(e\)/.test(guard[1]) && /buildICS\(e\)/.test(guard[1]), "both Google and Apple/Outlook are inside the guard");
assert.ok(!/buildGoogleCalUrl|buildICS/.test(actionsSrc.replace(guard[0], "")), "nothing outside the guard builds a calendar link");
assert.ok(/id="evtShareBtn"/.test(actionsSrc.slice(actionsSrc.indexOf(guard[0]) + guard[0].length)), "Share is outside the guard and always rendered");
assert.ok(html.indexOf("if(L.primary) actionsHtml += linkBtn(L.primary") !== -1 && html.indexOf("if(L.primary) actionsHtml += linkBtn(L.primary") < html.indexOf(guard[0]), "Tickets is built before, and outside, the guard");
assert.ok(/function calendarExportAvailable\(e\)\{\s*if\(isDatesUnconfirmed\(e\)\) return false;/.test(html), "unverified dates never offer a calendar export");
console.log("PASS: unverified rows get no Add to Calendar controls; Share and Tickets stay");

// 2. Confirmed rows are untouched.
const single = ev({ date: "2026-10-17", endDate: "2026-10-17", time: "7:30 PM" });
assert.strictEqual(F.isDatesUnconfirmed(single), false);
assert.deepStrictEqual(F.eventDateTimeParts(single), { allDay: false, startDate: "20261017", startTime: "193000", endDate: "20261017", endTime: "213000" });
assert.ok(!/Dates not confirmed/.test(F.buildEventDescription(single)));
const overnight = ev({ date: "2026-10-16", endDate: "2026-10-17", time: "10:00 PM–2:00 AM" });
assert.strictEqual(F.isDatesUnconfirmed(overnight), false);
assert.deepStrictEqual(F.eventDateTimeParts(overnight), { allDay: false, startDate: "20261016", startTime: "220000", endDate: "20261017", endTime: "020000" });
const weekend = ev({ dateSemantics: "recurring", occurrenceDates: ["2026-10-17", "2026-10-18"] });
assert.strictEqual(F.isDatesUnconfirmed(weekend), false);
const cont = ev({ dateSemantics: "continuous" });
assert.strictEqual(F.isDatesUnconfirmed(cont), false);
assert.deepStrictEqual(F.eventDateTimeParts(ev({ dateSemantics: "continuous", time: null })), { allDay: true, startDate: "20261001", endDate: "20261101" }, "continuous keeps its calendar export over its range");
const recNoDates = ev({ dateSemantics: "recurring", occurrenceDates: null });
assert.strictEqual(F.isDatesUnconfirmed(recNoDates), true, "recurring without dates is unverified");
console.log("PASS: single-date, overnight, recurring-with-dates and continuous rows are not marked and export as before");

// 3. Source-level guards: the page selects the two columns, loads the shared rule, and annotates the heading.
assert.ok(/select=[^`]*date_semantics,occurrence_dates/.test(html), "main query selects date_semantics and occurrence_dates");
assert.ok(html.indexOf('/event-dates.js') !== -1 && html.indexOf('/event-dates.js') < html.indexOf("function isDatesUnconfirmed"), "event-dates.js is loaded before use");
assert.ok(/isDatesUnconfirmed\(e\)\?' · days not confirmed'/.test(html), "heading appends 'days not confirmed' for unverified rows only");
assert.ok(/e\.time && !isDatesUnconfirmed\(e\)\?/.test(html), "heading omits the stored hours for unverified rows (#151)");
assert.ok(!/recurrence_evidence/.test(html), "recurrence_evidence is never selected");
console.log("PASS: page selects the schedule columns, loads the shared rule, annotates the heading");

// 4. #151: occurrence-dated rows export their next evidenced occurrence, not the stored first day.
const cider2 = ev({ date: "2026-10-11", endDate: "2026-10-18", time: "1:00 PM\u20135:00 PM", dateSemantics: "recurring", occurrenceDates: ["2026-10-17", "2026-10-18"] });
assert.strictEqual(F.nextOccurrence(cider2), "2026-10-17");
assert.deepStrictEqual(F.eventDateTimeParts(cider2), { allDay: false, startDate: "20261017", startTime: "130000", endDate: "20261017", endTime: "170000" }, "Cider exports Oct 17 1-5 PM, not Oct 11");
assert.ok(/Also on: Oct 18/.test(F.buildEventDescription(cider2)), "the other upcoming date is named in the description");
const harvest = ev({ date: "2026-10-03", endDate: "2026-10-31", time: "10:00 AM", dateSemantics: "recurring", occurrenceDates: ["2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18", "2026-10-24", "2026-10-25", "2026-10-31"] });
assert.deepStrictEqual(F.upcomingOccurrences(harvest), ["2026-10-17", "2026-10-18", "2026-10-24", "2026-10-25", "2026-10-31"], "past occurrences are dropped");
const done = ev({ date: "2026-09-01", endDate: "2026-09-30", dateSemantics: "recurring", occurrenceDates: ["2026-09-05", "2026-09-06"] });
assert.strictEqual(F.nextOccurrence(done), "2026-09-06", "all past: the last evidenced occurrence");
assert.strictEqual(F.nextOccurrence(single), null, "single-date and unverified rows are untouched");
assert.strictEqual(F.nextOccurrence(cont), null);
assert.deepStrictEqual(F.eventDateTimeParts(single), { allDay: false, startDate: "20261017", startTime: "193000", endDate: "20261017", endTime: "213000" });
assert.ok(/dateRangeLabel[\s\S]{0,400}upcomingOccurrences\(e\)/.test(html), "the date label shows the occurrence dates");
console.log("PASS: occurrence-dated rows show and export their next evidenced occurrence; others unchanged");

// 5. All-past correction (owner decision 2026-10-17): verified occurrence dates that have all ended offer no calendar
// export. "Now" is pinned per case; all instants are UTC, the rule reads America/Detroit.
{
  const rec = (dates, time) => ev({ date: dates[0], endDate: dates[dates.length - 1], time, dateSemantics: "recurring", occurrenceDates: dates });
  const avail = (e, when) => { at(when); return F.calendarExportAvailable(e); };

  // 5.1 final verified occurrence in the future: available, exports the next one.
  const future = rec(["2026-10-03", "2026-10-04", "2026-10-24"], "1:00 PM");
  assert.strictEqual(avail(future, "2026-10-16T16:00:00Z"), true);
  assert.strictEqual(F.nextOccurrence(future), "2026-10-24", "5.4 past and future dates: the next verified future occurrence");
  assert.strictEqual(F.eventDateTimeParts(future).startDate, "20261024");

  // 5.2 final occurrence is today: respect the stated end time (EDT, UTC-4).
  const today = rec(["2026-10-17"], "1:00 PM\u20135:00 PM");
  assert.strictEqual(avail(today, "2026-10-17T20:59:00Z"), true, "4:59 PM Detroit: still running");
  assert.strictEqual(avail(today, "2026-10-17T21:00:00Z"), false, "5:00 PM Detroit: ended");
  const night = rec(["2026-10-17"], "10:00 PM\u20132:00 AM");
  assert.strictEqual(avail(night, "2026-10-18T03:00:00Z"), true, "11:00 PM Oct 17: running");
  assert.strictEqual(avail(night, "2026-10-18T05:59:00Z"), true, "1:59 AM Oct 18: overnight still running");
  assert.strictEqual(avail(night, "2026-10-18T06:00:00Z"), false, "2:00 AM Oct 18: ended");
  const startOnly = rec(["2026-10-17"], "6:00 PM");
  assert.strictEqual(avail(startOnly, "2026-10-18T03:59:00Z"), true, "no stated end: the whole day counts, 11:59 PM Detroit");
  assert.strictEqual(avail(startOnly, "2026-10-18T04:00:00Z"), false, "midnight Detroit: ended");

  // 5.3 every verified occurrence has ended: no export (Greenfield: last date Oct 25, checked on Oct 26).
  const greenfield = rec(["2026-10-10", "2026-10-24", "2026-10-25"], "6:00 PM");
  assert.strictEqual(avail(greenfield, "2026-10-26T03:59:00Z"), true, "11:59 PM Oct 25 Detroit");
  assert.strictEqual(avail(greenfield, "2026-10-26T04:00:00Z"), false, "Oct 26 00:00 Detroit");
  const cider = rec(["2026-10-17", "2026-10-18"], "1:00 PM");
  assert.strictEqual(avail(cider, "2026-10-19T16:00:00Z"), false, "Cider on a simulated Oct 19");

  // 5.5 unverified dates stay hidden, and non-recurring rows are unaffected by the new rule.
  assert.strictEqual(avail(ev({}), "2026-10-16T16:00:00Z"), false, "unverified range: hidden");
  assert.strictEqual(avail(ev({ date: "2026-10-01", endDate: "2026-10-01", time: "7:30 PM" }), "2026-10-20T16:00:00Z"), true, "single-day: unchanged");
  assert.strictEqual(avail(ev({ dateSemantics: "continuous" }), "2026-10-16T16:00:00Z"), true, "continuous: unchanged");
  assert.strictEqual(avail(ev({ date: "2026-10-16", endDate: "2026-10-17", time: "10:00 PM\u20132:00 AM" }), "2026-10-16T16:00:00Z"), true, "overnight single night: unchanged");

  // 5.7 Detroit midnight and daylight-saving boundaries.
  const dstEnd = rec(["2026-11-01"], "6:00 PM"); // fall back Nov 1 2026 02:00 EDT -> 01:00 EST
  assert.strictEqual(avail(dstEnd, "2026-11-02T04:59:00Z"), true, "11:59 PM Nov 1 EST (UTC-5)");
  assert.strictEqual(avail(dstEnd, "2026-11-02T05:00:00Z"), false, "midnight Nov 2 EST, not 04:00Z");
  const dstStart = rec(["2027-03-13"], "7:00 PM"); // spring forward Mar 14 2027
  assert.strictEqual(avail(dstStart, "2027-03-14T04:59:00Z"), true, "11:59 PM Mar 13 EST (UTC-5)");
  assert.strictEqual(avail(dstStart, "2027-03-14T05:00:00Z"), false, "midnight Mar 14");
  const dstDay = rec(["2027-03-14"], "6:00 PM\u201311:00 PM");
  assert.strictEqual(avail(dstDay, "2027-03-15T02:59:00Z"), true, "10:59 PM Mar 14 EDT (UTC-4)");
  assert.strictEqual(avail(dstDay, "2027-03-15T03:00:00Z"), false, "11:00 PM Mar 14 EDT");
  at("2026-10-16T16:00:00Z");
}
console.log("PASS: calendar export is hidden once every verified occurrence has ended (Detroit time, end times, overnight, DST)");
