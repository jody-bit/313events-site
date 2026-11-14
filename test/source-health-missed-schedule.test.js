// test/source-health-missed-schedule.test.js — missed-schedule detection
// (owner GO 2026-10-20): expected scheduled slots vs actual runs, tolerant of
// delays and pauses, RA 14:45Z regression coverage, DEC-010 manual-only RA.
// Pure evaluation over fixed times. Run: node test/source-health-missed-schedule.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sh = require(path.join(process.cwd(), "api/_lib/source-health.js"));

const H = 3600000;
const D = 24 * H;
const T = (iso) => Date.parse(iso);
const iso = (t) => new Date(t).toISOString();

// ---- scheduledSlots: the expected-execution calculator ----
{
  const now = T("2026-10-20T18:00:00Z");
  assert.deepStrictEqual(sh.scheduledSlots("0 14 * * *", now, 3).map(iso), ["2026-10-20T14:00:00.000Z", "2026-10-19T14:00:00.000Z", "2026-10-18T14:00:00.000Z"]);
  assert.deepStrictEqual(sh.scheduledSlots("0 14 * * *", T("2026-10-20T13:59:00Z"), 1).map(iso), ["2026-10-19T14:00:00.000Z"], "a slot in the future is not expected yet");
  assert.deepStrictEqual(sh.scheduledSlots("30 */6 * * *", now, 3).map(iso), ["2026-10-20T18:30:00.000Z".replace("18:30", "12:30"), "2026-10-20T06:30:00.000Z", "2026-10-20T00:30:00.000Z"]);
  assert.deepStrictEqual(sh.scheduledSlots("0 9 * * 1", now, 2).map(iso), ["2026-10-19T09:00:00.000Z", "2026-10-12T09:00:00.000Z"], "weekly (Monday)");
  assert.strictEqual(sh.scheduledSlots("*/5 * * * *", now), null, "unsupported shape is unknown, never guessed");
  assert.strictEqual(sh.scheduledSlots("0 14 1 * *", now), null);
}
console.log("PASS scheduledSlots computes expected executions and refuses unknown shapes");

// ---- missedSlots: expected vs actual ----
{
  const now = T("2026-10-20T18:00:00Z");
  const starts = [T("2026-10-19T14:07:00Z"), T("2026-10-18T14:00:30Z"), T("2026-10-17T14:20:00Z")];
  const r = sh.missedSlots({ expr: "0 14 * * *", startsMs: starts, nowMs: now, earliestMs: T("2026-10-10T00:00:00Z"), count: 4 });
  assert.deepStrictEqual(r.missed.map(iso), ["2026-10-20T14:00:00.000Z"], "today's 14:00 slot has no run");
  assert.strictEqual(r.slotsChecked, 4);
  // late but inside the same slot window is covered (delay tolerated)
  const late = sh.missedSlots({ expr: "0 14 * * *", startsMs: starts.concat([T("2026-10-20T15:40:00Z")]), nowMs: now, earliestMs: T("2026-10-10T00:00:00Z"), count: 4 });
  assert.deepStrictEqual(late.missed, []);
  // still inside grace: not missed yet
  const early = sh.missedSlots({ expr: "0 14 * * *", startsMs: [T("2026-10-19T14:03:00Z")], nowMs: T("2026-10-20T15:30:00Z"), earliestMs: T("2026-10-10T00:00:00Z"), count: 1 });
  assert.deepStrictEqual(early.missed, [], "inside the 2h grace period");
  // history does not reach back: slots before the earliest run are not judged
  const young = sh.missedSlots({ expr: "0 14 * * *", startsMs: [T("2026-10-19T14:05:00Z")], nowMs: now, earliestMs: T("2026-10-19T14:05:00Z"), count: 7 });
  assert.deepStrictEqual(young.missed.map(iso), ["2026-10-20T14:00:00.000Z"]);
  assert.ok(young.slotsChecked <= 2);
}
console.log("PASS missedSlots: missed, late-but-covered, inside grace, no invented history");

// ---- evaluateSources integration ----
const vercelConfig = { crons: [{ path: "/api/cron-oldmiami", schedule: "0 14 * * *" }] };
const run = (slug, t, extra = {}) => Object.assign({ source_slug: slug, outcome: "success", started_at: iso(t), finished_at: iso(t + 60000), records_fetched: 5, records_written: 5 }, extra);
const evalSlug = (slug, runs, now, cfg = vercelConfig) => sh.evaluateSources({ runs, vercelConfig: cfg, now }).bySlug.get(slug);
{
  const now = T("2026-10-20T18:00:00Z");
  const base = [1, 2, 3, 4, 5, 6].map((d) => run("oldmiami", T("2026-10-20T14:02:00Z") - d * D));
  // healthy: every slot including today's has a run
  const healthy = evalSlug("oldmiami", [run("oldmiami", T("2026-10-20T14:02:00Z"))].concat(base), now);
  assert.strictEqual(healthy.missedSchedule.missedCount, 0);
  assert.strictEqual(healthy.status, "healthy");
  // one missed run (today's) while yesterday's succeeded: detected long before the 2x-cadence failing rule
  const missed = evalSlug("oldmiami", base, now);
  assert.strictEqual(missed.missedSchedule.missedCount, 1);
  assert.strictEqual(missed.missedSchedule.mostRecentMissedSlot, "2026-10-20T14:00:00.000Z");
  assert.strictEqual(missed.status, "degraded", "degraded, not failing: only the existing 2x cadence rule fails a source");
  assert.ok(missed.reasons.some((r) => /Scheduled run due 2026-10-20T14:00:00.000Z never started/.test(r)));
  // a late run within grace is not a miss
  const lateOk = evalSlug("oldmiami", [run("oldmiami", T("2026-10-20T15:10:00Z"))].concat(base), now);
  assert.strictEqual(lateOk.missedSchedule.missedCount, 0);
  // not yet due / inside grace
  const early = evalSlug("oldmiami", base, T("2026-10-20T15:00:00Z"));
  assert.strictEqual(early.missedSchedule.missedCount, 0);
  // an older miss (4 days back) is kept as an advisory line without changing status
  const gap = [run("oldmiami", T("2026-10-20T14:02:00Z"))].concat([1, 2, 3, 5, 6].map((d) => run("oldmiami", T("2026-10-20T14:02:00Z") - d * D)));
  const advisory = evalSlug("oldmiami", gap, now);
  assert.strictEqual(advisory.missedSchedule.missedCount, 1);
  assert.strictEqual(advisory.missedSchedule.mostRecentMissedSlot, "2026-10-16T14:00:00.000Z");
  assert.strictEqual(advisory.status, "healthy");
  assert.ok(advisory.reasons.some((r) => /advisory: older than 3 days/.test(r)));
}
console.log("PASS evaluateSources: missed slot flagged degraded, late-in-grace tolerated, healthy unchanged");

// pause: removing the schedule leaves no slots to miss
{
  const now = T("2026-10-20T18:00:00Z");
  const runs = [1, 2, 3].map((d) => run("oldmiami", T("2026-10-20T14:02:00Z") - d * D));
  const paused = evalSlug("oldmiami", runs, now, { crons: [] });
  assert.strictEqual(paused.missedSchedule, null, "no schedule, no expected executions");
  assert.ok(!paused.reasons.some((r) => /never started/.test(r)));
  // source with no run log: no missed-slot claim (insufficient evidence path unchanged)
  const nolog = evalSlug("oldmiami", [], now);
  assert.strictEqual(nolog.missedSchedule, null);
}
console.log("PASS pause and no-run-log sources are never reported as missed");

// ---- RA: DEC-010 manual-only, and the 14:45Z bridge reconcile regression ----
{
  const now = T("2026-10-20T18:00:00Z");
  const ra = evalSlug("resident-advisor", [run("resident-advisor", T("2026-10-12T10:00:00Z"))], now);
  assert.strictEqual(ra.manualOnly, true);
  assert.strictEqual(ra.missedSchedule, null, "RA is manual-only (DEC-010): no scheduled slot is ever expected, so none is missed");
  assert.ok(!ra.reasons.some((r) => /Scheduled run due/.test(r)));
  assert.ok(sh.MANUAL_ONLY.has("resident-advisor"));
  assert.strictEqual(sh.EXTERNAL_SCHEDULES["resident-advisor"].cadenceHours, 24, "existing declared cadence untouched");
}
console.log("PASS RA stays manual-only: no missed-slot claim, declared schedule unchanged");

{
  // Regression: the RA bridge's report-only daily reconcile runs from
  // .github/workflows/ra-sync-bridge.yml at 14:45Z. It is a GitHub Actions
  // schedule, not a Vercel cron and not a source_runs writer, so the app
  // cannot observe it; what can be pinned is (a) the schedule is still there,
  // (b) what a missed slot looks like to the calculator, (c) the workflow
  // remains report-only for the scheduled event.
  const wf = fs.readFileSync(path.join(process.cwd(), ".github/workflows/ra-sync-bridge.yml"), "utf8");
  const m = /schedule:\s*\n\s*- cron: '([^']+)'/.exec(wf);
  assert.ok(m, "ra-sync-bridge.yml keeps a schedule trigger");
  assert.strictEqual(m[1], "45 14 * * *", "the reconcile slot is 14:45Z");
  assert.ok(/Report-only daily reconcile/.test(wf) && /Relays nothing/.test(wf), "scheduled event is documented report-only");
  const now = T("2026-10-21T15:30:00Z"); // 45 minutes after the slot
  const slots = sh.scheduledSlots(m[1], now, 2).map(iso);
  assert.deepStrictEqual(slots, ["2026-10-21T14:45:00.000Z", "2026-10-20T14:45:00.000Z"]);
  const justAfter = sh.missedSlots({ expr: m[1], startsMs: [T("2026-10-20T14:50:00Z")], nowMs: now, earliestMs: T("2026-10-15T00:00:00Z"), count: 1 });
  assert.deepStrictEqual(justAfter.missed, [], "45 minutes after the slot is inside grace: not yet missed");
  const later = sh.missedSlots({ expr: m[1], startsMs: [T("2026-10-20T14:50:00Z")], nowMs: T("2026-10-21T17:00:00Z"), earliestMs: T("2026-10-15T00:00:00Z"), count: 2 });
  assert.deepStrictEqual(later.missed.map(iso), ["2026-10-21T14:45:00.000Z"], "no run by 2h after the slot: the miss is reported");
  const oct20 = sh.missedSlots({ expr: m[1], startsMs: [], nowMs: T("2026-10-20T18:00:00Z"), earliestMs: T("2026-10-15T00:00:00Z"), count: 1 });
  assert.deepStrictEqual(oct20.missed.map(iso), ["2026-10-20T14:45:00.000Z"], "the Oct 20 14:45Z slot with no run is flagged as missed");
}
console.log("PASS RA 14:45Z reconcile: schedule pinned, report-only, missed slot detected after grace");

// the evaluator never writes or dispatches: it takes data and returns data
{
  const src = fs.readFileSync(path.join(process.cwd(), "api/_lib/source-health.js"), "utf8");
  assert.ok(!/fetch\(|require\(["']child_process|workflow_dispatch|repository_dispatch/.test(src), "source-health.js performs no I/O and dispatches nothing");
}
console.log("PASS evaluator is pure (no I/O, no dispatch)");

console.log("all source-health missed-schedule tests passed");
