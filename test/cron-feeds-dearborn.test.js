// test/cron-feeds-dearborn.test.js
//
// City of Dearborn publication policy (api/_lib/feed-publication.js). dearborn.gov was not
// reachable from the build environment, so the VEVENTs below are SYNTHETIC fixtures that
// follow RFC 5545 and the shapes of Google Calendar exports; they are not captured from the
// live calendar. Re-run against a real export before activating the feed.
//
// Covers: administrative entries skipped, real public events kept, Symphony Under the Stars
// (Sept 10, 2026) as the historical coverage-gap regression, recurring occurrences kept
// distinct, a missing time never invented, an unplaced event held, a reviewer's status
// never overwritten, a failed source fetch writing nothing, and policy matching exactness.
//
// Run: node test/cron-feeds-dearborn.test.js
"use strict";
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const FEED_URL = "https://calendar.google.com/calendar/ical/SYNTHETIC-DEARBORN-ID/public/basic.ics";

function freshHandler() {
  for (const m of ["cron-feeds.js", "_lib/venue-lookup.js", "_lib/ics-location.js", "_lib/feed-publication.js"]) delete require.cache[require.resolve(`${REPO_DIR}/api/${m}`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });
const ics = (events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");

async function poll({ feed, events, stored = [], fail = false }) {
  const written = [];
  let polled = null;
  global.fetch = async (url, opts = {}) => {
    const m = opts.method || "GET";
    if (url.includes("/rest/v1/feed_sources") && m === "GET") return { ok: true, status: 200, json: async () => [feed] };
    if (url.includes("/rest/v1/feed_sources")) { polled = JSON.parse(opts.body || "{}"); return { ok: true, status: 204 }; }
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && url.includes("external_id=in.")) return { ok: true, status: 200, json: async () => stored };
    if (url.includes("/rest/v1/events") && m === "GET") return { ok: true, status: 200, json: async () => [] };
    if (url === feed.feed_url) return fail ? { ok: false, status: 503, text: async () => "" } : { ok: true, status: 200, text: async () => ics(events) };
    if (url.includes("/rest/v1/events") && m === "POST") { written.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
    throw new Error("unmocked URL: " + url);
  };
  const res = makeRes();
  await freshHandler()({ headers: {} }, res);
  assert.strictEqual(res._status, 200);
  return { written, polled };
}
const byUid = (rows, uid) => rows.find((r) => r.external_id.endsWith(`-${uid}`));

async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  const FEED = { id: "fs-dbn", venue_name: "City of Dearborn", website: "https://www.dearborn.gov/calendar", default_category: "community", feed_url: FEED_URL, feed_format: "ics", status: "approved", location_per_event: true };
  const ADDR = "LOCATION:Ford Field Park - 1 Example St  Dearborn MI 48126";
  const events = [
    ["UID:stars-2026-09-10", "DTSTART:20260910T190000", "DTEND:20260910T210000", ADDR, "SUMMARY:Symphony Under the Stars"],
    ["UID:council", "DTSTART:20261020T190000", "SUMMARY:City Council Regular Meeting", ADDR],
    ["UID:zba", "DTSTART:20261021T190000", "SUMMARY:Zoning Board of Appeals Meeting", ADDR],
    ["UID:tax", "DTSTART;VALUE=DATE:20261101", "DTEND;VALUE=DATE:20261102", "SUMMARY:Winter Tax Payment Due"],
    ["UID:closed", "DTSTART;VALUE=DATE:20261126", "DTEND;VALUE=DATE:20261127", "SUMMARY:City Offices Closed - Thanksgiving"],
    ["UID:openhouse", "DTSTART:20261014T180000", "SUMMARY:Fire Department Open House", "LOCATION:Dearborn Fire Station 1 - 13615 Michigan Ave  Dearborn MI 48126"],
    ["UID:booksale", "DTSTART;VALUE=DATE:20261017", "DTEND;VALUE=DATE:20261018", "SUMMARY:Friends of the Library Book Sale", "LOCATION:Henry Ford Centennial Library - 16301 Michigan Ave  Dearborn MI 48126"],
    ["UID:dance-1", "DTSTART:20261023T190000", "SUMMARY:Community Dance", ADDR],
    ["UID:dance-2", "DTSTART:20261030T190000", "SUMMARY:Community Dance", ADDR],
    ["UID:noloc", "DTSTART:20261105T180000", "SUMMARY:Halloween Family Night"],
  ];

  let { written: rows } = await poll({ feed: FEED, events });

  // Administrative entries are never ingested; real public events are.
  for (const uid of ["council", "zba", "tax", "closed"]) assert.strictEqual(byUid(rows, uid), undefined, `${uid} is administrative`);
  for (const uid of ["openhouse", "booksale", "dance-1", "dance-2", "stars-2026-09-10"]) assert.ok(byUid(rows, uid), `${uid} is ingested`);
  console.log("PASS: administrative entries skipped, public events kept");

  // Regression: Symphony Under the Stars, the original coverage gap. Ingested with its
  // official date and time, source UID preserved, and clearly in the past (not upcoming).
  const stars = byUid(rows, "stars-2026-09-10");
  assert.strictEqual(stars.start_date, "2026-09-10");
  assert.match(stars.time_display, /7:00/);
  assert.ok(stars.start_date < "2026-10-12", "a September event is historical relative to 2026-10-12");
  console.log("PASS: Symphony Under the Stars regression");

  // Recurring occurrences keep their own identities (no false duplicate collapse).
  assert.notStrictEqual(byUid(rows, "dance-1").external_id, byUid(rows, "dance-2").external_id);
  assert.strictEqual(new Set(rows.map((r) => r.external_id)).size, rows.length, "external ids are unique");
  console.log("PASS: recurring occurrences stay distinct");

  // No invented times: an all-day entry has no time_display.
  assert.ok(!byUid(rows, "booksale").time_display, "no start time invented for an all-day entry");

  // An event with no stated place is held, not published; a placed one publishes.
  assert.strictEqual(byUid(rows, "noloc").status, "pending_review");
  assert.match(byUid(rows, "noloc").note, /no location stated/);
  assert.strictEqual(byUid(rows, "dance-1").status, "approved");
  console.log("PASS: unplaced events are held for review");

  // A reviewer's decision survives the next poll.
  ({ written: rows } = await poll({ feed: FEED, events, stored: [{ external_id: "feed-fs-dbn-noloc", status: "approved" }, { external_id: "feed-fs-dbn-dance-2", status: "rejected" }] }));
  assert.strictEqual(byUid(rows, "noloc").status, "approved");
  assert.strictEqual(byUid(rows, "dance-2").status, "rejected");
  console.log("PASS: existing status is never overwritten");

  // Source failure: nothing is written and the failure is recorded for health monitoring.
  const failed = await poll({ feed: FEED, events, fail: true });
  assert.strictEqual(failed.written.length, 0);
  assert.ok(failed.polled && /503|fail|error/i.test(String(failed.polled.last_poll_result)), "failure recorded in last_poll_result");
  console.log("PASS: source failure writes nothing and is recorded");

  // Policy matching is exact.
  const { policyFor } = require(`${REPO_DIR}/api/_lib/feed-publication.js`);
  assert.ok(policyFor(FEED));
  assert.ok(policyFor({ venue_name: "Dearborn Library", website: "https://dearborn.gov/library" }), "dearborn.gov website matches");
  for (const v of ["City of Dearborn Heights", "Dearborn Public Schools", "Dearborn Brewing"]) assert.strictEqual(policyFor({ venue_name: v, website: "https://example.org" }), null, v);
  console.log("PASS: policy matching is exact");
}
run().catch((e) => { console.error(e); process.exit(1); });
