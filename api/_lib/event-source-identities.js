"use strict";

// api/_lib/event-source-identities.js — general-purpose cross-source
// identity crosswalk (see supabase/migration_045_event_source_identities.sql
// for the schema this reads/writes, and that migration's own header for
// why this is a separate additive table rather than a change to
// events.external_id).
//
// Two operations, mirroring the chunked/injectable conventions already
// established by api/_lib/status-lookup.js, but with deliberately
// different failure behavior (see each function's own comment):
//
//   lookupKnownSourceIds() — read, used to WIDEN an existing "is this
//     candidate already known?" check. Fails soft.
//   recordSourceIdentity() — write, used to persist a conservative
//     cross-source dedupe match once it's found. Fails soft.
//
// Both are deliberately fail-soft, the opposite convention from status-
// lookup.js's fail-closed contract. status-lookup.js protects existing
// moderation state from being silently reversed by a failed lookup --
// getting that wrong is dangerous. This table only ever ADDS information
// that makes a known-elsewhere candidate get skipped instead of
// re-examined, or persists a match that's already been found by the
// authoritative dedupe check (findConservativeDuplicate) using the
// authoritative DB. A failure here just means: the candidate is treated
// exactly as it would have been before this table existed (re-examined
// as new, or the match simply isn't remembered for next time) -- never
// worse than the pre-existing behavior, never a reason to abort a run.

const MAX_IDS_PER_CHUNK = 100;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Returns a Set of the bare sourceIds (e.g. "2547930", not "ra-2547930")
// that already have a row in event_source_identities for the given
// source. An id with no row simply isn't in the returned Set -- that's
// the normal "no identity match (yet)" outcome, not a failure.
//
// Fails soft: a chunk that errors (network failure, non-OK response,
// unparseable body) is skipped, not thrown -- see header comment for why
// that's the correct posture here, unlike status-lookup.js.
async function lookupKnownSourceIds(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, source, sourceIds, options = {}) {
  const { fetchFn = fetch } = options;
  const ids = Array.isArray(sourceIds)
    ? Array.from(new Set(sourceIds.filter((id) => typeof id === "string" && id.length > 0)))
    : [];
  const known = new Set();
  if (!ids.length || !source || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return known;

  for (const chunk of chunkArray(ids, MAX_IDS_PER_CHUNK)) {
    try {
      const idList = chunk.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",");
      const resp = await fetchFn(
        `${SUPABASE_URL}/rest/v1/event_source_identities?source=eq.${encodeURIComponent(source)}&source_id=in.(${idList})&select=source_id`,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      if (!resp || !resp.ok) continue; // fail soft -- see header comment
      const rows = await resp.json();
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (row && typeof row.source_id === "string") known.add(row.source_id);
        }
      }
    } catch {
      // fail soft -- see header comment
    }
  }
  return known;
}

// Persists one (source, source_id) -> event_id relationship. Idempotent
// via on_conflict=source,source_id with resolution=ignore-duplicates --
// matches the table's own primary key, so re-recording the same match on
// a retried/duplicated run (or a second source listing the same event
// under a different id that still resolves to the same match) is a
// silent no-op rather than an error.
//
// Fails soft: returns false, never throws. Recording the relationship is
// a durability improvement for FUTURE runs, not a precondition for the
// CURRENT run's own correctness -- the duplicate-handling code at the
// call site has already correctly decided to skip this candidate (it
// found a real match via the authoritative dedupe check) regardless of
// whether this write succeeds.
async function recordSourceIdentity(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { eventId, source, sourceId }, options = {}) {
  const { fetchFn = fetch } = options;
  if (!eventId || !source || !sourceId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/event_source_identities?on_conflict=source,source_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify([{ event_id: eventId, source, source_id: sourceId }]),
    });
    return !!(resp && resp.ok);
  } catch {
    return false;
  }
}

module.exports = { lookupKnownSourceIds, recordSourceIdentity, MAX_IDS_PER_CHUNK };
