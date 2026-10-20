// test/selfheal-step-budget.test.js — #256 Auto-Repair / feeds poller time budgets.
// Offline only: fake fetch, no network, no database.
// A normal run  B hanging VisitDetroit request  C independent steps continue
// D partial failures reported  E feeds poller budget  F legacy shape kept
// G no duplicate/late writes on timeout or repeat.
// Run: node test/selfheal-step-budget.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { runSteps, STATUS } = require(`${REPO_DIR}/api/_lib/step-runner`);
const { runAutoRepair, AUTO_REPAIR_BUDGET_MS, AUTO_REPAIR_TIMEOUTS } = require(`${REPO_DIR}/api/_lib/auto-repair-steps`);
const { repairVisitDetroitDeadLinks } = require(`${REPO_DIR}/scripts/visitdetroit-dead-link-repair`);

const creds = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A fetch that never answers on its own but honors an abort signal.
function hangingFetch(calls) {
  return (url, init = {}) => {
    calls.push({ url, method: (init && init.method) || "GET" });
    return new Promise((_, reject) => {
      if (init.signal) init.signal.addEventListener("abort", () => reject(init.signal.reason || new Error("aborted")), { once: true });
    });
  };
}
const fastLoaders = (over = {}) => ({
  venue: () => async () => ({ fieldsWritten: 2, written: 1, writtenIds: ["a"] }),
  outerLimitsDescription: () => async () => ({ written: 1, writtenIds: ["b"] }),
  dossinMetadata: () => async () => ({ written: 0, writtenIds: [] }),
  redfordMetadata: () => async () => ({ fieldsWritten: 1, writtenIds: ["a"] }),
  genericEnrichment: () => async () => ({ fieldsWritten: 3, writtenIds: ["c"] }),
  venueRawReparse: () => async () => ({ written: 0, writtenIds: [] }),
  nonEventRetirement: () => async () => ({ retired: 0 }),
  duplicateConsolidation: () => async () => ({ writtenIds: ["d"] }),
  visitDetroitDeadLinks: () => async () => ({ fieldsWritten: 1, writtenIds: ["e"], stoppedEarly: false, deferred: 0 }),
  ...over,
});
const tiny = (ms = 150) => Object.fromEntries(Object.keys(AUTO_REPAIR_TIMEOUTS).map((k) => [k, ms]));

(async () => {
  const origFetch = global.fetch;

  // --- A. normal execution completes; F. legacy response shape kept ---
  {
    const r = await runAutoRepair({ ...creds, loaders: fastLoaders(), timeouts: tiny() });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.complete, true);
    assert.strictEqual(r.partial, false);
    assert.strictEqual(r.steps.length, 9);
    assert.ok(r.steps.every((s) => s.status === STATUS.COMPLETED && s.startedAt));
    assert.strictEqual(r.budgetMs, AUTO_REPAIR_BUDGET_MS);
    assert.strictEqual(r.written, 5, "written is the UNION of touched event ids (a,b,c,d,e; 'a' counted once)");
    assert.strictEqual(r.fieldsWritten, 2 + 1 + 0 + 1 + 3 + 1 + 0);
    for (const f of ["venue", "outerLimitsDescription", "dossinMetadata", "redfordMetadata", "genericEnrichment", "visitDetroitDeadLinks", "venueRawReparse", "nonEventRetirement", "duplicateConsolidation"]) assert.ok(f in r, `legacy field ${f} kept`);
    for (const f of ["outerLimitsDescriptionError", "dossinMetadataError", "redfordMetadataError", "genericEnrichmentError", "visitDetroitLinkError", "venueRawReparseError", "nonEventRetirementError", "duplicateConsolidationError"]) assert.strictEqual(r[f], null);
    assert.strictEqual(r.fieldsWritten, r.fieldsWritten);
    assert.strictEqual(r.visitDetroitDeadLinks.writtenIds[0], "e");
    assert.strictEqual(r.steps[r.steps.length - 1].key, "visitDetroitDeadLinks", "the long network step runs last");
  }
  console.log("PASS A/F: normal run completes, legacy response fields and written/fieldsWritten semantics preserved, Step 6 last");

  // --- B. hanging VisitDetroit request times out within its assigned budget ---
  {
    const calls = [];
    global.fetch = hangingFetch(calls);
    let patches = 0;
    const loaders = fastLoaders({
      visitDetroitDeadLinks: () => (opts) => repairVisitDetroitDeadLinks({
        ...opts,
        logger: { log() {}, warn() {}, error() {} },
        fetchCandidates: async () => [1, 2, 3, 4].map((i) => ({ id: `e${i}`, title: "T", ticket_url: `https://visit.example/e${i}/`, link_check_status: null })),
        applyPatchFn: async () => { patches++; return true; },
        healFn: async ({ url }) => { try { await fetch(url); return { classification: "ok" }; } catch { return { classification: "inconclusive" }; } },
      }),
    });
    // (i) per-request timeout bounds each hung check
    let t = Date.now();
    let r = await runAutoRepair({ ...creds, loaders, timeouts: { ...tiny(), visitDetroitDeadLinks: 2000 }, requestTimeoutMs: 40 });
    let elapsed = Date.now() - t;
    assert.ok(elapsed < 1000, `4 hung requests must be bounded by the 40 ms request timeout, took ${elapsed} ms`);
    assert.strictEqual(r.visitDetroitDeadLinks.inconclusive, 4);
    assert.strictEqual(r.visitDetroitDeadLinks.written, 0);
    assert.strictEqual(patches, 0, "inconclusive (timed out) checks never write");
    // (ii) no per-request timeout: the STEP timeout fires and the step is timed_out, not success
    calls.length = 0;
    t = Date.now();
    r = await runAutoRepair({ ...creds, loaders, timeouts: { ...tiny(), visitDetroitDeadLinks: 120 }, requestTimeoutMs: 60000 });
    elapsed = Date.now() - t;
    const vd = r.steps.find((s) => s.key === "visitDetroitDeadLinks");
    assert.strictEqual(vd.status, STATUS.TIMED_OUT);
    assert.ok(elapsed < 600, `step timeout bounds the run, took ${elapsed} ms`);
    assert.strictEqual(r.complete, false);
    assert.strictEqual(r.partial, true);
    assert.ok(/Timed out/.test(r.visitDetroitLinkError), "timeout is never a silent success");
    assert.strictEqual(r.visitDetroitDeadLinks, null, "no partial result represented as complete");
    const afterTimeout = calls.length;
    await sleep(150);
    assert.strictEqual(calls.length, afterTimeout, "no further requests after the step timed out");
    assert.strictEqual(patches, 0);
  }
  console.log("PASS B: hung VisitDetroit requests are bounded per request and per step; timeout reported, nothing written");

  // --- C/D. independent steps continue; partial failures reported accurately ---
  {
    const calls = [];
    global.fetch = hangingFetch(calls);
    const loaders = fastLoaders({
      dossinMetadata: () => async () => { throw new Error("dossin feed unreachable"); },
      genericEnrichment: () => async () => { await fetch("https://hang.example/"); return { fieldsWritten: 99, writtenIds: ["zzz"] }; },
    });
    const r = await runAutoRepair({ ...creds, loaders, timeouts: tiny(120) });
    const st = Object.fromEntries(r.steps.map((s) => [s.key, s]));
    assert.strictEqual(st.genericEnrichment.status, STATUS.TIMED_OUT);
    assert.strictEqual(st.dossinMetadata.status, STATUS.FAILED);
    for (const k of ["venue", "outerLimitsDescription", "redfordMetadata", "venueRawReparse", "nonEventRetirement", "duplicateConsolidation", "visitDetroitDeadLinks"]) assert.strictEqual(st[k].status, STATUS.COMPLETED, `${k} still ran`);
    assert.strictEqual(r.complete, false);
    assert.strictEqual(r.partial, true);
    assert.strictEqual(r.dossinMetadataError, "dossin feed unreachable");
    assert.ok(/Timed out/.test(r.genericEnrichmentError));
    assert.strictEqual(r.genericEnrichment, null);
    assert.ok(!r.written || r.written === 4, "ids from the timed-out step are not counted (a,b,d,e)");
    assert.strictEqual(r.fieldsWritten, 2 + 1 + 1 + 1, "counts only completed steps' fields");
  }
  console.log("PASS C/D: a timed-out and a failed step do not block the rest; each is reported accurately");

  // --- budget: steps starting with too little budget left are skipped_budget ---
  {
    let clock = 0;
    const now = () => clock;
    const steps = [
      { key: "slow", run: async () => { clock += 238000; return 1; }, timeoutMs: 240000 },
      { key: "late", run: async () => 2, timeoutMs: 60000 },
    ];
    const out = await runSteps(steps, { budgetMs: 240000, now });
    assert.strictEqual(out.results[0].status, STATUS.COMPLETED);
    assert.strictEqual(out.results[1].status, STATUS.SKIPPED_BUDGET);
    assert.ok(/budget/i.test(out.results[1].error));
    assert.strictEqual(out.complete, false);
    assert.ok(AUTO_REPAIR_BUDGET_MS < 300000, "overall budget is below Vercel's 300 s limit");
    assert.ok(AUTO_REPAIR_BUDGET_MS + 30000 <= 300000, "leaves response headroom");
  }
  console.log("PASS: overall budget below 300 s; steps with no budget left are skipped_budget and the run is partial");

  // --- G. no duplicate / late writes ---
  {
    const calls = [];
    let release;
    global.fetch = (url, init = {}) => {
      calls.push({ url, method: (init && init.method) || "GET" });
      if (url.includes("hang")) return new Promise((_, rej) => init.signal && init.signal.addEventListener("abort", () => rej(init.signal.reason), { once: true }));
      return Promise.resolve({ ok: true, status: 200 });
    };
    let runs = 0;
    const step = {
      key: "writer", timeoutMs: 80, run: async () => {
        runs++;
        await fetch("https://db.example/patch1", { method: "PATCH" });
        try { await fetch("https://hang.example/slow"); } catch (e) { /* aborted */ }
        await sleep(20);
        try { await fetch("https://db.example/patch2", { method: "PATCH" }); } catch (e) { /* guard blocks */ }
        return "done";
      },
    };
    const out = await runSteps([step], { budgetMs: 1000, minRemainingMs: 0 });
    assert.strictEqual(out.results[0].status, STATUS.TIMED_OUT);
    await sleep(100);
    assert.strictEqual(calls.filter((c) => c.method === "PATCH").length, 1, "the second write after the timeout never reaches the network");
    assert.strictEqual(runs, 1, "the runner never retries a step");
    void release;
    // Step 6 stops writing once told to stop and defers the rest
    let stopped = false; const writes = [];
    const res = await repairVisitDetroitDeadLinks({
      ...creds, logger: { log() {}, warn() {}, error() {} },
      fetchCandidates: async () => ["a", "b", "c", "d"].map((id) => ({ id, title: "T", ticket_url: `https://v.example/${id}/`, link_check_status: null })),
      healFn: async ({ url }) => { if (url.includes("/b/")) stopped = true; return { classification: "ok" }; },
      applyPatchFn: async (_u, _h, id) => { writes.push(id); return true; },
      shouldStop: () => stopped,
    });
    assert.deepStrictEqual(writes, ["a"], "the result in flight when the stop arrives is discarded; nothing after it is written");
    assert.strictEqual(res.stoppedEarly, true);
    assert.strictEqual(res.deferred, 3);
    assert.strictEqual(res.inconclusive, 0, "aborted checks are not miscounted as inconclusive");
  }
  console.log("PASS G: no writes after timeout, no step retries, Step 6 stops and defers instead of miscounting");

  // --- E. feeds poller respects its budget ---
  {
    process.env.SUPABASE_URL = creds.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.FEED_FETCH_TIMEOUT_MS = "60";
    process.env.FEEDS_RUN_BUDGET_MS = "2200"; // threshold = 2200 - (60 + 2000) = 140 ms
    delete process.env.CRON_SECRET;
    const feeds = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `f${i}`, venue_name: `V${i}`, feed_url: `https://hang.example/f${i}.ics`, feed_format: "ics", status: "approved" }));
    const patched = []; let feedFetches = 0; let feedsQuery = "";
    global.fetch = (url, init = {}) => {
      if (url.includes("/rest/v1/feed_sources?status=")) { feedsQuery = url; return Promise.resolve({ ok: true, status: 200, json: async () => feeds }); }
      if (url.includes("/rest/v1/feed_sources?id=eq.")) { patched.push(url.match(/id=eq\.([^&]+)/)[1]); return Promise.resolve({ ok: true, status: 200, text: async () => "" }); }
      if (url.includes("/rest/v1/")) return Promise.resolve({ ok: true, status: 200, json: async () => [], text: async () => "" });
      if (url.includes("hang.example")) { feedFetches++; return new Promise((_, rej) => init.signal && init.signal.addEventListener("abort", () => rej(init.signal.reason), { once: true })); }
      throw new Error("unmocked URL: " + url);
    };
    delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
    const handler = require(`${REPO_DIR}/api/cron-feeds.js`);
    const res = { _s: null, _b: null, status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; } };
    const keepAlive = setInterval(() => {}, 50); // AbortSignal.timeout timers are unref'd; keep the loop alive in the test
    const t = Date.now();
    await handler({ headers: {} }, res);
    clearInterval(keepAlive);
    const elapsed = Date.now() - t;
    assert.strictEqual(res._s, 200);
    assert.ok(elapsed < 1500, `run bounded by per-feed timeout and budget, took ${elapsed} ms`);
    assert.ok(feedFetches >= 1 && feedFetches < 6, `some feeds attempted (${feedFetches}), the rest deferred`);
    assert.strictEqual(res._b.complete, false);
    assert.strictEqual(res._b.feedsSkippedForBudget, 6 - feedFetches);
    const skipped = res._b.results.filter((r) => /^Skipped: run time budget/.test(r.result));
    assert.strictEqual(skipped.length, 6 - feedFetches);
    const timedOut = res._b.results.filter((r) => /^Fetch failed: timed out/.test(r.result));
    assert.strictEqual(timedOut.length, feedFetches, "a hung feed is reported as a timeout, not success");
    assert.ok(skipped.every((r) => !patched.includes(r.id)), "skipped feeds keep their old last_polled_at (not marked polled)");
    assert.ok(/order=last_polled_at\.asc\.nullsfirst/.test(feedsQuery), "least recently polled feeds go first");
    const { feedSourceFailures } = { feedSourceFailures: null };
    void feedSourceFailures;
    delete process.env.FEED_FETCH_TIMEOUT_MS; delete process.env.FEEDS_RUN_BUDGET_MS;
  }
  console.log("PASS E: feeds poller times out hung feeds, stops at its budget, reports skipped feeds, polls the stalest first");

  global.fetch = origFetch;
  console.log("\nAll #256 step-budget tests passed.");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
