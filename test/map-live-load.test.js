// test/map-live-load.test.js -- the map must never silently replace live events with demo data
// (P0 2026-10-15: production showed 10 hardcoded demo events / 1 Detroit marker instead of ~2,100).
// Run: node test/map-live-load.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(process.env.REPO_DIR || process.cwd(), "map.html"), "utf8");

// 1. Structure: no demo events, no silent catch.
assert.ok(!/FALLBACK_EVENTS/.test(html), "demo/fallback events must not exist on the map");
assert.ok(!/Silent by design — FALLBACK/.test(html));
assert.ok(/loadState\s*=\s*'error'/.test(html) && /onclick="retryLoad\(\)"/.test(html), "an error state with a retry control must exist");
assert.ok(/window\.__313MapLoad/.test(html), "load diagnostics must be exposed");
console.log("PASS: no demo data, error state + retry + diagnostics present");

// 2. Behaviour of the real loader with stubbed I/O.
const start = html.indexOf("async function loadSupabaseEvents()");
const end = html.indexOf("loadSupabaseEvents();\n</script>");
assert.ok(start > 0 && end > start);
const loaderSrc = html.slice(start, end);

function makeCtx({ fetchBehaviour }) {
  const renders = [];
  const ctx = {
    SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k",
    console: { error() {}, log() {}, warn() {} },
    setTimeout: (fn) => { fn(); return 0; }, // collapse retry delays
    loadFloorISO: () => "2026-10-07",
    getTodayISO: () => "2026-10-16",
    loadVenueLatLng: async () => {},
    mapSupabaseRow: (r) => r, addToByDate: () => {}, buildFilterBar: () => {},
    render: () => renders.push({ state: ctx.loadState, events: ctx.EVENTS.length }),
    EVENTS: [], byDate: {}, loadState: "loading",
    loadDiag: { state: "loading", attempts: 0, total: null, loaded: 0, plotted: 0, complete: null, error: null },
    fetchAllRows: fetchBehaviour,
    Promise, Error, String,
  };
  vm.createContext(ctx);
  vm.runInContext(loaderSrc + "\nthis.run = loadSupabaseEvents;", ctx);
  ctx.renders = renders;
  return ctx;
}
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: "e" + i }));

(async () => {
  // healthy: every fetched row is kept (nothing discarded by the loader)
  let ctx = makeCtx({ fetchBehaviour: async () => ({ rows: rows(2687), total: 2687, complete: true }) });
  await ctx.run();
  assert.strictEqual(ctx.loadState, "ready");
  assert.strictEqual(ctx.EVENTS.length, 2687);
  assert.strictEqual(ctx.loadDiag.loaded, 2687);
  console.log("PASS: healthy load keeps all 2,687 rows");

  // transient: two failures then success -> live data, no error
  let calls = 0;
  ctx = makeCtx({ fetchBehaviour: async () => { if (++calls < 3) throw new Error("HTTP 500"); return { rows: rows(2687), total: 2687, complete: true }; } });
  await ctx.run();
  assert.strictEqual(ctx.loadState, "ready");
  assert.strictEqual(ctx.loadDiag.attempts, 3);
  assert.strictEqual(ctx.EVENTS.length, 2687);
  console.log("PASS: transient failures are retried and live data is shown");

  // permanent failure: error state, zero events (never demo data), error recorded
  ctx = makeCtx({ fetchBehaviour: async () => { throw new Error("HTTP 500"); } });
  await ctx.run();
  assert.strictEqual(ctx.loadState, "error");
  assert.strictEqual(ctx.EVENTS.length, 0, "no placeholder events after a failed load");
  assert.strictEqual(ctx.loadDiag.error, "HTTP 500");
  assert.strictEqual(ctx.loadDiag.attempts, 3);
  assert.ok(ctx.renders.length && ctx.renders[ctx.renders.length - 1].state === "error", "error state must be rendered");
  console.log("PASS: permanent failure shows an error state with zero events");

  // an empty result is an error too, not an empty-but-fine map
  ctx = makeCtx({ fetchBehaviour: async () => ({ rows: [], total: 0, complete: true }) });
  await ctx.run();
  assert.strictEqual(ctx.loadState, "error");
  console.log("PASS: a 0-row result is reported as an error");

  // partial result is flagged
  ctx = makeCtx({ fetchBehaviour: async () => ({ rows: rows(1000), total: 2687, complete: false }) });
  await ctx.run();
  assert.strictEqual(ctx.loadState, "ready");
  assert.strictEqual(ctx.loadDiag.complete, false);
  console.log("PASS: a partial load is flagged");

  // retry after failure recovers
  let ok = false;
  ctx = makeCtx({ fetchBehaviour: async () => { if (!ok) throw new Error("down"); return { rows: rows(5), total: 5, complete: true }; } });
  await ctx.run(); assert.strictEqual(ctx.loadState, "error");
  ok = true; await ctx.run(); assert.strictEqual(ctx.loadState, "ready"); assert.strictEqual(ctx.EVENTS.length, 5);
  console.log("PASS: retry recovers from an error state");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
