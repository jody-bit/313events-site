// test/source-health-abandoned-runs.test.js — abandoned-run visibility
// (owner GO 2026-10-20): a run that started and never finished stays visible
// after a later run succeeds; thresholds are explicit; history is never
// mutated. Pure evaluation over fixture runs.
// Run: node test/source-health-abandoned-runs.test.js
"use strict";
const assert = require("assert");
const path = require("path");
const sh = require(path.join(process.cwd(), "api/_lib/source-health.js"));

const NOW = Date.parse("2026-10-20T18:00:00Z");
const H = 3600000;
const D = 24 * H;
const vercelConfig = { crons: [{ path: "/api/cron-oldmiami", schedule: "0 14 * * *" }] };
const ago = (ms) => new Date(NOW - ms).toISOString();
const ok = (ms) => ({ source_slug: "oldmiami", outcome: "success", started_at: ago(ms), finished_at: ago(ms - 60000), records_fetched: 5, records_written: 5 });
const failed = (ms) => ({ source_slug: "oldmiami", outcome: "failed", started_at: ago(ms), finished_at: ago(ms - 60000), records_fetched: 0, records_written: 0 });
const abandoned = (ms) => ({ source_slug: "oldmiami", outcome: "started", started_at: ago(ms), finished_at: null });
const evalOld = (runs) => {
  const copy = JSON.parse(JSON.stringify(runs));
  const r = sh.evaluateSources({ runs, vercelConfig, now: NOW }).bySlug.get("oldmiami");
  assert.deepStrictEqual(runs, copy, "evaluation must not mutate its input");
  return r;
};

// 1. clean history: no new signal, no change
{
  const s = evalOld([ok(4 * H), ok(28 * H), ok(52 * H)]);
  assert.strictEqual(s.status, "healthy");
  assert.strictEqual(s.history.abandonedEarlier, 0);
}
console.log("PASS clean history unchanged");

// 2. an abandoned run followed by a later success is NOT hidden
{
  const s = evalOld([ok(4 * H), abandoned(28 * H), ok(52 * H)]);
  assert.strictEqual(s.history.abandonedEarlier, 1);
  assert.strictEqual(s.history.mostRecentAbandonedAt, ago(28 * H));
  assert.strictEqual(s.status, "degraded", "recent abandoned run lowers the source to degraded");
  assert.ok(s.reasons.some((r) => /1 earlier run\(s\) started and never finished/.test(r)));
  assert.strictEqual(s.dimensions.execution, "ok", "the latest run itself is fine; execution is unchanged");
  assert.strictEqual(s.unhealthy, true);
}
console.log("PASS abandoned-then-success stays visible (degraded, not failing)");

// 3. thresholds: an unfinished run inside the 15 minute timeout is "still running", not abandoned
{
  const MIN = 60000;
  const inside = evalOld([ok(10 * MIN), abandoned(12 * MIN), ok(30 * H)]);
  assert.strictEqual(inside.history.abandonedEarlier, 0, "12 minutes old is inside the timeout");
  const outside = evalOld([ok(10 * MIN), abandoned(16 * MIN), ok(30 * H)]);
  assert.strictEqual(outside.history.abandonedEarlier, 1, "16 minutes old and unfinished is abandoned");
  assert.strictEqual(sh.STARTED_RUN_TIMEOUT_MINUTES, 15);
}
console.log("PASS timeout threshold respected");

// 4. age: older than 3 days is advisory only (kept in reasons, no status change)
{
  const s = evalOld([ok(4 * H), abandoned(5 * D), ok(6 * D)]);
  assert.strictEqual(s.history.abandonedEarlier, 1);
  assert.strictEqual(s.status, "healthy", "older than the raise window does not change status");
  assert.ok(s.reasons.some((r) => /advisory: older than 3 days/.test(r)), "but the evidence is still reported");
}
console.log("PASS old abandoned run is an advisory line, evidence kept");

// 5. several abandoned runs are counted with newest/oldest times
{
  const s = evalOld([ok(2 * H), abandoned(26 * H), abandoned(50 * H), ok(74 * H)]);
  assert.strictEqual(s.history.abandonedEarlier, 2);
  assert.strictEqual(s.history.mostRecentAbandonedAt, ago(26 * H));
  assert.strictEqual(s.history.oldestAbandonedAt, ago(50 * H));
  assert.ok(s.reasons.some((r) => /2 earlier run\(s\)/.test(r) && /oldest/.test(r)));
}
console.log("PASS multiple abandoned runs counted");

// 6. earlier failures stay visible as an advisory, without raising status
{
  const s = evalOld([ok(2 * H), failed(26 * H), ok(50 * H)]);
  assert.strictEqual(s.history.failedEarlier, 1);
  assert.strictEqual(s.status, "healthy");
  assert.ok(s.reasons.some((r) => /earlier run\(s\) failed or were blocked/.test(r)));
}
console.log("PASS earlier failed runs reported as advisory");

// 7. the latest run abandoned: existing behavior unchanged (failing), not double counted
{
  const s = evalOld([abandoned(3 * H), ok(27 * H)]);
  assert.strictEqual(s.status, "failing");
  assert.strictEqual(s.history.abandonedEarlier, 0, "the latest run is judged by execution, not history");
}
console.log("PASS latest abandoned run still failing, not double counted");

// 8. lookback is bounded to the most recent earlier runs
{
  const runs = [ok(1 * H)];
  for (let i = 0; i < sh.ABANDONED_LOOKBACK_RUNS; i++) runs.push(ok((25 + i) * H));
  runs.push(abandoned((25 + sh.ABANDONED_LOOKBACK_RUNS + 1) * H)); // beyond the lookback
  const s = evalOld(runs);
  assert.strictEqual(s.history.abandonedEarlier, 0);
}
console.log("PASS lookback bounded");

// 9. unscheduled / unreadable-schedule sources never get a status change from history
{
  const r = sh.evaluateSources({ runs: [ok(4 * H), abandoned(28 * H)], vercelConfig: { crons: [] }, now: NOW }).bySlug.get("oldmiami");
  assert.notStrictEqual(r.status, "degraded");
  assert.ok(r.history.abandonedEarlier === 1);
}
console.log("PASS unscheduled source: evidence recorded, status untouched");

console.log("all source-health abandoned-run tests passed");
