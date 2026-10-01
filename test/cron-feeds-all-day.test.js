// test/cron-feeds-all-day.test.js
//
// Regression guard for the 2026-10-01 is_all_day bug fix (Needs Follow-up
// start-time investigation): icsEventsToRows() in api/cron-feeds.js never
// set is_all_day on the row it builds, so every event ever ingested
// through the generic ICS pipeline silently kept the events table's own
// `false` default, regardless of what the source's own DTSTART actually
// said. Confirmed live against real production events before this fix:
// City of Royal Oak's "Vermont/New Hampshire (Shoreline Tours)" and
// "Journey through Spain: Madrid to Barcelona" (both multi-day senior-
// center trips) and Mount Clemens Public Library's "Ask an Expert Coffee
// Hour" all publish "Time: All Day" on their own authoritative event
// pages (romi.gov / mtclib.org, both CivicPlus), yet all three landed in
// admin.html's Needs Follow-up queue under START TIME — not because no
// time exists to find, but because is_all_day was never reaching the row
// in the first place. parseIcsDate already correctly derives hour===null
// for a date-only (VALUE=DATE) DTSTART; this suite guards that signal
// actually reaching the row cron-feeds.js builds.
//
// Run: node test/cron-feeds-all-day.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ics-location.js`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// Builds one VEVENT with an explicit DTSTART/DTEND line (and optional
// VALUE=DATE param), so both the timed and all-day shapes can be tested
// with the same helper.
function icsFor({ summary, uid, dtstart, dtend }) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `UID:${uid}`, dtstart];
  if (dtend) lines.push(dtend);
  lines.push(`SUMMARY:${summary}`, "END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

function baseMocks({ feedSources, icsText }) {
  return async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => feedSources };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
    if (url === "https://feed.example/cal.ics") return { ok: true, status: 200, text: async () => icsText };
    if (url.includes("/rest/v1/events") && opts.method === "POST") {
      baseMocks._capturedUpsertBody = JSON.parse(opts.body);
      return { ok: true, status: 201, text: async () => "" };
    }
    throw new Error("unmocked URL: " + url);
  };
}

async function runOne({ feedSources, icsText }) {
  const handler = freshHandler();
  global.fetch = baseMocks({ feedSources, icsText });
  const res = makeRes();
  await handler({ headers: {} }, res);
  assert.strictEqual(res._status, 200, "handler should return 200 for a healthy poll");
  return baseMocks._capturedUpsertBody;
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  const FEED = {
    id: "fs-romi",
    venue_name: "City of Royal Oak",
    default_category: "community",
    feed_url: "https://feed.example/cal.ics",
    feed_format: "ics",
    status: "approved",
    location_per_event: false,
  };

  // --- 1. A single-day, date-only DTSTART (VALUE=DATE, no time component
  //     at all) — the real romi.gov/mtclib.org shape for "Time: All Day"
  //     events like "Ask an Expert Coffee Hour" — must set is_all_day:
  //     true and leave time_display null (never a guessed/invented time).
  {
    const icsText = icsFor({
      summary: "Ask an Expert Coffee Hour",
      uid: "evt-allday-single",
      dtstart: "DTSTART;VALUE=DATE:20261020",
    });
    const rows = await runOne({ feedSources: [FEED], icsText });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].is_all_day, true, "a VALUE=DATE DTSTART must set is_all_day true");
    assert.strictEqual(rows[0].time_display, null, "an all-day event must never get a guessed time_display");
  }
  console.log("PASS: a single-day VALUE=DATE DTSTART sets is_all_day true with no invented time");

  // --- 2. A multi-day, date-only DTSTART/DTEND span — the real romi.gov
  //     shape for "Vermont/New Hampshire (Shoreline Tours)" and "Journey
  //     through Spain" (both multi-day senior-center trips) — must also
  //     set is_all_day: true, and still populate end_date for the
  //     multi-day span (pre-existing end_date behavior, unaffected by
  //     this fix, re-asserted here so the two don't regress each other). ---
  {
    const icsText = icsFor({
      summary: "Vermont/New Hampshire (Shoreline Tours)",
      uid: "evt-allday-multiday",
      dtstart: "DTSTART;VALUE=DATE:20261002",
      dtend: "DTEND;VALUE=DATE:20261009",
    });
    const rows = await runOne({ feedSources: [FEED], icsText });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].is_all_day, true, "a multi-day VALUE=DATE span must also set is_all_day true");
    assert.strictEqual(rows[0].start_date, "2026-10-02");
    assert.strictEqual(rows[0].end_date, "2026-10-09", "multi-day end_date behavior must be unaffected by the is_all_day fix");
  }
  console.log("PASS: a multi-day VALUE=DATE span sets is_all_day true and keeps its existing end_date behavior");

  // --- 3. Regression guard: an ordinary timed DTSTART (the overwhelming
  //     majority of real events) must still get is_all_day: false and its
  //     normal time_display — this fix must not flip every event to
  //     all-day. ---
  {
    const icsText = icsFor({
      summary: "Evening Concert",
      uid: "evt-timed",
      dtstart: "DTSTART:20261015T190000Z",
    });
    const rows = await runOne({ feedSources: [FEED], icsText });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].is_all_day, false, "an ordinary timed DTSTART must stay is_all_day: false");
    assert.ok(rows[0].time_display, "an ordinary timed DTSTART must still get a real time_display");
  }
  console.log("PASS: an ordinary timed DTSTART is unaffected — stays is_all_day: false with its normal time_display");

  console.log("All cron-feeds.js is_all_day tests passed.");
}

run();
