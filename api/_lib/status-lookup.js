// api/_lib/status-lookup.js — WP 0.17: fail-closed status lookup (2026-09-22)
//
// THE BUG THIS CLOSES (architecture audit gap D7, severity S1): every
// ingestion connector's pre-write status lookup was fail-SOFT — a failed
// lookup (non-OK response, thrown network error, or an unusable response
// body) silently fell through to an EMPTY existingStatusByExternalId map,
// and every row then got DEFAULT_STATUS (`approved` in 17 of the 20
// connectors that existed when the audit ran). That means a single failed
// GET could silently re-approve every previously-rejected event on the
// next run of that connector, including every 2026-09-17 dedupe-batch
// rejection — a moderator's decision reversed with no one asking and no
// record of why. The status lookup's whole job is to protect existing
// moderation state; failing soft defeated that job at exactly the moment
// it mattered most.
//
// THE FIX: this module is fail-CLOSED. lookupExistingStatuses() either
// returns a complete, trustworthy Map of every requested external_id's
// current status, or it throws — there is no third outcome, and it never
// returns a partial/empty map to paper over a failure. A connector that
// calls this MUST treat a thrown error as "abort this run: zero event
// writes, HTTP 502" (see each connector's own call site for the exact
// shape) rather than falling back to some default status. This makes the
// safe behavior the only behavior the helper offers — a connector cannot
// accidentally reintroduce D7 by copy-pasting a fail-soft catch, because
// there's no fail-soft path exposed here for it to copy.
//
// CHUNKING: Supabase/PostgREST's `external_id=in.(id1,id2,...)` filter
// puts every id in the URL's query string, and cron-ticketmaster.js alone
// can have on the order of ~1,000 candidate ids in one run (~20 KB
// unchunked, per the audit) — a real risk of tripping a gateway URL-length
// limit (the audit specifically flagged a 414 as one of the failure modes
// this whole fix exists to handle safely). MAX_IDS_PER_CHUNK caps every
// single lookup request to a bounded, safe size; a ~1,000-id run issues
// ceil(1000 / 100) = 10 chunked requests instead of one large one. EVERY
// chunk must succeed — if any one chunk fails, the whole lookup fails
// (see "fail-closed" above), because a partial result (some ids resolved,
// others unknown) is exactly the "silently missing status" situation this
// fix exists to prevent; there is no safe way to write rows whose true
// existing status couldn't be confirmed.
//
// USAGE (from a connector, inside the existing per-run try block, in place
// of the old inline idList/fetch/try-catch):
//
//   const { lookupExistingStatuses } = require("./_lib/status-lookup");
//   ...
//   let existingStatusByExternalId;
//   try {
//     existingStatusByExternalId = await lookupExistingStatuses(
//       SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, rows.map((r) => r.external_id)
//     );
//   } catch (lookupErr) {
//     // await finishRun(runHandle, { outcome: "failed", http_status: 502,
//     //   error_sample: "Status lookup failed: " + lookupErr.message }); -- if this
//     //   connector has WP 0.5 run-log instrumentation; finishRun is itself
//     //   fail-safe (see run-log.js), so this is never a second point of failure.
//     res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
//     return;
//   }
//   const rowsWithStatus = rows.map((row) => ({
//     ...row,
//     status: existingStatusByExternalId.get(row.external_id) || DEFAULT_STATUS,
//   }));
//
// Note what does NOT change: this module only ever narrows an UNKNOWN
// status question into either "here is the real map" or "this run must not
// write." It has no opinion on what a connector's DEFAULT_STATUS should be
// for a genuinely NEW row (one with no existing status at all, which is a
// legitimate, expected `undefined` in the returned map, not a failure) --
// that per-connector default-status decision is unchanged and stays in
// each connector, exactly as before this WP.

const MAX_IDS_PER_CHUNK = 100;

class StatusLookupFailedError extends Error {
  constructor(message, options) {
    super(message);
    this.name = "StatusLookupFailedError";
    if (options && options.cause !== undefined) this.cause = options.cause;
  }
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Low-level primitive: fetches whatever columns `select` names for every
// given external_id, in chunks of at most MAX_IDS_PER_CHUNK per request.
// Returns a Map(external_id -> row) containing an entry for every EXISTING
// row found (an id with no existing row simply has no entry — that's a
// normal "this is a new row" outcome, not a failure). Throws
// StatusLookupFailedError — never returns a partial or empty-on-failure
// map — if any chunk's request fails for any reason: a non-OK HTTP
// response, a thrown network exception, an unparseable response body, a
// response that isn't a JSON array, or a row missing its own external_id.
//
// Almost every connector wants only the status column — use
// lookupExistingStatuses() below for that, the easy/default path. This
// lower-level function exists for the one connector (cron-poppspacking.js,
// WP 0.8) that also needs to preserve a reviewer's start_date/time_display
// correction, not just status, and would otherwise have had to hand-roll
// its own subtly different chunked/fail-closed fetch to get those extra
// columns — sharing this instead keeps the chunking and fail-closed
// contract identical everywhere, even where the selected columns differ.
async function lookupExistingRows(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, externalIds, options) {
  const select = (options && options.select) || "external_id,status";
  const map = new Map();
  const ids = Array.isArray(externalIds)
    ? externalIds.filter((id) => typeof id === "string" && id.length > 0)
    : [];
  if (!ids.length) return map;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new StatusLookupFailedError(
      "Status lookup misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  for (const chunk of chunkArray(ids, MAX_IDS_PER_CHUNK)) {
    const idList = chunk.join(",");
    let resp;
    try {
      resp = await fetch(
        `${SUPABASE_URL}/rest/v1/events?external_id=in.(${idList})&select=${select}`,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
      );
    } catch (err) {
      throw new StatusLookupFailedError("Status lookup network failure: " + err.message, { cause: err });
    }

    if (!resp.ok) {
      let bodySample = "";
      try {
        bodySample = (await resp.text()).slice(0, 300);
      } catch {
        // Reading the error body is best-effort only — the missing body
        // doesn't change the outcome, the non-OK status alone is enough.
      }
      throw new StatusLookupFailedError(`Status lookup returned ${resp.status}${bodySample ? ": " + bodySample : ""}`);
    }

    let rows;
    try {
      rows = await resp.json();
    } catch (err) {
      throw new StatusLookupFailedError("Status lookup returned unparseable JSON: " + err.message, { cause: err });
    }
    if (!Array.isArray(rows)) {
      throw new StatusLookupFailedError("Status lookup returned a non-array response");
    }

    for (const row of rows) {
      if (!row || typeof row.external_id !== "string" || !row.external_id) {
        throw new StatusLookupFailedError("Status lookup returned a malformed row (missing external_id)");
      }
      map.set(row.external_id, row);
    }
  }

  return map;
}

// The easy/default path — almost every connector should call this, not
// lookupExistingRows() directly. Same chunking and fail-closed contract;
// returns a Map(external_id -> status) instead of full row objects.
async function lookupExistingStatuses(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, externalIds) {
  const rows = await lookupExistingRows(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, externalIds, {
    select: "external_id,status",
  });
  const statuses = new Map();
  for (const [externalId, row] of rows) statuses.set(externalId, row.status);
  return statuses;
}

module.exports = {
  lookupExistingStatuses,
  lookupExistingRows,
  StatusLookupFailedError,
  MAX_IDS_PER_CHUNK,
};
