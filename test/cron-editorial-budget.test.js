// test/cron-editorial-budget.test.js — minimal reliability fix for
// cron-editorial.js: timeout on each outlet feed fetch and a budget check
// between outlets. Existing write behaviour is untouched (same upsert, same
// later passes). Offline: fake fetch only.
// Run: node test/cron-editorial-budget.test.js
"use strict";
const assert = require("assert");
const REPO = process.cwd();
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
delete process.env.CRON_SECRET;

const HANG = () => new Promise(() => {}); // never settles, ignores the abort signal
const realNow = Date.now.bind(Date);

const RSS = (title, link) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>${title}</title><link>${link}</link><pubDate>Mon, 19 Oct 2026 12:00:00 GMT</pubDate><description>A festival is coming.</description></item></channel></rss>`;
const EMPTY_RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>`;

function setup(feedFn) {
  const feedCalls = [];
  const writes = [];
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || "GET";
    if (url.startsWith("https://example.supabase.co/")) {
      if (method !== "GET") writes.push({ url, method });
      return { ok: true, status: method === "GET" ? 200 : 201, json: async () => [], text: async () => "[]" };
    }
    feedCalls.push(url);
    return feedFn(url, feedCalls.length);
  };
  delete require.cache[require.resolve(`${REPO}/api/cron-editorial.js`)];
  return { handler: require(`${REPO}/api/cron-editorial.js`), feedCalls, writes };
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });
const xml = (body) => ({ ok: true, status: 200, text: async () => body });
const slow = (ms, body) => ({ ok: true, status: 200, text: async () => { await new Promise((r) => setTimeout(r, ms)); return body; } });
function reset() { for (const k of ["EDITORIAL_OUTLET_BUDGET_MS", "EDITORIAL_REQUEST_TIMEOUT_MS", "EDITORIAL_MIN_START_MS"]) delete process.env[k]; Date.now = realNow; }

(async () => {
  // 1. normal run: every outlet attempted once, nothing skipped, articles written exactly as before.
  {
    reset();
    const { handler, feedCalls, writes } = setup((url, n) => xml(n === 1 ? RSS("Fall Festival returns", "https://x.example/a1") : EMPTY_RSS));
    const res = makeRes(); await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200);
    const total = res._body.outletsChecked;
    assert.strictEqual(res._body.outletsAttempted, total);
    assert.strictEqual(feedCalls.length, total, "each outlet fetched exactly once");
    assert.deepStrictEqual(res._body.outletsDeferred, []);
    assert.deepStrictEqual(res._body.outletsTimedOut, []);
    assert.strictEqual(res._body.complete, true);
    assert.strictEqual(res._body.partial, false);
    assert.ok(writes.some((w) => w.url.includes("/rest/v1/editorial_articles") && w.method === "POST"), "the article upsert still happens");
    assert.strictEqual(res._body.results.length, total);
  }
  console.log("PASS: a normal run is unchanged in behaviour and reports complete");

  // 2. every feed hangs: each bounded by the per-request timeout, reported, later passes still run, no article written.
  {
    reset(); process.env.EDITORIAL_REQUEST_TIMEOUT_MS = "40";
    const { handler, feedCalls, writes } = setup(HANG);
    const res = makeRes(); const t0 = Date.now();
    await handler({ headers: {} }, res);
    const total = res._body.outletsChecked;
    assert.ok(Date.now() - t0 < total * 40 * 3 + 2000, "bounded by per-request timeouts");
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.outletsTimedOut.length, total);
    assert.strictEqual(res._body.partial, true);
    assert.strictEqual(res._body.complete, false);
    assert.strictEqual(feedCalls.length, total, "a timed-out feed is never retried");
    assert.ok(res._body.results.every((r) => /Timed out/.test(r.result)));
    assert.ok("retroactiveRematch" in res._body && "deepPressCoverageLinking" in res._body, "the later passes still run");
    assert.ok(!writes.some((w) => w.url.includes("/rest/v1/editorial_articles")), "no article written from unread feeds");
  }
  console.log("PASS: hung outlet feeds are bounded, reported, not retried, and the later passes still run");

  // 3. one hung feed does not stop the others.
  {
    reset(); process.env.EDITORIAL_REQUEST_TIMEOUT_MS = "40";
    const { handler, writes } = setup((url, n) => (n === 2 ? HANG() : xml(n === 3 ? RSS("Harvest festival preview", "https://x.example/a3") : EMPTY_RSS)));
    const res = makeRes(); await handler({ headers: {} }, res);
    assert.strictEqual(res._body.outletsTimedOut.length, 1);
    assert.strictEqual(res._body.outletsAttempted, res._body.outletsChecked);
    assert.ok(writes.some((w) => w.url.includes("/rest/v1/editorial_articles")), "the readable feeds are still ingested");
  }
  console.log("PASS: one hung feed does not prevent the other outlets from being ingested");

  // 4. budget exhausted between outlets: remaining outlets skipped (not fetched), reported, listed in results.
  {
    reset(); process.env.EDITORIAL_OUTLET_BUDGET_MS = "250"; process.env.EDITORIAL_MIN_START_MS = "60"; process.env.EDITORIAL_REQUEST_TIMEOUT_MS = "1000";
    const { handler, feedCalls } = setup(() => slow(70, EMPTY_RSS));
    const res = makeRes(); await handler({ headers: {} }, res);
    const total = res._body.outletsChecked;
    assert.ok(res._body.outletsDeferred.length > 0 && res._body.outletsAttempted > 0);
    assert.strictEqual(res._body.outletsAttempted + res._body.outletsDeferred.length, total);
    assert.strictEqual(feedCalls.length, res._body.outletsAttempted, "deferred outlets are never fetched");
    assert.strictEqual(res._body.results.length, total, "every outlet is accounted for");
    assert.strictEqual(res._body.results.filter((r) => r.result === "Skipped: run time budget reached").length, res._body.outletsDeferred.length);
    assert.strictEqual(res._body.partial, true);
    assert.ok("retroactiveRematch" in res._body, "the later passes still run");
  }
  console.log("PASS: budget exhaustion defers whole outlets, reports them, and fetches nothing further");

  // 5. rotation: the deferred set differs from one UTC day to the next, so the tail is not starved.
  {
    const deferredOn = async (dayOffset) => {
      reset(); process.env.EDITORIAL_OUTLET_BUDGET_MS = "250"; process.env.EDITORIAL_MIN_START_MS = "60"; process.env.EDITORIAL_REQUEST_TIMEOUT_MS = "1000";
      Date.now = () => realNow() + dayOffset * 86400000;
      const { handler } = setup(() => slow(70, EMPTY_RSS));
      const res = makeRes(); await handler({ headers: {} }, res);
      Date.now = realNow;
      return res._body.outletsDeferred.slice().sort().join("|");
    };
    const d0 = await deferredOn(0), d3 = await deferredOn(3);
    assert.notStrictEqual(d0, d3, "a different UTC day starts the outlet loop at a different outlet");
  }
  console.log("PASS: the outlet order rotates by UTC day");

  reset();
  console.log("\nAll cron-editorial budget tests passed.");
})().catch((e) => { console.error("FAIL:", e); process.exitCode = 1; });
