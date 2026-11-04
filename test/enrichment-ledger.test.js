"use strict";
const assert = require("assert");
const fs = require("fs");
const { createTableLedger } = require("../scripts/enrichment-ledger");

(async () => {
  assert.strictEqual(createTableLedger({ SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k" }), null, "off by default: no durable ledger before the table is approved");
  const calls = [];
  const l = createTableLedger({ SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k", enabled: true,
    fetchFn: async (u, o = {}) => { calls.push({ u, m: o.method || "GET", b: o.body }); return { ok: true, status: 200, json: async () => [] }; } });
  await l.record([{ event_id: "e1", field: "venue_city_raw", before: null, after: "Detroit", source: "SH.1 canonical_venue_id", run_id: "r", status: "applied", at: "2026-11-04T00:00:00Z" }]);
  assert.strictEqual(calls[0].m, "POST");
  assert.deepStrictEqual(JSON.parse(calls[0].b)[0], { event_id: "e1", field: "venue_city_raw", before_value: null, after_value: "Detroit", source: "SH.1 canonical_venue_id", run_id: "r", status: "applied", created_at: "2026-11-04T00:00:00Z" });
  assert.strictEqual(await l.hasProposal("e1|venue_city_raw|Detroit"), false);
  const bad = createTableLedger({ SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k", enabled: true, fetchFn: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(() => bad.record([{ event_id: "e", field: "f", before: null, after: "a", source: "s", run_id: null, status: "applied", at: "t" }]));
  const src = fs.readFileSync(__dirname + "/../scripts/enrichment-ledger.js", "utf8");
  assert.ok(!/PATCH|DELETE/.test(src.replace(/\/\/.*$/gm, "")), "ledger module is append-only: never PATCH or DELETE");
  const sql = fs.readFileSync(__dirname + "/../supabase/proposed/enrichment_change_log.sql", "utf8");
  assert.ok(/enable row level security/.test(sql) && /revoke all on public\.enrichment_change_log from anon, authenticated/.test(sql));
  assert.ok(/revoke update, delete, truncate on public\.enrichment_change_log from service_role/.test(sql), "append-only is enforced by revoke, not just by grant");
  console.log("PASS: enrichment ledger is off by default, append-only, and its proposed table is RLS-locked");
})().catch((e) => { console.error("FAIL:", e); process.exitCode = 1; });
