// test/admin-events-incomplete-paging.test.js — DEBT-003 (2026-10-04): the
// Needs follow-up queue is computed from EVERY upcoming event, not the first
// 1,000.
//
// WHAT WAS MEASURED (production, 2026-10-04): 1,891 upcoming events. The
// queue endpoint asked for all of them in one request; the database API
// returned the first 1,000 by date (through 5 November) with a success
// status. Admin judged those and showed 66 events needing attention. The
// real number was 102: 36 were later than 5 November and were never shown.
//
// The fake database here does what production does: never more than 1,000
// rows per request, success status, no error (test/fixtures/mock-postgrest.js).
//
// Run: node test/admin-events-incomplete-paging.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/admin-events.js`)];
  return require(`${REPO_DIR}/api/admin-events.js`);
}

function makeRes() {
  return { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
}

// n upcoming events, 12 per day from `firstDay`, so many share a date —
// the case in which paging without a total order skips and repeats rows.
function upcoming(n, firstDay, extra) {
  const rows = [];
  const start = new Date(`${firstDay}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    const day = new Date(start + Math.floor(i / 12) * 86400000).toISOString().slice(0, 10);
    rows.push({
      id: `evt-${String(i).padStart(5, "0")}`,
      title: `Event ${i}`,
      category: "music",
      status: i % 40 === 0 ? "pending_review" : "approved",
      start_date: day,
      time_display: "7:00 PM",
      is_all_day: false,
      venue_name_raw: "Somewhere",
      venue_address_raw: "1 Main St",
      venue_city_raw: "Detroit",
      venue_id: null,
      description: "A described event.",
      ticket_url: "https://example.test/t",
      event_url: null,
      source: "Fixture",
      followup_dismissed: false,
      no_fixed_venue: false,
      ticket_status: null,
      link_check_status: null,
      ...(extra ? extra(i) : null),
    });
  }
  return rows;
}

async function callIncomplete(tables) {
  const db = makeMockPostgrest(tables, { cap: 1000 });
  const requests = [];
  global.fetch = async (url, init) => { requests.push(String(url)); return db.fetch(String(url), init); };
  const res = makeRes();
  await freshHandler()({ method: "GET", query: { incomplete: "1" }, headers: { "x-admin-secret": process.env.ADMIN_SECRET } }, res);
  return { res, requests };
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.ADMIN_SECRET = "fixture-admin-secret"; // a test value for this fixture only

  const today = new Date().toISOString().slice(0, 10);

  // --- 1. 2,350 upcoming events; the ones that need attention are all
  //     beyond the first 1,000 by date. Every one of them is returned. ---
  {
    const needsAttention = new Set([1005, 1500, 1999, 2000, 2349]);
    const events = [
      ...upcoming(2350, today, (i) => (needsAttention.has(i) ? { venue_address_raw: null, venue_city_raw: null, venue_name_raw: "-" } : null)),
      { id: "past-1", title: "Yesterday", status: "approved", start_date: "2020-01-01", venue_address_raw: null, venue_city_raw: null },
      { id: "rej-1", title: "Rejected", status: "rejected", start_date: today, venue_address_raw: null, venue_city_raw: null },
    ];
    const { res, requests } = await callIncomplete({ events, venues: [] });

    assert.strictEqual(res._status, 200, JSON.stringify(res._body).slice(0, 300));
    const got = res._body.events;
    assert.strictEqual(got.length, 2350, "every upcoming pending/approved event is returned, not the first 1,000");
    assert.strictEqual(new Set(got.map((e) => e.id)).size, 2350, "no event is returned twice");
    assert.ok(!got.some((e) => e.id === "past-1" || e.id === "rej-1"), "past and rejected events are still excluded");

    const flagged = got.filter((e) => !e.venue_address_raw && !e.venue_city_raw).map((e) => e.id).sort();
    assert.deepStrictEqual(flagged, [...needsAttention].map((i) => `evt-${String(i).padStart(5, "0")}`).sort(),
      "the events needing attention beyond row 1,000 all reach Admin");

    for (let i = 1; i < got.length; i++) {
      assert.ok(got[i - 1].start_date <= got[i].start_date, "still in date order");
    }
    assert.strictEqual(requests.length, 3, "three pages: 1,000 + 1,000 + 350");
    for (const url of requests) assert.ok(/order=start_date\.asc,id\.asc/.test(url), "each page is read in a total order (date, then id)");
  }
  console.log("PASS: with 2,350 upcoming events the queue endpoint returns all 2,350 — the five that need attention past row 1,000 included");

  // --- 2. Control: what the endpoint did before — one request — sees none of them. ---
  {
    const events = upcoming(2350, today, (i) => (i >= 1000 && i % 450 === 5 ? { venue_address_raw: null, venue_city_raw: null } : null));
    const db = makeMockPostgrest({ events, venues: [] }, { cap: 1000 });
    const resp = await db.fetch(`${SUPABASE_URL}/rest/v1/events?status=in.(pending_review,approved)&start_date=gte.${today}&select=id,venue_address_raw,venue_city_raw&order=start_date.asc`, { headers: {} });
    const rows = await resp.json();
    assert.ok(resp.ok, "the database reports success");
    assert.strictEqual(rows.length, 1000, "and returns exactly 1,000 rows");
    assert.strictEqual(rows.filter((e) => !e.venue_address_raw && !e.venue_city_raw).length, 0, "none of the events needing attention is among them");
    assert.strictEqual(events.filter((e) => !e.venue_address_raw && !e.venue_city_raw).length, 3, "though three exist");
  }
  console.log("PASS: control — a single request succeeds, returns 1,000 rows and misses every event past them");

  // --- 3. Exactly 1,000 and exactly 2,000 rows: no row lost at a page edge. ---
  for (const n of [1000, 2000, 999, 1]) {
    const { res, requests } = await callIncomplete({ events: upcoming(n, today), venues: [] });
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.events.length, n, `${n} rows in, ${n} rows out`);
    assert.strictEqual(requests.length, Math.floor(n / 1000) + 1, `${n} rows: stops at the first short page`);
  }
  console.log("PASS: page edges — 1, 999, 1,000 and 2,000 rows are each returned exactly");

  // --- 4. A failed page is an error, never a short list that looks whole. ---
  {
    const db = makeMockPostgrest({ events: upcoming(1500, today), venues: [] }, { cap: 1000 });
    let n = 0;
    global.fetch = async (url, init) => {
      n++;
      if (n === 2) return { ok: false, status: 503, json: async () => ({ message: "upstream unavailable" }), headers: { get: () => null } };
      return db.fetch(String(url), init);
    };
    const res = makeRes();
    await freshHandler()({ method: "GET", query: { incomplete: "1" }, headers: { "x-admin-secret": process.env.ADMIN_SECRET } }, res);
    assert.strictEqual(res._status, 502);
    assert.ok(res._body.error && !res._body.events, "no partial list is returned when a page fails");
  }
  console.log("PASS: a failed page returns an error — never the pages read so far");

  console.log("\nAll admin-events-incomplete-paging.test.js checks passed.");
}

run().catch((err) => { console.error("FAIL:", err && err.stack || err); process.exit(1); });
