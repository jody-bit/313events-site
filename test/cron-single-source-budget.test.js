// test/cron-single-source-budget.test.js — reliability of cron-oldmiami and
// cron-redford-theatre (per-request timeout, run budget, partial reporting,
// deferred-work recovery, no loss of verified data, no retries).
// Offline: fake fetch, in-memory events store that applies merge-duplicates
// exactly (absent key keeps the stored value, present null writes NULL).
// Run: node test/cron-single-source-budget.test.js
"use strict";
const assert = require("assert");
const path = require("path");
const REPO = process.cwd();

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
delete process.env.CRON_SECRET;

const HANG = () => new Promise(() => {}); // never settles, ignores the abort signal

function makeStore() {
  const rows = new Map();
  const runs = [];
  const events = { posts: [] };
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
      events.posts.push(body);
      const ids = body.map((r) => r.external_id);
      assert.strictEqual(new Set(ids).size, ids.length, "no duplicate external_id inside one request");
      for (const r of body) rows.set(r.external_id, { ...(rows.get(r.external_id) || {}), ...r });
      return { ok: true, status: 201, text: async () => "", json: async () => ({}) };
    }
    return null;
  };
  return { rows, runs, events, handle };
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

// Date.now pinned to a day number that is a multiple of 6 so rotate() is the identity for <= 6 slugs.
function pinDay() {
  const real = Date.now;
  const t0 = real();
  const base = 6 * 86400000 * 1000;
  Date.now = () => base + (real() - t0);
  return () => { Date.now = real; };
}

// ---------------- Old Miami ----------------
const OM_VENUE = "https://rockindetroit.com/venue/old-miami/";
const omVenuePage = (slugs) => slugs.map((s) => `<a href="https://rockindetroit.com/events/${s}/">x</a>`).join("");
const omEventPage = (title) =>
  `<div>Old Miami</div><div>Presents:</div><div>${title}</div><div>Bands</div><div>Band ${title}</div><div>Date</div><div>12/31/2099</div><div>Start Time</div><div>8:00 pm</div>`;

async function oldMiami() {
  setEnv({ OLDMIAMI_REQUEST_TIMEOUT_MS: 60, OLDMIAMI_RUN_BUDGET_MS: 2000, OLDMIAMI_MIN_START_MS: 10 });
  const restoreNow = pinDay();
  try {
    // 1. normal run is complete
    {
      const handler = fresh("cron-oldmiami.js");
      const store = makeStore();
      global.fetch = async (url, opts) => {
        const h = store.handle(url, opts); if (h) return h;
        if (url === OM_VENUE) return { ok: true, status: 200, text: async () => omVenuePage(["a", "b", "c"]) };
        const slug = url.split("/events/")[1].replace("/", "");
        return { ok: true, status: 200, text: async () => omEventPage("T-" + slug) };
      };
      const res = makeRes();
      await handler({ headers: {} }, res);
      assert.strictEqual(res._status, 200);
      assert.strictEqual(res._body.upserted, 3);
      assert.strictEqual(res._body.complete, true);
      assert.strictEqual(res._body.partial, false);
      assert.strictEqual(store.runs[0].outcome, "success");
    }
    console.log("PASS oldmiami: normal run complete, run row success");

    // 2. one hung event page: bounded, others written, reported as partial, never retried
    {
      const handler = fresh("cron-oldmiami.js");
      const store = makeStore();
      const hits = {};
      global.fetch = async (url, opts) => {
        const h = store.handle(url, opts); if (h) return h;
        hits[url] = (hits[url] || 0) + 1;
        if (url === OM_VENUE) return { ok: true, status: 200, text: async () => omVenuePage(["a", "hang", "c"]) };
        if (url.includes("/hang/")) return HANG();
        const slug = url.split("/events/")[1].replace("/", "");
        return { ok: true, status: 200, text: async () => omEventPage("T-" + slug) };
      };
      const t0 = Date.now();
      const res = makeRes();
      await handler({ headers: {} }, res);
      assert.ok(Date.now() - t0 < 1500, "hung request bounded by the per-request timeout");
      assert.strictEqual(res._body.upserted, 2);
      assert.deepStrictEqual(res._body.timedOut, ["hang"]);
      assert.strictEqual(res._body.complete, false);
      assert.strictEqual(res._body.partial, true);
      assert.strictEqual(store.runs[0].outcome, "partial");
      assert.strictEqual(hits["https://rockindetroit.com/events/hang/"], 1, "no retry within a run");
      assert.ok(store.rows.has("oldmiami-a") && store.rows.has("oldmiami-c") && !store.rows.has("oldmiami-hang"));
    }
    console.log("PASS oldmiami: hung event page bounded, partial reported, no retry, others written");

    // 3. source down: three consecutive timeouts defer the rest instead of burning the budget
    {
      const handler = fresh("cron-oldmiami.js");
      const store = makeStore();
      global.fetch = async (url, opts) => {
        const h = store.handle(url, opts); if (h) return h;
        if (url === OM_VENUE) return { ok: true, status: 200, text: async () => omVenuePage(["h1", "h2", "h3", "d1", "d2"]) };
        if (/\/events\/h\d\//.test(url)) return HANG();
        return { ok: true, status: 200, text: async () => omEventPage("T") };
      };
      const t0 = Date.now();
      const res = makeRes();
      await handler({ headers: {} }, res);
      assert.ok(Date.now() - t0 < 1000);
      assert.deepStrictEqual(res._body.timedOut, ["h1", "h2", "h3"]);
      assert.deepStrictEqual(res._body.deferred, ["d1", "d2"]);
      assert.strictEqual(res._body.upserted, 0);
      assert.strictEqual(store.runs[0].outcome, "failed", "nothing readable -> failed, not success");
      assert.strictEqual(store.events.posts.length, 0, "no write when nothing was read");
    }
    console.log("PASS oldmiami: consecutive timeouts defer the rest; nothing written; run row failed");

    // 4. budget exhaustion defers; next run recovers; no duplicates; earlier data survives
    {
      setEnv({ OLDMIAMI_RUN_BUDGET_MS: 220, OLDMIAMI_REQUEST_TIMEOUT_MS: 150, OLDMIAMI_MIN_START_MS: 40 });
      const store = makeStore();
      let slow = true;
      const mk = () => async (url, opts) => {
        const h = store.handle(url, opts); if (h) return h;
        if (url === OM_VENUE) return { ok: true, status: 200, text: async () => omVenuePage(["s1", "s2", "s3", "s4", "s5", "s6"]) };
        if (slow) await new Promise((r) => setTimeout(r, 90));
        const slug = url.split("/events/")[1].replace("/", "");
        return { ok: true, status: 200, text: async () => omEventPage("T-" + slug) };
      };
      global.fetch = mk();
      const res1 = makeRes();
      await fresh("cron-oldmiami.js")({ headers: {} }, res1);
      assert.ok(res1._body.deferred.length >= 1, "some pages deferred when the budget is spent");
      assert.strictEqual(res1._body.partial, true);
      assert.strictEqual(res1._body.upserted + res1._body.deferred.length, 6, "every slug is written or reported deferred");
      assert.strictEqual(store.runs[0].outcome, "partial");
      const firstWritten = new Set(store.rows.keys());

      slow = false;
      setEnv({ OLDMIAMI_RUN_BUDGET_MS: 2000 });
      const res2 = makeRes();
      await fresh("cron-oldmiami.js")({ headers: {} }, res2);
      assert.strictEqual(res2._body.complete, true);
      assert.strictEqual(store.rows.size, 6, "recovery run completes the set with no duplicate rows");
      for (const id of firstWritten) assert.ok(store.rows.has(id));
      assert.strictEqual(store.runs[1].outcome, "success");
    }
    console.log("PASS oldmiami: budget exhaustion defers; recovery run completes the set without duplicates");

    // 5. venue page hang: bounded, run fails with the existing error shape
    {
      const store = makeStore();
      global.fetch = async (url, opts) => store.handle(url, opts) || HANG();
      const res = makeRes();
      const t0 = Date.now();
      await fresh("cron-oldmiami.js")({ headers: {} }, res);
      assert.ok(Date.now() - t0 < 1500);
      assert.strictEqual(res._body.upserted, 0);
      assert.ok(/Venue page fetch failed: Timed out/.test(res._body.error));
      assert.strictEqual(store.runs[0].outcome, "failed");
    }
    console.log("PASS oldmiami: hung venue page bounded and reported");
  } finally {
    restoreNow();
    clearEnv("OLDMIAMI_REQUEST_TIMEOUT_MS", "OLDMIAMI_RUN_BUDGET_MS", "OLDMIAMI_MIN_START_MS");
  }
}

// ---------------- Redford ----------------
const RT_SOURCE = "https://redfordtheatre.com/events/";
const rtLi = (n) =>
  `<li><a href="https://redfordtheatre.com/events/film-${n}/"><div class="featureBottom"><h3>Film Number ${n} (1985)</h3><p>Friday, December 11 at 8:00 PM</p></div></a></li>`;
const rtArchive = (n) => Array.from({ length: n }, (_, i) => rtLi(i + 1)).join("");
const rtDetail = (n) =>
  `<div class="eventDesc">Verified description ${n}</div><a href="https://tickets.example/${n}">Buy Tickets</a>`;

async function redford() {
  setEnv({ REDFORD_ARCHIVE_TIMEOUT_MS: 60, REDFORD_DETAIL_TIMEOUT_MS: 60, REDFORD_RUN_BUDGET_MS: 2000, REDFORD_MIN_START_MS: 10 });
  try {
    const mkFetch = (store, behavior) => async (url, opts) => {
      const h = store.handle(url, opts); if (h) return h;
      if (url === RT_SOURCE) return behavior.archive ? behavior.archive() : { ok: true, status: 200, text: async () => rtArchive(behavior.n || 3) };
      const n = Number(url.match(/film-(\d+)/)[1]);
      return behavior.detail(n, url);
    };
    const ok = (n) => ({ ok: true, status: 200, text: async () => rtDetail(n) });

    // 1. normal run complete, details written
    {
      const store = makeStore();
      global.fetch = mkFetch(store, { n: 3, detail: (n) => ok(n) });
      const res = makeRes();
      await fresh("cron-redford-theatre.js")({ headers: {} }, res);
      assert.strictEqual(res._body.upserted, 3);
      assert.strictEqual(res._body.complete, true);
      assert.strictEqual(store.runs[0].outcome, "success");
      for (const r of store.rows.values()) assert.ok(r.description && r.ticket_url);
    }
    console.log("PASS redford: normal run complete; descriptions and ticket links written");

    // 2. hung / failed detail pages never erase verified data; run is partial and says so
    {
      const store = makeStore();
      global.fetch = mkFetch(store, { n: 3, detail: (n) => ok(n) });
      await fresh("cron-redford-theatre.js")({ headers: {} }, makeRes());
      const verified = JSON.parse(JSON.stringify([...store.rows.values()]));
      const posts0 = store.events.posts.length;

      const hits = {};
      global.fetch = mkFetch(store, {
        n: 3,
        detail: (n, url) => {
          hits[url] = (hits[url] || 0) + 1;
          if (n === 1) return HANG();
          if (n === 2) return { ok: false, status: 503, text: async () => "" };
          return ok(n);
        },
      });
      const res = makeRes();
      const t0 = Date.now();
      await fresh("cron-redford-theatre.js")({ headers: {} }, res);
      assert.ok(Date.now() - t0 < 1500, "hung detail page bounded");
      assert.strictEqual(res._body.upserted, 3, "base rows still written");
      assert.strictEqual(res._body.detailTimedOut, 1);
      assert.strictEqual(res._body.detailFailed, 1);
      assert.strictEqual(res._body.detailOk, 1);
      assert.strictEqual(res._body.partial, true);
      assert.strictEqual(res._body.complete, false);
      assert.strictEqual(store.runs[1].outcome, "partial");
      assert.ok(/2 of 3 detail pages not read/.test(store.runs[1].error_sample));
      assert.ok(Object.values(hits).every((c) => c === 1), "no retry within a run");
      const lastPost = store.events.posts.slice(posts0).flat();
      for (const r of lastPost) {
        const n = Number(r.external_id.match(/film-(\d+)/) ? RegExp.$1 : r.title.match(/Number (\d+)/)[1]);
        if (n !== 3) assert.ok(!("description" in r) && !("ticket_url" in r), "unread detail page: keys omitted, stored values kept");
      }
      const after = [...store.rows.values()];
      assert.deepStrictEqual(after.map((r) => [r.description, r.ticket_url]), verified.map((r) => [r.description, r.ticket_url]), "verified description/ticket_url unchanged");
    }
    console.log("PASS redford: hung/failed detail pages bounded, reported partial, verified data not erased, no retry");

    // 3. a page that was read and has no description still writes null (unchanged behavior)
    {
      const store = makeStore();
      global.fetch = mkFetch(store, { n: 1, detail: () => ({ ok: true, status: 200, text: async () => "<html></html>" }) });
      const res = makeRes();
      await fresh("cron-redford-theatre.js")({ headers: {} }, res);
      assert.strictEqual(res._body.complete, true);
      const row = [...store.rows.values()][0];
      assert.ok("description" in row && row.description === null && row.ticket_url === null);
    }
    console.log("PASS redford: a read page with no description keeps the legacy null write");

    // 4. source down: after three consecutive timeouts the rest is deferred; recovery run fills them in
    {
      const store = makeStore();
      global.fetch = mkFetch(store, { n: 10, detail: () => HANG() });
      const res = makeRes();
      const t0 = Date.now();
      await fresh("cron-redford-theatre.js")({ headers: {} }, res);
      assert.ok(Date.now() - t0 < 1500);
      assert.ok(res._body.detailTimedOut >= 3);
      assert.ok(res._body.detailDeferred >= 1, "remaining pages deferred, not hammered");
      assert.strictEqual(res._body.detailTimedOut + res._body.detailDeferred, 10);
      assert.strictEqual(store.runs[0].outcome, "partial");
      assert.strictEqual(store.rows.size, 10);
      for (const r of store.rows.values()) assert.ok(!("description" in r));

      global.fetch = mkFetch(store, { n: 10, detail: (n) => ok(n) });
      const res2 = makeRes();
      await fresh("cron-redford-theatre.js")({ headers: {} }, res2);
      assert.strictEqual(res2._body.complete, true);
      assert.strictEqual(store.rows.size, 10, "recovery run creates no duplicate events");
      for (const r of store.rows.values()) assert.ok(r.description && r.ticket_url, "recovered");
      assert.strictEqual(store.runs[1].outcome, "success");
    }
    console.log("PASS redford: dead source defers remaining pages; recovery run fills them in with no duplicates");

    // 5. budget exhaustion defers detail pages
    {
      setEnv({ REDFORD_RUN_BUDGET_MS: 150, REDFORD_MIN_START_MS: 60, REDFORD_DETAIL_TIMEOUT_MS: 120 });
      const store = makeStore();
      global.fetch = mkFetch(store, {
        n: 12,
        detail: async (n) => { await new Promise((r) => setTimeout(r, 70)); return ok(n); },
      });
      const res = makeRes();
      await fresh("cron-redford-theatre.js")({ headers: {} }, res);
      assert.ok(res._body.detailDeferred >= 1, "pages not started once the budget is nearly spent");
      assert.strictEqual(res._body.detailOk + res._body.detailDeferred + res._body.detailTimedOut + res._body.detailFailed, 12);
      assert.strictEqual(res._body.partial, true);
      assert.strictEqual(res._body.upserted, 12);
      setEnv({ REDFORD_RUN_BUDGET_MS: 2000, REDFORD_MIN_START_MS: 10, REDFORD_DETAIL_TIMEOUT_MS: 60 });
    }
    console.log("PASS redford: budget exhaustion defers detail pages and reports it");

    // 6. archive page hang: bounded, run fails with the existing error shape
    {
      const store = makeStore();
      global.fetch = mkFetch(store, { archive: HANG, detail: () => { throw new Error("unreached"); } });
      const res = makeRes();
      const t0 = Date.now();
      await fresh("cron-redford-theatre.js")({ headers: {} }, res);
      assert.ok(Date.now() - t0 < 1500);
      assert.ok(/Fetch failed: Timed out/.test(res._body.error));
      assert.strictEqual(store.runs[0].outcome, "failed");
    }
    console.log("PASS redford: hung archive page bounded and reported");

    // 7. exported helpers used by scripts/redford-metadata-repair.js keep their contract
    {
      const mod = fresh("cron-redford-theatre.js");
      global.fetch = async () => ({ ok: false, status: 500, text: async () => "" });
      assert.deepStrictEqual(await mod.fetchEventDetail("https://redfordtheatre.com/events/x/"), { description: null, ticket_url: null });
      global.fetch = async () => ({ ok: true, status: 200, text: async () => rtDetail(7) });
      assert.deepStrictEqual(await mod.fetchEventDetail("https://redfordtheatre.com/events/x/"), { description: "Verified description 7", ticket_url: "https://tickets.example/7" });
    }
    console.log("PASS redford: fetchEventDetail export unchanged");
  } finally {
    clearEnv("REDFORD_ARCHIVE_TIMEOUT_MS", "REDFORD_DETAIL_TIMEOUT_MS", "REDFORD_RUN_BUDGET_MS", "REDFORD_MIN_START_MS");
  }
}

(async () => {
  await oldMiami();
  await redford();
  const { rotate } = require(path.join(REPO, "api/_lib/run-budget.js"));
  assert.deepStrictEqual(rotate(["a", "b", "c"], 1), ["b", "c", "a"]);
  assert.deepStrictEqual(rotate([], 5), []);
  console.log("PASS run-budget: rotate");
  console.log("all cron-single-source-budget tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
