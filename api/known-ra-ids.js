const crypto = require("crypto");
const { lookupExistingRows } = require("./_lib/status-lookup");
const { parseCandidateIds, computeKnownIds, RaKnownIdsValidationError } = require("./_lib/ra-known-ids");

// Vercel serverless function -- read-only lookup for the external Resident
// Advisor (RA) acquisition automation (a separately-scheduled Claude task,
// not a Vercel cron -- this endpoint is intentionally NOT in vercel.json's
// "crons" list; the automation calls it directly).
//
// PURPOSE (and only purpose): answer "which of these candidate RA
// external_ids already exist in production, regardless of event moderation
// status?" The automation needs this because an anonymous Supabase read is
// subject to RLS -- a rejected or hidden RA event is invisible to it, so
// without this endpoint every run re-discovers already-rejected events as
// "new" and re-submits them forever. This endpoint uses the service-role
// path (via api/_lib/status-lookup.js, same helper the ingestion
// connectors use for their own pre-write status checks) specifically to
// see past that RLS restriction for a read -- it performs no writes of any
// kind, moderation status included.
//
// AUTH -- RA_AUTOMATION_SECRET, a dedicated env var for this endpoint
// only. Deliberately NOT CRON_SECRET: CRON_SECRET is a Vercel Sensitive
// Environment Variable on this project and cannot be read, rotated, or
// otherwise touched from here, and reusing it would also blur which
// caller (Vercel's own cron invoker vs. this external automation) a given
// request actually came from. A missing RA_AUTOMATION_SECRET fails
// closed -- every request is rejected with 500, never silently allowed
// through the way CRON_SECRET's own "if (CRON_SECRET) {...}" optional
// gate behaves elsewhere in this project (see e.g.
// api/cron-outerlimitslounge.js) -- because this endpoint's whole job is
// to gate a service-role-backed read for a caller outside this codebase,
// so there is no safe "auth not configured yet" default the way there is
// for an internal-only cron trigger.
//
// REQUEST  -- POST /api/known-ra-ids
//   Header:  Authorization: Bearer <RA_AUTOMATION_SECRET>
//   Body:    { "candidateIds": ["ra-2495966", "ra-2407740", ...] }
//            Every entry must match "ra-<numeric id>"; the array must be
//            non-empty. A malformed body is rejected with 400 -- never
//            silently filtered down to whatever entries happened to be
//            valid.
//
// RESPONSE -- 200 { "knownIds": ["ra-2495966", ...] }
//   Only the subset of the submitted candidateIds that already exist in
//   production (any status) -- see api/_lib/ra-known-ids.js's
//   computeKnownIds(). The automation is expected to treat every
//   candidate NOT in knownIds as safe to create. Never returns event rows,
//   titles, or any other event data -- existence only.
//
//   A lookup failure (Supabase unreachable, non-OK response, malformed
//   response body -- see api/_lib/status-lookup.js's fail-closed
//   contract) returns 502 and NEVER a 200 with an empty or partial
//   knownIds list. Reporting "none of these are known" on a failed lookup
//   would tell the automation every candidate is new and safe to create,
//   which is exactly backwards when the truth is simply "couldn't check."
//
// RA-SPECIFIC RULE -- ra-2485347 is always reported as known, regardless
// of lookup result. See api/_lib/ra-known-ids.js's RA_LEGACY_EXCLUDED_IDS
// for the full explanation (MotorCity Wine connector ownership).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RA_AUTOMATION_SECRET = process.env.RA_AUTOMATION_SECRET;

// Same timing-safe secret comparison as every other secret-gated endpoint
// in this project (see api/admin-events.js) -- duplicated rather than
// shared, per this project's one-file-per-endpoint convention for
// endpoint-local helpers (api/_lib/* is reserved for logic actually meant
// to be shared across files, like status-lookup.js).
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
  if (!RA_AUTOMATION_SECRET) {
    res.status(500).json({ error: "RA_AUTOMATION_SECRET not configured on the server." });
    return false;
  }
  const auth = req.headers["authorization"];
  if (!timingSafeStringEqual(auth || "", `Bearer ${RA_AUTOMATION_SECRET}`)) {
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

  let candidateIds;
  try {
    candidateIds = parseCandidateIds(body.candidateIds);
  } catch (err) {
    if (err instanceof RaKnownIdsValidationError) {
      res.status(400).json({ error: err.message, details: err.details });
      return;
    }
    throw err;
  }

  let existingRows;
  try {
    // No status filter -- deliberately the same unfiltered
    // events?external_id=in.(...) query status-lookup.js's other callers
    // use, so a rejected/hidden row counts as "known" exactly the same as
    // an approved one. select is narrowed to external_id only -- this
    // endpoint has no reason to read or return any other event column.
    existingRows = await lookupExistingRows(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, candidateIds, {
      select: "external_id",
    });
  } catch (err) {
    // Fail closed -- see this file's header comment. Never fall through
    // to a 200 with an empty/partial knownIds list on a failed lookup.
    res.status(502).json({ error: "Known-id lookup failed, aborting: " + err.message });
    return;
  }

  const existingIdSet = new Set(existingRows.keys());
  const knownIds = computeKnownIds(candidateIds, existingIdSet);
  res.status(200).json({ knownIds });
};
