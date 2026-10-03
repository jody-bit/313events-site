// test/paged-fetch.test.js — unit tests for paged-fetch.js's fetchAllRows().
//
// Written for the 2026-10-03 loading defect: Supabase returns at most its
// "Max rows" setting (1,000) per request no matter what `limit=` asks for,
// so every page's single un-paged event query was silently truncated (see
// paged-fetch.js's header). These tests run the REAL helper against a mock
// API that enforces that same cap (test/fixtures/mock-postgrest.js) and
// prove it returns every row — for the cap production has today, for a
// lower cap, with no row count available, and through failures.
//
// Run: node test/paged-fetch.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { fetchAllRows } = require(`${REPO_DIR}/paged-fetch.js`);
const { makeMockPostgrest } = require(`${REPO_DIR}/test/fixtures/mock-postgrest.js`);

const BASE = "https://example.supabase.co/rest/v1";
const HEADERS = { apikey: "anon", Authorization: "Bearer anon" };

function makeRows(count) {
  // start_date deliberately repeats (many rows per date) so `id` is the
  // only thing that makes the order total — exactly as in production.
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${String(i).padStart(5, "0")}`,
    start_date: `2026-${String(1 + (Math.floor(i / 300) % 12)).padStart(2, "0")}-15`,
  }));
}
const expectedOrder = (rows) =>
  [...rows].sort((a, b) => (a.start_date === b.start_date ? (a.id < b.id ? -1 : 1) : a.start_date < b.start_date ? -1 : 1)).map((r) => r.id);
const URL_EVENTS = `${BASE}/events?select=id,start_date&order=start_date.asc,id.asc`;

// Silence the helper's own console.warn for the cases that expect one, and
// capture it so the test can assert a warning really was raised.
function captureWarnings(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  return fn().then(
    (value) => { console.warn = original; return { value, warnings }; },
    (err) => { console.warn = original; throw err; }
  );
}

async function run() {
  // --- 0. The defect itself, reproduced by the mock ---
  {
    const rows = makeRows(2953);
    const api = makeMockPostgrest({ events: rows }, { cap: 1000 });
    const resp = await api.fetch(`${URL_EVENTS}&limit=5000`, { headers: HEADERS });
    assert.strictEqual(resp.ok, true, "the truncated response still reports success — that is why nobody noticed");
    const got = await resp.json();
    assert.strictEqual(got.length, 1000, "a single request asking for limit=5000 gets only 1,000 rows");
  }
  console.log("PASS: (defect reproduced) one request with limit=5000 silently returns only 1,000 of 2,953 rows");

  // --- 1. Production's cap today: 1,000 ---
  {
    const rows = makeRows(2953);
    const api = makeMockPostgrest({ events: rows }, { cap: 1000 });
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch });
    assert.strictEqual(result.rows.length, 2953);
    assert.strictEqual(result.total, 2953);
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.pages, 3);
    assert.deepStrictEqual(result.rows.map((r) => r.id), expectedOrder(rows), "rows arrive complete and in query order");
    assert.strictEqual(new Set(result.rows.map((r) => r.id)).size, 2953, "no duplicates");
    assert.strictEqual(api.log.length, 4, "1 count request + 3 pages — no wasted requests");
  }
  console.log("PASS: returns all 2,953 rows through a 1,000-row cap, in order, in 1 count request + 3 pages");

  // --- 2. A cap LOWER than the page size asked for ---
  for (const cap of [400, 250, 1]) {
    const rows = makeRows(cap === 1 ? 37 : 2953);
    const api = makeMockPostgrest({ events: rows }, { cap });
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch });
    assert.strictEqual(result.rows.length, rows.length, `cap ${cap}: every row returned`);
    assert.deepStrictEqual(result.rows.map((r) => r.id), expectedOrder(rows), `cap ${cap}: no gaps, no duplicates, in order`);
    assert.strictEqual(result.complete, true);
  }
  console.log("PASS: never assumes the cap is 1,000 — still returns every row when the server caps at 400, 250 or 1");

  // --- 3. No row count available at all ---
  {
    const rows = makeRows(2953);
    const api = makeMockPostgrest({ events: rows }, { cap: 1000, exposeCount: false });
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch });
    assert.strictEqual(result.total, null);
    assert.deepStrictEqual(result.rows.map((r) => r.id), expectedOrder(rows));
    assert.strictEqual(result.complete, true);
  }
  {
    const rows = makeRows(2953);
    const api = makeMockPostgrest({ events: rows }, { cap: 300, exposeCount: false });
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch });
    assert.deepStrictEqual(result.rows.map((r) => r.id), expectedOrder(rows), "no count AND a low cap: still complete");
  }
  console.log("PASS: with no Content-Range total, pages until an empty page and still returns every row");

  // --- 4. Boundaries ---
  {
    const api = makeMockPostgrest({ events: makeRows(2000) }, { cap: 1000 });
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch });
    assert.strictEqual(result.rows.length, 2000);
    assert.strictEqual(result.pages, 2, "an exact multiple of the page size needs no extra page");
  }
  {
    const api = makeMockPostgrest({ events: makeRows(130) }, { cap: 1000 });
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch });
    assert.strictEqual(result.rows.length, 130);
    assert.strictEqual(result.pages, 1);
  }
  {
    const api = makeMockPostgrest({ events: [] }, { cap: 1000 });
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch });
    assert.deepStrictEqual(result, { rows: [], total: 0, complete: true, pages: 0 });
    assert.strictEqual(api.log.length, 1, "an empty result costs only the count request");
  }
  {
    const api = makeMockPostgrest({ events: [] }, { cap: 1000, exposeCount: false });
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch });
    assert.strictEqual(result.rows.length, 0);
    assert.strictEqual(result.complete, true);
  }
  console.log("PASS: exact-multiple, single-page and empty results are all handled without extra or missing pages");

  // --- 5. Filters in the URL are preserved on every page ---
  {
    const rows = makeRows(2953).map((r, i) => ({ ...r, status: i % 3 === 0 ? "pending_review" : "approved" }));
    const approved = rows.filter((r) => r.status === "approved");
    const api = makeMockPostgrest({ events: rows }, { cap: 1000 });
    const result = await fetchAllRows(`${BASE}/events?status=eq.approved&select=id,start_date&order=start_date.asc,id.asc`, HEADERS, { fetchImpl: api.fetch });
    assert.strictEqual(result.rows.length, approved.length);
    assert.ok(result.rows.every((r) => r.status === "approved"), "no page leaks a row the filter excludes");
    assert.ok(api.log.every((req) => /status=eq\.approved/.test(req.url)), "every request carries the original filter");
  }
  console.log("PASS: the query's own filters are applied to every page");

  // --- 6. Auth headers on every request; caller's headers object untouched ---
  {
    const callerHeaders = { apikey: "anon", Authorization: "Bearer anon" };
    const api = makeMockPostgrest({ events: makeRows(2500) }, { cap: 1000 });
    await fetchAllRows(URL_EVENTS, callerHeaders, { fetchImpl: api.fetch });
    assert.ok(api.log.every((req) => req.headers.apikey === "anon" && req.headers.Authorization === "Bearer anon"));
    assert.deepStrictEqual(callerHeaders, { apikey: "anon", Authorization: "Bearer anon" }, "Prefer/Range are not leaked into the caller's headers");
    assert.strictEqual(api.log.filter((req) => req.headers.Prefer).length, 1, "only the count request asks for a count");
  }
  console.log("PASS: every request is authenticated, and the caller's headers object is not modified");

  // --- 7. Failures ---
  {
    const api = makeMockPostgrest({ events: makeRows(2953) }, { cap: 1000, failure: () => 500 });
    await assert.rejects(
      () => fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch }),
      /HTTP 500/,
      "when nothing at all can be loaded it throws, so the page's catch keeps its fallback data"
    );
  }
  console.log("PASS: throws when the first page cannot be loaded (caller keeps its fallback data)");
  {
    // One page fails once, then succeeds: retried transparently.
    let failedOnce = false;
    const api = makeMockPostgrest({ events: makeRows(2953) }, {
      cap: 1000,
      failure: (req) => {
        if (!failedOnce && /offset=1000/.test(req.url)) { failedOnce = true; return 503; }
        return null;
      },
    });
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch });
    assert.strictEqual(result.rows.length, 2953);
    assert.strictEqual(result.complete, true);
  }
  console.log("PASS: a page that fails once is retried and the result is still complete");
  {
    // The third page never loads: partial result, clearly marked, contiguous.
    const rows = makeRows(2953);
    const api = makeMockPostgrest({ events: rows }, { cap: 1000, failure: (req) => (/offset=2000/.test(req.url) ? 500 : null) });
    const { value: result, warnings } = await captureWarnings(() => fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch }));
    assert.strictEqual(result.complete, false, "a partial result is never reported as complete");
    assert.deepStrictEqual(result.rows.map((r) => r.id), expectedOrder(rows).slice(0, 2000), "what was loaded is a clean prefix — no gap in the middle");
    assert.ok(warnings.some((w) => /page failed to load/.test(w)), "and it is reported, not silent");
  }
  console.log("PASS: a page that keeps failing yields a contiguous partial result marked complete:false, with a warning");
  {
    // Count request fails but pages work: still complete.
    const api = makeMockPostgrest({ events: makeRows(2953) }, { cap: 1000, failure: (req) => (req.headers.Prefer ? 500 : null) });
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch });
    assert.strictEqual(result.rows.length, 2953);
    assert.strictEqual(result.complete, true);
  }
  console.log("PASS: a failed count request does not prevent a complete load");

  // --- 8. Safety ceiling is loud, not silent ---
  {
    const api = makeMockPostgrest({ events: makeRows(2953) }, { cap: 1000 });
    const { value: result, warnings } = await captureWarnings(() => fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: api.fetch, maxRows: 2000 }));
    assert.strictEqual(result.rows.length, 2000);
    assert.strictEqual(result.complete, false);
    assert.ok(warnings.some((w) => /safety ceiling/.test(w)));
  }
  console.log("PASS: reaching the safety ceiling is reported as complete:false with a warning");

  // --- 9. Rows repeated across pages are de-duplicated ---
  {
    const rows = makeRows(1500);
    const inner = makeMockPostgrest({ events: rows }, { cap: 1000 });
    // Simulate a row inserted upstream between the two page requests: the
    // second page starts one row early, repeating the first page's last row.
    const shifting = async (url, init) => inner.fetch(url.replace("offset=1000", "offset=999"), init);
    const result = await fetchAllRows(URL_EVENTS, HEADERS, { fetchImpl: shifting });
    const ids = result.rows.map((r) => r.id);
    assert.strictEqual(new Set(ids).size, ids.length, "no event appears twice");
  }
  console.log("PASS: a row repeated across pages (upstream insert mid-load) is not shown twice");

  // --- 10. Misuse is caught immediately ---
  {
    const api = makeMockPostgrest({ events: makeRows(10) }, { cap: 1000 });
    await assert.rejects(() => fetchAllRows(`${URL_EVENTS}&limit=2000`, HEADERS, { fetchImpl: api.fetch }), /without limit=\/offset=/);
    await assert.rejects(() => fetchAllRows(`${URL_EVENTS}&offset=5`, HEADERS, { fetchImpl: api.fetch }), /without limit=\/offset=/);
    const noQuery = await fetchAllRows(`${BASE}/events`, HEADERS, { fetchImpl: api.fetch });
    assert.strictEqual(noQuery.rows.length, 10, "a URL with no query string is handled");
  }
  console.log("PASS: a URL that already has limit=/offset= is rejected; a URL with no query string works");

  console.log("\nAll paged-fetch.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
