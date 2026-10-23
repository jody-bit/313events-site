// test/cron-feeds-placeholder-end.test.js
//
// A generic ICS feed (Richmond, Redford, Madison Heights, Macomb Twp, Garden City) publishes DTEND 23:59 as an
// end-of-day filler, which showed on cards as "12:00 PM – 11:59 PM" and exported a calendar end of midnight.
// The row keeps its start only. Real end times (and a 23:58 or next-day end) are untouched.
//
// Run: node test/cron-feeds-placeholder-end.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2025-01-01T00:00:00Z");
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
function ics(dtstart, dtend) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:evt-1", dtstart, dtend, "SUMMARY:Senior Craft Time", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
async function timeFor(dtstart, dtend) {
  let body = null;
  const feed = { id: "fs-1", venue_name: "City", default_category: "community", feed_url: "https://feed.example/cal.ics", feed_format: "ics", status: "approved", location_per_event: false };
  global.fetch = async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => [feed] };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
    if (url === "https://feed.example/cal.ics") return { ok: true, status: 200, text: async () => ics(dtstart, dtend) };
    if (url.includes("/rest/v1/events") && opts.method === "POST") { body = JSON.parse(opts.body); return strictWriteResponse(url, opts); }
    throw new Error("unmocked URL: " + url);
  };
  const res = makeRes();
  await freshHandler()({ headers: {} }, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(body.length, 1);
  return body[0].time_display;
}

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  assert.strictEqual(await timeFor("DTSTART:20261026T120000", "DTEND:20261026T235900"), "12:00 PM", "23:59 end is dropped");
  assert.strictEqual(await timeFor("DTSTART:20261026T120000", "DTEND:20261026T150000"), "12:00 PM – 3:00 PM", "a real end is kept");
  assert.strictEqual(await timeFor("DTSTART:20261026T120000", "DTEND:20261026T235800"), "12:00 PM – 11:58 PM", "only exactly 23:59 is treated as filler");
  console.log("PASS: cron-feeds drops an exact 23:59 end-of-day filler and keeps real end times");
})();
