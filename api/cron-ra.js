const crypto = require("crypto");
const path = require("path");
const {
  startRaSyncSession,
  completeRaSyncSession,
  RaSyncSessionError,
} = require(path.join(__dirname, "..", "scripts", "ra-sync"));
const { RaKnownIdsValidationError } = require("./_lib/ra-known-ids");
const { StatusLookupFailedError } = require("./_lib/status-lookup");

// Vercel serverless function — the new RA (Resident Advisor) sync pipeline's
// only entry point for the device's browser-driven acquisition automation.
// See scripts/ra-sync.js for the full design rationale and every actual
// business rule; this file is a thin, CRON_SECRET-gated wrapper around its
// two orchestrators, same "shared module + thin endpoint wrapper" pattern
// as api/cron-editorial.js / api/admin-editorial.js around
// scripts/press-coverage-linking.js.
//
// NOT in vercel.json's own cron schedule, same as the endpoint this
// replaces (api/known-ra-ids.js) — this is called directly by the
// separately-scheduled Claude task that drives the browser, not by
// Vercel's own cron invoker.
//
// AUTH — CRON_SECRET, required and fail-closed (a missing CRON_SECRET
// rejects every request with 500, never silently allows one through the
// way an internal-only read-side cron's optional "if (CRON_SECRET) {...}"
// gate does elsewhere in this project). This endpoint performs real
// database writes on behalf of a caller outside this codebase, the exact
// same posture api/known-ra-ids.js already used for RA_AUTOMATION_SECRET —
// this replaces that dedicated secret with the project's already-correctly-
// configured CRON_SECRET (see the architecture doc's audit of the
// RA_AUTOMATION_SECRET / CRON_SECRET mismatch).
//
// REQUEST -- POST /api/cron-ra
//   Header: Authorization: Bearer <CRON_SECRET>
//   Body:   { "action": "start", "candidateIds": ["ra-2495966", ...] }
//        -> { runId, candidateCount, knownCount, newCount, allNewCount, ids }
//   Body:   { "action": "complete", "runId": "...", "events": [ { id, title,
//             description, startDate, endDate, venueName, address, image,
//             offersPrice, url }, ... ] }
//        -> { runId, imported, duplicates, skipped, errors, errorDetail, duplicateDetail }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

function timingSafeStringEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function checkAuth(req, res) {
  if (!CRON_SECRET) {
    res.status(500).json({ error: "CRON_SECRET not configured on the server." });
    return false;
  }
  const auth = req.headers["authorization"];
  if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Database not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." });
    return;
  }
  if (!checkAuth(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  if (body.action === "start") {
    try {
      const result = await startRaSyncSession({
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        candidateIds: body.candidateIds,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof RaKnownIdsValidationError) {
        res.status(400).json({ error: err.message, details: err.details });
        return;
      }
      if (err instanceof StatusLookupFailedError || err instanceof RaSyncSessionError) {
        res.status(502).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (body.action === "complete") {
    try {
      const result = await completeRaSyncSession({
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        runId: body.runId,
        events: body.events,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof RaSyncSessionError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(400).json({ error: "Body must include { action: 'start'|'complete', ... }" });
};
