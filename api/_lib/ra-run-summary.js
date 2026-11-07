// api/_lib/ra-run-summary.js -- pure builder for the Resident Advisor run
// summary (RA telemetry/summary accuracy draft, 2026-11-06). No I/O.
//
// Separates four counts that were previously conflated into "N new events":
//   1. listing candidates  -- ids RA's listing showed that we do not know
//   2. detail fetch        -- device attempted / was blocked / succeeded
//   3. listing promotions  -- pending_review rows from listing evidence
//                             (HIDDEN from the public site), cap-deferred ids
//   4. public publications -- approved rows only (detail-page imports)
// `text` is a plain-language string the scheduled task may relay verbatim.
"use strict";

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (Number.isFinite(v) ? v : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function buildRaRunSummary({ sessionData, complete, promotion, detail } = {}) {
  const sd = sessionData || {};
  const c = complete || {};
  const newIds = arr(sd.newIds);
  const importedIds = arr(c.importedIds);
  const imported = Number.isFinite(c.imported) ? c.imported : importedIds.length;

  const d = detail || sd.detailReport || {};
  const detailAttempted = Number.isFinite(d.attempted) ? d.attempted : null;
  const blockedIds = arr(d.blockedIds);
  // Unreported stays null (unknown), never 0.
  const blocked = Number.isFinite(d.blocked) ? d.blocked : blockedIds.length ? blockedIds.length : null;
  const detailReported = detailAttempted !== null || blocked !== null;

  const p = promotion && !promotion.error ? promotion : null;
  const writtenIds = p ? arr(p.writtenIds) : [];
  const deferredIds = p ? arr(p.deferredByCapIds) : [];
  const dryRun = !!(p && p.dryRun);
  // dry runs / disabled promotion create nothing, whatever `written` says.
  const created = p && !dryRun ? num(p.written) : 0;
  const createdIds = p && !dryRun ? writtenIds : [];

  const perCandidate = newIds.map((id) => {
    let status = "never_attempted";
    if (importedIds.includes(id)) status = "imported_public";
    else if (createdIds.includes(id)) status = "promoted_pending_review";
    else if (deferredIds.includes(id)) status = "deferred_by_cap";
    else if (blockedIds.includes(id)) status = "blocked";
    return {
      id,
      status,
      detailBlocked: blockedIds.includes(id),
    };
  });

  const counts = {
    listing: {
      candidates: num(sd.candidateCount),
      known: num(sd.knownCount),
      new: newIds.length || num(sd.allNewCount),
    },
    detail: {
      attempted: detailAttempted, // null = device did not report
      blocked,
      succeeded: imported,
      submitted: num(c.submitted),
    },
    promotion: {
      examined: p ? num(p.examined) : 0,
      pendingReview: created,
      pendingReviewIds: createdIds,
      deferredByCap: deferredIds.length,
      deferredByCapIds: deferredIds,
      dryRun,
      error: promotion && promotion.error ? promotion.error : null,
    },
    publications: { public: imported, publicIds: importedIds },
  };

  const parts = [];
  parts.push(
    `Listing showed ${plural(counts.listing.candidates, "candidate", "candidates")}, ${counts.listing.new} new to us.`
  );
  if (!detailReported) {
    parts.push(`Detail fetch result was not reported by the device (${plural(imported, "event", "events")} imported from submitted details).`);
  } else if (counts.detail.blocked > 0) {
    parts.push(`Detail fetch: ${imported} succeeded${detailAttempted !== null ? ` of ${detailAttempted} attempted` : ""}; RA blocked ${counts.detail.blocked}.`);
  } else {
    parts.push(`Detail fetch: ${imported} succeeded${detailAttempted !== null ? ` of ${detailAttempted} attempted` : ""}.`);
  }
  if (counts.promotion.error) {
    parts.push(`Listing promotion failed (${counts.promotion.error}); nothing was promoted.`);
  } else if (dryRun) {
    parts.push(`Listing promotion was a dry run; nothing was created.`);
  } else if (created > 0) {
    parts.push(`${plural(created, "event was", "events were")} saved as pending_review from listing data (hidden, not on the public site until approved).`);
  } else {
    parts.push(`No listing promotions were created.`);
  }
  if (deferredIds.length) {
    parts.push(`${plural(deferredIds.length, "candidate was", "candidates were")} deferred by the per-run cap (${deferredIds.join(", ")}) and carry over to the next run.`);
  }
  parts.push(
    imported > 0
      ? `Public site: ${plural(imported, "event", "events")} published.`
      : `Public site: 0 events published by this run.`
  );

  return { counts, perCandidate, text: parts.join(" ") };
}

// Read side (Admin / control tower). Takes the persisted pieces and returns a
// display-safe object. Anything not persisted stays null = UNKNOWN; it is
// never coerced to 0 or "success". Runs from before this change have none of
// these fields => { known: false }.
const KNOWN_STATUS = new Set(["imported_public", "promoted_pending_review", "deferred_by_cap", "blocked", "never_attempted"]);

function readRaTelemetry({ summary, summaryText, perCandidate } = {}) {
  const sm = summary && typeof summary === "object" ? summary : null;
  const text = typeof summaryText === "string" && summaryText ? summaryText : null;
  if (!sm && !text) return { known: false, summaryText: null, counts: null, perCandidate: null };
  const n = (v) => (Number.isFinite(v) ? v : null);
  const g = (o, k) => (o && typeof o === "object" ? n(o[k]) : null);
  const counts = {
    listingCandidates: g(sm && sm.listing, "candidates"),
    listingNew: g(sm && sm.listing, "new"),
    detailAttempted: g(sm && sm.detail, "attempted"), // null = device did not report
    detailBlocked: g(sm && sm.detail, "blocked"),
    detailSucceeded: g(sm && sm.detail, "succeeded"),
    pendingReview: g(sm && sm.promotion, "pendingReview"), // hidden; never public
    deferredByCap: g(sm && sm.promotion, "deferredByCap"),
    public: g(sm && sm.publications, "public"),
  };
  const per = Array.isArray(perCandidate)
    ? perCandidate.filter((c) => c && typeof c.id === "string").map((c) => ({
        id: c.id,
        status: KNOWN_STATUS.has(c.status) ? c.status : "unknown",
        detailBlocked: c.detailBlocked === true,
      }))
    : null;
  return { known: true, summaryText: text, counts, perCandidate: per };
}

// Untrusted device-reported detail-fetch outcome -> small known shape, or null.
function sanitizeDetailReport(d) {
  if (!d || typeof d !== "object") return null;
  const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^ra-\d+$/.test(x)).slice(0, 200) : []);
  const n = (v) => (Number.isInteger(v) && v >= 0 && v <= 100000 ? v : null);
  return { attempted: n(d.attempted), blocked: n(d.blocked), blockedIds: ids(d.blockedIds) };
}

module.exports = { buildRaRunSummary, readRaTelemetry, sanitizeDetailReport };
