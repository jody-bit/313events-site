// test/cron-feeds-non-event-filter.test.js
//
// Regression guard for the 2026-10-01 fix wiring
// api/_lib/non-event-filter.js's isLikelyNotARealEvent() into
// api/cron-feeds.js's generic ICS pipeline (Needs Follow-up remaining-gap
// product pass, Jody: "if an event says 'closed to the public' ... we
// don't want that listing in the site AT ALL"). Confirmed real, live
// case: The Congregation's own feed publishes a literal "CLOSED FOR
// PRIVATE EVENT" entry, fully populated (venue, time, everything) — not
// an event the public can attend.
//
// Run: node test/cron-feeds-non-event-filter.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ics-location.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/mobile-event.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/non-event-filter.js`)];
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

function icsWithTwoEvents(titleA, titleB) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "BEGIN:VEVENT", "UID:evt-a", "DTSTART:20261004T090000Z", `SUMMARY:${titleA}`, "END:VEVENT",
    "BEGIN:VEVENT", "UID:evt-b", "DTSTART:20261005T190000Z", `SUMMARY:${titleB}`, "END:VEVENT",
    "END:VCALENDAR",
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

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  const FEED = {
    id: "fs-congregation",
    venue_name: "The Congregation",
    default_category: "nightlife",
    feed_url: "https://feed.example/cal.ics",
    feed_format: "ics",
    status: "approved",
    location_per_event: false,
  };

  const handler = freshHandler();
  global.fetch = baseMocks({
    feedSources: [FEED],
    icsText: icsWithTwoEvents("CLOSED FOR PRIVATE EVENT", "Donation Based Yoga"),
  });
  const res = makeRes();
  await handler({ headers: {} }, res);
  assert.strictEqual(res._status, 200);

  const rows = baseMocks._capturedUpsertBody;
  assert.strictEqual(rows.length, 1, "the CLOSED FOR PRIVATE EVENT entry must never be ingested at all");
  assert.strictEqual(rows[0].title, "Donation Based Yoga", "the real event in the same feed must still be ingested normally");
  console.log("PASS: a real \"CLOSED FOR PRIVATE EVENT\" feed entry is skipped entirely; the real event alongside it still ingests");

  console.log("\ncron-feeds-non-event-filter.test.js: all assertions passed");
}

run().catch((err) => { console.error(err); process.exitCode = 1; });
