// test/cron-feeds-events-harvest.test.js
//
// Publication policy for the owner-curated "313.events Events Harvest" calendar (api/_lib/feed-publication.js):
// every NEW row is created pending_review, nothing is discarded, a reviewer's decision survives the next poll, and
// the policy matches the feed row's exact venue_name only (never the URL, never a bare "harvest"). The calendar
// itself is private and unseen, so the fixture is a small synthetic multi-venue ICS and a placeholder address.
//
// Run: node test/cron-feeds-events-harvest.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2025-01-01T00:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const FEED_URL = "https://calendar.example.invalid/harvest-placeholder.ics";
const ics = (events) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//harvest//EN", ...events.flat(), "END:VCALENDAR"].join("\r\n");
const ev = (uid, summary, start, location) => ["BEGIN:VEVENT", `UID:${uid}`, `SUMMARY:${summary}`, `DTSTART:${start}`, `DTEND:${start.replace("T200000", "T220000")}`, ...(location ? [`LOCATION:${location}`] : []), "END:VEVENT"];
const SAMPLE = ics([
  ev("h1@test", "Holiday Pop-Up Market", "20260110T200000Z", "Eastern Market Shed 5\\, 2934 Russell St\\, Detroit\\, MI 48207"),
  ev("h2@test", "Candlelight Poetry Night", "20260111T200000Z", "Some Bookstore\\, 100 Main St\\, Royal Oak\\, MI 48067"),
  ev("h3@test", "Neighborhood Meetup", "20260112T200000Z", ""),
]);

function freshHandler() {
  for (const m of ["cron-feeds.js", "_lib/venue-lookup.js", "_lib/ics-location.js", "_lib/feed-publication.js"]) delete require.cache[require.resolve(`${REPO_DIR}/api/${m}`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });

async function poll({ feed, stored = [] }) {
  const written = [];
  global.fetch = async (url, opts = {}) => {
    const m = opts.method || "GET";
    if (url.includes("/rest/v1/feed_sources") && m === "GET") return { ok: true, status: 200, json: async () => [feed] };
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 204 };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && url.includes("external_id=in.")) return { ok: true, status: 200, json: async () => stored };
    if (url.includes("/rest/v1/events") && m === "GET") return { ok: true, status: 200, json: async () => [] };
    if (url === feed.feed_url) return { ok: true, status: 200, text: async () => SAMPLE };
    if (url.includes("/rest/v1/events") && m === "POST") { written.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
    throw new Error("unmocked URL: " + url);
  };
  const res = makeRes();
  await freshHandler()({ headers: {} }, res);
  assert.strictEqual(res._status, 200);
  return written;
}

async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const FEED = { id: "fs-harvest", venue_name: "313.events Events Harvest", website: null, default_category: "community", feed_url: FEED_URL, feed_format: "ics", status: "approved", location_per_event: true };

  // 1. every new row waits for review, none is discarded, each says why
  let rows = await poll({ feed: FEED });
  assert.strictEqual(rows.length, 3, "nothing is discarded");
  assert.ok(rows.every((r) => r.status === "pending_review"), "every new Harvest row waits for review");
  assert.ok(rows.every((r) => /owner-curated and mixed-genre/.test(r.note)), "each held row says why");
  console.log("PASS: every new Harvest row is created pending_review with a reason; nothing discarded");

  // 2. a reviewer's decision is never overwritten by the next poll
  const sid = rows[0].external_id;
  rows = await poll({ feed: FEED, stored: [{ external_id: sid, status: "approved" }] });
  assert.strictEqual(rows.find((r) => r.external_id === sid).status, "approved");
  console.log("PASS: reviewer decision survives the next poll");

  // 3. matching is the exact venue_name, anchored and case-insensitive; never the URL or a bare word
  const { policyFor } = require(`${REPO_DIR}/api/_lib/feed-publication.js`);
  assert.ok(policyFor(FEED));
  assert.ok(policyFor({ venue_name: "  313.EVENTS events harvest " }));
  for (const v of ["Royal Oak Farmers Market", "Harvest", "313.events Events Harvest Extra", "My 313.events Events Harvest", "313 events harvest", "Events Harvest Cafe", "", null]) assert.strictEqual(policyFor({ venue_name: v, website: "https://example.org" }), null, String(v));
  assert.strictEqual(policyFor({ venue_name: "Other Calendar", website: null, feed_url: "https://calendar.example.invalid/313.events-events-harvest.ics" }), null, "the URL never matches");
  console.log("PASS: policy matches the exact feed name only");

  // 4. a feed with another name is unchanged
  rows = await poll({ feed: { ...FEED, id: "fs-other", venue_name: "Harvest Cafe" } });
  assert.ok(rows.length === 3 && rows.every((r) => r.status === "approved"), "feeds without a policy still publish as before");
  console.log("PASS: other feeds unchanged");
}
run().catch((e) => { console.error(e); process.exit(1); });
