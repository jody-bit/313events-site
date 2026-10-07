// test/cron-ra-promote-candidates.test.js — api/cron-ra.js's
// "promote_candidates" action (RA candidate-recovery MVP, 2026-10-01) AND,
// since 2026-10-07 (RA_CANDIDATE_PROMOTION DEFECT 2 fix), the "complete"
// action's new automatic post-completion promotion hook. Proves the HTTP
// wiring only (auth, method, dispatch, dryRun passthrough, error shape,
// and -- for "complete" -- that promotion actually runs afterward and that
// a promotion failure never breaks the complete response) --
// promoteRaCandidates()'s own decision logic is already covered end to end
// by test/ra-candidate-promotion.test.js, and completeRaSyncSession()'s own
// decision logic by test/ra-sync.test.js.
//
// Plain Node assert, no dependencies, same style as test/ra-sync.test.js.
// Run: node test/cron-ra-promote-candidates.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  for (const mod of ["api/cron-ra.js", "scripts/ra-candidate-promotion.js", "scripts/ra-sync.js", "api/_lib/status-lookup.js"]) {
    try { delete require.cache[require.resolve(`${REPO_DIR}/${mod}`)]; } catch { /* fine */ }
  }
  return require(`${REPO_DIR}/api/cron-ra.js`);
}

function makeRes() {
  return {
    _status: null, _body: null,
    status(c) { this._status = c; return this; },
    json(b) { this._body = b; return this; },
  };
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.CRON_SECRET = "test-secret";

  // No RA session exists yet -- a clean, zero-count 200, not an error.
  global.fetch = async (url) => {
    if (url.includes("/rest/v1/source_runs")) return { ok: true, status: 200, json: async () => [] };
    throw new Error("unexpected fetch: " + url);
  };

  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(
      { method: "POST", headers: { authorization: "Bearer test-secret" }, body: { action: "promote_candidates" } },
      res
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.sessionFound, false);
    assert.strictEqual(res._body.written, 0);
  }
  console.log("PASS: promote_candidates with no RA session yet returns a clean 200, zero counts");

  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(
      { method: "POST", headers: { authorization: "Bearer test-secret" }, body: { action: "promote_candidates", dryRun: true } },
      res
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.dryRun, true, "dryRun must pass through from the request body");
  }
  console.log("PASS: promote_candidates passes dryRun through to promoteRaCandidates");

  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(
      { method: "POST", headers: { authorization: "Bearer wrong-secret" }, body: { action: "promote_candidates" } },
      res
    );
    assert.strictEqual(res._status, 401, "wrong CRON_SECRET must be rejected, same as start/complete");
  }
  console.log("PASS: promote_candidates is gated by the exact same CRON_SECRET check as start/complete");

  console.log("\nAll cron-ra.js promote_candidates tests passed.");
}

// "complete" action's new automatic post-completion promotion hook
// (2026-10-07, DEFECT 2 fix). Exercised at the real HTTP handler, with
// global.fetch mocked for every underlying REST call both
// completeRaSyncSession() and (immediately after, same request)
// promoteRaCandidates() make -- cron-ra.js injects no fakes into either,
// so this is the only way to prove the wiring itself, not just each
// function in isolation (already covered by test/ra-sync.test.js and
// test/ra-candidate-promotion.test.js respectively).
async function runCompletePromotionHookTests() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.CRON_SECRET = "test-secret";

  const baseRun = {
    id: "run-1",
    source_slug: "resident-advisor",
    outcome: "started",
    started_at: new Date().toISOString(),
    session_data: { phase: "started", newIds: ["ra-300"], candidateCount: 5, knownCount: 3, allNewCount: 2 },
  };
  const completeBody = {
    action: "complete",
    runId: "run-1",
    events: [
      { id: "ra-300", title: "RIOT: The Machine World Tour", description: "desc", startDate: "2026-12-12T21:00:00-05:00", venueName: "Elektricity", address: "15 South Saginaw Street, Pontiac, MI 48342" },
    ],
  };

  // promoteRaCandidates() finds no RA session at all this time (its OWN
  // getLatestRaSession query, by source_slug -- distinct from
  // completeRaSyncSession's own by-id lookup above) -- the simplest real,
  // non-trivial exercise of the actual function: it still runs for real,
  // it just has nothing to do. Proves the hook reuses the real function
  // (sessionFound/examined/written all present and correctly zero) rather
  // than faking a result.
  {
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || "GET";
      if (url.includes("/rest/v1/source_runs?id=eq.")) {
        if (method === "PATCH") return { ok: true, text: async () => "" };
        return { ok: true, json: async () => [baseRun] };
      }
      if (url.includes("/rest/v1/events?start_date=gte.")) return { ok: true, json: async () => [] };
      if (url.includes("/rest/v1/events?on_conflict=external_id")) return { ok: true, text: async () => "" };
      if (url.includes("/rest/v1/events?external_id=in.")) return { ok: true, json: async () => [] }; // completeRaSyncSession's merge-vs-insert pre-check -- nothing existing yet
      if (url.includes("/rest/v1/venues?select=")) return { ok: true, json: async () => [] };
      if (url.includes("/rest/v1/source_runs?source_slug=eq.")) return { ok: true, json: async () => [] }; // promoteRaCandidates' own session lookup -- none found
      throw new Error("unexpected fetch: " + url);
    };
    const handler = freshHandler();
    const res = makeRes();
    await handler({ method: "POST", headers: { authorization: "Bearer test-secret" }, body: completeBody }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.imported, 1, "the detail-fetch import itself is unaffected by the new hook");
    assert.ok(res._body.candidatePromotion, "complete's response now also carries a candidatePromotion field");
    assert.strictEqual(res._body.candidatePromotion.sessionFound, false, "promoteRaCandidates really ran (for real, against the mocked fetch) rather than being stubbed out");
    assert.strictEqual(res._body.candidatePromotion.written, 0);
  }
  console.log("PASS: complete action's response now also carries a real candidatePromotion result, without affecting the import result itself");

  // A promotion failure (promoteRaCandidates' own session lookup fetch
  // throwing) must never turn a successful complete() into anything but
  // a successful 200 -- only candidatePromotion itself reflects the
  // failure, isolated.
  {
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || "GET";
      if (url.includes("/rest/v1/source_runs?id=eq.")) {
        if (method === "PATCH") return { ok: true, text: async () => "" };
        return { ok: true, json: async () => [baseRun] };
      }
      if (url.includes("/rest/v1/events?start_date=gte.")) return { ok: true, json: async () => [] };
      if (url.includes("/rest/v1/events?on_conflict=external_id")) return { ok: true, text: async () => "" };
      if (url.includes("/rest/v1/events?external_id=in.")) return { ok: true, json: async () => [] }; // completeRaSyncSession's merge-vs-insert pre-check -- nothing existing yet
      if (url.includes("/rest/v1/venues?select=")) return { ok: true, json: async () => [] };
      if (url.includes("/rest/v1/source_runs?source_slug=eq.")) throw new Error("simulated network failure");
      throw new Error("unexpected fetch: " + url);
    };
    const handler = freshHandler();
    const res = makeRes();
    await handler({ method: "POST", headers: { authorization: "Bearer test-secret" }, body: completeBody }, res);

    assert.strictEqual(res._status, 200, "a promotion failure must never turn a successful complete() into a non-200");
    assert.strictEqual(res._body.imported, 1, "the already-succeeded detail-fetch import must be completely unaffected");
    assert.ok(res._body.candidatePromotion && res._body.candidatePromotion.error, "the promotion failure is reported, isolated, in its own field");
  }
  console.log("PASS: a candidate-promotion failure never breaks, retries, or masks an otherwise-successful complete() response -- isolated to its own field");

  console.log("\nAll cron-ra.js complete-action promotion-hook tests passed.");
}

run()
  .then(runCompletePromotionHookTests)
  .then(() => console.log("\nAll cron-ra.js tests (promote_candidates + complete promotion hook) passed."))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
