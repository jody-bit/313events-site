// test/cron-wdet-runlog.test.js — WP 0.5 Batch 1.
//
// WDET is a Tribe Events JSON API source like Belle Isle Nature Center,
// but with an extra per-row venue/city/category filter (excluding travel
// packages and non-Detroit-area venues) folded into the same
// .map().filter(Boolean) step. records_fetched/records_parsed are read
// directly off the existing `events`/`rows` variables -- no
// parsing/business logic touched.
//
// Mirrors test/cron-belle-isle-nature-center-runlog.test.js's structure.
// Plain Node assert, no dependencies.
// Run: node test/cron-wdet-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const API_URL = "https://wdet.org/wp-json/tribe/events/v1/events?per_page=50";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-wdet.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  return require(`${REPO_DIR}/api/cron-wdet.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

function wdetEvent({ id, title = "Live Session", venueName = "El Club", venueCity = "Detroit", venueAddress = undefined, description = undefined, category = "Music", start_date = "2026-12-01 20:00:00", end_date = "2026-12-01 22:00:00", cost = "", url = "https://wdet.org/event/x", image = false }) {
  return {
    id,
    title,
    description,
    cost,
    url,
    image,
    start_date,
    end_date,
    venue: venueName ? { venue: venueName, city: venueCity, address: venueAddress } : null,
    categories: category ? [{ name: category }] : [],
  };
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url === API_URL) return routes.source();
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return routes.runInsert ? routes.runInsert() : { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return routes.runUpdate ? routes.runUpdate() : { ok: true, status: 204, json: async () => ({}) };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return routes.statusLookup ? routes.statusLookup() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && opts.method === "POST") return routes.upsert ? routes.upsert() : { ok: true, status: 201, text: async () => "" };
    throw new Error("unmocked URL in test: " + url);
  };
  return { fetchFn, calls };
}

function patchCalls(calls) {
  return calls.filter((c) => c.url.includes("/rest/v1/source_runs") && c.opts.method === "PATCH");
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 1. normal success ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [wdetEvent({ id: 1 }), wdetEvent({ id: 2, title: "Second Show" })] }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 2);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success");
    assert.strictEqual(patches[0].body.records_fetched, 2);
    assert.strictEqual(patches[0].body.records_parsed, 2);
    assert.strictEqual(patches[0].body.records_written, 2);
  }
  console.log("PASS: normal success logs outcome=success with matching fetched/parsed/written counts");

  // --- 2. legitimate zero upstream records ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [] }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success");
    assert.strictEqual(patches[0].body.records_fetched, 0);
    assert.strictEqual(patches[0].body.records_parsed, 0);
  }
  console.log("PASS: zero upstream events logs outcome=success with records_fetched=0");

  // --- 3. fetched > 0 / parsed = 0: e.g. travel packages (no venue) and a
  //     non-Detroit-area venue -- both filtered out by the existing
  //     venue/city rule, not a crash ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            wdetEvent({ id: 1, venueName: null }), // WDET Travel package, no venue attached
            wdetEvent({ id: 2, venueCity: "Ann Arbor" }), // real venue, but not an allowed city
          ],
        }),
      }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "still success -- the run completed normally");
    assert.strictEqual(patches[0].body.records_fetched, 2, "two raw events were present");
    assert.strictEqual(patches[0].body.records_parsed, 0, "but neither passed the venue/city filter");
  }
  console.log("PASS: travel packages / out-of-area venues logs records_fetched=2/records_parsed=0");

  // --- 4. write failure ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [wdetEvent({ id: 1 })] }) }),
      upsert: () => ({ ok: false, status: 500, text: async () => "internal server error" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 502);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "failed");
    assert.strictEqual(patches[0].body.records_written, 0);
    assert.ok(patches[0].body.error_sample.includes("internal server error"));
  }
  console.log("PASS: a failed upsert logs outcome=failed with records_written=0 and an error_sample");

  // --- 5. upstream blocked/auth failure ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: false, status: 401, text: async () => "" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "blocked", "a 401 from the upstream is blocked, not failed");
    assert.strictEqual(patches[0].body.http_status, 401);
  }
  console.log("PASS: an upstream 401 logs outcome=blocked");

  // --- 6. logging failure does not break ingestion ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [wdetEvent({ id: 1 })] }) }),
      runInsert: () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 0, "no PATCH is attempted when startRun() never produced a runId");
  }
  console.log("PASS: a source_runs logging failure does not affect ingestion's own success/response");

  // --- 7. Needs Follow-up burn-down (2026-09-22): description and
  //     venue_address_raw/venue_city_raw are recovered from Tribe's own
  //     `description`/`venue.address`/`venue.city` fields -- data the API
  //     already returns (live-verified 2026-09-22) and this connector
  //     previously discarded. Confirms this clears admin.html's exact
  //     getMissingFields() "description" and "venue address/city" checks
  //     for an event that also has a ticket_url and time_display, i.e. it
  //     is fully cleared from Needs Follow-up, not just partially patched. ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            wdetEvent({
              id: 1,
              venueName: "The Detroit Princess Riverboat",
              venueCity: "Detroit",
              venueAddress: "1 Civic Center Drive",
              description: "<p>Waajeed and Liz Warner spin a sunset cruise. &#038; more.</p>",
            }),
          ],
        }),
      }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const upsertCall = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    assert.ok(upsertCall, "an upsert POST must have been made");
    const row = upsertCall.body[0];
    assert.strictEqual(row.description, "Waajeed and Liz Warner spin a sunset cruise. & more.", "HTML must be stripped and entities decoded");
    assert.strictEqual(row.venue_address_raw, "1 Civic Center Drive");
    assert.strictEqual(row.venue_city_raw, "Detroit");

    // Replicates admin.html's exact getMissingFields() logic inline (same
    // approach as test/cron-dossin-runlog.test.js's WP burn-down test).
    function getMissingFields(e) {
      const missing = [];
      if (!e.description || !e.description.trim()) missing.push("description");
      const hasRawAddress = !!(e.venue_address_raw && e.venue_address_raw.trim()) || !!(e.venue_city_raw && e.venue_city_raw.trim());
      const hasLinkedVenueAddress = !!(e.venues && e.venues.address && e.venues.address.trim());
      if (!hasRawAddress && !hasLinkedVenueAddress) missing.push("venue address/city");
      if (!(e.ticket_url && e.ticket_url.trim()) && !(e.event_url && e.event_url.trim())) missing.push("ticket/event link");
      if (!e.is_all_day && !(e.time_display && e.time_display.trim())) missing.push("start time");
      return missing;
    }
    assert.deepStrictEqual(getMissingFields(row), [], "with description + address/city recovered (and this row's existing ticket_url + time_display), the event is fully cleared from Needs Follow-up");
  }
  console.log("PASS: recovered description + venue_address_raw/venue_city_raw fully clear a WDET event from Needs Follow-up");

  console.log("\nAll cron-wdet.js WP 0.5 integration tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
