// test/wp07-partial-writes.test.js — when one key-shape group of a batch is
// rejected, the connector says exactly what was and was not written.
//
// Before WP 0.7 a connector's write was one request: it landed or it did
// not, and a failure branch could hard-code "0 written". Now a batch can be
// several requests, so part of it can land. A connector that still reported
// 0 — or reported the whole batch as failed, or threw away the rows that
// did land — would be telling the run log and the operator something false.
// This runs one connector of each call-site pattern through a partial
// failure:
//   1. Ticketmaster       plain response, no run log
//   2. WDET               records the run in source_runs
//   3. Detroit Month of Design   chunked writes, per-chunk error list
//   4. Playground Detroit        the other chunked writer
//   5. Popps Packing      two sets (new / existing) written concurrently
//   6. Ticketmaster again: a network failure on the second request
// test/wp07-connector-coverage.test.js pins the same failure-branch code,
// textually, in all 25.
//
// Plain Node assert, no dependencies. Run: node test/wp07-partial-writes.test.js
"use strict";
const assert = require("assert");

const { world, page, json, notFound, runConnector, eventWrites, byId, SUPABASE_URL } = require("./fixtures/connector-harness.js");

// Reject (HTTP 400) the events write whose body mentions `marker`.
const rejectGroupContaining = (marker) => (request) =>
  request.table === "events" && request.method === "POST" && request.body.includes(marker) ? 400 : null;
const REJECTION = '{"message":"mock failure"}';

async function run() {
  // --- 1. Ticketmaster: plain response -------------------------------------
  const tmEvent = (id, name, info) => ({
    id, name, info, url: `https://www.ticketmaster.com/event/${id}`,
    classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
    dates: { start: { localDate: "2026-10-09", localTime: "19:30:00" }, status: { code: "onsale" } },
    images: [{ ratio: "16_9", url: `https://s1.ticketm.net/dam/a/${id}.jpg`, width: 1024 }],
    _embedded: { venues: [{ name: "Fixture Hall", city: { name: "Detroit" }, address: { line1: "2115 Woodward Ave" }, location: { latitude: "42.3387", longitude: "-83.0524" } }] },
  });
  const tmEvents = [tmEvent("tm-a", "Band A", "Doors at 6:30."), tmEvent("tm-b", "Band B"), tmEvent("tm-c", "Band C", "Seated."), tmEvent("tm-d", "Band D"), tmEvent("tm-e", "Band E")];
  const tmUpstream = (url) => (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json") ? json({ _embedded: { events: tmEvents }, page: { totalPages: 1 } }) : null);
  {
    const { tables, db } = world({ upstream: tmUpstream, failure: rejectGroupContaining('"tm-b"') });
    const res = await runConnector("cron-ticketmaster.js");
    assert.strictEqual(eventWrites(db).length, 2, "both groups were sent");
    assert.strictEqual(res._status, 502, "a partly rejected batch is still a failure");
    assert.strictEqual(res._body.upserted, 2, "…that reports the two rows which did land — not 0, not 5");
    assert.strictEqual(res._body.error, `Supabase upsert failed: [1 of 2 key-shape groups rejected; 2 of 5 rows written] ${REJECTION}`);
    assert.deepStrictEqual(tables.events.map((r) => r.external_id).sort(), ["tm-a", "tm-c"]);
  }
  console.log("PASS: Ticketmaster — one of two groups rejected: 502, upserted: 2, and an error that says 2 of 5 were written");

  // --- 2. WDET: the run log ---------------------------------------------------
  {
    const wdetEvent = (id, address) => ({
      id, title: `Session ${id}`, description: "<p>Live.</p>", cost: "$20", url: `https://wdet.org/event/${id}`, image: false,
      start_date: "2026-10-09 19:00:00", end_date: "2026-10-09 21:00:00", categories: [{ name: "Music", slug: "music" }],
      venue: { venue: "El Club", city: "Detroit", address },
    });
    const events = [wdetEvent(9001, "4114 Vernor Hwy"), wdetEvent(9002, undefined), wdetEvent(9003, "4114 Vernor Hwy")];
    const { tables } = world({
      upstream: (url) => (url.startsWith("https://wdet.org/wp-json/tribe/events/v1/events") ? json({ events }) : null),
      failure: rejectGroupContaining('"wdet-9002"'),
    });
    const res = await runConnector("cron-wdet.js");
    assert.deepStrictEqual([res._status, res._body.upserted], [502, 2]);
    const logged = tables.source_runs[0];
    assert.strictEqual(logged.outcome, "failed", "the run is logged as failed — a rejected group is never a success");
    assert.strictEqual(logged.records_written, 2, "with the true number of rows written");
    assert.strictEqual(logged.http_status, 400);
    assert.ok(logged.error_sample.startsWith("Supabase upsert failed: [1 of 2 key-shape groups rejected; 2 of 3 rows written] "), logged.error_sample);
    assert.deepStrictEqual(tables.events.map((r) => r.external_id).sort(), ["wdet-9001", "wdet-9003"]);
  }
  console.log("PASS: WDET — the run log records outcome failed, records_written 2, and the account of what landed at the front of the error");

  // --- 3. Detroit Month of Design: chunked, per-chunk error list -------------
  {
    const base = "https://www.detroitmonthofdesign.org/event-details/";
    const ld = (fields) => `<html><head><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Event", ...fields })}</script></head></html>`;
    const place = { "@type": "Place", name: "Fixture Gallery", address: "123 Main St, Detroit, MI 48226" };
    const pages = {
      "with-description-1": ld({ name: "One", startDate: "2026-10-09T11:00:00-04:00", description: "d", location: place }),
      "bare-1": ld({ name: "Two", startDate: "2026-10-10T11:00:00-04:00", location: place }),
      "with-description-2": ld({ name: "Three", startDate: "2026-10-11T11:00:00-04:00", description: "d", location: place }),
      "bare-2": ld({ name: "Four", startDate: "2026-10-12T11:00:00-04:00", location: place }),
    };
    const sitemap = `<urlset>${Object.keys(pages).map((slug) => `<url><loc>${base}${slug}</loc></url>`).join("")}</urlset>`;
    const { tables } = world({
      upstream: (url) => {
        if (url === "https://www.detroitmonthofdesign.org/event-pages-sitemap.xml") return page(sitemap);
        return url.startsWith(base) && pages[url.slice(base.length)] ? page(pages[url.slice(base.length)]) : notFound();
      },
      failure: rejectGroupContaining('"dmod-bare-1"'),
    });
    const res = await runConnector("cron-detroitmonthofdesign.js");
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._body.upserted, 2, "the rows of the accepted group are counted");
    assert.strictEqual(res._body.upsertErrors.length, 1);
    assert.deepStrictEqual(res._body.upsertErrors[0].externalIds.sort(), ["dmod-bare-1", "dmod-bare-2"], "the error lists only the rows that were rejected — not the whole chunk");
    assert.deepStrictEqual(tables.events.map((r) => r.external_id).sort(), ["dmod-with-description-1", "dmod-with-description-2"]);
  }
  console.log("PASS: Detroit Month of Design — a rejected group inside a chunk: upserted counts the rest, and the error names only the rejected rows");

  // --- 4. Playground Detroit: the other chunked writer -------------------------
  {
    const gcal = (dates, location) => `<html><body><a href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;dates=${dates}${location ? `&amp;location=${encodeURIComponent(location)}` : ""}">Add</a></body></html>`;
    const list = [1, 2, 3].map((n) => ({ id: 600 + n, link: `https://playgrounddetroit.com/events/e${n}/`, title: { rendered: `Event ${n}` }, excerpt: { rendered: "" }, mec_category: [] }));
    const details = {
      "https://playgrounddetroit.com/events/e1/": gcal("20261009T180000/20261009T210000", "2845 Gratiot Ave, Detroit, MI 48207"),
      "https://playgrounddetroit.com/events/e2/": gcal("20261010T180000/20261010T210000"),
      "https://playgrounddetroit.com/events/e3/": gcal("20261011T180000/20261011T210000", "2845 Gratiot Ave, Detroit, MI 48207"),
    };
    const { tables } = world({
      upstream: (url) => {
        if (url.startsWith("https://playgrounddetroit.com/wp-json/wp/v2/mec-events")) return json(list, { "x-wp-totalpages": "1" });
        if (url.startsWith("https://playgrounddetroit.com/wp-json/wp/v2/mec_category")) return json([]);
        return details[url] ? page(details[url]) : notFound();
      },
      failure: rejectGroupContaining('"playgrounddetroit-602"'),
    });
    const res = await runConnector("cron-playgrounddetroit.js", { fastTimers: true });
    assert.deepStrictEqual([res._status, res._body.upserted], [502, 2]);
    assert.deepStrictEqual(res._body.upsertErrors.map((e) => e.externalIds), [["playgrounddetroit-602"]]);
    assert.deepStrictEqual(tables.events.map((r) => r.external_id).sort(), ["playgrounddetroit-601", "playgrounddetroit-603"]);
  }
  console.log("PASS: Playground Detroit — same: upserted 2, the error names the one rejected row");

  // --- 5. Popps Packing: two sets written concurrently ---------------------------
  {
    const post = (id, title, excerpt, image) => ({
      id, date: "2026-09-20T10:00:00", link: `https://www.poppspacking.org/?p=${id}`, title: { rendered: title }, excerpt: { rendered: excerpt },
      _embedded: image ? { "wp:featuredmedia": [{ source_url: `https://www.poppspacking.org/${id}.jpg` }] } : {},
    });
    const posts = [
      post(1, "Open Studio October 9, 5-8PM", "<p>Come by.</p>", true),
      post(2, "Workshop October 10, 1-4PM", "<p>Make things.</p>", false),
      post(3, "Talk October 11, 2-3PM", "<p>Listen.</p>", true),
      post(4, "Existing October 12, 6-7PM", "<p>Already stored.</p>", true),
    ];
    const { tables } = world({
      events: [{ id: "row-4", external_id: "poppspacking-4", title: "Existing", category: "visual", start_date: "2026-10-12", status: "approved", time_display: "6:00 PM–7:00 PM" }],
      upstream: (url) => (url.startsWith("https://www.poppspacking.org/wp-json/wp/v2/posts") ? json(posts) : null),
      failure: rejectGroupContaining('"poppspacking-2"'),
    });
    const res = await runConnector("cron-poppspacking.js");
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._body.upserted, 3, "two new rows and the existing one landed; one new row did not");
    assert.ok(res._body.error.includes("[1 of 2 key-shape groups rejected; 2 of 3 rows written]"), res._body.error);
    assert.deepStrictEqual(tables.events.map((r) => r.external_id).sort(), ["poppspacking-1", "poppspacking-3", "poppspacking-4"]);
    assert.strictEqual(byId(tables, "poppspacking-4").status, "approved");
  }
  console.log("PASS: Popps Packing — a rejected group in the new-rows set: upserted 3 (two new + the existing row), and the error says which part");

  // --- 6. a network failure on the second of two requests -------------------------
  {
    const { tables, db } = world({ upstream: tmUpstream });
    const real = global.fetch;
    let eventPosts = 0;
    global.fetch = async (url, init) => {
      if (String(url).startsWith(`${SUPABASE_URL}/rest/v1/events`) && init && init.method === "POST" && ++eventPosts === 2) throw new Error("socket hang up");
      return real(url, init);
    };
    const res = await runConnector("cron-ticketmaster.js");
    assert.strictEqual(tables.events.length, 2, "the first group was committed before the connection dropped");
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._body.upserted, 2, "and the connector says so, instead of reporting 0 from a catch block");
    assert.strictEqual(res._body.error, "Supabase upsert failed: [1 of 2 key-shape groups rejected; 2 of 5 rows written] request failed: socket hang up");
    assert.strictEqual(eventWrites(db).length, 1, "(the request that threw never reached the database)");
  }
  console.log("PASS: a dropped connection on the second request is reported as 2 of 5 written, not as an unexplained failure with 0");

  console.log("\nAll wp07-partial-writes.test.js checks passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
