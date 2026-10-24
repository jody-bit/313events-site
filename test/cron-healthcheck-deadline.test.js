// test/cron-healthcheck-deadline.test.js — healthchecks stopped recording after 2026-10-19 (Decision 7).
// A stalled check must be recorded as a failed check inside the run budget, and the registered-feed freshness
// check must run its feeds together, not one after another.
// Run: node test/cron-healthcheck-deadline.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
const hc = require(`${REPO_DIR}/api/cron-healthcheck.js`);

(async () => {
  // 1. no deadline set: a check behaves as before
  const ok = await hc.runCheck("fast", async () => "fine");
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.detail, "fine");
  const bad = await hc.runCheck("throws", async () => { throw new Error("boom"); });
  assert.deepStrictEqual([bad.ok, bad.detail], [false, "boom"]);

  // 2. a check that never answers is recorded as failed once the deadline passes
  hc._setCheckDeadline(Date.now() + 50);
  const t0 = Date.now();
  const hung = await hc.runCheck("hung", () => new Promise(() => {}));
  assert.strictEqual(hung.ok, false);
  assert.ok(/run budget/.test(hung.detail), hung.detail);
  assert.ok(Date.now() - t0 < 1000, "returned long after the deadline");
  // a check that answers before the deadline is untouched
  hc._setCheckDeadline(Date.now() + 500);
  assert.strictEqual((await hc.runCheck("quick", async () => "ok")).ok, true);
  hc._setCheckDeadline(null);

  // 3. feed freshness: 27 feeds, 40 ms per request. In series that is over 2 s; together it is about one feed's two requests.
  const feeds = Array.from({ length: 27 }, (_, i) => ({ id: `f${i}`, venue_name: `Venue ${i}` }));
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    await new Promise((r) => setTimeout(r, 40));
    const u = String(url);
    if (u.includes("/feed_sources?")) return { ok: true, json: async () => feeds };
    if (u.includes("feed_source_id=eq.f3&") && u.includes("updated_at=gte")) return { ok: true, json: async () => [] }; // f3 went quiet
    return { ok: true, json: async () => [{ id: "x" }] };
  };
  try {
    const started = Date.now();
    await assert.rejects(() => hc.checkFeedSourcesFreshness(7), /gone quiet 7d\+: Venue 3$/);
    assert.ok(Date.now() - started < 800, `feed freshness took ${Date.now() - started} ms; feeds are not running together`);
    // none stale: same text as before
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/feed_sources?")) return { ok: true, json: async () => feeds };
      return { ok: true, json: async () => [{ id: "x" }] };
    };
    assert.strictEqual(await hc.checkFeedSourcesFreshness(7), "27 approved feed(s) checked, none stale");
    // a feed that never pulled anything is not this check's concern
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/feed_sources?")) return { ok: true, json: async () => feeds.slice(0, 2) };
      return { ok: true, json: async () => [] };
    };
    assert.strictEqual(await hc.checkFeedSourcesFreshness(7), "2 approved feed(s) checked, none stale");
  } finally {
    global.fetch = realFetch;
  }
  console.log("ok: cron-healthcheck deadline and parallel feed freshness");
})().catch((e) => { console.error(e); process.exit(1); });
