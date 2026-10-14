// api/_lib/pending-queue.js
//
// Which pending_review rows belong in the default admin submissions queue and which in the historical view
// (owner decision 2026-10-14, after 734 already-ended City of Dearborn rows filled the queue). READ-SIDE ONLY:
// nothing here changes a row's status, and a row moves between the two views purely because the date passes.
//
// A row is "expired" (historical) only when its effective end (end_date, else start_date) is a real date that is
// before today. Today is the America/Detroit calendar date, the same day a Detroit reader would call "today".
// Everything uncertain stays in the default queue: a missing or unreadable date, and a recurring event
// (is_recurring), whose own start date says nothing about its later occurrences.
"use strict";

function isoDay(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(v + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : null;
}

function detroitToday(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" }).format(now || new Date());
}

function isExpiredPending(row, today) {
  if (!row || row.is_recurring === true) return false;
  const start = isoDay(row.start_date);
  if (!start) return false;
  let end = start;
  if (row.end_date !== null && row.end_date !== undefined && row.end_date !== "") {
    const e = isoDay(row.end_date);
    if (!e) return false; // an unreadable end date is ambiguous, not expired
    if (e > end) end = e;
  }
  return end < today;
}

// view: "current" (default queue) or "expired" (historical view).
function filterPendingQueue(rows, view, now) {
  const today = detroitToday(now);
  const wantExpired = view === "expired";
  return rows.filter((r) => isExpiredPending(r, today) === wantExpired);
}

module.exports = { isExpiredPending, filterPendingQueue, detroitToday };
