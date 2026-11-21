// test/cron-ticketmaster-time-safeguard.test.js — Ticketmaster never writes a placeholder time.
//
// WHY (owner GO 2026-10-21): when Ticketmaster has no localTime the connector wrote "Evening", a time of day the
// source never stated, and because the upsert merges on external_id it also overwrote any time already stored or
// corrected on the row (18 upcoming rows carry the placeholder; 13 have official team-schedule times).
//
// THE RULE
//   Ticketmaster has a localTime   time_display is written as before ("7:30 PM")
//   Ticketmaster has no localTime  the time_display key is OMITTED: a new row stores NULL, a stored row keeps its value
//   Dates are untouched by this change: start_date still follows Ticketmaster's localDate.
//
// WHAT THIS SHOWS, with the connector's real handler against the fake database that refuses mixed-key batches:
//   1. shapeForDb: stated times still format, no-time events carry no key and never "Evening"
//   2. an existing verified/corrected time survives a run where Ticketmaster has no time
//   3. a new event with an unknown time is stored with NULL (no invented time)
//   4. a mixed batch (new/stored x timed/untimed) is written as uniform requests and every row lands
//   5. a time Ticketmaster does supply still refreshes a stored time; no row anywhere holds "Evening"
//   6. start_date is unchanged by the safeguard (date follows Ticketmaster, no row shifted)
//
// Plain Node assert, no dependencies.
// Run: node test/cron-ticketmaster-time-safeguard.test.js
"use strict";
const assert = require("assert");
const { shapeForDb } = require("../api/cron-ticketmaster.js");
const {
  world, json, runConnector, eventWrites, sentRows, sentRow, byId, assertHeterogeneousAndNowWritten,
} = require("./fixtures/connector-harness.js");

const TM_URL = "https://app.ticketmaster.com/discovery/v2/events.json";
const hasKey = (row, key) => Object.prototype.hasOwnProperty.call(row, key);

const tmEvent = (id, name, start) => ({
  id, name, url: `https://www.ticketmaster.com/event/${id}`,
  classifications: [{ segment: { name: "Sports" }, genre: { name: "Football" } }],
  dates: { start, status: { code: "onsale" } },
  images: [{ ratio: "16_9", url: `https://s1.ticketm.net/dam/a/${id}.jpg`, width: 1024, height: 576 }],
  priceRanges: [{ min: 20, max: 60 }],
  _embedded: { venues: [{ name: "Fixture Stadium", city: { name: "Detroit" }, address: { line1: "1 Main St" }, location: { latitude: "42.3387", longitude: "-83.0524" } }] },
});
const stored = (id, extra) => ({
  id: `row-${id}`, external_id: id, title: "stored title", category: "sports", start_date: "2026-11-07", status: "approved",
  source: "Ticketmaster", time_display: null, description: null, description_source: null, ...extra,
});
const upstreamOf = (events) => (url) => (url.startsWith(TM_URL) ? json({ _embedded: { events }, page: { totalPages: 1 } }) : null);

async function run() {
  // 1. shapeForDb
  {
    const timed = shapeForDb(tmEvent("u-1", "Timed", { localDate: "2026-11-07", localTime: "19:30:00" }), new Map());
    assert.strictEqual(timed.time_display, "7:30 PM", "a stated time is still written");
    assert.strictEqual(shapeForDb(tmEvent("u-2", "Noon", { localDate: "2026-11-07", localTime: "12:00:00" }), new Map()).time_display, "12:00 PM");
    const tba = shapeForDb(tmEvent("u-3", "No time", { localDate: "2026-11-07" }), new Map());
    assert.ok(tba, "an event without a time is still shaped");
    assert.strictEqual(hasKey(tba, "time_display"), false, "no time_display key when Ticketmaster has no localTime");
    assert.strictEqual(tba.start_date, "2026-11-07", "the date is untouched");
  }
  console.log("PASS: shapeForDb formats stated times and sends no time_display key (never 'Evening') when there is none");

  // 2 + 3. one stored row with a corrected time and TM silent; one new event with no time
  {
    const events = [
      tmEvent("old-corrected", "Corrected Game", { localDate: "2026-11-07" }),
      tmEvent("new-untimed", "New Untimed Game", { localDate: "2026-11-14" }),
    ];
    const { tables, db } = world({ events: [stored("old-corrected", { time_display: "12:00 PM" })], upstream: upstreamOf(events) });
    const res = await runConnector("cron-ticketmaster.js");
    assert.deepStrictEqual([res._status, res._body.upserted], [200, 2]);
    assert.strictEqual(sentRow(db, "old-corrected"), undefined, "a stored row is not sent in an upsert at all (field protection)");
    assert.strictEqual(byId(tables, "old-corrected").time_display, "12:00 PM", "an existing verified time survives a run where Ticketmaster has no time");
    assert.strictEqual(byId(tables, "new-untimed").time_display, null, "a new event with an unknown time is stored with NULL, no invented time");
    assert.ok(tables.events.every((r) => r.time_display !== "Evening"), "no row holds the Evening placeholder");
  }
  console.log("PASS: a stored corrected time survives a no-time run; a new unknown-time event stores NULL");

  // 4 + 5 + 6. mixed batch: new/stored x timed/untimed
  {
    const events = [
      tmEvent("m-new-timed", "New Timed", { localDate: "2026-11-10", localTime: "19:00:00" }),
      tmEvent("m-new-untimed", "New Untimed", { localDate: "2026-11-11" }),
      tmEvent("m-old-timed", "Old Timed", { localDate: "2026-11-12", localTime: "18:30:00" }),
      tmEvent("m-old-untimed-null", "Old Untimed Null", { localDate: "2026-11-13" }),
      tmEvent("m-old-untimed-corrected", "Old Untimed Corrected", { localDate: "2026-11-14" }),
      tmEvent("m-old-untimed-legacy", "Old Untimed Legacy", { localDate: "2026-11-15" }),
    ];
    const { tables, db } = world({
      events: [
        stored("m-old-timed", { time_display: "8:00 PM", start_date: "2026-11-12" }),
        stored("m-old-untimed-null", { start_date: "2026-11-13" }),
        stored("m-old-untimed-corrected", { time_display: "7:00 PM", start_date: "2026-11-14" }),
        stored("m-old-untimed-legacy", { time_display: "Evening", start_date: "2026-11-15" }),
      ],
      upstream: upstreamOf(events),
    });
    const res = await runConnector("cron-ticketmaster.js");
    assert.strictEqual(res._status, 200);
    // Field protection (#207): only the two NEW events are upserted; the four stored rows are never sent, so no stored time, date or placeholder changes.
    const sent = sentRows(db);
    assert.deepStrictEqual(sent.map((r) => r.external_id).sort(), ["m-new-timed", "m-new-untimed"], "only new events are upserted");
    assert.strictEqual(tables.events.length, 6, "two inserted, four stored rows untouched, no duplicates");
    assert.strictEqual(byId(tables, "m-new-timed").time_display, "7:00 PM");
    assert.strictEqual(byId(tables, "m-new-untimed").time_display, null, "no invented start time for a new untimed event");
    assert.strictEqual(byId(tables, "m-old-timed").time_display, "8:00 PM", "a stored time is not refreshed from Ticketmaster (differences show in the dry run)");
    assert.strictEqual(byId(tables, "m-old-untimed-null").time_display, null, "a stored NULL stays NULL");
    assert.strictEqual(byId(tables, "m-old-untimed-corrected").time_display, "7:00 PM", "a corrected time is kept");
    assert.strictEqual(byId(tables, "m-old-untimed-legacy").time_display, "Evening", "a legacy placeholder is left for the guarded correction, not silently rewritten");
    for (const id of ["m-old-timed", "m-old-untimed-null", "m-old-untimed-corrected", "m-old-untimed-legacy"]) {
      assert.strictEqual(byId(tables, id).id, `row-${id}`, `${id} untouched`);
    }
    assert.strictEqual(byId(tables, "m-old-timed").start_date, "2026-11-12", "a stored date is not changed");
    assert.ok(sent.every((r) => r.time_display !== "Evening"), "no request carries the placeholder");
  }
  console.log("PASS: a mixed batch upserts only new events; stored times, dates and placeholders are untouched");

  console.log("\nAll Ticketmaster time-safeguard checks passed.");
}

run().catch((err) => { console.error(err); process.exit(1); });
