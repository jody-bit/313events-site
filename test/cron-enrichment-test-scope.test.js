// test/cron-enrichment-test-scope.test.js — the real cron-enrichment handler in its staging test scope (#312 follow-up).
// Proves: inactive by default (no env => the full sequence still runs: see cron-enrichment-runlog.test.js); active scope refuses a
// production host / production env; active scope runs ONLY the SH.1 step, on ONLY the named ids, with the run id from source_runs
// written into the AUTO-FILL line, and records the scope in the run summary. Run: node test/cron-enrichment-test-scope.test.js
"use strict";
const assert = require("assert");
const REPO = process.env.REPO_DIR || process.cwd();
const STG = "stg1234567890.supabase.co";
const ID1 = "a3120000-0000-4000-8000-000000000006", ID2 = "a3120000-0000-4000-8000-000000000001";

function handlerFor(env) {
  for (const k of ["SUPABASE_URL", "ENRICHMENT_TEST_ONLY_EVENT_IDS", "ENRICHMENT_TEST_EXPECT_SUPABASE_HOST", "VERCEL_ENV", "CRON_SECRET", "ENRICHMENT_LEDGER_TABLE"]) delete process.env[k];
  Object.assign(process.env, { SUPABASE_SERVICE_ROLE_KEY: "k", CRON_SECRET: "s", ...env });
  for (const f of ["api/cron-enrichment.js", "api/_lib/environment.js", "api/_lib/venue-lookup.js", "scripts/sh1-repair-existing-venue-address-city.js", "scripts/enrichment-test-scope.js", "scripts/enrichment-ledger.js", "api/_lib/run-log.js"]) { try { delete require.cache[require.resolve(`${REPO}/${f}`)]; } catch {} }
  return require(`${REPO}/api/cron-enrichment.js`);
}
const res = () => ({ _s: null, _b: null, status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; } });

(async () => {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase(); calls.push({ url, method, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes("/rest/v1/source_runs") && method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-xyz" }] };
    if (url.includes("/rest/v1/source_runs")) return { ok: true, status: 204, json: async () => [] };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [{ id: "v1", name: "Andy Arts", address: "3000 Fenkell St", city: "Detroit" }] };
    if (url.includes("/rest/v1/events") && method === "GET") {
      if (!url.includes("or=(venue_address_raw.is.null,venue_city_raw.is.null)")) throw new Error("a non-SH.1 step ran in test scope: " + url);
      const b = { venue_id: "v1", venue_name_raw: "Andy Arts", venue_address_raw: null, venue_city_raw: null, start_date: "2030-01-01", status: "approved", source: "feed" };
      return { ok: true, status: 200, json: async () => [{ id: ID1, ...b }, { id: ID2, ...b, source: "Manual" }, { id: "11111111-1111-4111-8111-111111111111", ...b }] };
    }
    if (url.includes("/rest/v1/events") && method === "PATCH") return { ok: true, status: 200, json: async () => [{ id: "x" }] };
    throw new Error("unmocked: " + method + " " + url);
  };
  const base = { VERCEL_ENV: "preview", SUPABASE_URL: `https://${STG}`, ENRICHMENT_TEST_ONLY_EVENT_IDS: `${ID1},${ID2}`, ENRICHMENT_TEST_EXPECT_SUPABASE_HOST: STG };

  // refusals: nothing is read or written
  for (const [why, env] of [["production env", { ...base, VERCEL_ENV: "production" }], ["no expected host", { ...base, ENRICHMENT_TEST_EXPECT_SUPABASE_HOST: "" }], ["host mismatch", { ...base, ENRICHMENT_TEST_EXPECT_SUPABASE_HOST: "other.supabase.co" }]]) {
    calls.length = 0; const r = res();
    await handlerFor(env)({ headers: { authorization: "Bearer s" }, query: {} }, r);
    assert.strictEqual(r._b.ok, false, why); assert.ok(/refused/.test(r._b.error), why); assert.strictEqual(calls.length, 0, why + ": no network at all");
  }
  // production host from a preview deployment: the existing environment guard stops the handler at load, before any read or write
  calls.length = 0;
  assert.throws(() => handlerFor({ ...base, SUPABASE_URL: require(`${REPO}/api/_lib/environment.js`).PRODUCTION_SUPABASE_URL, ENRICHMENT_TEST_EXPECT_SUPABASE_HOST: require(`${REPO}/api/_lib/environment.js`).PRODUCTION_SUPABASE_HOST }), /production database/);
  assert.strictEqual(calls.length, 0);
  console.log("PASS: scope refuses production env, production host, missing and mismatched expected host before any read or write");

  // scoped run
  calls.length = 0; const r = res();
  await handlerFor(base)({ headers: { authorization: "Bearer s" }, query: {} }, r);
  assert.strictEqual(r._b.ok, true); assert.deepStrictEqual(r._b.testScope.ids, [ID1, ID2]);
  const patches = calls.filter((c) => c.url.includes("/rest/v1/events") && c.method === "PATCH");
  assert.strictEqual(patches.length, 1, "only the one eligible, in-scope row is patched (Manual row proposed only; unlisted real row untouched)");
  assert.ok(patches[0].url.includes(ID1)); assert.ok(patches[0].body.internal_note.includes("; run run-xyz"), "AUTO-FILL line carries the source_runs id");
  const fin = calls.filter((c) => c.url.includes("/rest/v1/source_runs") && c.method === "PATCH").pop();
  assert.strictEqual(fin.body.session_data.venue_fill.run_id, "run-xyz"); assert.strictEqual(fin.body.session_data.venue_fill.owner_rows_skipped, 1);
  assert.deepStrictEqual(fin.body.session_data.venue_fill.proposed_fills.map((p) => p.id), [ID2]);
  assert.deepStrictEqual(fin.body.session_data.test_scope.ids, [ID1, ID2]);
  console.log("PASS: scoped run uses the real handler and run log, runs SH.1 only, on the named ids only, and records scope, run id and proposed fill");
})().catch((e) => { console.error(e); process.exit(1); });
