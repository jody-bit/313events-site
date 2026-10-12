// test/cron-feeds-dearborn.test.js
//
// City of Dearborn publication policy (api/_lib/feed-publication.js), exercised on a sample of the REAL
// public export of the city's "Website Calendar 2026" (test/fixtures/dearborn-website-calendar-sample.ics:
// 20 of 1,061 VEVENTs, unmodified, saved from the live feed on 2026-10-12). The feed has no category field,
// so the policy skips plain notices by title and holds every other new row for review.
//
// Covers: Symphony Under the Stars (2026-09-10), the historical coverage-gap case; notices skipped; real
// events kept (held for review, never auto-published); RRULE / RECURRENCE-ID entries not duplicated; time
// zones; a CANCELED title still visible; a reviewer's status never overwritten; a failed fetch writing
// nothing; policy matching exactness.
//
// Run: node test/cron-feeds-dearborn.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const FEED_URL = "https://calendar.google.com/calendar/ical/websitecalendar%40dearborn.gov/public/basic.ics";
const SAMPLE = fs.readFileSync(`${REPO_DIR}/test/fixtures/dearborn-website-calendar-sample.ics`, "utf8");

function freshHandler() {
  for (const m of ["cron-feeds.js", "_lib/venue-lookup.js", "_lib/ics-location.js", "_lib/feed-publication.js"]) delete require.cache[require.resolve(`${REPO_DIR}/api/${m}`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });

async function poll({ feed, stored = [], fail = false, body = SAMPLE }) {
  const written = [];
  let polled = null;
  global.fetch = async (url, opts = {}) => {
    const m = opts.method || "GET";
    if (url.includes("/rest/v1/feed_sources") && m === "GET") return { ok: true, status: 200, json: async () => [feed] };
    if (url.includes("/rest/v1/feed_sources")) { polled = JSON.parse(opts.body || "{}"); return { ok: true, status: 204 }; }
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && url.includes("external_id=in.")) return { ok: true, status: 200, json: async () => stored };
    if (url.includes("/rest/v1/events") && m === "GET") return { ok: true, status: 200, json: async () => [] };
    if (url === feed.feed_url) return fail ? { ok: false, status: 503, text: async () => "" } : { ok: true, status: 200, text: async () => body };
    if (url.includes("/rest/v1/events") && m === "POST") { written.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
    throw new Error("unmocked URL: " + url);
  };
  const res = makeRes();
  await freshHandler()({ headers: {} }, res);
  assert.strictEqual(res._status, 200);
  return { written, polled };
}
const byTitle = (rows, re) => rows.filter((r) => re.test(r.title));

async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  const FEED = { id: "fs-dbn", venue_name: "City of Dearborn", website: "https://www.dearborn.gov/calendar", default_category: "community", feed_url: FEED_URL, feed_format: "ics", status: "approved", location_per_event: true };
  let { written: rows } = await poll({ feed: FEED });

  // Notices are never ingested.
  for (const re of [/City Council Meeting/, /Early Voting/, /Civil Service Commission/, /Thanksgiving \(DISC CLOSED\)/, /LOOSE LEAF/]) assert.strictEqual(byTitle(rows, re).length, 0, `${re} is a notice`);
  console.log("PASS: meetings, voting dates, closures and leaf-collection notices are skipped");

  // Real public events are ingested but NEVER auto-published: nothing in the feed labels event vs notice.
  for (const re of [/Fire Department Open House/, /Friends Of The Library/, /Haunted Trail/, /Nutcracker/, /Dearborn Symphony Orchestra Concert/, /Camp Dearborn Halloween Weekend/]) assert.ok(byTitle(rows, re).length >= 1, `${re} ingested`);
  assert.ok(rows.length > 0 && rows.every((r) => r.status === "pending_review"), "every new Dearborn row waits for review");
  assert.ok(rows.every((r) => /no event-type label/.test(r.note)), "each held row says why");
  console.log("PASS: public events ingested and held for review");

  // Regression: Symphony Under the Stars (2026-09-10), the original coverage gap, is in the feed.
  const stars = byTitle(rows, /^Symphony Under the Stars$/);
  assert.strictEqual(stars.length, 1);
  assert.strictEqual(stars[0].start_date, "2026-09-10", "23:30Z is 7:30 PM Detroit time on the 10th");
  assert.match(stars[0].time_display, /7:30 PM/);
  assert.match(stars[0].venue_name_raw, /Peace Park West/);
  assert.ok(stars[0].start_date < "2026-10-12", "historical relative to 2026-10-12, so it is not an upcoming event");
  const jazz = byTitle(rows, /^Jazz Under the Stars$/)[0];
  assert.strictEqual(jazz.start_date, "2026-08-28", "00:00Z on the 29th is 8:00 PM on the 28th Detroit time");
  console.log("PASS: Symphony Under the Stars regression (and UTC-to-Detroit date handling)");

  // A CANCELED entry keeps its CANCELED title (visible to reviewers; nothing hides or invents it).
  assert.ok(byTitle(rows, /^CANCELED - Jazz Under the Stars$/).length === 1);

  // Source identity: unique UIDs, no duplicates from the RECURRENCE-ID override already skipped as a notice.
  assert.strictEqual(new Set(rows.map((r) => r.external_id)).size, rows.length);
  assert.ok(rows.every((r) => /^feed-fs-dbn-[a-z0-9]+@google\.com$/.test(r.external_id)));
  console.log("PASS: stable Google UIDs, no duplicates");

  // No invented times: an all-day entry has no time_display.
  const trail = byTitle(rows, /Haunted Trail/)[0];
  assert.ok(!trail.time_display, "all-day entry gets no time");

  // A reviewer's decision survives the next poll; a reviewed row's status is never overwritten.
  const sid = stars[0].external_id;
  ({ written: rows } = await poll({ feed: FEED, stored: [{ external_id: sid, status: "approved" }] }));
  assert.strictEqual(rows.find((r) => r.external_id === sid).status, "approved");
  console.log("PASS: reviewer decision is never overwritten");

  // Source failure: nothing is written and the failure is recorded for source-health.
  const failed = await poll({ feed: FEED, fail: true });
  assert.strictEqual(failed.written.length, 0);
  assert.ok(failed.polled && /503|fail|error/i.test(String(failed.polled.last_poll_result)));
  console.log("PASS: source failure writes nothing and is recorded");

  // Policy matching is exact; an unrelated feed is untouched by reviewAll.
  const { policyFor } = require(`${REPO_DIR}/api/_lib/feed-publication.js`);
  assert.ok(policyFor(FEED));
  assert.ok(policyFor({ venue_name: "Dearborn Library", website: "https://dearborn.gov/library" }));
  for (const v of ["City of Dearborn Heights", "Dearborn Public Schools", "Dearborn Brewing"]) assert.strictEqual(policyFor({ venue_name: v, website: "https://example.org" }), null, v);
  ({ written: rows } = await poll({ feed: { ...FEED, id: "fs-other", venue_name: "City of Test", website: "https://example.org" } }));
  assert.ok(rows.length > 0 && rows.every((r) => r.status === "approved"), "feeds without a policy still publish as before");
  console.log("PASS: policy matching is exact; other feeds unchanged");
}
run().catch((e) => { console.error(e); process.exit(1); });
