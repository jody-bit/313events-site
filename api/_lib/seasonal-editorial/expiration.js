"use strict";
// api/_lib/seasonal-editorial/expiration.js — REPORT-ONLY seasonal expiration safeguard (owner decision 2026-10-20).
// Node only, private. Nothing here changes publication: it never hides, unpublishes or edits an entry, and it is never
// consulted by the public projection. Collection membership still changes only by a reviewed commit to entries.json.
//
// Optional private fields on an entry:
//   season.end        YYYY-MM-DD final operating date. Populate ONLY when authoritative evidence supports it. Never infer it
//                     from a generic date range, an incomplete schedule, or a private schedule whose provenance is secondary.
//   season.endSource  where the final date was read (evidence reference). A season.end without it counts as unverified.
//   reviewOn          YYYY-MM-DD when editorial verification must occur.
//   expiryDisposition { action: "unpublish" | "keep-published", by, at: YYYY-MM-DD, note } — the explicit editorial decision for
//                     a verified-ended entry that is still published.
//
// Report states (separate, an entry can carry more than one):
//   SEASON_ENDED           verified season.end is before today (Detroit date)
//   REVIEW_DUE             reviewOn is today or earlier
//   INSUFFICIENT_EVIDENCE  no usable verified season.end (missing, malformed, or without endSource). Informational only.
// The ONLY failing condition is a SEASON_ENDED entry that is still PUBLISHED and has no valid disposition.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const has = (s) => typeof s === "string" && s.trim().length > 0;
const validDate = (s) => typeof s === "string" && DATE.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

// Today's calendar date in America/Detroit as YYYY-MM-DD.
function detroitToday(now) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now || new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return g("year") + "-" + g("month") + "-" + g("day");
}

function verifiedEnd(e) {
  const s = e && e.season;
  return s && validDate(s.end) && has(s.endSource) ? s.end : null;
}

function validDisposition(d) {
  return !!d && (d.action === "unpublish" || d.action === "keep-published") && has(d.by) && validDate(d.at) && has(d.note);
}

// slugs -> entries (the shape of entries.json). today: YYYY-MM-DD. Returns { today, items, counts, failures }.
function expirationReport(byCollection, today) {
  if (!validDate(today)) throw new Error("expirationReport needs today as YYYY-MM-DD");
  const items = [], counts = { published: 0, SEASON_ENDED: 0, REVIEW_DUE: 0, INSUFFICIENT_EVIDENCE: 0, dispositionMissing: 0, unpublishNotApplied: 0 };
  for (const slug of Object.keys(byCollection || {})) {
    for (const e of byCollection[slug] || []) {
      if (!e || e.status !== "PUBLISHED") continue; // only what is publicly shown can be stale
      counts.published++;
      const states = [], end = verifiedEnd(e);
      const reasons = [];
      if (end && end < today) { states.push("SEASON_ENDED"); counts.SEASON_ENDED++; }
      if (validDate(e.reviewOn) && e.reviewOn <= today) { states.push("REVIEW_DUE"); counts.REVIEW_DUE++; }
      if (!end) {
        states.push("INSUFFICIENT_EVIDENCE"); counts.INSUFFICIENT_EVIDENCE++;
        if (e.season && e.season.end && !has(e.season.endSource)) reasons.push("season.end has no endSource");
        else if (e.season && e.season.end && !validDate(e.season.end)) reasons.push("season.end is not a valid YYYY-MM-DD date");
        else if (e.schedule && e.schedule.season && e.schedule.season.end) reasons.push("private schedule has an end date (" + e.schedule.season.end + ") but it is not recorded as a verified season.end");
        else reasons.push("no verified final operating date recorded");
      }
      const needsDisposition = states.includes("SEASON_ENDED") && !validDisposition(e.expiryDisposition);
      if (needsDisposition) counts.dispositionMissing++;
      // A decision to unpublish must land in the SAME change as the status change: an ended entry that records
      // `unpublish` but is still PUBLISHED is an inconsistent state and fails the build.
      const unpublishNotApplied = states.includes("SEASON_ENDED") && validDisposition(e.expiryDisposition) && e.expiryDisposition.action === "unpublish";
      if (unpublishNotApplied) counts.unpublishNotApplied++;
      if (states.length) items.push({ collection: slug, id: e.id, name: e.name, states, seasonEnd: end, reviewOn: validDate(e.reviewOn) ? e.reviewOn : null, expiryDisposition: e.expiryDisposition || null, needsDisposition, unpublishNotApplied, reasons });
    }
  }
  const failures = items.filter((i) => i.needsDisposition).map((i) => i.collection + "/" + i.id + " ended " + i.seasonEnd + " but is still PUBLISHED with no valid disposition")
    .concat(items.filter((i) => i.unpublishNotApplied).map((i) => i.collection + "/" + i.id + " ended " + i.seasonEnd + " has expiryDisposition unpublish but is still PUBLISHED (the status change must land in the same PR)"));
  return { today, items, counts, failures };
}

function formatReport(r, opts) {
  const verbose = !!(opts && opts.verbose), L = [];
  L.push("Seasonal expiration report (report-only; nothing is hidden or unpublished) — today " + r.today + " America/Detroit");
  L.push("published " + r.counts.published + " | SEASON_ENDED " + r.counts.SEASON_ENDED + " | REVIEW_DUE " + r.counts.REVIEW_DUE + " | INSUFFICIENT_EVIDENCE " + r.counts.INSUFFICIENT_EVIDENCE + " | ended without disposition " + r.counts.dispositionMissing + " | unpublish decided but still published " + r.counts.unpublishNotApplied);
  for (const st of ["SEASON_ENDED", "REVIEW_DUE"]) {
    const rows = r.items.filter((i) => i.states.includes(st));
    if (!rows.length) continue;
    L.push("", st + " (" + rows.length + ")");
    for (const i of rows) L.push("  " + i.collection + "/" + i.id + " — " + i.name + (st === "SEASON_ENDED" ? " — ended " + i.seasonEnd + (i.expiryDisposition ? " — disposition: " + i.expiryDisposition.action : " — NEEDS DISPOSITION") : " — review on " + i.reviewOn));
  }
  const ins = r.items.filter((i) => i.states.includes("INSUFFICIENT_EVIDENCE"));
  if (ins.length) {
    L.push("", "INSUFFICIENT_EVIDENCE (" + ins.length + ") — informational; never a failure, never a suppression");
    for (const i of verbose ? ins : ins.filter((x) => x.reasons.some((m) => !/^no verified/.test(m)))) L.push("  " + i.collection + "/" + i.id + " — " + i.reasons.join("; "));
    if (!verbose) L.push("  (" + ins.filter((x) => x.reasons.every((m) => /^no verified/.test(m))).length + " more have no verified final operating date recorded; use --verbose to list)");
  }
  if (r.failures.length) L.push("", "FAIL — verified-ended entries still published without a disposition:", ...r.failures.map((f) => "  " + f));
  return L.join("\n");
}

module.exports = { expirationReport, formatReport, detroitToday, verifiedEnd, validDisposition, validDate };
