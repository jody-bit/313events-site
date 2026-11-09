// api/_lib/ingest-eligibility.js
//
// One shared rule for the generic feed pipeline (api/cron-feeds.js, ICS and RSS): a feed row that is DEFINITIVELY over
// is not inserted as a new event. Owner decision 2026-10-14 after the City of Dearborn calendar, a full-year export,
// put 765 already-ended rows into the review queue.
//
// "Definitively expired" is deliberately narrow. A row is expired only when ALL of these hold:
//   - start_date is a real ISO calendar date, and end_date (when present) is one too;
//   - its effective end (end_date, else start_date) is before yesterday in UTC. The one-day grace keeps an evening
//     event from being dropped by a clock that has already rolled over;
//   - it is not part of a recurring series: an RRULE/RDATE master or a RECURRENCE-ID override (row._recurring);
//   - its date is not a guess: an RSS item dated from its pubDate fallback (row._dateConfidence === "pubdate-fallback")
//     is never treated as expired.
// Anything else, including a missing or malformed date, is NOT expired and goes through the pipeline unchanged.
//
// The rule is applied to NEW inserts only (see api/cron-feeds.js upsertParsedRows): a row that already exists keeps
// being updated, so reviewer decisions and approved records are untouched. Backfill scripts do not call cron-feeds.
"use strict";

const MS_PER_DAY = 86400000;
const GRACE_DAYS = 1;

function isoDay(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(v + "T00:00:00Z");
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10) === v ? Math.floor(t / MS_PER_DAY) : null;
}

function isDefinitelyExpired(row, now) {
  if (!row || row._recurring || row._dateConfidence === "pubdate-fallback") return false;
  const start = isoDay(row.start_date);
  if (start === null) return false;
  let end = start;
  if (row.end_date !== null && row.end_date !== undefined && row.end_date !== "") {
    const e = isoDay(row.end_date);
    if (e === null) return false; // an unreadable end date is ambiguous, not expired
    end = Math.max(start, e);
  }
  const today = Math.floor((now instanceof Date ? now.getTime() : Date.now()) / MS_PER_DAY);
  return end < today - GRACE_DAYS;
}

// Splits rows into { keep, skippedPast }. `isExisting(row)` says whether the row is already stored; those always stay.
function partitionExpired(rows, isExisting, now) {
  const keep = [];
  let skippedPast = 0;
  for (const row of rows) {
    if (!isExisting(row) && isDefinitelyExpired(row, now)) skippedPast++;
    else keep.push(row);
  }
  return { keep, skippedPast };
}

module.exports = { isDefinitelyExpired, partitionExpired, GRACE_DAYS };
