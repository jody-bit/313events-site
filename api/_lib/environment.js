"use strict";

// api/_lib/environment.js
//
// Sprint Zero (environment + release foundation). One place that knows
// which deployment this code is running in, and which database it may use.
//
// WHY: before this, production's Supabase URL and publishable key were
// hard-coded as fallbacks, so a Preview deployment with missing env vars
// silently read production, and nothing stopped a non-production runtime
// from being handed production's service-role key.
//
// RULES
//   - "production" means VERCEL_ENV === "production" (or APP_ENV, see below). Anything else
//     (preview, development, unset, local, tests) is NON-production.
//   - A non-production runtime must never use the production database.
//     assertDatabaseAllowed() throws if it would. The production project
//     host is public (it is in every page's source), so it can live here.
//   - Production keeps its existing fallbacks, so production behavior does
//     not depend on any env var being set. Non-production has NO fallback:
//     a missing variable is an error, not a silent switch to production.
//
// This file contains no secrets. The publishable key is public by design
// (read-only through RLS) and is the same value every page already ships.

const PRODUCTION_SUPABASE_HOST = "afvyfjfqukptnfmgshzn.supabase.co";
const PRODUCTION_SUPABASE_URL = `https://${PRODUCTION_SUPABASE_HOST}`;
const PRODUCTION_PUBLISHABLE_KEY = "sb_publishable_NQgem2pH8h_ynP8ikwdmFw_5aoN34Q5";
const PRODUCTION_SITE_URL = "https://313.events";

// Vercel sets VERCEL_ENV at runtime when "Automatically expose System
// Environment Variables" is on (the default). If a project has that turned
// off, set APP_ENV=production on the Production environment instead.
// Anything that is not exactly "production" is treated as non-production.
function environmentName(env = process.env) {
  return env.VERCEL_ENV || env.APP_ENV || "local";
}

function isProduction(env = process.env) {
  return environmentName(env) === "production";
}

function hostOf(url) {
  try { return new URL(String(url)).host.toLowerCase(); } catch { return ""; }
}

function pointsAtProductionDatabase(url) {
  return hostOf(url) === PRODUCTION_SUPABASE_HOST;
}

// Throws when a non-production runtime is configured with the production
// database. Call before any write path uses SUPABASE_URL. A deliberate
// override exists for the rare supervised case: ALLOW_PRODUCTION_DATABASE
// must equal the exact phrase below, and is never set by default.
const OVERRIDE_PHRASE = "i-understand-this-is-production";
function assertDatabaseAllowed(supabaseUrl, env = process.env) {
  if (isProduction(env)) return;
  if (!pointsAtProductionDatabase(supabaseUrl)) return;
  if (env.ALLOW_PRODUCTION_DATABASE === OVERRIDE_PHRASE) return;
  throw new Error(
    `Refusing to use the production database from a non-production environment (${environmentName(env)}). ` +
    `Set SUPABASE_URL to the staging project for Preview/Development.`
  );
}

// Public (browser-safe) config. Production falls back to its own values so
// it never depends on env vars being present; everything else must be set.
function publicConfig(env = process.env) {
  const prod = isProduction(env);
  const supabaseUrl = env.SUPABASE_URL || (prod ? PRODUCTION_SUPABASE_URL : "");
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || (prod ? PRODUCTION_PUBLISHABLE_KEY : "");
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: "SUPABASE_URL and SUPABASE_ANON_KEY must be set for non-production deployments." };
  }
  if (!prod && pointsAtProductionDatabase(supabaseUrl) && env.ALLOW_PRODUCTION_DATABASE !== OVERRIDE_PHRASE) {
    return { ok: false, error: "Non-production deployment is configured with the production database. Refusing." };
  }
  return { ok: true, environment: environmentName(env), supabaseUrl, supabaseAnonKey };
}

// Canonical site URL for links in emails/sitemaps. Non-production uses the
// deployment's own URL when known, so staging never emits production links.
function siteUrl(env = process.env) {
  if (isProduction(env)) return PRODUCTION_SITE_URL;
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, "");
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

module.exports = {
  PRODUCTION_SUPABASE_HOST, PRODUCTION_SUPABASE_URL, PRODUCTION_PUBLISHABLE_KEY, PRODUCTION_SITE_URL, OVERRIDE_PHRASE,
  environmentName, isProduction, pointsAtProductionDatabase, assertDatabaseAllowed, publicConfig, siteUrl,
};
