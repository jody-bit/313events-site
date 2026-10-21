// test/enrichment-candidate-ordering.test.js — generic enrichment candidate
// selection (owner GO 2026-10-20): soonest events first, deterministic, a cap
// hit is reported, candidates beyond the cap are preserved, publication
// safeguards untouched. Mocked PostgREST that honours `order` and `limit`.
// Run: node test/enrichment-candidate-ordering.test.js
"use strict";
const assert = require("assert");
const REPO = process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const KEY = "test-key";
const NOT_CONFIGURED = { isExternalDiscoveryConfiguredFn: () => false };

function lib() {
  delete require.cache[require.resolve(`${REPO}/scripts/generic-metadata-enrichment.js`)];
  return require(`${REPO}/scripts/generic-metadata-enrichment.js`);
}

// A pool of blank-description upcoming events with distinct dates; ids unordered on purpose.
function makePool(n) {
  const pool = [];
  for (let i = 0; i < n; i++) {
    const day = String(1 + (i % 28)).padStart(2, "0");
    const month = String(11 + Math.floor(i / 28 / 12)).padStart(2, "0");
    pool.push({
      id: `evt-${String((i * 7919) % n).padStart(5, "0")}-${i}`, title: `Event ${i}`, description: null, category: "music",
      start_date: `2027-${month}-${day}`, time_display: "8:00 PM", is_all_day: false,
      venue_id: "v1", venue_name_raw: "Venue", venue_address_raw: null, venue_city_raw: null,
      ticket_url: null, event_url: "https://example.com/e", source: "Test Source",
    });
  }
  // deterministic scramble so "no ORDER BY" returns a non-soonest subset
  return pool.sort((a, b) => ((a.title.length * 31 + a.id.charCodeAt(5)) % 13) - ((b.title.length * 31 + b.id.charCodeAt(5)) % 13));
}

function mock(pool, { honourOrder = true, patchSink = [], urls = [] } = {}) {
  return async (url, opts = {}) => {
    const method = opts.method || "GET";
    urls.push({ url, method, headers: opts.headers });
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && method === "GET") {
      const isPoor = url.includes("description=not.is.null");
      let rows = isPoor ? [] : pool.slice();
      if (honourOrder && /order=start_date\.asc,id\.asc/.test(url)) rows.sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.id < b.id ? -1 : 1));
      const limit = Number((/limit=(\d+)/.exec(url) || [])[1] || rows.length);
      const out = rows.slice(0, limit);
      return {
        ok: true, status: 200, json: async () => out,
        headers: { get: (h) => (h.toLowerCase() === "content-range" && opts.headers && opts.headers.Prefer === "count=exact" ? `0-${Math.max(0, out.length - 1)}/${rows.length}` : null) },
      };
    }
    if (method === "PATCH") {
      patchSink.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => [{ id: "x" }] };
    }
    throw new Error("unmocked URL in test: " + method + " " + url);
  };
}

(async () => {
  const L = lib();

  // 1. both queries carry the deterministic order and the cap
  {
    const pool = makePool(5);
    const urls = [];
    global.fetch = mock(pool, { urls });
    await L.fetchEnrichmentCandidates(SUPABASE_URL, KEY, { apikey: KEY });
    const gets = urls.filter((u) => u.method === "GET" && u.url.includes("/rest/v1/events"));
    assert.strictEqual(gets.length, 2);
    for (const g of gets) {
      assert.ok(g.url.includes("order=start_date.asc,id.asc"), "ordered by soonest start, then id");
      assert.ok(g.url.includes(`limit=${L.CANDIDATE_LIMIT}`));
    }
    assert.strictEqual(L.CANDIDATE_LIMIT, 1000);
    assert.ok(poorUrlHasOrder(L), "poor-description URL helper carries the order");
  }
  function poorUrlHasOrder(Lx) { return Lx.poorDescriptionCandidatesUrl(SUPABASE_URL).includes("order=start_date.asc,id.asc"); }
  console.log("PASS both candidate queries are ordered and capped");

  // 2. over the cap: the window is the SOONEST 1000, identical on every run, and the cap hit is reported
  {
    const pool = makePool(2500);
    const soonest = pool.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.id < b.id ? -1 : 1)).slice(0, 1000).map((r) => r.id);
    global.fetch = mock(pool);
    const run1 = await L.fetchEnrichmentCandidates(SUPABASE_URL, KEY, { apikey: KEY });
    const run2 = await L.fetchEnrichmentCandidates(SUPABASE_URL, KEY, { apikey: KEY });
    assert.deepStrictEqual(run1.map((r) => r.id), soonest, "the window is the soonest 1000 events");
    assert.deepStrictEqual(run2.map((r) => r.id), run1.map((r) => r.id), "deterministic across runs");
    assert.strictEqual(run1.cap.blankCapReached, true);
    assert.strictEqual(run1.cap.blankTotal, 2500);
    assert.strictEqual(run1.cap.blankDeferred, 1500, "exact deferred count from the database total");
    // contrast: without the order the window is arbitrary, not the soonest (what production did before)
    global.fetch = mock(pool, { honourOrder: false });
    const unordered = await L.fetchEnrichmentCandidates(SUPABASE_URL, KEY, { apikey: KEY });
    assert.notDeepStrictEqual(unordered.map((r) => r.id).sort(), soonest.slice().sort());
  }
  console.log("PASS over-cap pool: soonest 1000, deterministic, deferred count exact");

  // 3. the run reports a cap hit; deferred candidates are preserved (never written)
  {
    const pool = makePool(1200);
    const patches = [];
    global.fetch = mock(pool, { patchSink: patches });
    const warnings = [];
    const logger = { log() {}, error() {}, warn: (m) => warnings.push(m) };
    const counts = await L.repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, logger, ...NOT_CONFIGURED });
    assert.strictEqual(counts.totalConsidered, 1000);
    assert.strictEqual(counts.capReached, true);
    assert.strictEqual(counts.candidateCap.blankDeferred, 200);
    assert.ok(/Candidate cap of 1000 reached/.test(counts.capWarning) && /200 deferred/.test(counts.capWarning));
    assert.strictEqual(warnings.length, 1, "warned once");
    assert.ok(patches.length > 0, "the run did write enrichment patches (so the checks below are not vacuous)");
    const processed = new Set(patches.map((p) => decodeURIComponent(/id=eq\.([^&]+)/.exec(p.url)[1])));
    const deferredIds = new Set(pool.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.id < b.id ? -1 : 1)).slice(1000).map((r) => r.id));
    for (const id of processed) assert.ok(!deferredIds.has(id), "no deferred candidate was touched");
    // publication safeguards: only enrichment fields are ever written
    for (const p of patches) for (const k of Object.keys(p.body)) assert.ok(!["status", "followup_dismissed", "approved_at", "published_at"].includes(k), `unexpected write to ${k}`);
  }
  console.log("PASS cap hit reported; deferred candidates untouched; no publication fields written");

  // 4. under the cap: no cap report, no warning, same behaviour as before
  {
    const pool = makePool(40);
    global.fetch = mock(pool);
    const warnings = [];
    const counts = await L.repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, logger: { log() {}, error() {}, warn: (m) => warnings.push(m) }, ...NOT_CONFIGURED });
    assert.strictEqual(counts.totalConsidered, 40);
    assert.strictEqual(counts.capReached, false);
    assert.strictEqual(counts.capWarning, undefined);
    assert.strictEqual(warnings.length, 0);
  }
  console.log("PASS under the cap: no report, no warning");

  // 5. injected candidate loaders without cap info (existing tests) keep working
  {
    const counts = await L.repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, logger: { log() {}, error() {}, warn() {} }, fetchCandidates: async () => [], ...NOT_CONFIGURED });
    assert.strictEqual(counts.totalConsidered, 0);
    assert.strictEqual(counts.capReached, undefined);
  }
  console.log("PASS candidate loaders without cap info unchanged");

  // 6. totalFromContentRange
  {
    const h = (v) => ({ headers: { get: () => v } });
    assert.strictEqual(L.totalFromContentRange(h("0-999/2953")), 2953);
    assert.strictEqual(L.totalFromContentRange(h("*/0")), 0);
    assert.strictEqual(L.totalFromContentRange(h("0-9/*")), null);
    assert.strictEqual(L.totalFromContentRange({}), null);
  }
  console.log("PASS content-range parsing");
  console.log("all enrichment-candidate-ordering tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
