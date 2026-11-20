"use strict";
// Ingest-time quality observer (Platform, P0 2026-11-20). ONE call every event write path makes with the rows it is about
// to write (new AND updated). Report-only: it never blocks, alters, hides or re-statuses a row, reads nothing from the
// network, and can never throw into a writer (any internal error is returned as state "error", never as a pass).
// Output: per-check outcome counts (pass/fail/review/unchecked) and the finding keys that need a person, logged as one
// structured line [quality-ingest] and returned so a caller may attach it to its run log.
const { buildCoverage } = require("./quality-coverage");
const { findingsForImport } = require("./quality-contract");
const { classifyMeeting } = require("./meeting-classifier");
const { isLikelyNotARealEvent } = require("./non-event-filter");

const KEY_CAP = 25;
const todayInDetroit = (nowMs) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit" }).format(new Date(nowMs));

// observeIngest(rows, { path, nowMs, log }) -> { state:'ok'|'error'|'skipped', path, rows, checks, review_keys, error }
function observeIngest(rows, opts) {
  const o = opts || {};
  const path = o.path || "unknown";
  const log = o.log === undefined ? console.log : o.log;
  try {
    const list = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === "object" && !Array.isArray(r));
    if (!list.length) return { state: "skipped", path, rows: 0, checks: {}, review_keys: [] };
    const nowMs = o.nowMs || Date.now();
    // Import stage: record-level rules plus same-venue/same-start pairs WITHIN this batch only (no read of stored rows).
    const findings = findingsForImport(list, [], {});
    const coverage = buildCoverage(list, { stage: "import", today: todayInDetroit(nowMs), nowMs, findings, classifyMeeting, isNonEvent: isLikelyNotARealEvent });
    const summary = {
      state: "ok", path, rows: coverage.denominator, checks: coverage.checks, dimensions: coverage.dimensions,
      review_keys: findings.filter((f) => f.class === "actionable").map((f) => f.key).slice(0, KEY_CAP),
      limits: ["import stage: duplicates beyond this batch, link status and freshness are unchecked here; the published sweep (control tower coverage) covers them"],
    };
    if (log) log("[quality-ingest] " + JSON.stringify({ path, rows: summary.rows, dimensions: summary.dimensions, review_keys: summary.review_keys }));
    return summary;
  } catch (err) {
    const message = "observer failed: " + String((err && err.name) || "Error").slice(0, 60); // never row content or secrets
    try { if (log) log("[quality-ingest] error " + JSON.stringify({ path, error: message })); } catch (_) { /* logging must never throw */ }
    return { state: "error", path, rows: 0, checks: {}, review_keys: [], error: message };
  }
}

module.exports = { observeIngest };
