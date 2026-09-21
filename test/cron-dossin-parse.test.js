// Plain-Node regression test, no framework/dependency (consistent with this
// project's own "no test infra exists yet" state — see BACKLOG.md's ID
// scheme doc and WP 0.11's planned test/notes/ location). Run directly:
//   node test/cron-dossin-parse.test.js
//
// Covers BUG-002 (2026-09-21 production incident): the live site currently
// splits an event's start date/time and its end time across two separate
// lines ("September 19, 2026, 10:00am" then "- 2:00pm" on the next line)
// instead of one combined line. This fixture mirrors that real structure
// (captured live during the incident's triage), plus the old single-line
// combined shape for backward compatibility, plus malformed-date cases that
// must be skipped rather than turned into bad rows.

const assert = require("node:assert");
const { parseDossinEvents } = require("../api/cron-dossin.js");

const FIXTURE_HTML = `
<div>Wayne County History Project - Exhibition 6 Opening</div>
<div>Guardian Building</div>
<div>September 19, 2026, 10:00am</div>
<div>- 2:00pm</div>
<div>Learn More</div>

<div>Guided tour</div>
<div>Dossin Great Lakes Museum</div>
<div>September 19, 2026, 11:00am</div>
<div>- 12:30pm</div>
<div>Learn More</div>

<div>Old-Format Combined Event</div>
<div>Dossin Great Lakes Museum</div>
<div>October 5, 2026, 2:00pm - 4:00pm</div>
<div>Learn More</div>

<div>All Day Placeholder Event</div>
<div>Dossin Great Lakes Museum</div>
<div>November 1, 2026</div>
<div>Learn More</div>

<div>Malformed Month Event</div>
<div>Dossin Great Lakes Museum</div>
<div>Blorptember 12, 2026, 10:00am</div>
<div>- 11:00am</div>

<div>Out Of Range Day Event</div>
<div>Dossin Great Lakes Museum</div>
<div>September 45, 2026, 10:00am</div>
<div>- 11:00am</div>
`;

const events = parseDossinEvents(FIXTURE_HTML);

// 1. Not-Dossin venue ("Guardian Building") must be excluded.
assert.ok(
  !events.some((e) => e.title.includes("Wayne County")),
  "a non-Dossin venue event must not be included"
);

// 2. Today's real split-line shape: start on one line, "- endtime" on the
// next — this is the actual defect being fixed.
const guidedTour = events.find((e) => e.title === "Guided tour");
assert.ok(guidedTour, "split-line date/end-time event must parse");
assert.strictEqual(guidedTour.date, "2026-09-19", "split-line event start date");
assert.strictEqual(guidedTour.time, "11:00am – 12:30pm", "split-line event time range");

// 3. Old single-line combined shape must still work (backward compatible).
const combined = events.find((e) => e.title === "Old-Format Combined Event");
assert.ok(combined, "single-line combined date/time event must still parse");
assert.strictEqual(combined.date, "2026-10-05");
assert.strictEqual(combined.time, "2:00pm – 4:00pm");

// 4. Date-only (no time at all) must still work.
const allDay = events.find((e) => e.title === "All Day Placeholder Event");
assert.ok(allDay, "date-only event must still parse");
assert.strictEqual(allDay.date, "2026-11-01");
assert.strictEqual(allDay.time, null);

// 5. Malformed month name must be skipped, not turned into a bad event.
assert.ok(
  !events.some((e) => e.title === "Malformed Month Event"),
  "an unrecognized month name must not produce an event"
);

// 6. Out-of-range day (45) must be skipped, not turned into a bad event.
assert.ok(
  !events.some((e) => e.title === "Out Of Range Day Event"),
  "an out-of-range day must not produce an event"
);

// 7. Exactly the two genuinely valid Dossin events plus the two backward-
// compatible/edge-case-but-valid ones should have parsed — nothing extra.
assert.strictEqual(events.length, 3, `expected 3 valid events, got ${events.length}: ${JSON.stringify(events)}`);

console.log("PASS — all cron-dossin.js parseDossinEvents assertions passed (" + events.length + " valid events parsed).");
