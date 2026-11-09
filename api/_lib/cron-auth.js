// api/_lib/cron-auth.js — Package 1 (Platform): one fail-closed check for every
// scheduled handler, replacing the copy-pasted `if (CRON_SECRET) { ... }` block.
//
// WHY
// The old block only checked when CRON_SECRET was set. If the variable were
// ever unset or renamed on a deployment, every cron endpoint would silently
// accept anyone (ENGINEERING_READINESS_REVIEW, cron auth; the healthcheck
// probes this exact regression). A missing secret on a deployed environment is
// now an error, not an open door.
//
// WHAT IT DOES
//   secret set, header matches ............ ok
//   secret set, header missing/wrong ....... 401 {error:"Unauthorized"}
//   secret NOT set, running on Vercel ...... 500 {error:"CRON_SECRET not configured on the server."}
//   secret NOT set, not on Vercel .......... ok (local runs and the test suite,
//                                              which have no deployed endpoint to protect)
// "On Vercel" means the platform-set VERCEL_ENV is present (production,
// preview or development); it cannot be set by a caller of the endpoint.
//
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` itself when the
// variable exists, so a configured deployment keeps working unchanged.

"use strict";

const crypto = require("crypto");

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// cronAuthStatus(req, env) -> "ok" | "unauthorized" | "unconfigured"
function cronAuthStatus(req, env = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) return env.VERCEL_ENV ? "unconfigured" : "ok";
  const header = req && req.headers ? req.headers.authorization : "";
  return timingSafeEqual(header || "", `Bearer ${secret}`) ? "ok" : "unauthorized";
}

// requireCronAuth(req, res) -> true when the handler may proceed. When it
// returns false the response has already been sent.
function requireCronAuth(req, res) {
  const status = cronAuthStatus(req);
  if (status === "ok") return true;
  if (status === "unconfigured") res.status(500).json({ error: "CRON_SECRET not configured on the server." });
  else res.status(401).json({ error: "Unauthorized" });
  return false;
}

module.exports = { cronAuthStatus, requireCronAuth };
