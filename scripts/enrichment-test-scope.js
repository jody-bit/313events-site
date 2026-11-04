// Staging-only test scope for the real enrichment entry point (api/cron-enrichment.js). Inactive unless
// ENRICHMENT_TEST_ONLY_EVENT_IDS is set; production never sets it, and this module refuses to activate there.
// When active it narrows the run to named test events and to exactly one verified staging database, so the first
// staging test exercises the same handler, auth, run log and configuration as production without touching real rows.
"use strict";

const path = require("path");
const { PRODUCTION_SUPABASE_HOST: PRODUCTION_HOST } = require(path.join(__dirname, "..", "api", "_lib", "environment"));
const TEST_ID = /^a3120000-0000-4000-8000-0000000000[0-9]{2}$/;   // the nine seeded ids only (p312-staging-test seed)
const MAX_IDS = 9;

function hostOf(url) { try { return new URL(String(url)).host.toLowerCase(); } catch { return ""; } }

// -> { active: false } | { active: true, ids, host } ; throws (fail closed) when the scope is requested but unsafe.
function resolveTestScope(env = process.env, supabaseUrl = env.SUPABASE_URL) {
  const raw = String(env.ENRICHMENT_TEST_ONLY_EVENT_IDS || "").trim();
  if (!raw) return { active: false };
  const fail = (m) => { throw new Error(`enrichment test scope refused: ${m}`); };
  if ((env.VERCEL_ENV || env.APP_ENV || "local") === "production") fail("never allowed in production");
  const host = hostOf(supabaseUrl);
  if (!host) fail("SUPABASE_URL is missing or invalid");
  if (host === PRODUCTION_HOST) fail("target is the production database");
  const expected = String(env.ENRICHMENT_TEST_EXPECT_SUPABASE_HOST || "").trim().toLowerCase();
  if (!expected) fail("ENRICHMENT_TEST_EXPECT_SUPABASE_HOST must name the one staging host");
  if (host !== expected) fail("SUPABASE_URL host does not equal ENRICHMENT_TEST_EXPECT_SUPABASE_HOST");
  const ids = raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!ids.length || ids.length > MAX_IDS) fail(`between 1 and ${MAX_IDS} event ids required`);
  if (new Set(ids).size !== ids.length) fail("duplicate event id");
  const bad = ids.filter((i) => !TEST_ID.test(i));
  if (bad.length) fail("an id is not one of the seeded test ids");
  return { active: true, ids, host };
}

module.exports = { resolveTestScope, PRODUCTION_HOST, TEST_ID };
