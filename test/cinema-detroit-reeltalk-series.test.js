// test/cinema-detroit-reeltalk-series.test.js
//
// Cinema Detroit's home page (WP page id 461, slug "home") lists the "Reel Talk: A Winter Film Series" as an
// et_pb_tabs module: tab controls hold the dates, tab contents hold the films, a "Thursdays at Moondog Café | 8045
// Linwood Street | 48206" line holds the venue. The old parser (one "Month D, YYYY" per page) found nothing in it.
// Fixture: test/fixtures/cinemadetroit-home-461-reeltalk.content-rendered.html, the page's content.rendered as supplied
// from the downloaded pages.json (whitespace-only lines are not significant to the parser).
//
// Run: node test/cinema-detroit-reeltalk-series.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2026-11-09T15:00:00Z");
const assert = require("assert");
const fs = require("fs");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const API_URL = "https://cinemadetroit.org/wp-json/wp/v2/pages?per_page=100&status=publish";
const FIXTURE = fs.readFileSync(`${REPO_DIR}/test/fixtures/cinemadetroit-home-461-reeltalk.content-rendered.html`, "utf8");
const homePage = (html = FIXTURE) => ({ id: 461, slug: "home", link: "https://cinemadetroit.org/", title: { rendered: "Home" }, content: { rendered: html } });

function freshHandler() {
  for (const f of ["api/cron-cinema-detroit.js", "api/_lib/run-log.js", "api/_lib/venue-lookup.js", "api/_lib/source-slugs.js"]) delete require.cache[require.resolve(`${REPO_DIR}/${f}`)];
  return require(`${REPO_DIR}/api/cron-cinema-detroit.js`);
}

(async () => {
  const { parseTabbedSeries, parsePage } = freshHandler();

  // 1. only explicit-year dates parse; year-less ones are rejected, not completed
  const ev = parseTabbedSeries(homePage());
  assert.deepStrictEqual(ev.map((e) => e.start_date), ["2026-11-12", "2027-01-21"]);
  assert.deepStrictEqual(ev.map((e) => e.external_id), ["cinemadetroit-461-20261112", "cinemadetroit-461-20270121"]);
  assert.strictEqual(ev[0].title, "Reel Talk: Movies Before Hollywood: 1895-1912 (10 shorts)");
  assert.strictEqual(ev[1].title, "Reel Talk: STRANGER ON THE THIRD FLOOR (1940)");
  assert.ok(!ev.some((e) => /2026-12-10|01-14|02-11|03-11/.test(e.start_date)), "no year-less date is guessed");

  // 2. venue from the source, no time invented, held for review, ticket/venue not taken from the Eventbrite link
  for (const e of ev) {
    assert.strictEqual(e.venue_name, "Moondog Café");
    assert.strictEqual(e.venue_address, "8045 Linwood Street");
    assert.strictEqual(e.time_display, null);
    assert.strictEqual(e.hold_for_review, true);
    assert.strictEqual(e.event_url, "https://cinemadetroit.org/");
    assert.ok(!/eventbrite/i.test(JSON.stringify(e)));
  }

  // 3. old behaviour unchanged: this page still yields nothing through parsePage; other pages yield no series
  assert.strictEqual(parsePage(homePage()), null);
  assert.deepStrictEqual(parseTabbedSeries({ id: 1, title: { rendered: "A Film" }, content: { rendered: "[et_pb_text]Saturday, December 5, 2026 | 3:30 p.m.[/et_pb_text]" } }), []);

  // 4. impossible calendar dates and a missing venue line produce nothing
  assert.strictEqual(parseTabbedSeries(homePage(FIXTURE.replace(">11.12.26<", ">02.30.27<").replace(">01.21.27<", ">13.01.27<"))).length, 0);
  assert.deepStrictEqual(parseTabbedSeries(homePage(FIXTURE.replace(/Thursdays at Moondog Café \| 8045 Linwood Street \| 48206/, "Thursdays"))), []);

  // 5. handler (the street address is parsed but not written: this connector is in venue-knowledge's NO_ADDRESS_CONNECTORS): new rows are written pending_review at Moondog Café; an existing row keeps its stored status; past dates are rejected
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const run = async (existingRows, pages = [homePage()]) => {
    const writes = [];
    global.fetch = async (url, opts = {}) => {
      if (url === API_URL) return { ok: true, status: 200, json: async () => pages };
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/source_runs")) return { ok: true, status: opts.method === "POST" ? 201 : 204, json: async () => [{ id: "run-1" }] };
      if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => existingRows };
      if (url.includes("/rest/v1/events") && opts.method === "POST") { writes.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
      throw new Error("unmocked URL: " + url);
    };
    const res = { status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; } };
    await freshHandler()({ headers: {} }, res);
    return { res, writes };
  };
  let r = await run([]);
  assert.strictEqual(r.res._s, 200);
  assert.strictEqual(r.writes.length, 2);
  assert.ok(r.writes.every((w) => w.status === "pending_review" && w.venue_name_raw === "Moondog Café" && !("venue_address_raw" in w) && w.time_display === null));
  r = await run([{ external_id: "cinemadetroit-461-20261112", status: "approved", event_url: null }]);
  assert.strictEqual(r.writes.find((w) => w.external_id === "cinemadetroit-461-20261112").status, "approved", "an existing row keeps its stored status");
  assert.strictEqual(r.writes.find((w) => w.external_id === "cinemadetroit-461-20270121").status, "pending_review");
  r = await run([], [homePage(FIXTURE.replace(">11.12.26<", ">10.01.26<"))]);
  assert.deepStrictEqual(r.writes.map((w) => w.external_id), ["cinemadetroit-461-20270121"], "a past explicit date is rejected");

  console.log("PASS: Reel Talk tabs parse explicit-year dates only, venue from source, held for review, status preserved, past rejected");
})().catch((e) => { console.error(e); process.exit(1); });
