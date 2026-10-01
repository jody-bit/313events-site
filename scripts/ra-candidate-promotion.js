"use strict";

// scripts/ra-candidate-promotion.js
//
// RA candidate-recovery MVP, "Step 0" -- 2026-10-01 (Product Owner decision
// set approving 313events-site/RA_CANDIDATE_RECOVERY_PROPOSAL findings:
// two consecutive production runs showed RA listing discovery works while
// RA detail-page acquisition is reliably DataDome-blocked; the uncapped
// backlog + listing-card evidence is already durably persisted in
// source_runs.session_data (scripts/ra-sync.js's startRaSyncSession) but
// never reaches the `events` table, so the EXISTING generic enrichment/
// self-healing pipeline (scripts/generic-metadata-enrichment.js, run daily
// by api/cron-enrichment.js) never gets a chance at it).
//
// This is the smallest bridge between the two: promote each still-
// unresolved RA backlog id into a MINIMAL, safe `events` row --
// status='pending_review' (hidden from the public site by schema.sql's own
// RLS policy; this project's existing "not yet confirmed real" state, same
// one every submitter-submitted event starts in) -- using ONLY evidence RA
// itself already showed on its listing page. Nothing here calls ra.co,
// nothing here guesses a venue/time/ticket link. Once the row exists,
// api/cron-enrichment.js's existing, UNMODIFIED steps (reverse/forward
// venue resolution, bounded external description/venue discovery, last-
// resort digital-home link) run against it automatically the same day --
// no separate RA enrichment system, per explicit instruction.
//
// PRODUCT DECISIONS THIS CODE ENFORCES (2026-10-01):
//   1. May auto-create pending_review rows after conservative dedupe. Must
//      NEVER auto-create approved rows -- status is hard-coded here, not
//      a parameter.
//   2. RA's own listing `date` (day-level) may populate start_date (schema
//      requires start_date not null, and this is RA's own stated fact, not
//      an invented one) so the row is identifiable/searchable/dedupe-able.
//      RA's listing `displayedTime` is deliberately NEVER written to
//      time_display or any authoritative time field here -- only an
//      independent source (future work) or a human may confirm a start
//      time. A candidate is skipped (counted "insufficient identity"),
//      never guessed, when title or date is missing.
//   3. RA id/url provenance is preserved via external_id (the existing
//      "ra-<id>" convention -- also what lets a later successful RA detail
//      fetch merge into this SAME row rather than duplicate it, and what
//      api/_lib/ra-provenance-note.js's note line also records explicitly)
//      and via the note field (which listing fields RA actually supplied --
//      never a fixed assumed list).
//   4. Conservative cross-source dedupe (scripts/ra-sync.js's own
//      findConservativeDuplicate, reused unmodified) runs BEFORE any row
//      is created -- a title/venue match against an existing non-RA row
//      within a few days is skipped, never silently merged or overwritten.
//
// Usage: node scripts/ra-candidate-promotion.js [--dry-run]
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.

const path = require("path");
const {
  findConservativeDuplicate,
  deriveCategory,
  LISTING_METADATA_FIELDS,
} = require(path.join(__dirname, "ra-sync"));
const { lookupExistingRows } = require(path.join(__dirname, "..", "api", "_lib", "status-lookup"));
const { SLUGS } = require(path.join(__dirname, "..", "api", "_lib", "source-slugs"));
const { buildRaDiscoveryNote } = require(path.join(__dirname, "..", "api", "_lib", "ra-provenance-note"));

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

// How many of the most recent Resident Advisor source_runs rows to
// consider when looking for one with usable session_data. Defensive only
// -- see getLatestRaSession's own comment for why more than 1 is ever
// needed.
const SESSION_LOOKBACK = 5;

// RA_CANDIDATE_PROMOTION_MAX_PER_RUN (2026-10-01, V1 experiment cap --
// Product Owner decision). Caps how many genuinely-new, deduped-clean RA
// candidates may actually become pending_review rows in ONE promotion
// run. Deliberately separate from, and applied strictly AFTER, both the
// existing-RA-row check and findConservativeDuplicate -- this cap never
// changes who counts as a duplicate or who lacks identity data, it only
// ever limits how many of the genuinely-eligible candidates get written
// this run. Selection is deterministic (allNewIds' own order -- RA's own
// listing order, soonest-event-first, per scripts/ra-sync.js's own
// header note on why no separate backlog-priority mechanism was ever
// needed) -- never random, and stable run to run for the same backlog.
// A candidate beyond the cap is NOT touched in any way (not marked
// duplicate, not marked resolved, no row of any kind) -- it is simply
// still in tomorrow's allNewIds, exactly as if this run had never seen
// it, because nothing here ever writes anything for it.
const DEFAULT_MAX_PER_RUN = Number(process.env.RA_CANDIDATE_PROMOTION_MAX_PER_RUN) || 10;

// getLatestRaSession(SUPABASE_URL, KEY, fetchFn) -> { id, allNewIds, listingMetadata } | null
//
// The most recent Resident Advisor source_runs row (by started_at desc,
// regardless of outcome -- session_data.allNewIds/listingMetadata are
// written at START time by startRaSyncSession, before completeRaSyncSession
// ever runs, so even a "started"/never-completed/blocked-before-detail-
// fetch row still carries a fully usable, already-recomputed-against-
// production diff; see ra-sync/README.md's 2026-09-29 repair note). Looks
// back up to SESSION_LOOKBACK rows purely as a defensive guard against the
// narrow window where a row was inserted by startRun() but its
// session_data PATCH never landed (a crash between the two calls) --
// never expected in practice, but a row like that should be skipped, not
// treated as "no backlog."
async function getLatestRaSession(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, fetchFn = fetch) {
  const url =
    `${SUPABASE_URL}/rest/v1/source_runs?source_slug=eq.${SLUGS.residentAdvisor}` +
    `&select=id,started_at,outcome,session_data&order=started_at.desc&limit=${SESSION_LOOKBACK}`;
  const resp = await fetchFn(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!resp.ok) return null;
  let rows;
  try {
    rows = await resp.json();
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;

  for (const row of rows) {
    const sd = row && row.session_data;
    if (sd && Array.isArray(sd.allNewIds)) {
      return {
        id: row.id,
        allNewIds: sd.allNewIds,
        listingMetadata: sd.listingMetadata && typeof sd.listingMetadata === "object" ? sd.listingMetadata : {},
      };
    }
  }
  return null;
}

// insertCandidateRow -- a plain POST upsert on external_id, same
// Prefer:resolution=merge-duplicates convention as completeRaSyncSession's
// own write path. Safe to call twice for the same id (e.g. this script
// runs again before a prior run's row shows up in the existingRows lookup
// for any reason) -- it will just no-op-merge onto itself, never duplicate
// (the unique index on external_id is the hard backstop either way).
async function insertCandidateRow(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, row, fetchFn = fetch) {
  try {
    const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([row]),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// promoteRaCandidates(opts) -> counts (see below)
//
// Every I/O dependency is injectable (this project's established
// testability convention), real implementations wired as defaults.
async function promoteRaCandidates({
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  dryRun = false,
  fetchFn = fetch,
  getLatestRaSessionFn = getLatestRaSession,
  lookupExistingRowsFn = lookupExistingRows,
  findConservativeDuplicateFn = findConservativeDuplicate,
  deriveCategoryFn = deriveCategory,
  insertCandidateRowFn = insertCandidateRow,
  maxPerRun = DEFAULT_MAX_PER_RUN,
} = {}) {
  // SAFETY GATE (2026-10-01): Product Owner decision 1/2 is explicit --
  // pending_review auto-creation is approved for THIS MVP, but must not
  // go live in production before she has reviewed a real dry-run report
  // against today's actual backlog. cron-enrichment.js's Step 0 calls
  // this function unconditionally, once daily, already deployed as of
  // this commit -- without this gate, tomorrow's scheduled run would
  // silently start writing real rows the moment it next fires, which is
  // exactly what she asked NOT to happen yet. RA_CANDIDATE_PROMOTION_ENABLED
  // must be explicitly set to the string "true" (a real env var Jody
  // adds herself, in Vercel's own project settings -- never invented or
  // defaulted on here) before any write is ever attempted, from EITHER
  // caller (the daily cron Step 0, or the on-demand promote_candidates
  // bridge action) -- an explicit dryRun:false in a request body is NOT
  // enough to bypass this; the flag is the single source of truth and
  // forces dryRun regardless of what was asked. Remove only once Jody
  // has reviewed the dry-run report and explicitly turned this on.
  const liveWritesEnabled = process.env.RA_CANDIDATE_PROMOTION_ENABLED === "true";
  const effectiveDryRun = dryRun || !liveWritesEnabled;

  const counts = {
    configured: true,
    liveWritesEnabled,
    sessionFound: false,
    runId: null,
    examined: 0,
    alreadyPresent: 0,
    insufficientIdentity: 0,
    insufficientIdentityIds: [],
    duplicates: 0,
    duplicateDetail: [],
    // "promotable" keeps its existing meaning: every candidate that
    // passed BOTH the already-present check and conservative dedupe --
    // i.e. everyone who is genuinely eligible, before the per-run cap is
    // ever applied. promoted + deferredByCap always equals promotable.
    promotable: 0,
    promoted: 0,
    deferredByCap: 0,
    deferredByCapIds: [],
    maxPerRun,
    written: 0,
    writtenIds: [],
    dryRun: effectiveDryRun,
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    counts.configured = false;
    return counts;
  }

  const session = await getLatestRaSessionFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, fetchFn);
  if (!session) return counts;
  counts.sessionFound = true;
  counts.runId = session.id;

  const allNewIds = Array.isArray(session.allNewIds) ? session.allNewIds.filter((id) => typeof id === "string") : [];
  const listingMetadata = session.listingMetadata || {};
  counts.examined = allNewIds.length;
  if (!allNewIds.length) return counts;

  const existingRows = await lookupExistingRowsFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, allNewIds, {
    select: "external_id",
  });

  for (const id of allNewIds) {
    if (existingRows.has(id)) {
      counts.alreadyPresent++;
      continue;
    }

    const meta = (listingMetadata && listingMetadata[id]) || {};
    const title = typeof meta.title === "string" ? meta.title.trim() : "";
    const dateStr = typeof meta.date === "string" ? meta.date.trim() : "";
    const startDate = ISO_DATE_RE.test(dateStr) ? dateStr.slice(0, 10) : "";

    if (!title || !startDate) {
      counts.insufficientIdentity++;
      counts.insufficientIdentityIds.push(id);
      continue;
    }

    const presentFields = LISTING_METADATA_FIELDS.filter(
      (f) => typeof meta[f] === "string" && meta[f].trim().length > 0
    );
    const venueNameRaw = typeof meta.venueName === "string" && meta.venueName.trim() ? meta.venueName.trim() : null;

    const draftRow = {
      external_id: id,
      title,
      category: deriveCategoryFn(title, ""),
      venue_name_raw: venueNameRaw,
      start_date: startDate,
    };

    const dupe = await findConservativeDuplicateFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, draftRow, fetchFn);
    if (dupe) {
      counts.duplicates++;
      counts.duplicateDetail.push({
        id,
        matchedEventId: dupe.id,
        matchedTitle: dupe.title,
        matchedExternalId: dupe.external_id || null,
      });
      continue;
    }

    counts.promotable++;

    // Per-run cap -- checked strictly AFTER existing-RA detection (the
    // alreadyPresent check above) and conservative cross-source dedupe
    // (the findConservativeDuplicate check above). A candidate deferred
    // here is counted and named (deferredByCapIds) but otherwise
    // completely untouched -- no row, no other write, no state change of
    // any kind -- so it is exactly as eligible on a later run as it is
    // right now. This check runs identically in dry-run mode (it's a
    // SELECTION decision, not a write decision), so a dry run reports
    // the same promoted/deferredByCap split a real run would produce.
    if (counts.promoted >= maxPerRun) {
      counts.deferredByCap++;
      counts.deferredByCapIds.push(id);
      continue;
    }
    counts.promoted++;

    const note = buildRaDiscoveryNote({ raId: id, raUrl: meta.url || null, presentFields });
    const row = {
      ...draftRow,
      status: "pending_review", // decision 2: never 'approved' here, ever.
      source: "Resident Advisor",
      note,
    };

    if (!effectiveDryRun) {
      const ok = await insertCandidateRowFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, row, fetchFn);
      if (ok) {
        counts.written++;
        counts.writtenIds.push(id);
      }
    }
  }

  return counts;
}

module.exports = {
  promoteRaCandidates,
  getLatestRaSession,
  insertCandidateRow,
  SESSION_LOOKBACK,
  DEFAULT_MAX_PER_RUN,
};

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  promoteRaCandidates({ dryRun })
    .then((counts) => {
      console.log(JSON.stringify(counts, null, 2));
    })
    .catch((err) => {
      console.error("ra-candidate-promotion failed:", err);
      process.exitCode = 1;
    });
}
