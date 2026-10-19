// test/cron-feeds-ticket-link.test.js — Q17 through the generic ICS and RSS pipelines (api/cron-feeds.js).
//
// A VEVENT URL / RSS link becomes ticket_url only if it is an absolute http(s) event page, or a site-relative path that
// resolves against the feed's own site to an event page. The CivicPlus calendar-feed path (565 production rows) and price
// text are not stored, and the rejection is named in the run's poll result.
//
// Run: node test/cron-feeds-ticket-link.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2025-01-01T00:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const FEED_URL = "https://www.royaloakmi.com/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=23";
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
  global.fetch = async (url, opts = {}) => {
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
  return { rows: upserted, body: res._body };
}
const byTitle = (rows, t) => rows.find((r) => r.title === t);

async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const source = { id: "fs-ro", venue_name: "City of Royal Oak", default_category: "community", feed_url: FEED_URL, feed_format: "ics", status: "approved", location_per_event: true };

  {
    const { rows, body } = await runFeed(source, ics([
      { uid: "feedpath", url: FEED },
      { uid: "absfeed", url: "https://www.royaloakmi.com" + FEED },
      { uid: "text", url: "Pay at the door" },
      { uid: "none" },
      { uid: "abs", url: "https://www.royaloakmi.com/Calendar.aspx?EID=912" },
      { uid: "rel", url: "/Calendar.aspx?EID=913" },
    ]));
    for (const t of ["feedpath", "absfeed", "text"]) assert.ok(!("ticket_url" in byTitle(rows, t)), `${t}: a rejected link is left out of the write, so it can never replace a stored link`);
    assert.ok(!("ticket_url" in byTitle(rows, "none")), "a missing source link is left out of the write too, so it cannot erase a stored link");
    assert.strictEqual(byTitle(rows, "abs").ticket_url, "https://www.royaloakmi.com/Calendar.aspx?EID=912", "a real event page is kept");
    assert.strictEqual(byTitle(rows, "rel").ticket_url, "https://www.royaloakmi.com/Calendar.aspx?EID=913", "a site-relative event page resolves against the feed's own site");
    assert.strictEqual(rows.length, 6, "no event is dropped for a bad link");
    const text = JSON.stringify(body);
    assert.strictEqual(body.linkRejections.logged, 3, "the run reports the three bounded diagnostics it logged");
    assert.deepStrictEqual(body.linkRejections.totalsBySourceAndReason.map((t) => [t.source, t.reason, t.count]).sort(), [["fs-ro", "feed_path", 2], ["fs-ro", "not_a_link", 1]]);
    assert.ok(/3 source links not usable/.test(text) && /feed_path 2/.test(text) && /not_a_link 1/.test(text), `the run log names the rejections: ${text}`);
  }
  console.log("PASS: ICS — feed paths and price text are not stored, good and resolvable links are, no event is dropped, the rejection is in the run log");

  {
    const rssSource = { id: "fs-rss", venue_name: "Some Org", default_category: "community", feed_url: "https://rss.example/feed.xml", feed_format: "rss", status: "approved" };
    const { rows } = await runFeed(rssSource, rss([{ id: "good", link: "https://rss.example/e/1" }, { id: "feedlink", link: "https://rss.example/calendar.rss" }, { id: "rel", link: "/e/2" }]));
    assert.strictEqual(byTitle(rows, "good concert").ticket_url, "https://rss.example/e/1");
    assert.ok(!("ticket_url" in byTitle(rows, "feedlink concert")), "RSS: a rejected link is left out of the write");
    assert.strictEqual(byTitle(rows, "rel concert").ticket_url, "https://rss.example/e/2");
  }
  console.log("PASS: RSS — same rule");

  console.log("\nAll cron-feeds-ticket-link.test.js checks passed.");
}
run().catch((err) => { console.error("FAIL:", err); process.exitCode = 1; });
