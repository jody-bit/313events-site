// test/dearborn-enrichment-backfill.test.js
//
// Stage 5: existing, still-unreviewed City of Dearborn rows gain a safe-match link and category hint, once.
// (Fixtures as in cron-feeds-dearborn-enrichment.test.js.) Fixtures are real: test/fixtures/dearborn-calendar-listing.html (the event-card block of dearborn.gov/calendar
// saved 2026-10-12) and test/fixtures/dearborn-website-calendar-sample.ics (sample of the city's public ICS).
//
// Run: node test/dearborn-enrichment-backfill.test.js
"use strict";
// api/cron-feeds.js skips new rows that have already ended (api/_lib/ingest-eligibility.js), so pin "now" before the fixtures' dates.
require("./fixtures/freeze-clock.js").freezeClock("2025-01-01T00:00:00Z");
const assert = require("assert");
const fs = require("fs");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const ICS = fs.readFileSync(`${REPO_DIR}/test/fixtures/dearborn-website-calendar-sample.ics`, "utf8");
const LISTING = fs.readFileSync(`${REPO_DIR}/test/fixtures/dearborn-calendar-listing.html`, "utf8");
const FEED_URL = "https://calendar.google.com/calendar/ical/websitecalendar%40dearborn.gov/public/basic.ics";
const FEED = { id: "fs-dbn", venue_name: "City of Dearborn", website: "https://www.dearborn.gov/calendar", default_category: "community", feed_url: FEED_URL, feed_format: "ics", status: "approved", location_per_event: true };

function freshHandler() {
  for (const m of ["cron-feeds.js", "_lib/venue-lookup.js", "_lib/ics-location.js", "_lib/feed-publication.js", "_lib/dearborn-enrichment.js"]) delete require.cache[require.resolve(`${REPO_DIR}/api/${m}`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
async function poll({ listing = () => ({ ok: true, status: 200, text: async () => LISTING }), stored = [] } = {}) {
  const written = []; const fetched = []; let polled = null;
  global.fetch = async (url, opts = {}) => {
    const m = opts.method || "GET";
    if (url.includes("/rest/v1/feed_sources") && m === "GET") return { ok: true, status: 200, json: async () => [FEED] };
    if (url.includes("/rest/v1/feed_sources")) { polled = JSON.parse(opts.body || "{}"); return { ok: true, status: 204 }; }
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && url.includes("external_id=in.")) return { ok: true, status: 200, json: async () => stored };
    if (url.includes("/rest/v1/events") && m === "GET") return { ok: true, status: 200, json: async () => [] };
    if (url === FEED_URL) return { ok: true, status: 200, text: async () => ICS };
    if (url.startsWith("https://www.dearborn.gov/")) { fetched.push(url); return listing(url); }
    if (url.includes("/rest/v1/events") && m === "POST") { written.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
    throw new Error("unmocked URL: " + url);
  };
  const res = { status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; } };
  await freshHandler()({ headers: {} }, res);
  assert.strictEqual(res._s, 200);
  return { written, fetched, polled };
}
const one = (rows, re) => { const r = rows.filter((x) => re.test(x.title)); assert.strictEqual(r.length, 1, String(re)); return r[0]; };

async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const { backfillPatch } = require(`${REPO_DIR}/api/_lib/dearborn-enrichment.js`);
  const E = { event_url: "https://www.dearborn.gov/events/2026/10/14/x", category: "City Event" };

  // --- pure rule
  assert.deepStrictEqual(backfillPatch({ event_url: null, note: "Held for review: x." }, E), { event_url: E.event_url, note: "Held for review: x. Source page category: City Event." });
  assert.deepStrictEqual(backfillPatch({ event_url: null, note: null }, E), { event_url: E.event_url, note: "Source page category: City Event." });
  assert.deepStrictEqual(backfillPatch({ event_url: "https://reviewer.example/own", note: "Source page category: Meeting." }, E), {}, "a stored link and an existing hint are never replaced");
  assert.deepStrictEqual(backfillPatch({ event_url: "https://reviewer.example/own", note: "n" }, { event_url: E.event_url }), {}, "stored link kept even when no category");
  assert.deepStrictEqual(backfillPatch({ event_url: null, note: "n" }, { event_url: null, category: null }), {}, "nothing to add, nothing written");
  assert.deepStrictEqual(backfillPatch(null, E), {});
  console.log("PASS: backfillPatch fills only empty links and adds the hint once");

  // --- through the cron: first poll to learn the external ids and the rows the cron writes for NEW rows
  const first = (await poll()).written;
  const foldNew = first.find((r) => /Friends Of The Library/.test(r.title));
  assert.ok(foldNew.event_url, "new row: linked as before (unchanged behaviour)");
  const id = foldNew.external_id;
  const holdNote = "Held for review: City of Dearborn's calendar mixes public events with notices.";

  // existing pending_review row with no link: it gains link + hint, status stays pending_review, hold note kept
  let rows = (await poll({ stored: [{ external_id: id, status: "pending_review", event_url: null, note: holdNote }] })).written;
  let r = rows.find((x) => x.external_id === id);
  assert.strictEqual(r.status, "pending_review");
  assert.strictEqual(r.event_url, foldNew.event_url);
  assert.strictEqual(r.note, `${holdNote} Source page category: City Event.`);
  console.log("PASS: existing pending row gains the link and the category hint; status and hold note kept");

  // repeated run: link and hint already stored -> nothing re-written, no duplicate hint
  rows = (await poll({ stored: [{ external_id: id, status: "pending_review", event_url: r.event_url, note: r.note }] })).written;
  r = rows.find((x) => x.external_id === id);
  assert.ok(!("event_url" in r) && !("note" in r), "second run writes neither key");
  console.log("PASS: repeated enrichment run is a no-op");

  // a stored (reviewer or earlier) link is never replaced
  rows = (await poll({ stored: [{ external_id: id, status: "pending_review", event_url: "https://reviewer.example/own", note: holdNote }] })).written;
  r = rows.find((x) => x.external_id === id);
  assert.ok(!("event_url" in r), "existing link kept");
  assert.match(r.note, /Source page category: City Event\./, "hint can still be added once");
  console.log("PASS: an existing link is never overwritten");

  // other statuses are untouched
  for (const status of ["approved", "rejected"]) {
    rows = (await poll({ stored: [{ external_id: id, status, event_url: null, note: "n" }] })).written;
    r = rows.find((x) => x.external_id === id);
    assert.strictEqual(r.status, status);
    assert.ok(!("event_url" in r) && !("note" in r), status + ": no link or note written");
  }
  console.log("PASS: approved and rejected rows are untouched");

  // listing failure: existing pending row is left alone, feed still ingests
  rows = (await poll({ listing: () => ({ ok: false, status: 503, text: async () => "" }), stored: [{ external_id: id, status: "pending_review", event_url: null, note: holdNote }] })).written;
  r = rows.find((x) => x.external_id === id);
  assert.ok(!("event_url" in r) && !("note" in r), "no match, nothing invented");
  console.log("PASS: no listing, no change");

  // an unmatched row (no card) stays unlinked
  const stars = first.find((x) => /^Symphony Under the Stars$/.test(x.title));
  rows = (await poll({ stored: [{ external_id: stars.external_id, status: "pending_review", event_url: null, note: holdNote }] })).written;
  r = rows.find((x) => x.external_id === stars.external_id);
  assert.ok(!("event_url" in r) && !("note" in r), "unmatched existing row: nothing invented");
  console.log("PASS: unmatched existing rows stay unlinked");
}
run().catch((e) => { console.error(e); process.exit(1); });
