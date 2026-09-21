// test/cron-redford-theatre-runlog.test.js — WP 0.5 Batch 2.
//
// Redford Theatre's parser (parseRedfordEvents / parseDateLine / findDates /
// findTimes) is treated as immutable for this WP -- see cron-redford-theatre.js's
// own 2026-09-16 rewrite header comment -- this suite only exercises the
// run-log wrapper around it, never its parsing rules. Like Dossin/HALO, the
// parser produces final event objects directly with no separate "raw
// candidate" stage, so records_fetched is always null by design, and there
// is no fetched>0/parsed=0 case or malformed-upstream-response case this
// connector's architecture can produce -- both intentionally omitted.
//
// Plain Node assert, no dependencies.
// Run: node test/cron-redford-theatre-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SOURCE_URL = "https://redfordtheatre.com/events/";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-redford-theatre.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  return require(`${REPO_DIR}/api/cron-redford-theatre.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// A title line followed by a single-date/time line -- the simplest shape
// parseDateLine handles (see its own header comment for the other shapes).
function redfordEventHtml({ title = "A Classic Film (1985)", dateLine = "Friday, August 28 at 8:00 PM" } = {}) {
  return `<div>${title}</div><div>${dateLine}</div>`;
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url === SOURCE_URL) return routes.source();
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
      source: () => ({ ok: true, status: 200, text: async () => redfordEventHtml() }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success");
    assert.strictEqual(patches[0].body.records_fetched, null, "records_fetched is genuinely unavailable for this connector, by design");
    assert.strictEqual(patches[0].body.records_parsed, 1);
    assert.strictEqual(patches[0].body.records_written, 1);
  }
  console.log("PASS: normal success logs outcome=success with records_fetched=null (by design) and matching parsed/written counts");

  // --- 2. legitimate zero candidates ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => "<div>Nothing playing right now.</div>" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "a genuinely empty parse is success, not failed");
    assert.strictEqual(patches[0].body.records_parsed, 0);
  }
  console.log("PASS: zero Redford events parsed logs outcome=success with records_parsed=0");

  // --- 3. write failure ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => redfordEventHtml() }),
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

  // --- 4. upstream blocked/auth failure ---
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
    assert.strictEqual(patches[0].body.outcome, "blocked");
    assert.strictEqual(patches[0].body.http_status, 403);
  }
  console.log("PASS: an upstream 403 logs outcome=blocked");

  // --- 5. logging failure does not break ingestion ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => redfordEventHtml() }),
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

  console.log("\nAll cron-redford-theatre.js WP 0.5 integration tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
