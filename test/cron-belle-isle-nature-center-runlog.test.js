// test/cron-belle-isle-nature-center-runlog.test.js — WP 0.5 Batch 1.
//
// Belle Isle Nature Center is a Tribe Events (WordPress "The Events
// Calendar") JSON API source, same shape as cron-lagerhouse.js's pilot but
// without a parser refactor: the handler already computes a natural
// pre-filter "fetched" array (`events`, the raw Tribe API array) and a
// post-filter "parsed" array (`rows`, after the start_date filter) as
// separate named variables, so records_fetched/records_parsed are read
// directly off existing variables -- no parsing/business logic touched.
//
// Mirrors test/cron-lagerhouse-runlog.test.js's structure and mock-fetch
// approach. Plain Node assert, no dependencies.
// Run: node test/cron-belle-isle-nature-center-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const API_URL = "https://belleislenaturecenter.org/wp-json/tribe/events/v1/events?per_page=50";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-belle-isle-nature-center.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  return require(`${REPO_DIR}/api/cron-belle-isle-nature-center.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

function tribeEvent({ id, title = "Nature Walk", start_date = "2026-12-01 10:00:00", end_date = "2026-12-01 11:00:00", cost = "", url = "https://belleislenaturecenter.org/event/x", image = false, description = "<p>Come explore.</p>" }) {
  return { id, title, description, start_date, end_date, cost, url, image };
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
  delete process.env.CRON_SECRET; // no auth header needed in these fixtures

  // --- 1. normal success: two valid events, both written ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [tribeEvent({ id: 1 }), tribeEvent({ id: 2, title: "Bird Walk" })] }) }),
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

  // --- 2. legitimate zero upstream records: this is a small venue, an
  //     empty events array is expected, not a broken scraper ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [] }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "a genuinely quiet small venue is success, not failed");
    assert.strictEqual(patches[0].body.records_fetched, 0);
    assert.strictEqual(patches[0].body.records_parsed, 0);
    assert.strictEqual(patches[0].body.records_written, 0);
  }
  console.log("PASS: zero upstream events logs outcome=success with records_fetched=0 (legitimate quiet run, small venue)");

  // --- 3. fetched > 0 / parsed = 0: events present but none have a
  //     start_date, so the .filter((e) => e.start_date) step drops all of
  //     them -- the "suspicious zero" signal, not a crash ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [tribeEvent({ id: 1, start_date: null }), tribeEvent({ id: 2, start_date: "" })] }) }),
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
    assert.strictEqual(patches[0].body.records_parsed, 0, "but neither had a usable start_date");
  }
  console.log("PASS: events present but none parseable logs records_fetched=2/records_parsed=0");

  // --- 4. write failure: the Supabase upsert POST fails ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [tribeEvent({ id: 1 })] }) }),
      upsert: () => ({ ok: false, status: 500, text: async () => "internal server error" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 502);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "failed");
    assert.strictEqual(patches[0].body.records_fetched, 1);
    assert.strictEqual(patches[0].body.records_parsed, 1);
    assert.strictEqual(patches[0].body.records_written, 0);
    assert.ok(patches[0].body.error_sample.includes("internal server error"));
  }
  console.log("PASS: a failed upsert logs outcome=failed with records_written=0 and an error_sample");

  // --- 5. upstream blocked/auth failure: the Tribe API fetch itself
  //     returns 403 ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: false, status: 403, text: async () => "" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "blocked", "a 403 from the upstream is blocked, not failed");
    assert.strictEqual(patches[0].body.http_status, 403);
  }
  console.log("PASS: an upstream 403 logs outcome=blocked (not failed, not silently success)");

  // --- 6. logging failure does not break ingestion: the source_runs POST
  //     itself fails, so startRun() returns null -- the connector must
  //     still fetch, parse and write normally, with no finishRun PATCH
  //     ever attempted (there's no runHandle to finish) ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [tribeEvent({ id: 1 })] }) }),
      runInsert: () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200, "ingestion succeeds even though run-log insert failed");
    assert.strictEqual(res._body.upserted, 1);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 0, "no PATCH is attempted when startRun() never produced a runId");
  }
  console.log("PASS: a source_runs logging failure at startRun() does not affect ingestion's own success/response");

  console.log("\nAll cron-belle-isle-nature-center.js WP 0.5 integration tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
