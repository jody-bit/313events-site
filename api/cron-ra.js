const crypto = require("crypto");
const path = require("path");
const {
  startRaSyncSession,
  completeRaSyncSession,
  RaSyncSessionError,
} = require(path.join(__dirname, "..", "scripts", "ra-sync"));
const { promoteRaCandidates } = require(path.join(__dirname, "..", "scripts", "ra-candidate-promotion"));
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
//   Body:   { "action": "start", "candidateIds": ["ra-2495966", ...],
//             "listingMetadata": { "ra-2495966": { title, date, displayedTime,
//               venueName, city, url, image }, ... } }  // listingMetadata optional
//        -> { runId, candidateCount, knownCount, newCount, allNewCount,
//             allNewIds, ids, listingMetadataCount }
//   Body:   { "action": "complete", "runId": "...", "events": [ { id, title,
//             description, startDate, endDate, venueName, address, image,
//             offersPrice, url }, ... ] }
//        -> { runId, imported, duplicates, skipped, errors, errorDetail, duplicateDetail }
//
// "start"'s listingMetadata is optional and additive: whatever the device
// read directly off ra.co's listing cards (never invented), keyed by the
// same "ra-<id>" strings as candidateIds. It's persisted server-side
// (source_runs.session_data.listingMetadata) for EVERY submitted id, not
// just the ids in this run's capped `ids` detail-fetch batch, and before
// any detail page is ever opened -- so a DataDome block partway through
// detail acquisition can never strand it. allNewIds (also new) is the full,
// uncapped list of genuinely-new ids this run's diff found; `ids` stays the
// existing capped subset actually due for detail-fetch this run.

const SUPABASE_URL = process.env.SUPABASE_URL;
// Non-production deployments must never use the production database (api/_lib/environment.js).
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);
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
        listingMetadata: body.listingMetadata,
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
      // RA_CANDIDATE_PROMOTION DEFECT 2 fix (2026-10-07): close the
      // discovery/promotion timing gap. Before this, promoteRaCandidates()
      // was only ever invoked by api/cron-enrichment.js's once-daily Step
      // 0 (around 12:30 UTC) and on demand via the "promote_candidates"
      // bridge action -- both of which historically ran BEFORE that same
      // day's RA sync session even started (13:23-15:19 UTC in the week of
      // production evidence this fix is based on), so getLatestRaSession()
      // was always looking at YESTERDAY's session, already largely
      // resolved, never today's fresh backlog. Smallest safe integration
      // point: this session's own "complete" call already IS the moment
      // its listingMetadata/allNewIds backlog is both durably recorded
      // (written at start(), unchanged by this call) and as current as it
      // will ever get for today -- so give promoteRaCandidates() a chance
      // at whatever remains unresolved RIGHT HERE, rather than waiting for
      // a cron that structurally always arrives too late. No session id
      // needs to be threaded through: getLatestRaSession() orders by
      // started_at desc, and the session this very call just completed
      // is -- by construction -- the newest Resident Advisor source_runs
      // row at this exact moment.
      //
      // Deliberately isolated from completeRaSyncSession's own result:
      // promoteRaCandidates() never writes to source_runs and never
      // touches the events this call just imported (it only acts on ids
      // STILL outside the events table), so a failure here can never
      // corrupt or retry the detail-fetch import that just succeeded --
      // only this additive `candidatePromotion` field is affected, and the
      // response is still 200 with completeRaSyncSession's own result
      // either way. Reuses promoteRaCandidates() completely unmodified,
      // including its own RA_CANDIDATE_PROMOTION_ENABLED gate, its own
      // per-run cap, and its own conservative dedupe -- nothing here
      // duplicates any of that logic.
      try {
        result.candidatePromotion = await promoteRaCandidates({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
      } catch (promotionErr) {
        result.candidatePromotion = { error: promotionErr.message };
      }
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

  if (body.action === "promote_candidates") {
    // 2026-10-01, RA candidate-recovery MVP -- on-demand trigger for
    // scripts/ra-candidate-promotion.js, reachable via the exact same
    // CRON_SECRET-gated bridge as start/complete (see .github/scripts/
    // ra-sync-bridge.js's "promote" action). This is also exactly what
    // api/cron-enrichment.js's own daily Step 0 calls automatically --
    // this endpoint exists so it can be run on demand (dry-run validation
    // before production deployment; a manual re-run) without waiting for
    // tomorrow's cron. dryRun defaults false; promoteRaCandidates itself
    // never auto-creates anything other than status='pending_review'
    // rows, regardless of dryRun.
    try {
      const result = await promoteRaCandidates({
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        dryRun: !!body.dryRun,
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(400).json({ error: "Body must include { action: 'start'|'complete'|'promote_candidates', ... }" });
};
