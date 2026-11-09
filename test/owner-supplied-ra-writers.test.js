// test/owner-supplied-ra-writers.test.js — RA detail merge (scripts/ra-sync.js) and RA time backfill (scripts/ra-time-backfill.js)
// leave an owner-supplied / editorially held row alone. Control row proves each writer WOULD write; the protected row must not be touched.
"use strict";
const assert = require("assert");
const REPO = process.env.REPO_DIR || process.cwd();
const URL_ = "https://example.supabase.co", KEY = "k";
const HOLD = "EDITORIAL-HOLD 2026-11-04 owner: leave blank on purpose";
const silent = { log() {}, warn() {}, error() {} };

(async () => {
  // --- ra-time-backfill
  {
    const bf = require(`${REPO}/scripts/ra-time-backfill.js`);
    const rows = [
      { id: "ctl", external_id: "ra-1", title: "Show A", start_date: "2026-12-12", end_date: null, time_display: null, event_url: null, ticket_url: null, source: "Resident Advisor", internal_note: null },
      { id: "held", external_id: "ra-2", title: "Show B", start_date: "2026-12-12", end_date: null, time_display: null, event_url: null, ticket_url: null, source: "Resident Advisor", internal_note: HOLD },
    ];
    const detail = new Map([
      ["ra-1", { startDate: "2026-12-12T21:00:00-05:00", endDate: "2026-12-13T02:00:00-05:00", url: "https://ra.co/events/1", title: "Show A" }],
      ["ra-2", { startDate: "2026-12-12T21:00:00-05:00", endDate: "2026-12-13T02:00:00-05:00", url: "https://ra.co/events/2", title: "Show B" }],
    ]);
    const patched = [];
    const counts = await bf.repairRaTimes({
      SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, logger: silent,
      fetchCandidates: async () => rows, fetchDetailData: async () => detail,
      applyPatchFn: async (_u, _h, event) => { patched.push(event.id); return true; },
    });
    assert.deepStrictEqual(patched, ["ctl"], "only the unprotected row is written");
    assert.strictEqual(counts.ownerProtected, 1);
    const src = require("fs").readFileSync(`${REPO}/scripts/ra-time-backfill.js`, "utf8");
    assert.ok(/select=id,external_id,title,start_date,end_date,time_display,event_url,ticket_url,source,internal_note/.test(src), "candidates are fetched with source + internal_note");
  }
  console.log("PASS ra-time-backfill leaves owner-held rows alone");

  // --- ra-sync complete merge
  {
    const lib = require(`${REPO}/scripts/ra-sync.js`);
    const run = { id: "run-1", source_slug: "resident-advisor", outcome: "started", started_at: new Date().toISOString(), session_data: { phase: "started", newIds: ["ra-300", "ra-301"], candidateCount: 2, knownCount: 0, allNewCount: 2 } };
    async function go(existing) {
      const calls = [];
      const fetchFn = async (url, opts) => {
        const method = (opts && opts.method) || "GET";
        calls.push({ url, method });
        if (url.includes("/source_runs?id=eq.")) return method === "PATCH" ? { ok: true, text: async () => "" } : { ok: true, json: async () => [run] };
        if (url.includes("/rest/v1/events?start_date=gte.")) return { ok: true, json: async () => [] };
        if (url.includes("/rest/v1/events?external_id=eq.") && method === "PATCH") return { ok: true, json: async () => [{}] };
        if (url.includes("on_conflict=external_id")) return { ok: true, text: async () => "" };
        throw new Error("unexpected fetch: " + url);
      };
      const result = await lib.completeRaSyncSession({
        SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, runId: "run-1",
        events: [{ id: "ra-300", title: "RIOT", description: "RA text", startDate: "2026-12-12T21:00:00-05:00", venueName: "Elektricity", address: "15 South Saginaw Street, Pontiac, MI 48342" }],
        fetchFn, finishRunFn: async () => {}, buildVenueNameToIdMapFn: async () => new Map(),
        lookupExistingRowsFn: async () => new Map([["ra-300", Object.assign({ external_id: "ra-300", status: "approved", description: null, venue_id: null, venue_name_raw: "Elektricity", venue_address_raw: null, venue_city_raw: null, event_url: null, ticket_url: null, image_url: null, end_date: null, time_display: null, is_free: null, price_from: null, source: "Resident Advisor", internal_note: null }, existing)]]),
      });
      return { result, patches: calls.filter((c) => c.method === "PATCH" && c.url.includes("/rest/v1/events")) };
    }
    const ctl = await go({});
    assert.strictEqual(ctl.patches.length, 1, "control: a blank field is merged");
    const held = await go({ internal_note: HOLD });
    assert.strictEqual(held.patches.length, 0, "held row: nothing written");
    assert.strictEqual(held.result.skipped, 1, "held row is reported as skipped (OWNER_PROTECTED), not an error");
    assert.strictEqual(held.result.errors, 0);
  }
  console.log("PASS ra-sync merge leaves owner-held rows alone");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
