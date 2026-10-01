// test/cron-feeds-no-fixed-venue.test.js
//
// Regression guard for the 2026-10-01 fix wiring api/_lib/mobile-event.js's
// isLikelyNoFixedVenue() into api/cron-feeds.js's generic ICS pipeline
// (Needs Follow-up remaining-gap product pass). The helper itself already
// existed (migration_040_no_fixed_venue.sql, 2026-09-28) but was only ever
// called from api/cron-visitdetroit.js — every event ingested through
// cron-feeds.js (every self-service ICS/CivicPlus/Tribe feed) silently
// never got no_fixed_venue set at all, regardless of its title. Confirmed
// live: City of Northville's own "Northville High School Homecoming
// Parade" was stuck in Needs Follow-up under VENUE ADDRESS/CITY for a
// route description with no conventional street address — not because the
// existing "parade" keyword didn't match, but because this pipeline never
// called the function that checks it.
//
// Run: node test/cron-feeds-no-fixed-venue.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ics-location.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/mobile-event.js`)];
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

function icsFor(summary, uid) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
    `UID:${uid}`, "DTSTART:20261002T180000Z", `SUMMARY:${summary}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
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
    id: "fs-northville",
    venue_name: "City of Northville Events",
    default_category: "community",
    feed_url: "https://feed.example/cal.ics",
    feed_format: "ics",
    status: "approved",
    location_per_event: false,
  };

  // --- 1. The real Northville parade title must now set no_fixed_venue
  //     true, through this pipeline (not just through cron-visitdetroit.js). ---
  {
    const icsText = icsFor("Northville High School Homecoming Parade", "evt-parade");
    const rows = await runOne({ feedSources: [FEED], icsText });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].no_fixed_venue, true, "a real parade title must set no_fixed_venue true through cron-feeds.js");
  }
  console.log("PASS: a real parade-titled event gets no_fixed_venue=true through cron-feeds.js's generic pipeline");

  // --- 2. An ordinary single-venue event title must stay no_fixed_venue
  //     false — this wiring must not flip every event. ---
  {
    const icsText = icsFor("Fall Storytime at the Library", "evt-ordinary");
    const rows = await runOne({ feedSources: [FEED], icsText });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].no_fixed_venue, false);
  }
  console.log("PASS: an ordinary single-venue title stays no_fixed_venue=false");

  console.log("\nAll cron-feeds.js no_fixed_venue wiring tests passed.");
}

run().catch((err) => { console.error(err); process.exitCode = 1; });
