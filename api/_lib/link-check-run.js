"use strict";

// api/_lib/link-check-run.js
//
// Rotating link check for upcoming approved events (Decision 7, Platform).
// Opens each event's primary link, records the outcome, and rechecks on a
// schedule that tightens as the event approaches.
//
// What it does NOT do: change a URL, unpublish an event, or substitute a
// homepage. A confirmed 404/410 is recorded as link_check_status='dead' so it
// surfaces for investigation; 403/429/5xx/timeouts are inconclusive and never
// overwrite a prior status (only link_checked_at moves, so the rotation advances).

const { classifyUrlCheck, classifyLinkKind, isUsableLinkKind } = require("./link-health");

const DAY_MS = 86400000;

// Days between checks, by days until the event.
function recheckIntervalDays(daysToEvent) {
  if (daysToEvent <= 3) return 1;
  if (daysToEvent <= 14) return 2;
  if (daysToEvent <= 30) return 7;
  return 14;
}

// The first of ticket_url / event_url that points at a specific page.
function primaryLink(row) {
  for (const field of ["ticket_url", "event_url"]) {
    const url = row[field];
    const kind = classifyLinkKind(url, { field: field === "ticket_url" ? "ticket" : "event" });
    if (isUsableLinkKind(kind)) return { field, url };
  }
  return null;
}

// selectDue(rows, now, limit) -> [{ row, field, url }], never-checked first, then soonest event.
function selectDue(rows, now, limit, { onlyNever = false } = {}) {
  const due = [];
  for (const row of rows) {
    const link = primaryLink(row);
    if (!link) continue;
    const daysToEvent = Math.max(0, Math.floor((Date.parse(`${row.start_date}T00:00:00Z`) - now) / DAY_MS));
    const checkedAt = row.link_checked_at ? Date.parse(row.link_checked_at) : null;
    if (onlyNever && checkedAt !== null) continue;
    if (checkedAt !== null && now - checkedAt < recheckIntervalDays(daysToEvent) * DAY_MS) continue;
    due.push({ row, ...link, daysToEvent, neverChecked: checkedAt === null });
  }
  due.sort((a, b) => (b.neverChecked - a.neverChecked) || (a.daysToEvent - b.daysToEvent));
  return due.slice(0, limit);
}

async function checkOne(item, { fetchFn, timeoutMs }) {
  try {
    const resp = await fetchFn(item.url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "313.events link check (+https://313.events)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: resp.status, classification: classifyUrlCheck(resp.status) };
  } catch (err) {
    return { status: null, classification: "inconclusive", error: err.message };
  }
}

// run({ rows, now, limit, concurrency, timeoutMs, deadlineMs, fetchFn, patchFn, apply })
// patchFn(item, fields) writes one row (apply mode only).
async function run({ rows, now = Date.now(), limit = 100, onlyNever = false, detail = false, concurrency = 8, timeoutMs = 6000, deadlineMs = 45000, fetchFn = fetch, patchFn = null, apply = false }) {
  const startedAt = Date.now();
  const queue = selectDue(rows, now, limit, { onlyNever });
  const stats = { mode: apply ? "apply" : "dry", candidates: rows.length, due: queue.length, checked: 0, ok: 0, dead: 0, inconclusive: 0, skipped_deadline: 0, write_errors: 0, dead_ids: [], inconclusive_by_status: {}, results: detail ? [] : undefined };
  let next = 0;
  async function worker() {
    while (next < queue.length) {
      if (Date.now() - startedAt > deadlineMs) { stats.skipped_deadline = queue.length - next; return; }
      const item = queue[next++];
      const result = await checkOne(item, { fetchFn, timeoutMs });
      stats.checked++;
      stats[result.classification]++;
      if (result.classification === "dead") stats.dead_ids.push(item.row.id);
      if (detail && stats.results.length < 200) stats.results.push({ id: item.row.id, title: item.row.title, url: item.url, status: result.status, classification: result.classification });
      if (result.classification === "inconclusive") {
        const key = String(result.status);
        stats.inconclusive_by_status[key] = (stats.inconclusive_by_status[key] || 0) + 1;
      }
      if (apply && patchFn) {
        const fields = { link_checked_at: new Date().toISOString() };
        if (result.classification !== "inconclusive") fields.link_check_status = result.classification;
        try { await patchFn(item, fields); } catch { stats.write_errors++; }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  stats.duration_ms = Date.now() - startedAt;
  return stats;
}

module.exports = { recheckIntervalDays, primaryLink, selectDue, run };
