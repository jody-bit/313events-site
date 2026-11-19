// test/cron-feeds-range-preservation.test.js
//
// MC-RANGE for the city-feed importer (api/cron-feeds.js). Royal Oak Market: the city feed's header/DTSTART says
// Nov 20-21 while the organizer (The Guild) evidences Nov 19-20. A refresh carrying Nov 20-21 must keep the stored,
// evidenced range Nov 19-20. Unclassified rows and new rows still take the feed's dates.
//
// Run: node test/cron-feeds-range-preservation.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2026-11-18T12:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ics-location.js`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
function makeRes() { return { _status: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } }; }
const ics = () => ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:royal-oak-market", "DTSTART;VALUE=DATE:20261120", "DTEND;VALUE=DATE:20261122", "SUMMARY:Art Fair Edition", "END:VEVENT", "END:VCALENDAR"].join("\r\n");

// storedExtra: fields of the stored row (null = no stored row). Returns the written start/end.
async function written(storedExtra) {
  let body = null;
  const feed = { id: "fs-1", venue_name: "City", default_category: "community", feed_url: "https://feed.example/cal.ics", feed_format: "ics", status: "approved", location_per_event: false };
  global.fetch = async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => [feed] };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) {
      if (!storedExtra) return { ok: true, status: 200, json: async () => [] };
      const m = /external_id=in\.\(([^)]*)\)/.exec(url);
      const ids = m ? m[1].split(",").map(decodeURIComponent) : [];
      return { ok: true, status: 200, json: async () => ids.map((id) => ({ external_id: id, status: "approved", source: "City", title: "Art Fair Edition", ...storedExtra })) };
    }
    if (url === "https://feed.example/cal.ics") return { ok: true, status: 200, text: async () => ics() };
    if (url.includes("/rest/v1/events") && opts.method === "POST") { body = JSON.parse(opts.body); return strictWriteResponse(url, opts); }
    throw new Error("unmocked URL: " + url);
  };
  const res = makeRes();
  await freshHandler()({ headers: {} }, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(body.length, 1);
  return [body[0].start_date, body[0].end_date];
}

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  assert.deepStrictEqual(await written(null), ["2026-11-20", "2026-11-21"], "a new row takes the feed's dates");
  assert.deepStrictEqual(await written({ start_date: "2026-11-20", end_date: null }), ["2026-11-20", "2026-11-21"], "an unclassified stored row takes the feed's dates");
  assert.deepStrictEqual(
    await written({ start_date: "2026-11-19", end_date: "2026-11-20", date_semantics: "recurring", occurrence_dates: ["2026-11-19", "2026-11-20"], recurrence_evidence: { complete: true } }),
    ["2026-11-19", "2026-11-20"], "a refresh carrying Nov 20-21 keeps the stored evidenced Nov 19-20");
  assert.deepStrictEqual(
    await written({ start_date: "2026-11-19", end_date: "2026-11-21", date_semantics: "continuous" }),
    ["2026-11-19", "2026-11-21"], "a classified continuous range is not narrowed");
  console.log("PASS: cron-feeds keeps evidenced stored ranges (Royal Oak Nov 19-20), unclassified and new rows follow the feed");
})().catch((e) => { console.error(e); process.exit(1); });
