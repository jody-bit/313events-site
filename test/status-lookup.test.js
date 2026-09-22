// test/status-lookup.test.js — WP 0.17: api/_lib/status-lookup.js
//
// Plain Node assert, no dependencies, matching this repo's existing style
// (see test/run-log.test.js). Run: node test/status-lookup.test.js
//
// Covers WP 0.17's locked acceptance criteria and required-tests list
// (criteria 1-12 of the 15 specified) directly against the shared helper.
// Criteria 13/14 (a real connector's failed lookup -> zero event writes ->
// HTTP 502) are proven at the connector level in
// test/cron-redford-theatre-runlog.test.js (see its "WP 0.17" section).
// Criterion 15 (every applicable connector uses the safe path) is proven
// structurally in test/wp017-connector-coverage.test.js.
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "test-key";

function freshStatusLookup() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/status-lookup.js`)];
  return require(`${REPO_DIR}/api/_lib/status-lookup.js`);
}

// Builds a mock fetch that serves /rest/v1/events?external_id=in.(...)
// lookups from an in-memory Map(external_id -> status), and records every
// call so tests can assert on chunk count / chunk size / ids requested.
function makeMockFetch(statusByExternalId) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const m = /external_id=in\.\(([^)]*)\)/.exec(url);
    const ids = m ? m[1].split(",") : [];
    const rows = ids
      .filter((id) => statusByExternalId.has(id))
      .map((id) => ({ external_id: id, status: statusByExternalId.get(id) }));
    return { ok: true, status: 200, json: async () => rows };
  };
  return { fetchFn, calls };
}

function idList(n, prefix = "id") {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

async function run() {
  // --- 2. 1 id works ---
  {
    const { lookupExistingStatuses } = freshStatusLookup();
    const { fetchFn, calls } = makeMockFetch(new Map([["id-0", "approved"]]));
    global.fetch = fetchFn;
    const result = await lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ["id-0"]);
    assert.strictEqual(calls.length, 1, "1 id should produce exactly 1 lookup request");
    assert.strictEqual(result.get("id-0"), "approved");
  }
  console.log("PASS: 1 id works, 1 lookup request");

  // --- 1 & 3. <=100 ids per request; exactly 100 ids works in one request ---
  {
    const { lookupExistingStatuses } = freshStatusLookup();
    const ids = idList(100);
    const statusMap = new Map(ids.map((id) => [id, "approved"]));
    const { fetchFn, calls } = makeMockFetch(statusMap);
    global.fetch = fetchFn;
    const result = await lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ids);
    assert.strictEqual(calls.length, 1, "exactly 100 ids should still be 1 lookup request");
    const requestedIds = /external_id=in\.\(([^)]*)\)/.exec(calls[0])[1].split(",");
    assert.ok(requestedIds.length <= 100, "no single request may carry more than 100 ids");
    assert.strictEqual(requestedIds.length, 100);
    assert.strictEqual(result.size, 100);
  }
  console.log("PASS: exactly 100 ids -> 1 request, and no request exceeds 100 ids");

  // --- 4. 101 ids produces 2 lookups ---
  {
    const { lookupExistingStatuses } = freshStatusLookup();
    const ids = idList(101);
    const { fetchFn, calls } = makeMockFetch(new Map(ids.map((id) => [id, "approved"])));
    global.fetch = fetchFn;
    await lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ids);
    assert.strictEqual(calls.length, 2, "101 ids should produce exactly 2 lookup requests");
    for (const url of calls) {
      const n = /external_id=in\.\(([^)]*)\)/.exec(url)[1].split(",").length;
      assert.ok(n <= 100, "every chunked request must stay at or under 100 ids");
    }
  }
  console.log("PASS: 101 ids -> 2 lookup requests, each <=100 ids");

  // --- 5. ~1,000 ids produces >=10 lookups ---
  {
    const { lookupExistingStatuses } = freshStatusLookup();
    const ids = idList(1000);
    const { fetchFn, calls } = makeMockFetch(new Map(ids.map((id) => [id, "approved"])));
    global.fetch = fetchFn;
    await lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ids);
    assert.ok(calls.length >= 10, `~1000 ids should produce >=10 lookup requests, got ${calls.length}`);
  }
  console.log("PASS: ~1,000 ids -> >=10 lookup requests");

  // --- 6. statuses from multiple chunks are combined correctly ---
  {
    const { lookupExistingStatuses } = freshStatusLookup();
    const ids = idList(250);
    // Give every 50th id (across what will be 3 chunks of 100/100/50) a
    // distinct, individually-identifiable status so the test can confirm
    // the final map has entries sourced from every chunk, not just the
    // first or last.
    const statusMap = new Map(ids.map((id, i) => [id, i % 2 === 0 ? "approved" : "rejected"]));
    const { fetchFn, calls } = makeMockFetch(statusMap);
    global.fetch = fetchFn;
    const result = await lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ids);
    assert.strictEqual(calls.length, 3, "250 ids should produce 3 chunked requests (100/100/50)");
    assert.strictEqual(result.size, 250, "the combined map must contain every id across all 3 chunks");
    // Spot-check one id from each chunk (indices 0, 150, 249).
    assert.strictEqual(result.get(ids[0]), statusMap.get(ids[0]));
    assert.strictEqual(result.get(ids[150]), statusMap.get(ids[150]));
    assert.strictEqual(result.get(ids[249]), statusMap.get(ids[249]));
  }
  console.log("PASS: statuses from multiple chunks are combined into one correct map");

  // --- 7/8/9. rejected / approved / pending_review are all preserved verbatim ---
  {
    const { lookupExistingStatuses } = freshStatusLookup();
    const statusMap = new Map([
      ["ext-rejected", "rejected"],
      ["ext-approved", "approved"],
      ["ext-pending", "pending_review"],
    ]);
    const { fetchFn } = makeMockFetch(statusMap);
    global.fetch = fetchFn;
    const result = await lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, [
      "ext-rejected",
      "ext-approved",
      "ext-pending",
    ]);
    assert.strictEqual(result.get("ext-rejected"), "rejected", "rejected must be preserved verbatim");
    assert.strictEqual(result.get("ext-approved"), "approved", "approved must be preserved verbatim");
    assert.strictEqual(result.get("ext-pending"), "pending_review", "pending_review must be preserved verbatim");
  }
  console.log("PASS: rejected/approved/pending_review statuses are all preserved verbatim");

  // --- 10. non-OK lookup response aborts (throws, never returns a map) ---
  {
    const { lookupExistingStatuses, StatusLookupFailedError } = freshStatusLookup();
    global.fetch = async () => ({ ok: false, status: 500, text: async () => "internal error" });
    await assert.rejects(
      () => lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ["id-0"]),
      StatusLookupFailedError,
      "a non-OK response must throw StatusLookupFailedError"
    );
  }
  console.log("PASS: non-OK lookup response aborts with StatusLookupFailedError");

  // --- 11. thrown/network failure aborts ---
  {
    const { lookupExistingStatuses, StatusLookupFailedError } = freshStatusLookup();
    global.fetch = async () => {
      throw new Error("simulated network failure");
    };
    await assert.rejects(
      () => lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ["id-0"]),
      StatusLookupFailedError,
      "a thrown network error must be wrapped and rethrown as StatusLookupFailedError"
    );
  }
  console.log("PASS: thrown network failure aborts with StatusLookupFailedError");

  // --- 12. malformed lookup response aborts (non-array body, and a row missing external_id) ---
  {
    const { lookupExistingStatuses, StatusLookupFailedError } = freshStatusLookup();
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ not: "an array" }) });
    await assert.rejects(
      () => lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ["id-0"]),
      StatusLookupFailedError,
      "a non-array JSON body must throw StatusLookupFailedError"
    );
  }
  {
    const { lookupExistingStatuses, StatusLookupFailedError } = freshStatusLookup();
    global.fetch = async () => ({ ok: true, status: 200, json: async () => [{ status: "approved" }] }); // missing external_id
    await assert.rejects(
      () => lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ["id-0"]),
      StatusLookupFailedError,
      "a row missing external_id must throw StatusLookupFailedError"
    );
  }
  {
    const { lookupExistingStatuses, StatusLookupFailedError } = freshStatusLookup();
    global.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } });
    await assert.rejects(
      () => lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ["id-0"]),
      StatusLookupFailedError,
      "unparseable JSON must throw StatusLookupFailedError"
    );
  }
  console.log("PASS: malformed lookup responses (non-array, missing external_id, unparseable JSON) all abort");

  // --- Any one chunk failing fails the WHOLE lookup, never a partial map ---
  {
    const { lookupExistingStatuses, StatusLookupFailedError } = freshStatusLookup();
    const ids = idList(150); // 2 chunks: 100 + 50
    let callCount = 0;
    global.fetch = async (url) => {
      callCount += 1;
      if (callCount === 1) {
        const m = /external_id=in\.\(([^)]*)\)/.exec(url);
        const requestedIds = m[1].split(",");
        return { ok: true, status: 200, json: async () => requestedIds.map((id) => ({ external_id: id, status: "approved" })) };
      }
      return { ok: false, status: 502, text: async () => "gateway error on chunk 2" };
    };
    await assert.rejects(
      () => lookupExistingStatuses(SUPABASE_URL, SUPABASE_KEY, ids),
      StatusLookupFailedError,
      "if any chunk fails, the whole lookup must throw -- never return a partial map"
    );
    assert.strictEqual(callCount, 2, "the second (failing) chunk should have been attempted");
  }
  console.log("PASS: a single failing chunk fails the whole lookup (no partial map is ever returned)");

  // --- lookupExistingRows: the low-level primitive supporting extra columns
  //     (cron-poppspacking.js's WP 0.8 start_date/time_display need) ---
  {
    const { lookupExistingRows } = freshStatusLookup();
    const calls = [];
    global.fetch = async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => [{ external_id: "id-0", status: "rejected", start_date: "2026-10-01", time_display: "7:00 PM" }],
      };
    };
    const result = await lookupExistingRows(SUPABASE_URL, SUPABASE_KEY, ["id-0"], {
      select: "external_id,status,start_date,time_display",
    });
    assert.ok(calls[0].includes("select=external_id,status,start_date,time_display"), "the custom select list must be sent");
    const row = result.get("id-0");
    assert.strictEqual(row.status, "rejected");
    assert.strictEqual(row.start_date, "2026-10-01");
    assert.strictEqual(row.time_display, "7:00 PM");
  }
  console.log("PASS: lookupExistingRows supports a configurable select list (cron-poppspacking.js's need)");

  console.log("\nAll status-lookup.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
