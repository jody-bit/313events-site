// test/cron-eventbrite-budget.test.js — reliability of cron-eventbrite.js
// (per-request timeout, run budget, accurate partial reporting, no loss of
// verified data, no duplicates, no retries). Offline: fake fetch only.
// Run: node test/cron-eventbrite-budget.test.js
"use strict";
const assert = require("assert");
const REPO = process.cwd();
const TOKEN_ENV = "EVENTBRITE_TOKEN_FLORIANEAST";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
delete process.env.CRON_SECRET;
process.env[TOKEN_ENV] = "fake-token";

const HANG = () => new Promise(() => {}); // never settles, ignores the abort signal
const day = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

function ebEvent(id) {
  return {
    id, name: { text: "Event " + id }, description: { text: "Desc " + id }, url: "https://www.eventbrite.com/e/" + id,
    start: { timezone: "America/Detroit", local: day + "T19:00:00", utc: day + "T23:00:00Z" },
    end: { timezone: "America/Detroit", local: day + "T22:00:00", utc: day + "T02:00:00Z" },
    status: "live", currency: "USD", online_event: false, is_series: false, is_series_parent: false, is_free: false,
    logo: null, organizer_id: "105186308861", venue: { id: "V1", name: "Florian East Lagers & Ales" },
  };
}
const page = (events, continuation) => ({
  pagination: { has_more_items: !!continuation, continuation: continuation || null }, events,
});

function setup(sourceFn) {
  const runs = [];
  const posts = [];
  const sourceCalls = [];
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || "GET";
    if (url.includes("eventbriteapi.com/v3/organizations/")) { sourceCalls.push(url); return sourceFn(url, sourceCalls.length); }
    if (url.includes("/rest/v1/source_runs")) {
      if (method === "POST") { runs.push({ outcome: "started" }); return { ok: true, status: 201, json: async () => [{ id: "run-1" }] }; }
      Object.assign(runs[runs.length - 1], JSON.parse(opts.body));
      return { ok: true, status: 204, json: async () => ({}) };
    }
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && method === "GET") return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && method === "POST") {
      const body = JSON.parse(opts.body);
      const ids = body.map((r) => r.external_id);
      assert.strictEqual(new Set(ids).size, ids.length, "no duplicate external_id in a request");
      posts.push(body);
      return { ok: true, status: 201, text: async () => "", json: async () => ({}) };
    }
    throw new Error("unmocked URL " + url);
  };
  delete require.cache[require.resolve(`${REPO}/api/cron-eventbrite.js`)];
  return { handler: require(`${REPO}/api/cron-eventbrite.js`), runs, posts, sourceCalls };
}
function makeRes() {
  return { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
}
const ok = (data, delay = 0) => ({ ok: true, status: 200, json: async () => { if (delay) await new Promise((r) => setTimeout(r, delay)); return data; } });

(async () => {
  // 1. normal run: complete, not partial, report present.
  {
    delete process.env.EVENTBRITE_REQUEST_TIMEOUT_MS; delete process.env.EVENTBRITE_RUN_BUDGET_MS;
    const { handler, runs, posts } = setup(() => ok(page([ebEvent("a"), ebEvent("b")])));
    const res = makeRes(); await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 2);
    assert.strictEqual(res._body.complete, true);
    assert.strictEqual(res._body.partial, false);
    assert.strictEqual(res._body.attempted, 1);
    assert.deepStrictEqual(res._body.timedOut, []);
    assert.strictEqual(res._body.budgetMs, 45000);
    assert.strictEqual(runs[0].outcome, "success");
    assert.strictEqual(posts.length, 1);
  }
  console.log("PASS: a normal run is complete and reports its budget");

  // 2. first page hangs: bounded, reported as timed out, partial run, nothing written, one call (no retry).
  {
    process.env.EVENTBRITE_REQUEST_TIMEOUT_MS = "60";
    const { handler, runs, posts, sourceCalls } = setup(HANG);
    const res = makeRes(); const t0 = Date.now();
    await handler({ headers: {} }, res);
    assert.ok(Date.now() - t0 < 2000, "a hung request is bounded by the per-request timeout");
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._body.timedOut, ["105186308861"]);
    assert.strictEqual(res._body.complete, false);
    assert.strictEqual(res._body.partial, true);
    assert.strictEqual(res._body.failed.length, 1);
    assert.strictEqual(runs[0].outcome, "partial");
    assert.strictEqual(posts.length, 0, "nothing to write, nothing written");
    assert.strictEqual(sourceCalls.length, 1, "a timed-out request is never retried");
  }
  console.log("PASS: a hung first page is bounded, reported as timed out, and not retried");

  // 3. page 2 hangs: verified page-1 events are still written once; run is partial.
  {
    process.env.EVENTBRITE_REQUEST_TIMEOUT_MS = "60";
    const { handler, runs, posts, sourceCalls } = setup((url, n) => (n === 1 ? ok(page([ebEvent("p1")], "c2")) : HANG()));
    const res = makeRes(); await handler({ headers: {} }, res);
    assert.strictEqual(res._body.upserted, 1);
    assert.strictEqual(posts.length, 1);
    assert.strictEqual(posts[0][0].external_id, "eventbrite-p1", "page-1 events are kept, no loss of verified data");
    assert.deepStrictEqual(res._body.timedOut, ["105186308861"]);
    assert.strictEqual(res._body.partial, true);
    assert.strictEqual(runs[0].outcome, "partial");
    assert.strictEqual(sourceCalls.length, 2);
  }
  console.log("PASS: a hang on a later page keeps the verified earlier pages and reports partial");

  // 4. body read hangs (headers arrive, json() never settles): still bounded.
  {
    process.env.EVENTBRITE_REQUEST_TIMEOUT_MS = "60";
    const { handler, res } = (() => { const s = setup(() => ({ ok: true, status: 200, json: HANG })); return { handler: s.handler, res: makeRes() }; })();
    const t0 = Date.now(); await handler({ headers: {} }, res);
    assert.ok(Date.now() - t0 < 2000);
    assert.deepStrictEqual(res._body.timedOut, ["105186308861"]);
  }
  console.log("PASS: a stalled response body is bounded too");

  // 5. run budget exhausted between pages: later pages deferred, not requested; earlier events kept.
  {
    process.env.EVENTBRITE_REQUEST_TIMEOUT_MS = "1000";
    process.env.EVENTBRITE_RUN_BUDGET_MS = "400";
    process.env.EVENTBRITE_MIN_START_MS = "150";
    const { handler, runs, posts, sourceCalls } = setup((url, n) => ok(page([ebEvent("s" + n)], "c" + (n + 1)), 120));
    const res = makeRes(); await handler({ headers: {} }, res);
    assert.ok(sourceCalls.length >= 1 && sourceCalls.length < 10, "stopped by the budget, not by MAX_PAGES (" + sourceCalls.length + ")");
    assert.deepStrictEqual(res._body.deferred, ["105186308861"]);
    assert.strictEqual(res._body.partial, true);
    assert.strictEqual(res._body.upserted, sourceCalls.length, "every fetched event is written exactly once");
    assert.strictEqual(runs[0].outcome, "partial");
    assert.strictEqual(posts.length, 1);
    delete process.env.EVENTBRITE_RUN_BUDGET_MS; delete process.env.EVENTBRITE_MIN_START_MS;
  }
  console.log("PASS: budget exhaustion defers remaining pages, keeps fetched events, reports deferred");

  // 6. non-OK still reports as a plain failure (not a timeout).
  {
    process.env.EVENTBRITE_REQUEST_TIMEOUT_MS = "500";
    const { handler, runs } = setup(() => ({ ok: false, status: 503, json: async () => ({}) }));
    const res = makeRes(); await handler({ headers: {} }, res);
    assert.deepStrictEqual(res._body.timedOut, []);
    assert.ok(res._body.failed[0].error.includes("503"));
    assert.strictEqual(runs[0].outcome, "partial");
  }
  console.log("PASS: an HTTP error is a failure, not a timeout");

  console.log("\nAll cron-eventbrite budget tests passed.");
})().catch((e) => { console.error("FAIL:", e); process.exitCode = 1; });
