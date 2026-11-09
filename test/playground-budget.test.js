// test/playground-budget.test.js — reliability of cron-playgrounddetroit (#256 / Old Miami pattern):
// per-request timeout, run budget, partial reporting, partial upsert, no in-run retries,
// the 3 s crawl-delay kept between detail requests, and owner moderation status preserved.
// Offline: fake fetch, in-memory events store that applies merge-duplicates exactly.
// Run: node test/playground-budget.test.js
"use strict";
const assert = require("assert");
const path = require("path");
const REPO = process.cwd();

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
delete process.env.CRON_SECRET;

const HANG = () => new Promise(() => {}); // never settles, ignores the abort signal

function makeStore(seed) {
  const rows = new Map((seed || []).map((r) => [r.external_id, r]));
  const runs = [];
  const posts = [];
  const handle = (url, opts = {}) => {
    const method = opts.method || "GET";
    if (url.includes("/rest/v1/source_runs")) {
      if (method === "POST") { runs.push({ outcome: "started" }); return { ok: true, status: 201, json: async () => [{ id: "run-" + runs.length }] }; }
      if (method === "PATCH") { Object.assign(runs[runs.length - 1], JSON.parse(opts.body)); return { ok: true, status: 204, json: async () => ({}) }; }
    }
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && method === "GET") {
      return { ok: true, status: 200, json: async () => [...rows.values()].map((r) => ({ external_id: r.external_id, status: r.status })) };
    }
    if (url.includes("/rest/v1/events") && method === "POST") {
      const body = JSON.parse(opts.body);
      posts.push(body);
      for (const r of body) rows.set(r.external_id, { ...(rows.get(r.external_id) || {}), ...r });
      return { ok: true, status: 201, text: async () => "", json: async () => ({}) };
    }
    return null;
  };
  return { rows, runs, posts, handle };
}

function makeRes() {
  return { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
}
function fresh(file) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(REPO, "api") + path.sep)) delete require.cache[k];
  return require(path.join(REPO, "api", file));
}
const setEnv = (o) => Object.entries(o).forEach(([k, v]) => (process.env[k] = String(v)));
const clearEnv = (...ks) => ks.forEach((k) => delete process.env[k]);

// Date.now pinned to a day number that is a multiple of 60 so rotate() is the identity for <= 6 events.
function pinDay() {
  const real = Date.now;
  const t0 = real();
  const base = 60 * 86400000 * 100;
  Date.now = () => base + (real() - t0);
  return () => { Date.now = real; };
}

const LIST_URL = "https://playgrounddetroit.com/wp-json/wp/v2/mec-events";
const CAT_URL = "https://playgrounddetroit.com/wp-json/wp/v2/mec_category";
const eventUrl = (n) => `https://playgrounddetroit.com/events/e${n}/`;
const gcal = (n) => `<html><body><a href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;dates=2099010${n}T180000/2099010${n}T210000&amp;location=${encodeURIComponent("2845 Gratiot Ave, Detroit, MI 48207")}">Add</a></body></html>`;
const listFor = (ids) => ids.map((n) => ({ id: 700 + n, link: eventUrl(n), title: { rendered: `Event ${n}` }, excerpt: { rendered: "" }, mec_category: [] }));
const okText = (body, headers) => ({ ok: true, status: 200, headers: new Headers(headers || {}), text: async () => body, json: async () => JSON.parse(body) });

// pages: { n: "hang" | html } ; counts: requests per url ; stamps: request start times of event pages
function installFetch(store, ids, pages, counts, stamps) {
  global.fetch = async (url, opts) => {
    const h = store.handle(url, opts); if (h) return h;
    counts[url] = (counts[url] || 0) + 1;
    if (url.startsWith(LIST_URL)) return okText(JSON.stringify(listFor(ids)), { "x-wp-totalpages": "1" });
    if (url.startsWith(CAT_URL)) return okText("[]");
    const m = url.match(/\/events\/e(\d)\/$/);
    if (m) {
      stamps.push(Date.now());
      const page = pages[m[1]];
      if (page === "hang") return HANG();
      return okText(page);
    }
    return { ok: false, status: 404, headers: new Headers(), text: async () => "", json: async () => ({}) };
  };
}

async function run() {
  setEnv({ PLAYGROUND_REQUEST_TIMEOUT_MS: 60, PLAYGROUND_RUN_BUDGET_MS: 4000, PLAYGROUND_MIN_START_MS: 10, PLAYGROUND_CRAWL_DELAY_MS: 5 });
  const restoreNow = pinDay();
  try {
    // 1. normal run: complete, every event written, new rows get the source's default status
    {
      const handler = fresh("cron-playgrounddetroit.js");
      const store = makeStore();
      installFetch(store, [1, 2, 3], { 1: gcal(1), 2: gcal(2), 3: gcal(3) }, {}, []);
      const res = makeRes();
      await handler({ headers: {}, query: {} }, res);
      assert.strictEqual(res._status, 200);
      assert.strictEqual(res._body.upserted, 3);
      assert.deepStrictEqual([res._body.complete, res._body.partial, res._body.timedOut, res._body.deferred], [true, false, [], []]);
      assert.deepStrictEqual([...store.rows.values()].map((r) => r.status), ["approved", "approved", "approved"]);
    }
    console.log("PASS: a normal run is complete and writes every event");

    // 2. HUNG request: the run settles, the stalled page is reported and NOT retried, the other pages are still written
    {
      const handler = fresh("cron-playgrounddetroit.js");
      const store = makeStore();
      const counts = {};
      installFetch(store, [1, 2, 3], { 1: gcal(1), 2: "hang", 3: gcal(3) }, counts, []);
      const res = makeRes();
      const started = Date.now();
      await handler({ headers: {}, query: {} }, res);
      assert.ok(Date.now() - started < 2000, "a hung page cannot hold the run");
      assert.strictEqual(res._status, 200);
      assert.deepStrictEqual(res._body.timedOut, [702]);
      assert.strictEqual(res._body.partial, true);
      assert.strictEqual(res._body.upserted, 2);
      assert.deepStrictEqual([...store.rows.keys()].sort(), ["playgrounddetroit-701", "playgrounddetroit-703"]);
      assert.strictEqual(counts[eventUrl(2)], 1, "no in-run retry of the stalled page");
    }
    console.log("PASS: a hung request is bounded, reported as timed out, not retried, and the rest of the run still writes");

    // 3. three timeouts in a row: the source is down, the rest is deferred (not burned through)
    {
      const handler = fresh("cron-playgrounddetroit.js");
      const store = makeStore();
      const counts = {};
      installFetch(store, [1, 2, 3, 4, 5], { 1: "hang", 2: "hang", 3: "hang", 4: gcal(4), 5: gcal(5) }, counts, []);
      const res = makeRes();
      await handler({ headers: {}, query: {} }, res);
      assert.deepStrictEqual(res._body.timedOut, [701, 702, 703]);
      assert.deepStrictEqual(res._body.deferred, [704, 705]);
      assert.strictEqual(res._body.upserted, 0);
      assert.strictEqual(store.posts.length, 0, "nothing parsed means nothing written");
      assert.strictEqual(counts[eventUrl(4)], undefined);
    }
    console.log("PASS: three timeouts in a row defer the rest and write nothing");

    // 4. budget exhaustion + PARTIAL UPSERT: only the events read are written; deferred ones are neither written nor touched;
    //    an existing moderation status (owner lock) is preserved on the rows that were written
    {
      setEnv({ PLAYGROUND_RUN_BUDGET_MS: 250, PLAYGROUND_CRAWL_DELAY_MS: 120, PLAYGROUND_MIN_START_MS: 10 });
      const handler = fresh("cron-playgrounddetroit.js");
      const store = makeStore([
        { external_id: "playgrounddetroit-701", status: "rejected", title: "Owner rejected" },
        { external_id: "playgrounddetroit-704", status: "approved", title: "Untouched stored row" },
      ]);
      installFetch(store, [1, 2, 3, 4], { 1: gcal(1), 2: gcal(2), 3: gcal(3), 4: gcal(4) }, {}, []);
      const res = makeRes();
      await handler({ headers: {}, query: {} }, res);
      assert.strictEqual(res._status, 200);
      assert.strictEqual(res._body.partial, true);
      assert.ok(res._body.deferred.length >= 1, "the budget ran out before every page was read");
      assert.strictEqual(res._body.attempted + res._body.deferred.length, res._body.total);
      const written = new Set(store.posts.flat().map((r) => r.external_id));
      for (const id of res._body.deferred) assert.ok(!written.has(`playgrounddetroit-${id}`), "a deferred event is not written");
      assert.strictEqual(store.rows.get("playgrounddetroit-701").status, "rejected", "an owner-set status is preserved");
      assert.strictEqual(store.rows.get("playgrounddetroit-704").title, "Untouched stored row", "an unread stored row is left alone");
      assert.strictEqual(res._body.upserted, res._body.attempted);
    }
    console.log("PASS: budget exhaustion defers the tail, upserts only what was read, preserves moderation status and untouched rows");
    setEnv({ PLAYGROUND_RUN_BUDGET_MS: 4000, PLAYGROUND_CRAWL_DELAY_MS: 5 });

    // 5. the crawl-delay is kept between detail requests
    {
      setEnv({ PLAYGROUND_CRAWL_DELAY_MS: 80 });
      const handler = fresh("cron-playgrounddetroit.js");
      const store = makeStore();
      const stamps = [];
      installFetch(store, [1, 2, 3], { 1: gcal(1), 2: gcal(2), 3: gcal(3) }, {}, stamps);
      const res = makeRes();
      await handler({ headers: {}, query: {} }, res);
      assert.strictEqual(stamps.length, 3);
      assert.ok(stamps[1] - stamps[0] >= 75 && stamps[2] - stamps[1] >= 75, "requests are spaced by the crawl-delay");
      setEnv({ PLAYGROUND_CRAWL_DELAY_MS: 5 });
    }
    console.log("PASS: the crawl-delay between detail requests is kept");

    // 6. production defaults are unchanged: 3 s delay, 95 s budget inside the 120 s function limit
    {
      clearEnv("PLAYGROUND_REQUEST_TIMEOUT_MS", "PLAYGROUND_RUN_BUDGET_MS", "PLAYGROUND_MIN_START_MS", "PLAYGROUND_CRAWL_DELAY_MS");
      const src = require("fs").readFileSync(path.join(REPO, "api", "cron-playgrounddetroit.js"), "utf8");
      assert.ok(/const CRAWL_DELAY_MS = 3000;/.test(src), "crawl-delay stays 3 s");
      assert.ok(/const RUN_BUDGET_MS = 95000;/.test(src), "run budget stays inside the 120 s limit");
      const vercel = JSON.parse(require("fs").readFileSync(path.join(REPO, "vercel.json"), "utf8"));
      assert.strictEqual(vercel.functions["api/cron-playgrounddetroit.js"].maxDuration, 120);
    }
    console.log("PASS: production crawl-delay, budget and maxDuration are unchanged");
  } finally {
    restoreNow();
    clearEnv("PLAYGROUND_REQUEST_TIMEOUT_MS", "PLAYGROUND_RUN_BUDGET_MS", "PLAYGROUND_MIN_START_MS", "PLAYGROUND_CRAWL_DELAY_MS");
  }
}

run().then(() => console.log("playground-budget: all checks passed"), (e) => { console.error(e); process.exit(1); });
