// api/_lib/feed-run-health.js — run-health vocabulary for the multi-source feeds cron.
//
// WHY
// api/cron-feeds.js polls every approved feed_sources row in one invocation with a 60 s function limit.
// Measured 2026-10-21: finished runs take 28-42 s, so a slower day is killed before it can write its closing
// source_runs row (Oct 18 and Oct 19 stayed "started"), and three city feeds that answer HTTP 403 every day
// made every finished run "partial", so the outcome could not tell a normal day from a bad one.
// This module holds the pure rules for that handler plus one fail-safe write. It never fetches a feed and
// never touches events.
//
// WHAT IT PROVIDES
//   - orderFeedsForRun(): least recently polled first, so a feed deferred today leads tomorrow's run.
//   - classifyFeedResult(): one kind per feed result, using the feed's previous result to tell a persistent
//     condition (same block, same failure, same empty answer as last time) from a new one.
//   - summarizeRun(): counts, a bounded list of alerts (new problems only) and a run-level note.
//   - closeStalledRuns(): marks earlier invocations that started and never finished as failed, once, with
//     the reason, so the history says what happened and the same stalled row is not reported again.
//
// WHAT IT DOES NOT DO
// No retries, no workarounds for blocked feeds, and no deletion or overwrite of any event.
"use strict";

const KINDS = Object.freeze({
  OK: "ok",
  EMPTY: "empty",
  EMPTY_UNEXPECTED: "empty_unexpected",
  BLOCKED: "blocked",
  BLOCKED_PERSISTENT: "blocked_persistent",
  TIMEOUT: "timeout",
  TIMEOUT_PERSISTENT: "timeout_persistent",
  FAILED: "failed",
  FAILED_PERSISTENT: "failed_persistent",
  DEFERRED: "deferred",
  MANUAL: "manual",
  SKIPPED_RESUME: "skipped_resume",
});

// The result strings api/cron-feeds.js has always written to feed_sources.last_poll_result.
const TIMED_OUT_RESULT = "Fetch failed: timed out";
const NOT_A_CALENDAR_RESULT = "Fetch failed: response was not an iCalendar (HTML, challenge page or truncated file)";
const DEFERRED_RESULT = "Deferred: run time budget reached, will be polled first next run";
const BLOCKED_RE = /^Fetch failed: HTTP (401|403)\b/;
const FAILURE_RE = /^(Fetch failed|Error:|Skipped — unrecognized|Parsed \d+ events? but Supabase upsert failed)/;
const EMPTY_RE = /^Fetched OK — 0 events found/;
const HAD_EVENTS_RE = /^([1-9]\d*) events? found/;

const stripVolatile = (s) => String(s || "").replace(/\d+/g, "#").slice(0, 160);

function classifyFeedResult(result, previousResult) {
  const r = String(result || "");
  const prev = String(previousResult || "");
  if (r.startsWith("Deferred:")) return KINDS.DEFERRED;
  if (r.startsWith("Not polled automatically")) return KINDS.MANUAL;
  if (r.startsWith("Skipped (resume)")) return KINDS.SKIPPED_RESUME;
  if (BLOCKED_RE.test(r)) return BLOCKED_RE.test(prev) && stripVolatile(prev) === stripVolatile(r) ? KINDS.BLOCKED_PERSISTENT : KINDS.BLOCKED;
  if (r === TIMED_OUT_RESULT) return prev === TIMED_OUT_RESULT ? KINDS.TIMEOUT_PERSISTENT : KINDS.TIMEOUT;
  if (FAILURE_RE.test(r)) return prev && stripVolatile(prev) === stripVolatile(r) ? KINDS.FAILED_PERSISTENT : KINDS.FAILED;
  if (EMPTY_RE.test(r)) return HAD_EVENTS_RE.test(prev) ? KINDS.EMPTY_UNEXPECTED : KINDS.EMPTY;
  return KINDS.OK;
}

// Failures that make the run "partial": new problems and timeouts, plus deferred feeds (an incomplete run
// is never "success"). Persistent blocks and repeats of a known failure are reported, not counted.
const RUN_FAILURE_KINDS = new Set([KINDS.BLOCKED, KINDS.TIMEOUT, KINDS.FAILED, KINDS.DEFERRED]);
const ALERT_KINDS = new Set([KINDS.BLOCKED, KINDS.TIMEOUT, KINDS.FAILED, KINDS.EMPTY_UNEXPECTED]);

// Oldest last_polled_at first (never-polled first); id breaks ties so the order is deterministic.
function orderFeedsForRun(feeds) {
  const stamp = (f) => (f && f.last_polled_at ? Date.parse(f.last_polled_at) || 0 : 0);
  return (feeds || []).slice().sort((a, b) => stamp(a) - stamp(b) || String(a.id).localeCompare(String(b.id)));
}

// resume: skip a feed that was polled within windowMs and did not fail, so a re-run after a partial day only
// touches what is left. A manual-format or never-polled feed is never skipped by this rule.
function shouldSkipOnResume(feed, now, windowMs) {
  if (!feed || !feed.last_polled_at || feed.feed_format === "manual") return false;
  const age = now - (Date.parse(feed.last_polled_at) || 0);
  if (age < 0 || age > windowMs) return false;
  const kind = classifyFeedResult(feed.last_poll_result, null);
  return kind === KINDS.OK || kind === KINDS.EMPTY;
}

const MAX_ALERTS = 20;

// entries: [{ id, venue, result, kind }]; extras: { stalledRuns, upserted, budgetExhausted }
function summarizeRun(entries, extras = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const count = (k) => list.filter((e) => e.kind === k).length;
  const alerts = [];
  for (const e of list) {
    if (ALERT_KINDS.has(e.kind)) alerts.push({ type: e.kind === KINDS.EMPTY_UNEXPECTED ? "unexpected_empty" : e.kind, feed: e.venue, detail: String(e.result || "").slice(0, 160) });
  }
  const deferred = count(KINDS.DEFERRED);
  if (deferred) alerts.push({ type: "budget_exhausted", detail: `${deferred} feed(s) deferred to the next run` });
  const stalled = (extras.stalledRuns || []).length;
  if (stalled) alerts.push({ type: "stalled_run", detail: `${stalled} earlier run(s) started and never finished (probable function time limit): ${extras.stalledRuns.map((r) => r.started_at).join(", ")}` });
  const polled = list.filter((e) => ![KINDS.MANUAL, KINDS.DEFERRED, KINDS.SKIPPED_RESUME].includes(e.kind)).length;
  if (polled >= 3 && !extras.upserted && !count(KINDS.FAILED) && !count(KINDS.TIMEOUT) && !count(KINDS.BLOCKED)) {
    alerts.push({ type: "suspected_empty_run", detail: `${polled} feeds polled, 0 events written` });
  }
  const persistent = list.filter((e) => e.kind === KINDS.BLOCKED_PERSISTENT || e.kind === KINDS.FAILED_PERSISTENT || e.kind === KINDS.TIMEOUT_PERSISTENT).map((e) => e.venue);
  const summary = {
    feedsAttempted: polled,
    feedsDeferred: deferred,
    feedsTimedOut: count(KINDS.TIMEOUT),
    feedsFailed: count(KINDS.FAILED) + count(KINDS.BLOCKED),
    feedsPersistentlyFailing: persistent.length,
    feedsEmpty: count(KINDS.EMPTY) + count(KINDS.EMPTY_UNEXPECTED),
    feedsSkippedOnResume: count(KINDS.SKIPPED_RESUME),
    budgetExhausted: !!extras.budgetExhausted,
    stalledRunsClosed: stalled,
    alerts: alerts.slice(0, MAX_ALERTS),
  };
  const parts = [];
  if (persistent.length) parts.push(`${persistent.length} feed(s) persistently failing, unchanged since the previous poll: ${persistent.join(", ")}`.slice(0, 300));
  if (deferred) parts.push(`${deferred} deferred by the run budget`);
  if (stalled) parts.push(`${stalled} earlier run(s) closed as never finished`);
  const failedNames = list.filter((e) => e.kind === KINDS.FAILED || e.kind === KINDS.BLOCKED || e.kind === KINDS.TIMEOUT).map((e) => e.venue);
  if (failedNames.length) parts.unshift(`new failures: ${failedNames.join(", ")}`.slice(0, 300));
  if (parts.length) summary.note = parts.join("; ");
  return summary;
}

function logAlerts(alerts, log = console) {
  for (const a of alerts || []) log.error(`[feeds-alert] ${JSON.stringify(a)}`);
}

// Marks invocations of `slug` that are still "started" after olderThanMs as failed. Safe against the current
// run (its own row is newer than the cutoff) and against concurrent closers (the PATCH re-asserts outcome=started).
// Fail-safe: any problem returns what was closed so far; nothing here may break the run.
async function closeStalledRuns({ supabaseUrl, headers, slug = "feeds", olderThanMs = 10 * 60 * 1000, now = Date.now(), fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  const closed = [];
  try {
    if (!supabaseUrl || !headers) return closed;
    const cutoff = new Date(now - olderThanMs).toISOString();
    const q = `${supabaseUrl}/rest/v1/source_runs?source_slug=eq.${encodeURIComponent(slug)}&outcome=eq.started&finished_at=is.null&started_at=lt.${encodeURIComponent(cutoff)}&select=id,started_at&order=started_at.asc&limit=20`;
    const r = await fetchImpl(q, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!r || !r.ok) return closed;
    const rows = await r.json();
    if (!Array.isArray(rows)) return closed;
    for (const row of rows) {
      if (!row || !row.id) continue;
      const patch = {
        outcome: "failed",
        finished_at: new Date(now).toISOString(),
        error_sample: `Abandoned: started ${row.started_at}, never finished (probable function time limit). Closed by a later run.`,
      };
      const u = `${supabaseUrl}/rest/v1/source_runs?id=eq.${encodeURIComponent(row.id)}&outcome=eq.started`;
      const p = await fetchImpl(u, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(patch), signal: AbortSignal.timeout(timeoutMs) });
      if (p && p.ok) closed.push({ id: row.id, started_at: row.started_at });
    }
  } catch (_) {
    // Logging hygiene must never change the run.
  }
  return closed;
}

module.exports = {
  KINDS,
  TIMED_OUT_RESULT,
  DEFERRED_RESULT,
  NOT_A_CALENDAR_RESULT,
  RUN_FAILURE_KINDS,
  classifyFeedResult,
  orderFeedsForRun,
  shouldSkipOnResume,
  summarizeRun,
  logAlerts,
  closeStalledRuns,
};
