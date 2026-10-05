const crypto = require("crypto");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");

// Vercel Cron job — 2026-09-23, "Automatic, not button-dependent" (Admin
// stabilization follow-up). Before this, the enrichment sequence sitting
// behind admin.html's Needs Follow-up "Auto-Repair" button (SH.1 venue
// repair, Outer Limits/Dossin/Redford authoritative recovery, and the new
// generic enrichment — description generation, reverse address->venue
// resolution, venue-digital-home link recovery) only ever ran when Jody
// pressed it by hand. The Product Owner's explicit instruction: "the
// end-state should not require Jody to continually press Auto-Repair...
// normal new events should flow through enrichment without human
// initiation... Do not redesign the ingestion architecture."
//
// This is the smallest way to do that: a new, separate, additive cron that
// calls the exact same five scripts api/admin-events.js's "auto_repair_
// venue" action already calls, in the same order, with the same
// failure-isolation between steps. It touches none of the 22 existing
// ingestion connectors and adds no new repair DECISION logic of its own —
// same "duplicated glue rather than a shared abstraction" convention this
// project already uses between, e.g., isSafeHttpUrl in api/admin-events.js
// and api/submit.js (see admin-events.js's own comment on that). Auto-
// Repair stays exactly as it was: a recovery tool, a retry mechanism, and
// an administrative control a moderator can still run on demand — this
// cron does not replace it, it just means Jody no longer has to remember to
// press it for routine, newly-ingested incompleteness to get a chance at
// automatic resolution.
//
// SCHEDULE: once daily, at a time slot not already used by another cron in
// vercel.json (see that file's own comment). Every source's own ingestion
// cron already runs once daily; running this once daily too means newly-
// ingested incompleteness gets its enrichment pass within at most one full
// day, matching this project's existing cadence rather than inventing a
// tighter one with no evidence it's needed (Product Owner: "prefer the
// smallest implementation... must not become another multi-day project").
//
// AUTH: same CRON_SECRET pattern as every other cron in this project —
// fails closed only when CRON_SECRET is actually configured (matching
// every cron here, and exactly what cron-healthcheck.js's own auth-probe
// checks are designed to catch if this ever regresses).
//
// TELEMETRY (2026-10-01, EPIC-006 SH.5 closure — Product Owner decision):
// this cron previously wrote no source_runs row at all, which meant no
// database query -- not even one run with the service-role key -- could
// confirm whether Vercel had ever actually fired it on its own schedule,
// as opposed to its six repair steps only ever having run via Jody's
// Admin Auto-Repair button (api/admin-events.js's "auto_repair_venue"
// action, which calls an overlapping-but-not-identical set of the same
// scripts). Fixed the same way every ingestion connector already does it:
// api/_lib/run-log.js's startRun()/finishRun() against the existing,
// already-provisioned source_runs table (migration_035). Deliberately
// narrow, per explicit Product Owner instruction: this proves whether
// cron-enrichment ran, its outcome, and repair counts -- nothing more. No
// new telemetry table, no new fields on source_runs, no change to any of
// the six repair steps' own logic or failure-isolation. The one structural
// addition this requires is a top-level try/catch around the full step
// sequence below: previously an unhandled throw from the one step that
// wasn't itself wrapped (repairExistingEvents, the SH.1 repair) would
// crash the handler with nothing recorded anywhere -- now it is caught,
// logged to source_runs as outcome='failed' with a sanitized error_sample,
// and still returns a normal (200, ok:false) response, matching this
// project's existing "a cron failure is not a 500 that pages someone"
// convention (see e.g. cron-healthcheck.js).
//
// SOURCE_SLUGS SCOPE NOTE: api/_lib/source-slugs.js's own header documents
// WP 0.5 telemetry as deliberately scoped to event-ingestion connectors,
// explicitly naming cron-editorial.js/cron-healthcheck.js/cron-post-to-
// facebook.js as out of scope ("not ingestion sources"). cron-enrichment.js
// is the same non-ingestion category as those three. The Product Owner's
// 2026-10-01 SH.5 closure decision explicitly extends source_runs'
// lightweight run-tracking to this one additional, named cron -- not a
// general reopening of that scope boundary to every scheduled job. See the
// "enrichment" entry in source-slugs.js for the matching note.
//
// VERIFICATION: per explicit instruction, this was verified by invoking
// the deployed endpoint directly and confirming it produces the expected
// source_runs row (an endpoint/run-log correctness check) -- not by
// waiting for a future scheduled Vercel invocation, which is a distinct
// claim this check does not make. See EPIC-006-metadata-self-healing.md's
// SH.5 note for that verification's result.

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

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured — nothing to do." });
    return;
  }

  const runHandle = await startRun(SLUGS.enrichment);

  try {
    // Step 0 (2026-10-01, RA candidate-recovery MVP -- Product Owner
    // decision 6: "Reuse the existing generic enrichment/self-healing
    // pipeline. Do not create a separate RA enrichment architecture.
    // Implement the proposed RA candidate-promotion Step 0 in cron-
    // enrichment."). Promotes any still-unresolved Resident Advisor
    // backlog id (source_runs.session_data.allNewIds/listingMetadata --
    // durable even through a DataDome-blocked detail-fetch run, see
    // scripts/ra-sync.js's own header) into a minimal, safe
    // status='pending_review' events row, using ONLY RA's own listing-
    // card evidence -- never a guessed venue/time/ticket link, never
    // 'approved' (that status transition is explicitly manual-only for
    // this MVP). Once such a row exists, the five existing steps below
    // run against it completely unmodified, the same day. Isolated in its
    // own try/catch, same convention as every other step here -- a
    // promotion failure must never block the other five.
    let raCandidateCounts = null;
    let raCandidatePromotionError = null;
    try {
      const { promoteRaCandidates } = require("../scripts/ra-candidate-promotion");
      raCandidateCounts = await promoteRaCandidates({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
    } catch (raErr) {
      raCandidatePromotionError = raErr.message;
    }

    // Same five steps, same order, same failure isolation as api/admin-
    // events.js's "auto_repair_venue" action — see that file's own header
    // comment for the full reasoning behind each step. Duplicated here
    // deliberately (see this file's own header) rather than factored into a
    // shared module.
    const { repairExistingEvents } = require("../scripts/sh1-repair-existing-venue-address-city");
    const venueCounts = await repairExistingEvents({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });

    let descriptionCounts = null;
    let outerLimitsDescriptionError = null;
    try {
      const { repairOuterLimitsDescriptions } = require("../scripts/outerlimits-description-repair");
      descriptionCounts = await repairOuterLimitsDescriptions({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
    } catch (descErr) {
      outerLimitsDescriptionError = descErr.message;
    }

    let dossinCounts = null;
    let dossinMetadataError = null;
    try {
      const { repairDossinMetadata } = require("../scripts/dossin-metadata-repair");
      dossinCounts = await repairDossinMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
    } catch (dossinErr) {
      dossinMetadataError = dossinErr.message;
    }

    let redfordCounts = null;
    let redfordMetadataError = null;
    try {
      const { repairRedfordMetadata } = require("../scripts/redford-metadata-repair");
      redfordCounts = await repairRedfordMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
    } catch (redfordErr) {
      redfordMetadataError = redfordErr.message;
    }

    let genericCounts = null;
    let genericEnrichmentError = null;
    try {
      const { repairGenericMetadata } = require("../scripts/generic-metadata-enrichment");
      genericCounts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
    } catch (genericErr) {
      genericEnrichmentError = genericErr.message;
    }

    // 2026-09-30 ("self-healing/enrichment pivot" root-cause fix -- see
    // NEEDS_FOLLOWUP_ROOT_CAUSE.md and scripts/venue-raw-reparse-repair.js's
    // own header): same generalized re-parse step api/admin-events.js's
    // "auto_repair_venue" action now also runs (its Step 7) -- re-runs the
    // now-fixed api/_lib/ics-location.js parser against any event whose
    // venue_name_raw is still holding an un-split raw location string from
    // before the grammar fix landed. Same failure isolation as every other
    // step above.
    let venueRawReparseCounts = null;
    let venueRawReparseError = null;
    try {
      const { repairVenueRawReparse } = require("../scripts/venue-raw-reparse-repair");
      venueRawReparseCounts = await repairVenueRawReparse({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
    } catch (reparseErr) {
      venueRawReparseError = reparseErr.message;
    }

    // 2026-10-05 (Sunday operations hardening): one real-world event, one
    // canonical row. Deterministic duplicates (same feed twice, CivicPlus
    // sibling feeds, two sources at one venue) are consolidated; anything
    // less certain is left for Admin > Duplicates. See
    // scripts/duplicate-consolidation.js. Same failure isolation as above.
    let duplicateCounts = null;
    let duplicateConsolidationError = null;
    try {
      const { consolidateDuplicates } = require("../scripts/duplicate-consolidation");
      duplicateCounts = await consolidateDuplicates({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
    } catch (dupErr) {
      duplicateConsolidationError = dupErr.message;
    }

    const raCandidateWrittenIds = (raCandidateCounts && raCandidateCounts.writtenIds) || [];
    const duplicateWrittenIds = (duplicateCounts && duplicateCounts.writtenIds) || [];
    const venueWrittenIds = venueCounts.writtenIds || [];
    const descriptionWrittenIds = (descriptionCounts && descriptionCounts.writtenIds) || [];
    const dossinWrittenIds = (dossinCounts && dossinCounts.writtenIds) || [];
    const redfordWrittenIds = (redfordCounts && redfordCounts.writtenIds) || [];
    const genericWrittenIds = (genericCounts && genericCounts.writtenIds) || [];
    const venueRawReparseWrittenIds = (venueRawReparseCounts && venueRawReparseCounts.writtenIds) || [];
    const combinedWrittenIds = new Set([...raCandidateWrittenIds, ...venueWrittenIds, ...descriptionWrittenIds, ...dossinWrittenIds, ...redfordWrittenIds, ...genericWrittenIds, ...venueRawReparseWrittenIds, ...duplicateWrittenIds]);

    // Step-level failures stay isolated (unchanged) -- but a run where any
    // step errored is not a clean 'success' for telemetry purposes either.
    // 'partial' mirrors the outcome vocabulary every ingestion connector
    // already uses for "ran, wrote some things, but not everything went
    // cleanly" (migration_035's own outcome check constraint).
    const stepErrors = [raCandidatePromotionError, outerLimitsDescriptionError, dossinMetadataError, redfordMetadataError, genericEnrichmentError, venueRawReparseError, duplicateConsolidationError].filter(Boolean);
    await finishRun(runHandle, {
      outcome: stepErrors.length ? "partial" : "success",
      records_written: combinedWrittenIds.size,
      error_sample: stepErrors.length ? stepErrors.join(" | ") : undefined,
    });

    res.status(200).json({
      ok: true,
      written: combinedWrittenIds.size,
      raCandidatePromotion: raCandidateCounts,
      raCandidatePromotionError,
      venue: venueCounts,
      outerLimitsDescription: descriptionCounts,
      outerLimitsDescriptionError,
      dossinMetadata: dossinCounts,
      dossinMetadataError,
      redfordMetadata: redfordCounts,
      redfordMetadataError,
      genericEnrichment: genericCounts,
      genericEnrichmentError,
      venueRawReparse: venueRawReparseCounts,
      venueRawReparseError,
      duplicateConsolidation: duplicateCounts,
      duplicateConsolidationError,
    });
  } catch (err) {
    // Previously unreachable safety net -- see this file's header TELEMETRY
    // note. Only a hard failure in the one step that wasn't already
    // individually try/caught (repairExistingEvents) or a genuinely
    // unexpected error reaches here; every named repair step's own failure
    // is still isolated above exactly as before.
    await finishRun(runHandle, { outcome: "failed", error_sample: err && err.message ? err.message : String(err) });
    res.status(200).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
};
