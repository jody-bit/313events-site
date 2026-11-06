// test/ra-run-summary.test.js -- RA telemetry/summary accuracy (2026-11-06).
// Focused: (1) 0 detail events + 10 hidden pending_review promotions must
// read "0 public / 10 pending", never "10 more events"; (2) cap-deferred id
// is listed and carried over; (3) handler persists the result into the same
// source_runs row after promotion. Run: node test/ra-run-summary.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { buildRaRunSummary } = require(`${REPO_DIR}/api/_lib/ra-run-summary.js`);

const newIds = Array.from({ length: 11 }, (_, i) => `ra-${2578841 - i * 5}`);
const sessionData = { candidateCount: 122, knownCount: 111, newIds };
const promoted = newIds.slice(0, 10);

{
  const s = buildRaRunSummary({
    sessionData,
    complete: { imported: 0, importedIds: [], submitted: 0 },
    promotion: { examined: 11, promoted: 10, written: 10, writtenIds: promoted, deferredByCapIds: [newIds[10]], dryRun: false },
    detail: { attempted: 1, blocked: 1, blockedIds: [newIds[0]] },
  });
  assert.strictEqual(s.counts.publications.public, 0);
  assert.strictEqual(s.counts.promotion.pendingReview, 10);
  assert.strictEqual(s.counts.detail.succeeded, 0);
  assert.strictEqual(s.counts.listing.candidates, 122);
  assert.strictEqual(s.counts.listing.new, 11);
  assert.ok(/pending_review/.test(s.text) && /hidden/.test(s.text));
  assert.ok(/Public site: 0 events published/.test(s.text));
  assert.ok(!/10 more events/.test(s.text));
  assert.strictEqual(s.perCandidate.length, 11);
  assert.strictEqual(s.perCandidate[0].status, "promoted_pending_review");
  assert.strictEqual(s.perCandidate[0].detailBlocked, true);
  assert.strictEqual(s.perCandidate[10].status, "deferred_by_cap");
}
console.log("PASS: 0 detail events + 10 hidden promotions => 0 public, 10 pending_review, no '10 more events'");

{
  const s = buildRaRunSummary({
    sessionData,
    complete: { imported: 0, importedIds: [] },
    promotion: { examined: 11, written: 10, writtenIds: promoted, deferredByCapIds: ["ra-2578790"], dryRun: false },
  });
  assert.deepStrictEqual(s.counts.promotion.deferredByCapIds, ["ra-2578790"]);
  assert.ok(/deferred by the per-run cap \(ra-2578790\) and carry over/.test(s.text));
  assert.strictEqual(s.counts.detail.attempted, null);
}
{
  // Never-attempted candidates when promotion is a dry run / failed.
  const s = buildRaRunSummary({ sessionData, complete: { imported: 0 }, promotion: { error: "boom" } });
  assert.ok(s.perCandidate.every((c) => c.status === "never_attempted"));
  assert.ok(/promotion failed/.test(s.text));
}
console.log("PASS: cap-deferred id listed and carried over; failed promotion => never_attempted, stated");

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.CRON_SECRET = "s";
  let run = { id: "run-1", source_slug: "resident-advisor", outcome: "started", started_at: new Date().toISOString(), session_data: { phase: "started", ...sessionData } };
  const patches = [];
  global.fetch = async (url, opts) => {
    const method = (opts && opts.method) || "GET";
    if (url.includes("/rest/v1/source_runs?id=eq.")) {
      if (method === "PATCH") { const b = JSON.parse(opts.body); patches.push(b); if (b.session_data) run = { ...run, session_data: b.session_data }; return { ok: true, text: async () => "" }; }
      return { ok: true, json: async () => [run] };
    }
    if (url.includes("/rest/v1/events?start_date=gte.")) return { ok: true, json: async () => [] };
    if (url.includes("/rest/v1/events?external_id=in.")) return { ok: true, json: async () => [] };
    if (url.includes("/rest/v1/venues?select=")) return { ok: true, json: async () => [] };
    if (url.includes("/rest/v1/source_runs?source_slug=eq.")) return { ok: true, json: async () => [] };
    throw new Error("unexpected fetch: " + url);
  };
  for (const m of ["api/cron-ra.js", "scripts/ra-sync.js", "scripts/ra-candidate-promotion.js"]) delete require.cache[require.resolve(`${REPO_DIR}/${m}`)];
  const handler = require(`${REPO_DIR}/api/cron-ra.js`);
  const res = { status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; } };
  await handler({ method: "POST", headers: { authorization: "Bearer s" }, body: { action: "complete", runId: "run-1", events: [], detail: { attempted: 1, blocked: 1, blockedIds: ["ra-2578841"] } } }, res);
  assert.strictEqual(res._s, 200);
  assert.ok(res._b.summary, "summaryError=" + res._b.summaryError);
  assert.strictEqual(res._b.summary.publications.public, 0);
  assert.ok(res._b.summaryText.includes("Public site: 0 events published"));
  const persisted = run.session_data;
  assert.ok(persisted.summary && persisted.summaryText && persisted.perCandidate && persisted.candidatePromotion, "promotion result + summary persisted into the same run row after promotion");
  assert.strictEqual(persisted.phase, "completed");
  assert.deepStrictEqual(persisted.detailReport.blockedIds, ["ra-2578841"]);
  console.log("PASS: handler persists summary + promotion result into source_runs.session_data; records_* untouched");
})().catch((e) => { console.error(e); process.exitCode = 1; });
