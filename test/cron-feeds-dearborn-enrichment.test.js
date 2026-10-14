// test/cron-feeds-dearborn-enrichment.test.js
//
// api/_lib/dearborn-enrichment.js: per-event dearborn.gov links and page-category hints for the City of Dearborn ICS
// rows. Fixtures are real: test/fixtures/dearborn-calendar-listing.html (the event-card block of dearborn.gov/calendar
// saved 2026-10-12) and test/fixtures/dearborn-website-calendar-sample.ics (sample of the city's public ICS).
//
// Run: node test/cron-feeds-dearborn-enrichment.test.js
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
  const { parseListing, matchRows } = require(`${REPO_DIR}/api/_lib/dearborn-enrichment.js`);

  // --- parser: only event cards (the page's alert blocks are not events); category, title, link, date, start time.
  const cards = parseListing(LISTING);
  assert.strictEqual(cards.length, 12);
  const count = (c) => cards.filter((x) => x.category === c).length;
  assert.deepStrictEqual([count("Meeting"), count("Important Date"), count("Classes & Programs"), count("City Event")], [9, 1, 1, 1]);
  const fold = cards.find((c) => /FOLD/.test(c.title));
  assert.deepStrictEqual([fold.path, fold.date, fold.startMin], ["/events/2026/10/14/friends-library-dearborn-fold-used-book-sale", "2026-10-14", 600]);
  assert.deepStrictEqual(parseListing("<html>no cards, just an <b>ALERT</b></html>"), []);
  console.log("PASS: listing parser reads 12 cards (9/1/1/1) and ignores non-event blocks");

  // --- end to end through the cron handler
  let { written: rows, fetched, polled } = await poll();
  const foldRow = one(rows, /Friends Of The Library/);
  assert.strictEqual(foldRow.event_url, "https://www.dearborn.gov/events/2026/10/14/friends-library-dearborn-fold-used-book-sale");
  assert.match(foldRow.note, /Source page category: City Event\./);
  assert.match(foldRow.note, /Held for review/, "the hold note is kept, the category is appended");
  const dance = rows.find((r) => /Specials Dance/.test(r.title) && r.start_date === "2026-10-13");
  assert.strictEqual(dance.event_url, "https://www.dearborn.gov/events/2026/10/13/dearborn-specials-dance");
  assert.match(dance.note, /category: Classes & Programs\./);
  const vacc = rows.find((r) => /Vaccine Clinic/.test(r.title));
  assert.match(vacc.event_url, /dearborn-public-health-host-vaccine-clinic/, "different title wording, same date and start time");
  assert.match(vacc.note, /category: Important Date/);
  const traffic = rows.find((r) => /^Traffic Commission$/.test(r.title));
  assert.match(traffic.event_url, /traffic-commission-meeting/);
  assert.match(traffic.note, /category: Meeting\./);
  const stars = one(rows, /^Symphony Under the Stars$/);
  assert.strictEqual(stars.event_url, undefined, "no card for it: left unlinked, nothing invented");
  assert.ok(!/Source page category/.test(stars.note));
  assert.ok(rows.every((r) => r.status === "pending_review"), "enrichment never changes status");
  assert.ok(rows.every((r) => !("_enrichment" in r)), "internal marker never reaches the database");
  assert.match(polled.last_poll_result, /enrichment: \d+\/\d+ rows linked from 12 listing cards/);
  assert.ok(fetched.length >= 1 && fetched.length <= 3, "bounded fetches");
  console.log("PASS: links and category hints attach on safe matches; status untouched; unmatched rows unlinked");

  // --- existing rows: a reviewer's link and note are never rewritten
  ({ written: rows } = await poll({ stored: [{ external_id: foldRow.external_id, status: "approved" }] }));
  const kept = rows.find((r) => r.external_id === foldRow.external_id);
  assert.strictEqual(kept.status, "approved");
  assert.ok(!("event_url" in kept) && !("note" in kept), "existing row: no event_url or note written");
  console.log("PASS: existing rows keep their link, note and status");

  // --- listing failure: feed still ingests, failure reported, nothing linked
  ({ written: rows, polled } = await poll({ listing: () => ({ ok: false, status: 503, text: async () => "" }) }));
  assert.ok(rows.length > 0 && rows.every((r) => !r.event_url));
  assert.match(polled.last_poll_result, /enrichment failed: HTTP 503/);
  console.log("PASS: listing failure is fail-soft and reported");

  // --- pager: followed only via the page's own link; a page that adds nothing ends it
  ({ fetched } = await poll());
  assert.deepStrictEqual(fetched, ["https://www.dearborn.gov/calendar", "https://www.dearborn.gov/calendar?page=%2C%2C1"], "second request is the page's own pager link; repeat content stops it");
  console.log("PASS: pager follows the exposed link and stops when it adds nothing");

  // --- time budget: a slow second page is abandoned, page-one results are kept, total time stays bounded
  const { enrichRows } = require(`${REPO_DIR}/api/_lib/dearborn-enrichment.js`);
  const rowsB = [{ title: "Friends Of The Library-Dearborn (FOLD) Used Book Sale", start_date: "2026-10-14", time_display: "10:00 AM – 6:00 PM" }];
  let calls = 0;
  const slowSecond = async (url, o) => {
    calls++;
    if (calls === 1) return { ok: true, status: 200, text: async () => LISTING };
    return new Promise((_, reject) => o.signal.addEventListener("abort", () => reject(new Error("aborted")))); // never answers
  };
  const t0 = Date.now();
  const note = await enrichRows(rowsB, FEED, { fetch: slowSecond, budgetMs: 400 });
  assert.ok(Date.now() - t0 < 2000, "bounded by the budget");
  assert.ok(rowsB[0]._enrichment && /friends-library/.test(rowsB[0]._enrichment.event_url), "page-one match kept");
  assert.match(note, /page 2 failed: aborted/);
  console.log("PASS: time budget keeps partial results and stays bounded");

  // --- matching is conservative: ambiguity and weak titles stay unlinked
  const card = { category: "Meeting", title: "Open Mic", path: "/events/2026/10/20/open-mic", date: "2026-10-20", startMin: 1140 };
  const a = { title: "Open Mic", start_date: "2026-10-20", time_display: "7:00 PM" };
  const b = { title: "Open Mic", start_date: "2026-10-20", time_display: "7:00 PM" };
  assert.strictEqual(matchRows([a, b], [card]).size, 0, "two rows for one card: ambiguous, neither linked");
  assert.strictEqual(matchRows([{ title: "Open Mic Night Extravaganza Gala", start_date: "2026-10-20", time_display: "7:00 PM" }], [card]).size, 0, "weak title match is not enough");
  assert.strictEqual(matchRows([{ title: "Open Mic", start_date: "2026-10-21", time_display: "7:00 PM" }], [card]).size, 0, "different date never matches");
  assert.strictEqual(matchRows([{ title: "Open Mic", start_date: "2026-10-20", time_display: "7:00 PM" }], [card]).size, 1);
  console.log("PASS: conservative matching");

  // --- RECURRENCE-ID: the master keeps the bare UID whatever the file order; a feed without the policy is unchanged
  const master = ["BEGIN:VEVENT", "UID:series1@google.com", "DTSTART:20261201T150000Z", "SUMMARY:Series Talk", "END:VEVENT"];
  const override = ["BEGIN:VEVENT", "UID:series1@google.com", "RECURRENCE-ID:20261208T150000Z", "DTSTART:20261209T150000Z", "SUMMARY:Series Talk", "END:VEVENT"];
  const idsFor = async (feed, order) => {
    const body = ["BEGIN:VCALENDAR", ...order.flat(), "END:VCALENDAR"].join("\r\n");
    const written = [];
    global.fetch = async (url, opts = {}) => {
      const m = opts.method || "GET";
      if (url.includes("/feed_sources") && m === "GET") return { ok: true, status: 200, json: async () => [feed] };
      if (url.includes("/feed_sources")) return { ok: true, status: 204 };
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("external_id=in.")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/events") && m === "GET") return { ok: true, status: 200, json: async () => [] };
      if (url === feed.feed_url) return { ok: true, status: 200, text: async () => body };
      if (url.startsWith("https://www.dearborn.gov/")) return { ok: false, status: 503, text: async () => "" };
      if (url.includes("/rest/v1/events") && m === "POST") { written.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
      throw new Error("unmocked " + url);
    };
    await freshHandler()({ headers: {} }, { status() { return this; }, json() { return this; } });
    return written.map((r) => [r.external_id.replace(`feed-${feed.id}-`, ""), r.start_date]).sort((x, y) => x[1].localeCompare(y[1]));
  };
  const expected = [["series1@google.com", "2026-12-01"], ["series1@google.com-2026-12-09", "2026-12-09"]];
  assert.deepStrictEqual(await idsFor(FEED, [master, override]), expected);
  assert.deepStrictEqual(await idsFor(FEED, [override, master]), expected, "file order does not swap the ids");
  const OTHER = { ...FEED, id: "fs-o", venue_name: "City of Test", website: "https://example.org" };
  const other = await idsFor(OTHER, [master, override]);
  assert.deepStrictEqual(other.map((x) => x[0]), ["series1@google.com", "series1@google.com"], "a feed without the policy keeps its previous behaviour (same UID twice)");
  console.log("PASS: master keeps the bare UID in any order; other feeds unchanged");
}
run().catch((e) => { console.error(e); process.exit(1); });
