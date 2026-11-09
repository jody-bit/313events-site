// test/cron-feeds-non-place-location.test.js — P1 audit EXPORT-2,
// "nocity-placeholder-venue": Tourism Windsor Essex rows were published with
// the venue "ON" or "Various Locations". A LOCATION that names no place is
// "Venue TBA" with no city; a LOCATION that names a place (readable or not)
// is kept whole, and the feed's own city is never given to a non-place.
// Run: node test/cron-feeds-non-place-location.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2025-01-01T00:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");
const REPO_DIR = process.env.REPO_DIR || process.cwd();

const FEED = { id: "fs-twe", venue_name: "Tourism Windsor Essex Pelee Island", default_category: "community", feed_url: "https://feed.example/twe.ics", feed_format: "ics", status: "approved", location_per_event: true };
const esc = (x) => x.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\;");

async function run(events) {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  for (const f of ["api/cron-feeds.js", "api/_lib/venue-lookup.js", "api/_lib/ics-location.js"]) delete require.cache[require.resolve(`${REPO_DIR}/${f}`)];
  const handler = require(`${REPO_DIR}/api/cron-feeds.js`);
  const written = [];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0"];
  for (const ev of events) {
    lines.push("BEGIN:VEVENT", `UID:${ev.uid}`, "DTSTART:20261201T190000Z", `SUMMARY:${ev.summary}`);
    if (ev.location != null) lines.push(`LOCATION:${esc(ev.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  global.fetch = async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources")) return opts.method === "PATCH" ? { ok: true, status: 204, json: async () => [], text: async () => "" } : { ok: true, status: 200, json: async () => [FEED] };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
    if (url === FEED.feed_url) return { ok: true, status: 200, text: async () => lines.join("\r\n") };
    if (url.includes("/rest/v1/events") && opts.method === "POST") { written.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
    throw new Error("unmocked URL: " + url);
  };
  const res = { status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; } };
  await handler({ headers: {} }, res);
  assert.strictEqual(res._s, 200, JSON.stringify(res._b));
  const by = {};
  for (const r of written) by[r.external_id.replace(`feed-${FEED.id}-`, "")] = r;
  return by;
}

(async () => {
  const rows = await run([
    { uid: "on", summary: "WIFF Daily Screenings", location: "ON" },
    { uid: "various", summary: "November Meltdown", location: "Various Locations" },
    { uid: "tbd", summary: "Mystery", location: "TBD" },
    { uid: "online", summary: "Webinar", location: "Online" },
    { uid: "casino", summary: "Show", location: "Caesars Windsor, Windsor ON" },
    { uid: "real", summary: "Film", location: "Capitol Theatre, 121 University Ave W, Windsor, ON" },
  ]);
  for (const uid of ["on", "various", "tbd"]) {
    assert.strictEqual(rows[uid].venue_name_raw, "Venue TBA", uid);
    assert.strictEqual(rows[uid].venue_city_raw, null, uid);
    assert.strictEqual(rows[uid].venue_address_raw, null, uid);
    assert.strictEqual(rows[uid].venue_id, null, uid);
  }
  assert.strictEqual(rows.online.venue_name_raw, "Online", "a stated place that is not a venue gap is kept as before");
  assert.strictEqual(rows.casino.venue_name_raw, "Caesars Windsor, Windsor ON", "unreadable but stated place kept whole");
  assert.strictEqual(rows.real.venue_name_raw, "Capitol Theatre");
  assert.strictEqual(rows.real.venue_city_raw, "Windsor");
  console.log("PASS: 'ON' / 'Various Locations' / 'TBD' become Venue TBA with no city; real and unreadable-but-stated places unchanged");
})().catch((e) => { console.error(e); process.exit(1); });
