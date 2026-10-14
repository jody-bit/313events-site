// test/ingest-expiry-rule.test.js
//
// Shared ingestion eligibility rule (api/_lib/ingest-eligibility.js, wired into api/cron-feeds.js upsertParsedRows):
// a NEW feed row that is definitively over is not inserted, for every feed source. Owner decision 2026-10-14 after the
// City of Dearborn calendar put 765 already-ended rows in the review queue.
//
// Covers: expired rows skipped and counted; upcoming and same-day rows kept; multi-day rows use the effective end date;
// RRULE masters and RECURRENCE-ID overrides kept; unreadable dates are not discarded; RSS pubDate-fallback dates are
// never treated as expired; existing rows are still updated (reviewer status preserved); the rule applies to a feed
// with no publication policy; a fully-expired feed writes nothing; no unrelated field changes.
//
// Run: node test/ingest-expiry-rule.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2026-10-14T12:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");
const { isDefinitelyExpired, partitionExpired } = require("../api/_lib/ingest-eligibility.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const FEED_URL = "https://feed.example/cal.ics";
const RSS_URL = "https://feed.example/rss.xml";

function freshHandler() {
  for (const m of ["cron-feeds.js", "_lib/venue-lookup.js", "_lib/ics-location.js", "_lib/feed-publication.js", "_lib/ingest-eligibility.js"]) delete require.cache[require.resolve(`${REPO_DIR}/api/${m}`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });

function ics(vevents) {
  return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + vevents.map((lines) => "BEGIN:VEVENT\r\n" + lines.join("\r\n") + "\r\nEND:VEVENT\r\n").join("") + "END:VCALENDAR\r\n";
}
const allDay = (uid, title, start, endExclusive, extra = []) => [`UID:${uid}`, `SUMMARY:${title}`, `DTSTART;VALUE=DATE:${start}`, ...(endExclusive ? [`DTEND;VALUE=DATE:${endExclusive}`] : []), ...extra];

async function poll({ feed, body, stored = [] }) {
  const written = [];
  let polled = null;
  global.fetch = async (url, opts = {}) => {
    const m = opts.method || "GET";
    if (url.includes("/rest/v1/feed_sources") && m === "GET") return { ok: true, status: 200, json: async () => [feed] };
    if (url.includes("/rest/v1/feed_sources")) { polled = JSON.parse(opts.body || "{}"); return { ok: true, status: 204 }; }
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && url.includes("external_id=in.")) return { ok: true, status: 200, json: async () => stored };
    if (url.includes("/rest/v1/events") && m === "GET") return { ok: true, status: 200, json: async () => [] };
    if (url === feed.feed_url) return { ok: true, status: 200, text: async () => body };
    if (url.includes("/rest/v1/events") && m === "POST") { written.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
    throw new Error("unmocked URL: " + url);
  };
  const res = makeRes();
  await freshHandler()({ headers: {} }, res);
  assert.strictEqual(res._status, 200);
  return { written, polled, body: res._body };
}
const titles = (rows) => rows.map((r) => r.title).sort();

async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const NOW = new Date("2026-10-14T12:00:00Z");

  // ---- the pure rule ----
  assert.strictEqual(isDefinitelyExpired({ start_date: "2026-10-01" }, NOW), true, "single past day");
  assert.strictEqual(isDefinitelyExpired({ start_date: "2026-10-14" }, NOW), false, "today");
  assert.strictEqual(isDefinitelyExpired({ start_date: "2026-10-13" }, NOW), false, "yesterday is inside the one-day grace");
  assert.strictEqual(isDefinitelyExpired({ start_date: "2026-10-12" }, NOW), true, "two days ago");
  assert.strictEqual(isDefinitelyExpired({ start_date: "2026-09-01", end_date: "2026-10-20" }, NOW), false, "multi-day uses the effective end date");
  assert.strictEqual(isDefinitelyExpired({ start_date: "2026-09-01", end_date: "2026-09-05" }, NOW), true, "multi-day that has ended");
  assert.strictEqual(isDefinitelyExpired({ start_date: "2026-09-01", _recurring: true }, NOW), false, "recurring is preserved");
  assert.strictEqual(isDefinitelyExpired({ start_date: "2026-09-01", _dateConfidence: "pubdate-fallback" }, NOW), false, "a guessed date is not proof");
  for (const bad of [null, "", "garbage", "2026-13-40", "2026-02-30"]) assert.strictEqual(isDefinitelyExpired({ start_date: bad }, NOW), false, `unreadable start ${bad}`);
  assert.strictEqual(isDefinitelyExpired({ start_date: "2026-09-01", end_date: "soon" }, NOW), false, "unreadable end date is ambiguous");
  assert.strictEqual(isDefinitelyExpired({ start_date: "2026-09-10", end_date: "2026-09-01" }, NOW), true, "end before start falls back to the start; still over");
  const part = partitionExpired([{ start_date: "2026-01-01", external_id: "a" }, { start_date: "2026-01-01", external_id: "b" }], (r) => r.external_id === "b", NOW);
  assert.deepStrictEqual([part.keep.map((r) => r.external_id), part.skippedPast], [["b"], 1], "an existing row is never filtered");
  console.log("PASS: the rule is narrow: only a readable, non-recurring, definitively ended date is expired");

  // ---- through the ICS pipeline, on a feed with NO publication policy ----
  const FEED = { id: "fs-x", venue_name: "Some Venue", website: "https://example.org", default_category: "community", feed_url: FEED_URL, feed_format: "ics", status: "approved" };
  const body = ics([
    allDay("past1", "Long Over", "20260301", "20260302"),
    allDay("today1", "Happening Today", "20261014", "20261015"),
    allDay("future1", "Coming Up", "20261101", "20261102"),
    allDay("span1", "Running Exhibit", "20260901", "20261101"),
    allDay("spanover", "Finished Exhibit", "20260801", "20260810"),
    allDay("series1", "Weekly Class", "20260105", "20260106", ["RRULE:FREQ=WEEKLY;UNTIL=20261231"]),
    allDay("series1", "Weekly Class (moved)", "20260302", "20260303", ["RECURRENCE-ID;VALUE=DATE:20260302"]),
  ]);
  const first = await poll({ feed: FEED, body });
  assert.deepStrictEqual(titles(first.written), ["Coming Up", "Happening Today", "Running Exhibit", "Weekly Class", "Weekly Class (moved)"]);
  console.log("PASS: expired rows are not inserted; upcoming, same-day, multi-day, recurring master and override are");
  assert.strictEqual(first.body.skippedPast, 2, "reported in the run response");
  assert.match(first.polled.last_poll_result, /7 events found; 2 already ended, not inserted/, "and in the stored poll result");
  assert.ok(first.written.every((r) => !("_recurring" in r) && !("_publication" in r)), "internal markers never reach the database");
  console.log("PASS: skipped-past count is recorded in the existing ingestion reporting");

  // ---- existing rows are unaffected: still written, status preserved ----
  const pastId = `feed-${FEED.id}-past1`;
  const second = await poll({ feed: FEED, body, stored: [{ external_id: pastId, status: "approved" }] });
  const existing = second.written.find((r) => r.external_id === pastId);
  assert.ok(existing, "an already-stored expired row is still updated");
  assert.strictEqual(existing.status, "approved", "its reviewer decision is preserved");
  assert.strictEqual(second.body.skippedPast, 1, "only the genuinely new expired row is skipped");
  console.log("PASS: existing rows are never filtered; reviewer decisions unchanged");

  // ---- a fully expired feed writes nothing ----
  const old = await poll({ feed: FEED, body: ics([allDay("o1", "Old A", "20260101", "20260102"), allDay("o2", "Old B", "20260201", "20260202")]) });
  assert.strictEqual(old.written.length, 0);
  assert.strictEqual(old.body.skippedPast, 2);
  assert.match(old.polled.last_poll_result, /2 events found; 2 already ended, not inserted/);
  console.log("PASS: a feed with only ended events writes nothing");

  // ---- RSS: an extracted past date is skipped; a pubDate fallback is never treated as proof ----
  const RSS_FEED = { id: "fs-rss", venue_name: "Blog Venue", default_category: "community", feed_url: RSS_URL, feed_format: "rss", status: "approved" };
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>Gala on March 3, 2026</title><link>https://e.example/1</link><description>Join us March 3, 2026 at 7pm</description><guid>g1</guid></item>
    <item><title>Open mic soon</title><link>https://e.example/2</link><description>Bring a song</description><pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate><guid>g2</guid></item>
    <item><title>Fall Fest on November 7, 2026</title><link>https://e.example/3</link><description>November 7, 2026 all day</description><guid>g3</guid></item>
  </channel></rss>`;
  const r = await poll({ feed: RSS_FEED, body: rss });
  assert.deepStrictEqual(titles(r.written), ["Fall Fest on November 7, 2026", "Open mic soon"]);
  assert.strictEqual(r.body.skippedPast, 1);
  assert.strictEqual(r.written.find((x) => x.title === "Open mic soon").status, "pending_review", "the fallback row still goes to review");
  console.log("PASS: RSS: extracted past date skipped; pubDate-fallback row kept for review");
}

run().then(() => console.log("\nall ingest-expiry-rule tests passed")).catch((e) => { console.error(e); process.exit(1); });
