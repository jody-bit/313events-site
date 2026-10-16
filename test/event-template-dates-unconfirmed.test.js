// test/event-template-dates-unconfirmed.test.js
//
// P0 date reliability PR-3 (2026-10-16): the event detail page and its Add to Calendar export must not present an
// unclassified multiday range as daily availability. Extracts the real shipped functions from event-template.html.
//   - heading text keeps the range and appends " · days not confirmed" for unverified rows only
//   - Add to Calendar for an unverified row is an all-day entry over the published range (no invented hours),
//     with a DESCRIPTION line "Dates not confirmed ..."
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
  grab(/function pad2\([^\n]*\n/, "pad2"),
  grab(/function isDatesUnconfirmed\([\s\S]*?\n\}\n/, "isDatesUnconfirmed"),
  grab(/function eventDateTimeParts\([\s\S]*?\n\}\n/, "eventDateTimeParts"),
  grab(/function buildEventDescription\([\s\S]*?\n\}\n/, "buildEventDescription"),
].join("\n");
// eslint-disable-next-line no-new-func
const F = new Function(`${src}\nreturn { isDatesUnconfirmed, eventDateTimeParts, buildEventDescription };`)();

const ev = (o) => Object.assign({ date: "2026-10-01", endDate: "2026-10-31", time: "9:00 AM", dateSemantics: null, occurrenceDates: null, source: "Manual" }, o);

// 1. Cider-shaped row: unclassified month range with a start time.
const cider = ev({});
assert.strictEqual(F.isDatesUnconfirmed(cider), true);
const p = F.eventDateTimeParts(cider);
assert.deepStrictEqual(p, { allDay: true, startDate: "20261001", endDate: "20261101" }, "all-day over the published range (DTEND exclusive), no invented hours");
assert.ok(/^Dates not confirmed/.test(F.buildEventDescription(cider)), "DESCRIPTION says so");
console.log("PASS: unverified range exports all-day over the published range with a Dates-not-confirmed description line");

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
const recNoDates = ev({ dateSemantics: "recurring", occurrenceDates: null });
assert.strictEqual(F.isDatesUnconfirmed(recNoDates), true, "recurring without dates is unverified");
console.log("PASS: single-date, overnight, recurring-with-dates and continuous rows are not marked and export as before");

// 3. Source-level guards: the page selects the two columns, loads the shared rule, and annotates the heading.
assert.ok(/select=[^`]*date_semantics,occurrence_dates/.test(html), "main query selects date_semantics and occurrence_dates");
assert.ok(html.indexOf('/event-dates.js') !== -1 && html.indexOf('/event-dates.js') < html.indexOf("function isDatesUnconfirmed"), "event-dates.js is loaded before use");
assert.ok(/isDatesUnconfirmed\(e\)\?' · days not confirmed'/.test(html), "heading appends 'days not confirmed' for unverified rows only");
assert.ok(!/recurrence_evidence/.test(html), "recurrence_evidence is never selected");
console.log("PASS: page selects the schedule columns, loads the shared rule, annotates the heading");
