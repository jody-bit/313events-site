// test/cron-ra-promote-candidates.test.js — api/cron-ra.js's new
// "promote_candidates" action (RA candidate-recovery MVP, 2026-10-01).
// Proves the HTTP wiring only (auth, method, dispatch, dryRun passthrough,
// error shape) -- promoteRaCandidates()'s own decision logic is already
// covered end to end by test/ra-candidate-promotion.test.js.
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

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
