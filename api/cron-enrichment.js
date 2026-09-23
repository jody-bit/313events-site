const crypto = require("crypto");

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

  const venueWrittenIds = venueCounts.writtenIds || [];
  const descriptionWrittenIds = (descriptionCounts && descriptionCounts.writtenIds) || [];
  const dossinWrittenIds = (dossinCounts && dossinCounts.writtenIds) || [];
  const redfordWrittenIds = (redfordCounts && redfordCounts.writtenIds) || [];
  const genericWrittenIds = (genericCounts && genericCounts.writtenIds) || [];
  const combinedWrittenIds = new Set([...venueWrittenIds, ...descriptionWrittenIds, ...dossinWrittenIds, ...redfordWrittenIds, ...genericWrittenIds]);

  res.status(200).json({
    ok: true,
    written: combinedWrittenIds.size,
    venue: venueCounts,
    outerLimitsDescription: descriptionCounts,
    outerLimitsDescriptionError,
    dossinMetadata: dossinCounts,
    dossinMetadataError,
    redfordMetadata: redfordCounts,
    redfordMetadataError,
    genericEnrichment: genericCounts,
    genericEnrichmentError,
  });
};
