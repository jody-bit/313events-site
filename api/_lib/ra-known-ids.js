// api/_lib/ra-known-ids.js — pure helpers for api/known-ra-ids.js
//
// The external RA (Resident Advisor) acquisition automation runs its own
// crawl, then needs to know which of its candidate "ra-<numeric id>"
// external_ids already have a row in this project's events table -- so it
// only ever tries to create the ones that are genuinely new. It can't
// answer that question itself with an anonymous Supabase read: RLS on the
// events table only exposes approved (and possibly pending_review) rows to
// an anonymous client, so a rejected/hidden RA event is invisible to it --
// and every run then re-discovers it as "new" and re-submits it forever.
// api/known-ra-ids.js exists to answer that one question using the
// service-role path (see api/_lib/status-lookup.js), where status doesn't
// matter at all. This file holds the pure, independently-testable pieces
// of that endpoint: request validation and the known/not-known split.
//
// Nothing in this file makes a network call or touches the database --
// that's entirely api/known-ra-ids.js's job, via the shared
// lookupExistingRows() helper from api/_lib/status-lookup.js.
"use strict";

// RA external_ids are always "ra-<the numeric RA event id>" -- e.g.
// "ra-2495966". Established by the manual-pull SQL files
// (supabase/update_2026-09-2*_ra-*.sql) and locked in by commit 11ec5dc
// ("Backfill ra-<id> external_id on 15 known RA duplicate events").
const RA_ID_PATTERN = /^ra-[0-9]+$/;

// Deliberately excluded, always reported as "known" regardless of what the
// production external_id lookup actually finds -- see
// supabase/update_2026-09-22_ra-external-id-backfill.sql's own header and
// commit 11ec5dc. ra-2485347 ("A Dub Supreme" @ MotorCity Wine, a
// recurring night) is a real-world duplicate of a row that
// cron-motorcitywine.js's own iCal ingestion already owns under its own
// external_id scheme ("mcw-ical-<date>-<hash>"), not "ra-2485347" -- that
// backfill deliberately left this one id unresolved, flagged for Jody's
// direct review, specifically so no mechanical process would guess at it.
//
// Without this carve-out, a literal external_id lookup for "ra-2485347"
// finds no row (nothing in production has that exact value) and this
// endpoint would report it as not-known -- telling the external RA
// automation it's safe to create, which would produce a second row for an
// event MotorCity Wine's connector already owns. Hard-coding it here as
// always-known preserves that backfill's own caution without this
// endpoint (or this task) performing any write to resolve the underlying
// ownership question itself.
const RA_LEGACY_EXCLUDED_IDS = new Set(["ra-2485347"]);

class RaKnownIdsValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "RaKnownIdsValidationError";
    if (details !== undefined) this.details = details;
  }
}

// Validates the request body's candidate id list. Fails closed: throws
// RaKnownIdsValidationError on anything that isn't exactly a non-empty
// array of strings each matching RA_ID_PATTERN, rather than silently
// dropping the bad entries and proceeding with whatever's left. A
// malformed request from the automation should come back as a clear 400
// it can log and fix, not a silently-incomplete 200 whose knownIds list
// could be misread as "these are the only ones checked."
//
// Duplicate ids in the input are not treated as malformed (the
// automation's own candidate list could legitimately repeat one) -- they
// are deduped here, order-preserving, before being handed to the lookup.
function parseCandidateIds(rawIds) {
  if (!Array.isArray(rawIds)) {
    throw new RaKnownIdsValidationError('candidateIds must be an array of "ra-<numeric id>" strings');
  }
  if (rawIds.length === 0) {
    throw new RaKnownIdsValidationError("candidateIds must not be empty");
  }
  const invalid = rawIds.filter((id) => typeof id !== "string" || !RA_ID_PATTERN.test(id));
  if (invalid.length > 0) {
    throw new RaKnownIdsValidationError(
      'every candidateIds entry must be a string matching the "ra-<numeric id>" format',
      { invalid }
    );
  }
  return Array.from(new Set(rawIds));
}

// Given the parsed candidate ids and the Set of ids a production lookup
// confirmed exist (any status -- the caller is responsible for using a
// lookup that does not filter by status), returns the subset that should
// be reported as "known": every production-confirmed id, plus every
// legacy-excluded id present in the candidate list (see
// RA_LEGACY_EXCLUDED_IDS above), regardless of whether the raw lookup
// found a row for it.
//
// existingIdSet must be a Set -- callers pass one built from the lookup's
// own result (e.g. `new Set(existingRowsMap.keys())`). A caller passing
// something else is an internal wiring bug, not a client input problem, so
// this throws rather than silently coercing it.
function computeKnownIds(candidateIds, existingIdSet) {
  if (!(existingIdSet instanceof Set)) {
    throw new RaKnownIdsValidationError("existingIdSet must be a Set (internal error, not a client input problem)");
  }
  return candidateIds.filter((id) => existingIdSet.has(id) || RA_LEGACY_EXCLUDED_IDS.has(id));
}

// The complementary "candidate-new" split -- ids NOT reported as known.
// api/known-ra-ids.js's own contract is to return only knownIds (per its
// "return only which submitted IDs already exist" requirement), so this
// is not currently called from the endpoint's response path. It's exposed
// and tested here anyway because it's the one piece of logic that must
// never drift out of sync with computeKnownIds()'s definition of "known" --
// any future caller that needs the new/not-yet-created side of this same
// split (rather than recomputing its own diff) should use this, not
// reimplement it.
function computeCandidateNewIds(candidateIds, existingIdSet) {
  const known = new Set(computeKnownIds(candidateIds, existingIdSet));
  return candidateIds.filter((id) => !known.has(id));
}

module.exports = {
  RA_ID_PATTERN,
  RA_LEGACY_EXCLUDED_IDS,
  RaKnownIdsValidationError,
  parseCandidateIds,
  computeKnownIds,
  computeCandidateNewIds,
};
