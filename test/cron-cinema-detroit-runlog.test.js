// test/cron-cinema-detroit-runlog.test.js — WP 0.5 Batch 1.
//
// Cinema Detroit scrapes WordPress core `pages` (not a calendar plugin) and
// regexes a date out of Divi shortcode content -- see the LOW CONFIDENCE
// header note in cron-cinema-detroit.js. Its normal, expected state is
// zero usable upcoming screenings (every published page's scraped date is
// often already in the past). The Product Owner specifically required this
// suite to prove that healthy-quiet condition is represented as a
// *successful* execution (outcome='success'), not a broken connector.
//
// This connector also has an extra early-return not present in the other
// three Batch 1 connectors (`!Array.isArray(pages)`), which needs its own
// finishRun() call.
//
// Mirrors test/cron-belle-isle-nature-center-runlog.test.js's structure.
// Plain Node assert, no dependencies.
// Run: node test/cron-cinema-detroit-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const API_URL = "https://cinemadetroit.org/wp-json/wp/v2/pages?per_page=100&status=publish";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-cinema-detroit.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  return require(`${REPO_DIR}/api/cron-cinema-detroit.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// Divi shortcode content with an embedded "Weekday, Month D, YYYY | H:MM a.m/p.m." string.
function divPage({ id, title = "A Film", dateLine = "Saturday, December 5, 2026 | 3:30 p.m." }) {
  return {
    id,
    title: { rendered: title },
    content: { rendered: `[et_pb_section][et_pb_row][et_pb_text]${dateLine}[/et_pb_text][/et_pb_row][/et_pb_section]` },
  };
}

function pastPage({ id, title = "An Old Screening" }) {
  return divPage({ id, title, dateLine: "Saturday, January 3, 2020 | 3:30 p.m." });
}

function noDatePage({ id, title = "Undated Page" }) {
  return { id, title: { rendered: title }, content: { rendered: "[et_pb_text]No date info here at all.[/et_pb_text]" } };
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

  // --- 1. normal success: one still-upcoming screening, written ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ([divPage({ id: 1 })]) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success");
    assert.strictEqual(patches[0].body.records_fetched, 1);
    assert.strictEqual(patches[0].body.records_parsed, 1);
    assert.strictEqual(patches[0].body.records_written, 1);
  }
  console.log("PASS: a still-upcoming screening logs outcome=success with matching fetched/parsed/written counts");

  // --- 2. THE HEALTHY-QUIET-SOURCE CASE: pages exist but every scraped
  //     date is already in the past -- this is Cinema Detroit's normal
  //     condition (see LOW CONFIDENCE header note), and must be
  //     represented as successful execution, not a broken connector ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ([pastPage({ id: 1 }), pastPage({ id: 2 })]) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "Cinema Detroit's normal healthy-quiet state must be success, never failed/blocked");
    assert.strictEqual(patches[0].body.records_fetched, 2, "two pages were checked");
    assert.strictEqual(patches[0].body.records_parsed, 0, "none had a still-upcoming date");
    assert.strictEqual(patches[0].body.records_written, 0);
  }
  console.log("PASS: all-pages-in-the-past (Cinema Detroit's normal condition) logs outcome=success, not failed/blocked");

  // --- 2b. fetched > 0 / parsed = 0 via unparseable date text (regex never
  //     matches at all, a different path to the same zero-parsed outcome) ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ([noDatePage({ id: 1 })]) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success");
    assert.strictEqual(patches[0].body.records_fetched, 1);
    assert.strictEqual(patches[0].body.records_parsed, 0);
  }
  console.log("PASS: a page with no parseable date text also logs records_fetched=1/records_parsed=0/outcome=success");

  // --- 3. unexpected API response shape: not the same as a legitimate
  //     zero-record run -- records_fetched can't be trusted, so this is a
  //     failure, not a suspicious-but-valid empty run ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ error: "not an array" }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.error, "Unexpected API response shape");
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "failed", "an unrecognized response shape is a failure, distinct from a legitimate empty run");
  }
  console.log("PASS: a non-array pages response logs outcome=failed (distinct from the legitimate healthy-quiet case)");

  // --- 4. write failure ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ([divPage({ id: 1 })]) }),
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

  // --- 6. logging failure does not break ingestion ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ([divPage({ id: 1 })]) }),
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

  console.log("\nAll cron-cinema-detroit.js WP 0.5 integration tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
