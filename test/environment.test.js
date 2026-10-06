// test/environment.test.js — api/_lib/environment.js and api/config.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const E = require(`${REPO_DIR}/api/_lib/environment.js`);
const handler = require(`${REPO_DIR}/api/config.js`);

const PROD = E.PRODUCTION_SUPABASE_URL;
const STAGING = "https://stagingprojectref.supabase.co";

// production: only VERCEL_ENV=production counts
assert.strictEqual(E.isProduction({ VERCEL_ENV: "production" }), true);
for (const v of ["preview", "development", undefined, ""]) assert.strictEqual(E.isProduction({ VERCEL_ENV: v }), false);

assert.strictEqual(E.isProduction({ APP_ENV: "production" }), true, "APP_ENV fallback when system env vars are off");
assert.strictEqual(E.isProduction({ VERCEL_ENV: "preview", APP_ENV: "production" }), false, "VERCEL_ENV wins");

// guard: non-production + production DB refuses; staging and production allowed
assert.throws(() => E.assertDatabaseAllowed(PROD, { VERCEL_ENV: "preview" }), /production database/);
assert.throws(() => E.assertDatabaseAllowed(PROD + "/rest/v1", {}), /production database/, "unset env is non-production");
assert.doesNotThrow(() => E.assertDatabaseAllowed(STAGING, { VERCEL_ENV: "preview" }));
assert.doesNotThrow(() => E.assertDatabaseAllowed(PROD, { VERCEL_ENV: "production" }));
assert.doesNotThrow(() => E.assertDatabaseAllowed("https://example.supabase.co", {}), "tests' fake URL is fine");
assert.throws(() => E.assertDatabaseAllowed(PROD, { VERCEL_ENV: "preview", ALLOW_PRODUCTION_DATABASE: "yes" }), "override needs the exact phrase");
assert.doesNotThrow(() => E.assertDatabaseAllowed(PROD, { VERCEL_ENV: "preview", ALLOW_PRODUCTION_DATABASE: E.OVERRIDE_PHRASE }));
// look-alike hosts are not production
assert.doesNotThrow(() => E.assertDatabaseAllowed(`https://${E.PRODUCTION_SUPABASE_HOST}.evil.example`, { VERCEL_ENV: "preview" }));

// publicConfig: production never needs env vars; non-production has no fallback
let c = E.publicConfig({ VERCEL_ENV: "production" });
assert.ok(c.ok && c.supabaseUrl === PROD && c.supabaseAnonKey === E.PRODUCTION_PUBLISHABLE_KEY, "production keeps its fallback");
c = E.publicConfig({ VERCEL_ENV: "preview" });
assert.strictEqual(c.ok, false, "preview with no env must fail, not fall back to production");
c = E.publicConfig({ VERCEL_ENV: "preview", SUPABASE_URL: STAGING, SUPABASE_ANON_KEY: "k" });
assert.ok(c.ok && c.supabaseUrl === STAGING);
c = E.publicConfig({ VERCEL_ENV: "preview", SUPABASE_URL: PROD, SUPABASE_ANON_KEY: "k" });
assert.strictEqual(c.ok, false, "preview pointed at production is refused");

// siteUrl: staging never emits production links
assert.strictEqual(E.siteUrl({ VERCEL_ENV: "production" }), "https://313.events");
assert.strictEqual(E.siteUrl({ VERCEL_ENV: "preview", VERCEL_URL: "x-git-b.vercel.app" }), "https://x-git-b.vercel.app");

// /config.js handler
function run(env) {
  const saved = { ...process.env };
  for (const k of ["VERCEL_ENV", "SUPABASE_URL", "SUPABASE_ANON_KEY", "ALLOW_PRODUCTION_DATABASE"]) delete process.env[k];
  Object.assign(process.env, env);
  const out = { headers: {} };
  const res = { setHeader: (k, v) => { out.headers[k] = v; }, status(n) { out.status = n; return this; }, send(b) { out.body = b; } };
  try { handler({}, res); } finally { process.env = saved; }
  return out;
}
let r = run({ VERCEL_ENV: "production" });
assert.strictEqual(r.status, 200);
assert.ok(r.body.startsWith("window.__313_CONFIG = ") && r.body.includes(E.PRODUCTION_SUPABASE_HOST));
r = run({ VERCEL_ENV: "preview" });
assert.strictEqual(r.status, 500);
assert.ok(r.body.startsWith("throw new Error("), "misconfigured preview serves a loud failure");
assert.ok(!r.body.includes(E.PRODUCTION_SUPABASE_HOST), "and never leaks production");
r = run({ VERCEL_ENV: "preview", SUPABASE_URL: STAGING, SUPABASE_ANON_KEY: "pub" });
assert.strictEqual(r.status, 200);
assert.ok(r.body.includes("stagingprojectref") && !r.body.includes(E.PRODUCTION_SUPABASE_HOST));

console.log("environment.test.js: all assertions passed");
