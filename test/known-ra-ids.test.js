// test/known-ra-ids.test.js — api/known-ra-ids.js + api/_lib/ra-known-ids.js
//
// Plain Node assert, no dependencies, matching this repo's existing style
// (see test/status-lookup.test.js, test/cron-belle-isle-nature-center-runlog.test.js).
// Run: node test/known-ra-ids.test.js
//
// Part 1 exercises the endpoint handler directly (freshHandler() + a mock
// global.fetch + makeRes()), covering authentication, malformed input,
// known-id filtering, all-status semantics, and fail-closed behavior on a
// failed/malformed lookup. Part 2 covers api/_lib/ra-known-ids.js's pure
// helpers directly for edge cases not already exercised through the
// endpoint (dedupe, computeCandidateNewIds).
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const RA_SECRET = "test-ra-automation-secret";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/known-ra-ids.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/status-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ra-known-ids.js`)];
  return require(`${REPO_DIR}/api/known-ra-ids.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
}

function makeReq({ auth, candidateIds, method = "POST" } = {}) {
  return {
    method,
    headers: auth === undefined ? {} : { authorization: auth },
    body: candidateIds === undefined ? {} : { candidateIds },
  };
}

// Serves /rest/v1/events?external_id=in.(...)&select=external_id from an
// in-memory Set of ids that "exist" in production, regardless of status --
// exactly like real Supabase/PostgREST does for this unfiltered query
// (see api/_lib/status-lookup.js: no status filter is ever applied by
// lookupExistingRows). Records every call so tests can assert on the
// request shape (e.g. that no status= filter is ever sent).
function makeMockFetch(existingIds, opts = {}) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (opts.networkError) throw new Error(opts.networkError);
    if (opts.nonOk) return { ok: false, status: 500, text: async () => "internal error" };
    if (opts.malformedBody) return { ok: true, status: 200, json: async () => ({ not: "an array" }) };
    const m = /external_id=in\.\(([^)]*)\)/.exec(url);
    const requested = m ? m[1].split(",") : [];
    const rows = requested.filter((id) => existingIds.has(id)).map((id) => ({ external_id: id }));
    return { ok: true, status: 200, json: async () => rows };
  };
  return { fetchFn, calls };
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

  // ============================================================
  // Part 1: the endpoint handler
  // ============================================================

  // --- 1. fail closed: RA_AUTOMATION_SECRET not configured at all -> 500,
  //     and the request never reaches the database (no fetch call) ---
  {
    delete process.env.RA_AUTOMATION_SECRET;
    const handler = freshHandler();
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 200, json: async () => [] };
    };
    const res = makeRes();
    await handler(makeReq({ auth: `Bearer anything`, candidateIds: ["ra-1"] }), res);
    assert.strictEqual(res._status, 500);
    assert.ok(!fetchCalled, "an unconfigured RA_AUTOMATION_SECRET must reject before ever touching Supabase");
    assert.ok(!JSON.stringify(res._body).includes("anything"), "the error body must not echo back the provided credential");
  }
  console.log("PASS: missing RA_AUTOMATION_SECRET fails closed with 500 and never queries the database");

  // --- 2. missing Authorization header -> 401 ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    global.fetch = async () => {
      throw new Error("must not be called");
    };
    const res = makeRes();
    await handler(makeReq({ candidateIds: ["ra-1"] }), res);
    assert.strictEqual(res._status, 401);
  }
  console.log("PASS: missing Authorization header -> 401, no lookup performed");

  // --- 3. wrong credential -> 401, and the real secret never appears in the response ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    global.fetch = async () => {
      throw new Error("must not be called");
    };
    const res = makeRes();
    await handler(makeReq({ auth: "Bearer wrong-secret", candidateIds: ["ra-1"] }), res);
    assert.strictEqual(res._status, 401);
    assert.ok(!JSON.stringify(res._body).includes(RA_SECRET), "the real secret must never appear in any response body");
  }
  console.log("PASS: incorrect credential -> 401, real secret never echoed");

  // --- 4. correct credential + malformed method -> 405 ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    global.fetch = async () => {
      throw new Error("must not be called");
    };
    const res = makeRes();
    await handler(makeReq({ auth: `Bearer ${RA_SECRET}`, candidateIds: ["ra-1"], method: "GET" }), res);
    assert.strictEqual(res._status, 405);
  }
  console.log("PASS: non-POST method -> 405");

  // --- 5. malformed input: candidateIds missing / not an array -> 400 ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    global.fetch = async () => {
      throw new Error("must not be called");
    };
    const res = makeRes();
    await handler({ method: "POST", headers: { authorization: `Bearer ${RA_SECRET}` }, body: {} }, res);
    assert.strictEqual(res._status, 400);
  }
  console.log("PASS: missing candidateIds -> 400, no lookup performed");

  // --- 6. malformed input: empty array -> 400 ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    global.fetch = async () => {
      throw new Error("must not be called");
    };
    const res = makeRes();
    await handler(makeReq({ auth: `Bearer ${RA_SECRET}`, candidateIds: [] }), res);
    assert.strictEqual(res._status, 400);
  }
  console.log("PASS: empty candidateIds array -> 400");

  // --- 7. malformed input: entries that don't match "ra-<numeric id>" -> 400 with details ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    global.fetch = async () => {
      throw new Error("must not be called");
    };
    const res = makeRes();
    await handler(
      makeReq({ auth: `Bearer ${RA_SECRET}`, candidateIds: ["ra-123", "RA-123", "ra-abc", "123", "ra-", 42] }),
      res
    );
    assert.strictEqual(res._status, 400);
    assert.ok(Array.isArray(res._body.details && res._body.details.invalid), "400 response should list the invalid entries");
    assert.ok(res._body.details.invalid.includes("RA-123"));
    assert.ok(res._body.details.invalid.includes("ra-abc"));
    assert.ok(res._body.details.invalid.includes("123"));
    assert.ok(res._body.details.invalid.includes("ra-"));
    assert.ok(res._body.details.invalid.includes(42));
    assert.ok(!res._body.details.invalid.includes("ra-123"), "the one well-formed entry must not be reported as invalid");
  }
  console.log("PASS: malformed candidate id formats -> 400 listing exactly the invalid entries");

  // --- 8. known-id filtering: only the candidates that exist come back ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    const { fetchFn } = makeMockFetch(new Set(["ra-100", "ra-200"]));
    global.fetch = fetchFn;
    const res = makeRes();
    await handler(makeReq({ auth: `Bearer ${RA_SECRET}`, candidateIds: ["ra-100", "ra-200", "ra-300"] }), res);
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual([...res._body.knownIds].sort(), ["ra-100", "ra-200"]);
    assert.ok(!res._body.knownIds.includes("ra-300"), "a candidate with no production row must not be reported as known");
  }
  console.log("PASS: knownIds contains exactly the candidates that exist in production");

  // --- 9. legitimately zero known ids: a genuinely successful lookup that
  //     finds nothing is a normal 200 with an empty list -- this must
  //     stay distinguishable from the fail-closed case in #12/#13 below ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch(new Set());
    global.fetch = fetchFn;
    const res = makeRes();
    await handler(makeReq({ auth: `Bearer ${RA_SECRET}`, candidateIds: ["ra-999"] }), res);
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._body.knownIds, []);
    assert.strictEqual(calls.length, 1, "a genuine 'none exist' result still requires an actual successful lookup call");
  }
  console.log("PASS: a successful lookup that finds nothing returns 200 with an empty knownIds (not an error)");

  // --- 10. all-status semantics: the lookup query itself carries no
  //     status filter, so a rejected/hidden production row is reported as
  //     known exactly the same as an approved one ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    // ra-500's row exists but (in the real table) is status='rejected' --
    // this mock doesn't even model status, which is the point: the query
    // this endpoint issues has no way to exclude it.
    const { fetchFn, calls } = makeMockFetch(new Set(["ra-500"]));
    global.fetch = fetchFn;
    const res = makeRes();
    await handler(makeReq({ auth: `Bearer ${RA_SECRET}`, candidateIds: ["ra-500"] }), res);
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._body.knownIds, ["ra-500"]);
    assert.ok(!calls[0].includes("status="), "the lookup request must not filter by status -- rejected/hidden rows must still count as known");
  }
  console.log("PASS: a rejected/hidden production row is still reported as known (no status filter is ever sent)");

  // --- 11. RA-specific legacy exclusion: ra-2485347 is always known, even
  //     when the raw lookup finds no matching row ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    const { fetchFn } = makeMockFetch(new Set()); // nothing matches ra-2485347 in this mock
    global.fetch = fetchFn;
    const res = makeRes();
    await handler(makeReq({ auth: `Bearer ${RA_SECRET}`, candidateIds: ["ra-2485347"] }), res);
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._body.knownIds, ["ra-2485347"]);
  }
  console.log("PASS: ra-2485347 (MotorCity Wine legacy exclusion) is always reported known, even with no matching row");

  // --- 12. FAIL CLOSED: a non-OK lookup response must NEVER surface as a
  //     200 with an empty (or any) knownIds list ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    const { fetchFn } = makeMockFetch(new Set(), { nonOk: true });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler(makeReq({ auth: `Bearer ${RA_SECRET}`, candidateIds: ["ra-1", "ra-2"] }), res);
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._body.knownIds, undefined, "a failed lookup must not include a knownIds field at all, empty or otherwise");
  }
  console.log("PASS: non-OK lookup response -> 502, never a 200 with knownIds");

  // --- 13. FAIL CLOSED: a thrown network error behaves the same way ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    const { fetchFn } = makeMockFetch(new Set(), { networkError: "simulated network failure" });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler(makeReq({ auth: `Bearer ${RA_SECRET}`, candidateIds: ["ra-1"] }), res);
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._body.knownIds, undefined);
  }
  console.log("PASS: thrown network error during lookup -> 502, never a 200 with knownIds");

  // --- 14. FAIL CLOSED: a malformed (non-array) lookup response body
  //     behaves the same way -- the core proof that a lookup failure can
  //     never be interpreted as "zero known ids" ---
  {
    process.env.RA_AUTOMATION_SECRET = RA_SECRET;
    const handler = freshHandler();
    const { fetchFn } = makeMockFetch(new Set(), { malformedBody: true });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler(makeReq({ auth: `Bearer ${RA_SECRET}`, candidateIds: ["ra-1"] }), res);
    assert.strictEqual(res._status, 502);
    assert.notStrictEqual(res._status, 200, "a malformed lookup response must not be mistaken for a legitimate empty result");
    assert.strictEqual(res._body.knownIds, undefined, "candidateIds must never be reported as 'not known' just because the lookup itself failed");
  }
  console.log("PASS: malformed (non-array) lookup response -> 502, lookup failure is never interpreted as an empty known-id set");

  // ============================================================
  // Part 2: api/_lib/ra-known-ids.js pure helpers, directly
  // ============================================================
  {
    delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ra-known-ids.js`)];
    const { parseCandidateIds, computeKnownIds, computeCandidateNewIds, RaKnownIdsValidationError } = require(`${REPO_DIR}/api/_lib/ra-known-ids.js`);

    // duplicate candidate ids are deduped, order-preserving
    assert.deepStrictEqual(parseCandidateIds(["ra-1", "ra-2", "ra-1"]), ["ra-1", "ra-2"]);

    // computeCandidateNewIds is the exact complement of computeKnownIds
    const candidates = ["ra-1", "ra-2", "ra-2485347", "ra-3"];
    const existing = new Set(["ra-2"]);
    const known = computeKnownIds(candidates, existing);
    const notKnown = computeCandidateNewIds(candidates, existing);
    assert.deepStrictEqual(known.sort(), ["ra-2", "ra-2485347"]);
    assert.deepStrictEqual(notKnown.sort(), ["ra-1", "ra-3"]);
    assert.strictEqual(known.length + notKnown.length, candidates.length, "every candidate must land in exactly one of known/not-known");

    // non-array / empty / malformed-entry rejections throw the typed error
    assert.throws(() => parseCandidateIds("ra-1"), RaKnownIdsValidationError);
    assert.throws(() => parseCandidateIds([]), RaKnownIdsValidationError);
    assert.throws(() => parseCandidateIds(["ra-1", "not-an-id"]), RaKnownIdsValidationError);
    assert.throws(() => computeKnownIds(["ra-1"], ["not", "a", "set"]), RaKnownIdsValidationError);
  }
  console.log("PASS: api/_lib/ra-known-ids.js pure helpers (dedupe, known/not-known complement, validation errors)");

  console.log("\nAll known-ra-ids tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
