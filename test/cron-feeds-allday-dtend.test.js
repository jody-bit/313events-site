// test/cron-feeds-allday-dtend.test.js
//
// RFC 5545 s3.6.1: when DTSTART/DTEND are VALUE=DATE, DTEND is EXCLUSIVE -- a
// one-day event on Oct 12 is DTSTART=20261012, DTEND=20261013. api/cron-feeds.js
// used to store DTEND as the span's last day, so every all-day event ran a day
// too long and every one-day event looked like a two-day one (found with the
// City of Lathrup Village feed: "City Hall - CLOSED" 10/12 stored as 10/12-10/13).
// The row's end_date is now the LAST day of the span, and null for a one-day event.
//
// Run: node test/cron-feeds-allday-dtend.test.js
"use strict";
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ics-location.js`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });

const FEED = { id: "fs-dtend", venue_name: "City of Test", default_category: "community", feed_url: "https://feed.example/cal.ics", feed_format: "ics", status: "approved", location_per_event: false };

async function rowFor(lines) {
  const icsText = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:u1", ...lines, "SUMMARY:Test", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  let captured = null;
  global.fetch = async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => [FEED] };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
    if (url === FEED.feed_url) return { ok: true, status: 200, text: async () => icsText };
    if (url.includes("/rest/v1/events") && opts.method === "POST") { captured = JSON.parse(opts.body); return strictWriteResponse(url, opts); }
    if (url.includes("/rest/v1/feed_sources") && opts.method === "PATCH") return { ok: true, status: 204 };
    throw new Error("unmocked URL: " + url);
  };
  const res = makeRes();
  await freshHandler()({ headers: {} }, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(captured.length, 1);
  return captured[0];
}

async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  const cases = [
    ["one-day (DTEND = next day) has no end_date", ["DTSTART;VALUE=DATE:20261012", "DTEND;VALUE=DATE:20261013"], { start: "2026-10-12", end: null, allDay: true }],
    ["no DTEND at all has no end_date", ["DTSTART;VALUE=DATE:20261012"], { start: "2026-10-12", end: null, allDay: true }],
    ["two-day span ends on its second day", ["DTSTART;VALUE=DATE:20261126", "DTEND;VALUE=DATE:20261128"], { start: "2026-11-26", end: "2026-11-27", allDay: true }],
    ["multi-day span ends the day before DTEND", ["DTSTART;VALUE=DATE:20261002", "DTEND;VALUE=DATE:20261009"], { start: "2026-10-02", end: "2026-10-08", allDay: true }],
    ["crossing a month boundary", ["DTSTART;VALUE=DATE:20261030", "DTEND;VALUE=DATE:20261102"], { start: "2026-10-30", end: "2026-11-01", allDay: true }],
    ["DTEND on the 1st of a month", ["DTSTART;VALUE=DATE:20261030", "DTEND;VALUE=DATE:20261101"], { start: "2026-10-30", end: "2026-10-31", allDay: true }],
    ["crossing a year boundary (Lathrup 12/31 closure)", ["DTSTART;VALUE=DATE:20261231", "DTEND;VALUE=DATE:20270102"], { start: "2026-12-31", end: "2027-01-01", allDay: true }],
    ["one-day event on Dec 31 (DTEND Jan 1)", ["DTSTART;VALUE=DATE:20261231", "DTEND;VALUE=DATE:20270101"], { start: "2026-12-31", end: null, allDay: true }],
    ["leap day", ["DTSTART;VALUE=DATE:20280228", "DTEND;VALUE=DATE:20280301"], { start: "2028-02-28", end: "2028-02-29", allDay: true }],
    ["bad data: DTEND equal to DTSTART is a one-day event", ["DTSTART;VALUE=DATE:20261012", "DTEND;VALUE=DATE:20261012"], { start: "2026-10-12", end: null, allDay: true }],
    ["bad data: DTEND before DTSTART is a one-day event", ["DTSTART;VALUE=DATE:20261012", "DTEND;VALUE=DATE:20261010"], { start: "2026-10-12", end: null, allDay: true }],
    ["timed event, TZID: no end_date, time kept", ["DTSTART;TZID=America/New_York:20261013T180000", "DTEND;TZID=America/New_York:20261013T190000"], { start: "2026-10-13", end: null, allDay: false, time: "6:00 PM – 7:00 PM" }],
    ["timed event, floating local time: unchanged", ["DTSTART:20261019T193000", "DTEND:20261019T210000"], { start: "2026-10-19", end: null, allDay: false, time: "7:30 PM – 9:00 PM" }],
    ["timed event, UTC: converted to Detroit, unchanged", ["DTSTART:20261015T230000Z", "DTEND:20261016T010000Z"], { start: "2026-10-15", end: null, allDay: false, time: "7:00 PM – 9:00 PM" }],
    ["timed event ending after midnight: no end_date", ["DTSTART;TZID=America/New_York:20261031T220000", "DTEND;TZID=America/New_York:20261101T020000"], { start: "2026-10-31", end: null, allDay: false, time: "10:00 PM" }],
    ["date-only start with a timed DTEND keeps that day", ["DTSTART;VALUE=DATE:20261012", "DTEND:20261014T120000"], { start: "2026-10-12", end: "2026-10-14", allDay: true }],
  ];
  for (const [name, lines, want] of cases) {
    const r = await rowFor(lines);
    assert.strictEqual(r.start_date, want.start, `${name}: start_date`);
    assert.strictEqual(r.end_date, want.end, `${name}: end_date`);
    assert.strictEqual(r.is_all_day, want.allDay, `${name}: is_all_day`);
    if (want.allDay) assert.strictEqual(r.time_display, null, `${name}: an all-day event never gets a time`);
    if (want.time) assert.strictEqual(r.time_display, want.time, `${name}: time_display`);
    console.log("PASS:", name);
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
