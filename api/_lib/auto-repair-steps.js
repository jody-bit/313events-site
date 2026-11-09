// Auto-Repair button: step definitions, time budget and response assembly
// (#256). The route in api/admin-events.js stays a thin caller; keeping this
// here makes the budget, ordering and response shape testable offline.
//
// Budget: Vercel kills the function at 300 s (admin-events has no
// maxDuration override). The run budget is 270 s, leaving 30 s headroom for
// the response. Cheap, bounded steps run first; the VisitDetroit dead-link
// step (one live fetch per candidate; the observed hang) runs last with
// whatever budget remains, so it can no longer starve the other steps.

const { runSteps, STATUS } = require("./step-runner");

const AUTO_REPAIR_BUDGET_MS = 270000;

const AUTO_REPAIR_TIMEOUTS = Object.freeze({
  venue: 45000,
  outerLimitsDescription: 30000,
  dossinMetadata: 30000,
  redfordMetadata: 30000,
  genericEnrichment: 90000,
  venueRawReparse: 30000,
  nonEventRetirement: 30000,
  duplicateConsolidation: 30000,
  visitDetroitDeadLinks: 220000, // also capped by the remaining overall budget
});
const VISITDETROIT_REQUEST_TIMEOUT_MS = 8000; // per live link check
const VISITDETROIT_MIN_START_MS = 20000; // Step 6 is skipped (not half-run) with less budget than this left
const VISITDETROIT_SOFT_STOP_GRACE_MS = 10000; // Step 6 stops starting checks this long before its hard timeout

// key -> [response field, response error field]
const FIELD_NAMES = {
  venue: ["venue", "venueError"],
  outerLimitsDescription: ["outerLimitsDescription", "outerLimitsDescriptionError"],
  dossinMetadata: ["dossinMetadata", "dossinMetadataError"],
  redfordMetadata: ["redfordMetadata", "redfordMetadataError"],
  genericEnrichment: ["genericEnrichment", "genericEnrichmentError"],
  visitDetroitDeadLinks: ["visitDetroitDeadLinks", "visitDetroitLinkError"],
  venueRawReparse: ["venueRawReparse", "venueRawReparseError"],
  nonEventRetirement: ["nonEventRetirement", "nonEventRetirementError"],
  duplicateConsolidation: ["duplicateConsolidation", "duplicateConsolidationError"],
};

function defaultLoaders() {
  return {
    venue: () => require("../../scripts/sh1-repair-existing-venue-address-city").repairExistingEvents,
    outerLimitsDescription: () => require("../../scripts/outerlimits-description-repair").repairOuterLimitsDescriptions,
    dossinMetadata: () => require("../../scripts/dossin-metadata-repair").repairDossinMetadata,
    redfordMetadata: () => require("../../scripts/redford-metadata-repair").repairRedfordMetadata,
    genericEnrichment: () => require("../../scripts/generic-metadata-enrichment").repairGenericMetadata,
    venueRawReparse: () => require("../../scripts/venue-raw-reparse-repair").repairVenueRawReparse,
    nonEventRetirement: () => require("../../scripts/retire-non-events").retireNonEvents,
    duplicateConsolidation: () => require("../../scripts/duplicate-consolidation").consolidateDuplicates,
    visitDetroitDeadLinks: () => require("../../scripts/visitdetroit-dead-link-repair").repairVisitDetroitDeadLinks,
  };
}

function buildAutoRepairSteps({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, loaders = defaultLoaders(), timeouts = AUTO_REPAIR_TIMEOUTS, requestTimeoutMs = VISITDETROIT_REQUEST_TIMEOUT_MS, softStopGraceMs = VISITDETROIT_SOFT_STOP_GRACE_MS, minStartMs = VISITDETROIT_MIN_START_MS }) {
  const creds = { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };
  const mk = (key, label, extra = {}) => ({
    key,
    label,
    timeoutMs: timeouts[key],
    run: ({ shouldStop }) => loaders[key]()({ ...creds, ...(extra.passStop ? { shouldStop } : {}) }),
    ...(extra.requestTimeoutMs ? { requestTimeoutMs: extra.requestTimeoutMs } : {}),
    ...(extra.softStopGraceMs !== undefined ? { softStopGraceMs: extra.softStopGraceMs } : {}),
    ...(extra.minRemainingMs !== undefined ? { minRemainingMs: extra.minRemainingMs } : {}),
  });
  return [
    mk("venue", "Venue address/city repair"),
    mk("outerLimitsDescription", "Outer Limits descriptions"),
    mk("dossinMetadata", "Dossin metadata"),
    mk("redfordMetadata", "Redford metadata"),
    mk("genericEnrichment", "Generic enrichment"),
    mk("venueRawReparse", "Venue raw re-parse"),
    mk("nonEventRetirement", "Non-event retirement"),
    mk("duplicateConsolidation", "Duplicate consolidation"),
    mk("visitDetroitDeadLinks", "VisitDetroit dead-link repair", {
      passStop: true,
      requestTimeoutMs,
      softStopGraceMs,
      minRemainingMs: minStartMs,
    }),
  ];
}

async function runAutoRepair({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, loaders, timeouts, requestTimeoutMs, softStopGraceMs, minStartMs, budgetMs = AUTO_REPAIR_BUDGET_MS, now, minRemainingMs }) {
  const steps = buildAutoRepairSteps({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, loaders, timeouts, requestTimeoutMs, softStopGraceMs, minStartMs });
  const run = await runSteps(steps, { budgetMs, now, minRemainingMs });
  return assembleResponse(run);
}

// Keeps every field the Admin UI already reads (written, fieldsWritten,
// venue*, per-step objects and *Error strings) and adds steps/elapsedMs/
// budgetMs/complete/partial. A step that did not complete reports its reason
// in its *Error field, so partial work is never shown as a clean success.
function assembleResponse(run) {
  const by = Object.fromEntries(run.results.map((r) => [r.key, r]));
  const val = (k) => (by[k] && by[k].status === STATUS.COMPLETED ? by[k].value : null);
  const err = (k) => {
    const r = by[k];
    if (!r || r.status === STATUS.COMPLETED) return null;
    return r.status === STATUS.TIMED_OUT ? `Timed out: ${r.error}` : r.error;
  };
  const venueCounts = val("venue");
  const ids = (k) => (val(k) && val(k).writtenIds) || [];
  const combined = new Set([
    ...ids("venue"), ...ids("outerLimitsDescription"), ...ids("dossinMetadata"), ...ids("redfordMetadata"),
    ...ids("genericEnrichment"), ...ids("visitDetroitDeadLinks"), ...ids("venueRawReparse"), ...ids("duplicateConsolidation"),
  ]);
  const n = (k, f) => (val(k) && val(k)[f]) || 0;
  const fieldsWritten =
    n("venue", "fieldsWritten") + n("outerLimitsDescription", "written") + n("dossinMetadata", "written") +
    n("redfordMetadata", "fieldsWritten") + n("genericEnrichment", "fieldsWritten") +
    n("visitDetroitDeadLinks", "fieldsWritten") + n("venueRawReparse", "written");
  const vd = val("visitDetroitDeadLinks");
  const stepsOut = run.results.map(({ key, label, status, startedAt, ms, error, partial, writesSent, writesInFlight }) => ({ key, label, status, startedAt, ms, error, partial: !!partial, writesSent: writesSent || 0, writesInFlight: writesInFlight || 0 }));
  const response = {
    ok: true,
    ...(venueCounts || {}),
    written: combined.size,
    fieldsWritten,
    complete: run.complete && !(vd && vd.stoppedEarly),
    partial: run.partial || !!(vd && vd.stoppedEarly),
    elapsedMs: run.elapsedMs,
    budgetMs: run.budgetMs,
    steps: stepsOut,
  };
  for (const [key, [field, errField]] of Object.entries(FIELD_NAMES)) {
    response[field] = val(key);
    response[errField] = err(key);
  }
  if (vd && vd.stoppedEarly) {
    response.visitDetroitLinkError = response.visitDetroitLinkError || `Stopped at time budget: ${vd.deferred} link(s) deferred to the next run`;
  }
  return response;
}

module.exports = {
  AUTO_REPAIR_BUDGET_MS, AUTO_REPAIR_TIMEOUTS, VISITDETROIT_REQUEST_TIMEOUT_MS, VISITDETROIT_SOFT_STOP_GRACE_MS,
  buildAutoRepairSteps, runAutoRepair, assembleResponse,
};
