// test/feed-event-page-from-description.test.js — CivicPlus feeds put the event's own page in DESCRIPTION text.
//
// 2026-10-23: 117 upcoming events had no link at all although each one's feed text held its own
// "https://<site>/calendar.aspx?EID=<uid>". The nightly repair only handles a bare-URL description on a listed source, so
// text plus a URL, and four unlisted feeds, never got a link. The ingestion now takes that page as event_url when it is on the
// feed's own site, unique, an exact calendar.aspx?EID= page, and carries this event's UID. Nothing is guessed or resolved.
//
// Run: node test/feed-event-page-from-description.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2025-01-01T00:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { eventPageFromDescription: pick } = require(`${REPO_DIR}/api/_lib/link-field.js`);
const FEED_URL = "https://www.romi.gov/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=23";
const FEED = "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=23";

function freshHandler() {
  for (const m of ["api/cron-feeds.js", "api/_lib/venue-lookup.js", "api/_lib/ics-location.js", "scripts/press-coverage-linking.js"]) delete require.cache[require.resolve(`${REPO_DIR}/${m}`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });

function ics(events) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, "DTSTART:20261201T190000Z", `SUMMARY:${e.uid}`);
    if (e.url !== undefined) lines.push(`URL:${e.url}`);
    if (e.desc !== undefined) lines.push(`DESCRIPTION:${e.desc}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function rss(items) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.map((i) => `<item><title>${i.id} concert</title><link>${i.link}</link><guid>${i.id}</guid><description>Join us on December 1, 2026 for a concert.</description></item>`).join("")}</channel></rss>`;
}

async function runFeed(feedSource, body) {
  const handler = freshHandler();
  let upserted = [];
  const patches = [];
  global.fetch = async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources") && opts.method === "PATCH") { patches.push(opts.body); return { ok: true, status: 204, json: async () => [], text: async () => "" }; }
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => [feedSource] };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
    if (url === feedSource.feed_url) return { ok: true, status: 200, text: async () => body };
    // rows with different key shapes go out as separate requests, so collect every POST
    if (url.includes("/rest/v1/events") && opts.method === "POST") { upserted.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
    if (url.includes("/rest/v1/")) return { ok: true, status: 200, json: async () => [] };
    throw new Error("unmocked URL: " + url);
  };
  const res = makeRes();
  await handler({ headers: {} }, res);
  assert.strictEqual(res._status, 200);
  return { rows: upserted, body: res._body, patches };
}

// ---- the rule ---------------------------------------------------------------------------------------------------------
{
  const feed = "https://www.romi.gov/common/modules/iCalendar/iCalendar.aspx?feed=calendar";
  assert.strictEqual(pick("Day Trip https://www.romi.gov/calendar.aspx?EID=8531", feed, "8531"), "https://www.romi.gov/calendar.aspx?EID=8531", "text plus URL");
  assert.strictEqual(pick("https://www.romi.gov/calendar.aspx?EID=8531", feed, "8531"), "https://www.romi.gov/calendar.aspx?EID=8531", "bare URL");
  assert.strictEqual(pick("See https://www.romi.gov/Calendar.aspx?EID=8531.", feed, "8531"), "https://www.romi.gov/calendar.aspx?EID=8531", "case and trailing punctuation");
  assert.strictEqual(pick("x https://romi.gov/calendar.aspx?EID=8531", feed, "8531"), "https://romi.gov/calendar.aspx?EID=8531", "www ignored when matching the site");
  assert.strictEqual(pick("https://www.romi.gov/calendar.aspx?EID=8531", feed, "ev-8531"), "https://www.romi.gov/calendar.aspx?EID=8531", "UID that ends in the id");
  // refused: never guessed
  assert.strictEqual(pick("https://www.romi.gov/calendar.aspx?EID=8531", feed, "8532"), null, "id differs from the UID");
  assert.strictEqual(pick("https://other.org/calendar.aspx?EID=8531", feed, "8531"), null, "different site");
  assert.strictEqual(pick("https://www.romi.gov/calendar.aspx?EID=8531 and https://www.romi.gov/calendar.aspx?EID=8532", feed, "8531"), null, "two different event pages");
  assert.strictEqual(pick("https://www.romi.gov/calendar.aspx?EID=8531 https://www.romi.gov/calendar.aspx?EID=8531", feed, "8531"), "https://www.romi.gov/calendar.aspx?EID=8531", "the same page twice is one page");
  assert.strictEqual(pick("https://www.romi.gov/calendar.aspx?EID=8531&x=1", feed, "8531"), null, "extra parameter");
  assert.strictEqual(pick("https://www.romi.gov/events/calendar.aspx?EID=8531", feed, "8531"), null, "not exactly /calendar.aspx");
  assert.strictEqual(pick("https://www.romi.gov/calendar.aspx?EID=85a", feed, "85"), null, "non-numeric id");
  assert.strictEqual(pick("https://www.romi.gov/common/modules/iCalendar/iCalendar.aspx?feed=calendar", feed, "1"), null, "the feed path is not an event page");
  assert.strictEqual(pick("no link here", feed, "1"), null);
  assert.strictEqual(pick(null, feed, "1"), null);
  assert.strictEqual(pick("https://www.romi.gov/calendar.aspx?EID=1", "not a url", "1"), null);
  assert.strictEqual(pick("https://www.romi.gov/calendar.aspx?EID=1", feed, undefined), null);
  assert.strictEqual(pick("https://www.romi.gov/calendar.aspx?EID=1", feed, "no-number"), null);
  console.log("PASS: event page taken from description text only on the feed's own site, once, exact path, and this event's UID");
}

async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const source = { id: "fs-ro", venue_name: "City of Royal Oak", default_category: "community", feed_url: FEED_URL, feed_format: "ics", status: "approved", location_per_event: true };
  const { rows } = await runFeed(source, ics([
    { uid: "8531", url: FEED, desc: "Day Trip https://www.romi.gov/calendar.aspx?EID=8531" },
    { uid: "8532", url: FEED, desc: "Real text about the event.\\nhttps://www.romi.gov/calendar.aspx?EID=8532" },
    { uid: "8533", url: FEED, desc: "Mismatch https://www.romi.gov/calendar.aspx?EID=1" },
    { uid: "8534", url: FEED, desc: "Other site https://example.org/calendar.aspx?EID=8534" },
    { uid: "8535", url: FEED },
    { uid: "8536", url: "https://www.romi.gov/calendar.aspx?EID=8536", desc: "Has its own link https://www.romi.gov/calendar.aspx?EID=8536" },
  ]));
  const by = (t) => rows.find((r) => r.title === t);
  assert.strictEqual(by("8531").event_url, "https://www.romi.gov/calendar.aspx?EID=8531", "text plus URL gets event_url at ingestion");
  assert.strictEqual(by("8532").event_url, "https://www.romi.gov/calendar.aspx?EID=8532", "long description gets event_url");
  assert.ok(!("ticket_url" in by("8531")), "never stored as a ticket link");
  assert.ok(by("8531").description.includes("Day Trip"), "the description is left as the feed gave it");
  for (const t of ["8533", "8534", "8535"]) assert.ok(!("event_url" in by(t)), `${t}: no link written, so a stored link is never replaced`);
  assert.strictEqual(by("8536").ticket_url, "https://www.romi.gov/calendar.aspx?EID=8536", "a usable VEVENT URL still wins");
  assert.ok(!("event_url" in by("8536")), "and nothing is derived beside it");
  console.log("PASS: through the generic feed pipeline");
  console.log("\nAll feed-event-page-from-description checks passed.");
}
run().catch((err) => { console.error("FAIL:", err); process.exitCode = 1; });
