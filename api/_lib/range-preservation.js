// api/_lib/range-preservation.js — MC-RANGE (#141): a connector refresh never narrows a stored range
// below dates a person or an organizer page has already evidenced.
//
// THE DEFECT: VisitDetroit's feed describes ONE occurrence window per listing and rolls it every refresh
// (Zoo Boo moved Oct 16-17 -> Oct 23-24 within a day; Cider and Greenfield moved the same way). The
// connector upserts start_date/end_date on every run. date_semantics, occurrence_dates and
// recurrence_evidence are never in its payload, so they survive, but the range around them is
// overwritten. Evidenced dates then fall outside start..end ("occurrence-outside-range"), the pages
// that load rows by range lose them, and exact-range guards in reviewed change sets drift.
//
// THE RULE (evidence only, never inference):
//   - A row with no classification (date_semantics NULL) or no existing row: incoming range, unchanged.
//   - recurring + occurrence_dates: the stored range must cover [first, last] evidenced occurrence.
//     start = earliest of (incoming start, first occurrence); end = latest of (incoming end, last
//     occurrence). The range is only ever widened TO an evidenced date, never past one. Days inside the
//     range stay unattendable, because date_semantics (not the range) says which days count.
//   - continuous: the existing classified range is authoritative where the source went narrower.
//     end = later of (incoming, existing); start = earlier of (incoming, existing). A source that is
//     further out than what is stored still extends the row (source evidence); one that is narrower is
//     held and reported, not applied.
//   - single, anything else: incoming, unchanged.
// Every held or widened row comes back as a conflict record so a person can see it; nothing is
// replaced silently and nothing is written beyond start_date/end_date.
"use strict";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (s) => typeof s === "string" && ISO_RE.test(s);

function evidencedOccurrences(existing) {
  const raw = existing && existing.occurrence_dates;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isIso))].sort();
}

// incoming: { start_date, end_date|null }; existing: the stored row's { start_date, end_date, date_semantics,
// occurrence_dates } or undefined; asOf: ISO "today" (Detroit) used only to tell roll-off from a real shortening.
// Returns { start_date, end_date, action, conflict|null } where action is "incoming" | "widened-to-evidence" | "held-existing".
function preserveRange(incoming, existing, asOf) {
  const inStart = incoming.start_date;
  const inEnd = incoming.end_date && isIso(incoming.end_date) && incoming.end_date > inStart ? incoming.end_date : inStart;
  const keep = (start, end, action, conflict) => ({
    start_date: start,
    end_date: end > start ? end : null, // connector convention: end_date NULL when it is the same day
    action,
    conflict: conflict || null,
  });
  const passthrough = () => keep(inStart, inEnd, "incoming");
  if (!existing || !isIso(inStart)) return passthrough();

  const sem = existing.date_semantics;
  const exStart = isIso(existing.start_date) ? existing.start_date : null;
  const exEnd = exStart && isIso(existing.end_date) && existing.end_date > exStart ? existing.end_date : exStart;

  if (sem === "recurring") {
    const occ = evidencedOccurrences(existing);
    if (!occ.length) return passthrough();
    const start = occ[0] < inStart ? occ[0] : inStart;
    const end = occ[occ.length - 1] > inEnd ? occ[occ.length - 1] : inEnd;
    if (start === inStart && end === inEnd) return passthrough();
    return keep(start, end, "widened-to-evidence", {
      kind: "incoming-range-excludes-evidenced-occurrences",
      incoming: [inStart, inEnd],
      evidenced_occurrences: occ,
      stored: [exStart, exEnd],
    });
  }

  if (sem === "continuous" && exStart) {
    const start = exStart < inStart ? exStart : inStart;
    const end = exEnd > inEnd ? exEnd : inEnd;
    if (start === inStart && end === inEnd) return passthrough();
    // A start that only moved later while the stored start is already past is the source rolling off
    // finished days, not a shortening of the event: keep the range quietly, no conflict to review.
    const endNarrowed = inEnd < exEnd;
    const startNarrowedLive = inStart > exStart && !(asOf && isIso(asOf) && exStart < asOf);
    return keep(start, end, "held-existing", (endNarrowed || startNarrowedLive) ? {
      kind: "incoming-range-narrower-than-classified-continuous-range",
      incoming: [inStart, inEnd],
      stored: [exStart, exEnd],
    } : null);
  }

  return passthrough();
}

module.exports = { preserveRange };
