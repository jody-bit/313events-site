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
  const blocked = Number.isFinite(d.blocked) ? d.blocked : blockedIds.length;

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
  if (counts.detail.blocked > 0 || (detailAttempted !== null && imported === 0 && counts.listing.new > 0)) {
    parts.push(`Detail fetch: ${imported} succeeded${detailAttempted !== null ? ` of ${detailAttempted} attempted` : ""}; RA blocked the rest.`);
  } else {
    parts.push(`Detail fetch: ${imported} succeeded.`);
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

module.exports = { buildRaRunSummary };
