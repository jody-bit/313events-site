// scripts/outerlimits-description-repair.js
//
// Authoritative Outer Limits Lounge description repair (2026-09-22) --
// Needs Follow-up burn-down, source-specific step. Outer Limits is the
// single largest remaining Needs Follow-up bucket (17 of 33 current cards,
// DESCRIPTION-only) and its Squarespace source already carries genuine,
// event-specific "Post Body" write-ups for most of its listings -- see
// api/cron-outerlimitslounge.js's own header comment (~30 of 53 upcoming
// listings have real Post Body content; the rest, dominated by the
// recurring "Karaoke with Polish John!" night, genuinely have none, which
// is why this deliberately leaves those blank rather than inventing
// anything).
//
// Reuses api/cron-outerlimitslounge.js's OWN fetch/parse/identity logic
// (FEED_URL, the oll-<item.id> external_id scheme, stripHtml()/
// decodeEntities() for the Post Body text) via that file's exported
// fetchDescriptionsByExternalId() -- there is exactly ONE parser for this
// source in the whole repo; this file adds none of its own and does not
// re-implement any HTML/entity parsing.
//
// SCOPE: existing events already in the database (start_date >= today,
// status != 'rejected', source = "Outer Limits Lounge", description
// currently blank) whose Squarespace source item currently has a genuine
// nonblank Post Body/excerpt. Never touches any other source. Never
// generates, infers, or synthesizes text. Never uses the event title as a
// description. Never invents copy for a source item that itself has none
// (recurring Karaoke etc. stay blank, exactly as authoritative). Never
// overwrites an existing nonblank description, whether moderator-entered
// or from a prior successful repair/scrape. Never touches status or any
// other column.
//
// SAFETY AT WRITE TIME: same race-safe pattern as SH.1's own repair script
// (scripts/sh1-repair-existing-venue-address-city.js) -- every PATCH
// re-asserts description.is.null in its own WHERE filter, so a concurrent
// write (a moderator typing a description in at the same moment this runs)
// can never be clobbered; PostgREST returning zero rows for that PATCH is
// counted as skipped, never treated as an error or a silent overwrite.
//
// Deliberately NOT a cron: same reasoning as SH.1's own script -- a
// manually/Auto-Repair-invoked one-shot pass, not scheduled, not in
// vercel.json, no source_runs telemetry of its own.
//
// Usage:
//   node scripts/outerlimits-description-repair.js            (writes repairs)
//   node scripts/outerlimits-description-repair.js --dry-run  (reports only, writes nothing)

const path = require("path");
const {
  fetchDescriptionsByExternalId,
  SOURCE_NAME,
} = require(path.join(__dirname, "..", "api", "cron-outerlimitslounge"));

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=neq.rejected` +
    `&source=eq.${encodeURIComponent(SOURCE_NAME)}` +
    `&description=is.null` +
    `&select=id,external_id,description,start_date,status` +
    `&limit=1000`;
  const resp = await fetch(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch Outer Limits description repair candidates: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching Outer Limits description repair candidates");
  return rows;
}

// PATCHes ONLY the description column, with a WHERE filter that
// re-requires description to still be null right now. Returns true if the
// write actually applied, false if a concurrent change made the filter no
// longer match (e.g. a moderator saved a description between the fetch
// above and this write).
async function applyPatch(SUPABASE_URL, sbHeaders, eventId, description) {
  const url = `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&description=is.null`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ description }),
  });
  if (!resp.ok) throw new Error(`PATCH failed for event ${eventId}: HTTP ${resp.status}`);
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

// The testable core. `fetchCandidates`/`applyPatchFn`/`fetchDescriptions`
// are injectable so tests can supply mocked Supabase/Squarespace layers,
// same convention as SH.1's own repairExistingEvents().
async function repairOuterLimitsDescriptions({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchRepairCandidates,
  fetchDescriptions = fetchDescriptionsByExternalId,
  applyPatchFn = applyPatch,
} = {}) {
  const counts = {
    totalConsidered: 0,
    // "matched" = the source item exists AND has a genuine nonblank Post
    // Body/excerpt -- i.e. an actual repair candidate. A blank-source match
    // is counted separately (matchedButSourceBlank), never folded into this
    // number, so `matched` always means "authoritative text was available."
    matched: 0,
    matchedButSourceBlank: 0,
    unmatched: 0,
    written: 0,
    skippedConcurrentChange: 0,
    writtenIds: [],
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  const [candidates, descriptionsByExternalId] = await Promise.all([
    fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders),
    fetchDescriptions(),
  ]);
  counts.totalConsidered = candidates.length;

  for (const event of candidates) {
    // Defensive re-check: fetchCandidates() already filters
    // description=is.null at the query level, but never trust that alone
    // -- an event with any nonblank description reaching here (stale
    // candidate list, a query-shape change elsewhere) must still never be
    // touched.
    if (event.description && event.description.trim()) continue;

    if (!descriptionsByExternalId.has(event.external_id)) {
      counts.unmatched++;
      continue;
    }
    const description = descriptionsByExternalId.get(event.external_id);
    if (!description || !description.trim()) {
      // The source itself has no Post Body/excerpt for this item (e.g. a
      // recurring Karaoke instance) -- authoritative absence, never
      // fabricated, left blank exactly as the source has it.
      counts.matchedButSourceBlank++;
      continue;
    }
    counts.matched++;

    if (dryRun) {
      logger.log(`[dry-run] would set description for event ${event.id} (external_id ${event.external_id})`);
      continue;
    }
    const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, description);
    if (applied) {
      counts.written++;
      counts.writtenIds.push(event.id);
    } else {
      counts.skippedConcurrentChange++;
      logger.warn(`Skipped event ${event.id} — description was no longer null at write time (concurrent change).`);
    }
  }

  return counts;
}

module.exports = { repairOuterLimitsDescriptions, fetchRepairCandidates, applyPatch };

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  repairOuterLimitsDescriptions({ dryRun })
    .then((counts) => {
      console.log(`\nOuter Limits Lounge description repair ${dryRun ? "(dry run) " : ""}summary:`);
      console.log(counts);
    })
    .catch((err) => {
      console.error("Outer Limits description repair failed:", err);
      process.exitCode = 1;
    });
}
