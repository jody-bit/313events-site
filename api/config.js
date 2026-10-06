"use strict";

// api/config.js — served at /config.js (see vercel.json rewrite).
// Public, browser-safe configuration for the static pages: which Supabase
// project to read and the publishable key. Replaces the production URL/key
// that used to be hard-coded in eight HTML files, so Preview/staging
// deployments read the staging database.
//
// Fails loudly (a script that throws a clear message) rather than falling
// back to production when a non-production deployment is misconfigured.
const { publicConfig } = require("./_lib/environment");

module.exports = function handler(req, res) {
  const cfg = publicConfig();
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  if (!cfg.ok) {
    res.status(500).send(`throw new Error(${JSON.stringify("313.events config: " + cfg.error)});`);
    return;
  }
  const body = { environment: cfg.environment, supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey };
  res.status(200).send(`window.__313_CONFIG = ${JSON.stringify(body)};`);
};
