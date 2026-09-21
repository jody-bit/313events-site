// test/sh1-repair-existing-events.test.js — SH.1 (Metadata Self-Healing).
//
// Covers scripts/sh1-repair-existing-venue-address-city.js: the "an
// existing upcoming incomplete event can be repaired without manual
// entry" half of SH.1's required dual demonstration (Product Owner's
// 2026-09-21 review, refinement 7), plus the safety requirements from
// refinement 8/9 that apply specifically to writing back to existing rows
// (the still-blank-at-write-time conditional PATCH, and "repair failure
// does not corrupt the event").
//
// Two layers are tested:
//   1. repairExistingEvents() with fetchCandidates/applyPatchFn injected
//      — proves the counting/branching logic (dry-run, concurrent-change,
//      unresolved, missing config) without needing a real fetch mock.
//   2. fetchRepairCandidates()/applyPatch() against a mocked global.fetch
//      — proves the actual Supabase/PostgREST query and conditional-PATCH
//      URL construction is correct end to end.
//
// Run: node test/sh1-repair-existing-events.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshScript() {
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/sh1-repair-existing-venue-address-city.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/scripts/sh1-repair-existing-venue-address-city.js`);
}

function silentLogger() {
  const calls = { log: [], warn: [], error: [] };
  return {
    log: (...a) => calls.log.push(a),
    warn: (...a) => calls.warn.push(a),
    error: (...a) => calls.error.push(a),
    calls,
  };
}

async function run() {
  // --- 1. dry-run: nothing is written, but candidates are still counted
  //     and classified ---
  {
    const { repairExistingEvents } = freshScript();
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [{ id: "v1", name: "The Loft", address: "123 Main St", city: "Detroit" }] };
      if (url.includes("/rest/v1/events")) return { ok: true, status: 200, json: async () => [] }; // learned map source
      throw new Error("unmocked: " + url);
    };
    const logger = silentLogger();
    const applyCalls = [];
    const counts = await repairExistingEvents({
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      dryRun: true,
      logger,
      fetchCandidates: async () => [
        { id: "e1", venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null, start_date: "2026-12-01", status: "approved" },
      ],
      applyPatchFn: async (...args) => { applyCalls.push(args); return true; },
    });
    assert.strictEqual(counts.totalConsidered, 1);
    assert.strictEqual(counts.repairable, 1);
    assert.strictEqual(counts.repairableFromCanonicalVenueId, 1);
    assert.strictEqual(counts.written, 0, "dry-run must never write");
    assert.strictEqual(applyCalls.length, 0, "dry-run must never call applyPatchFn");
    assert.strictEqual(logger.calls.log.length, 1, "dry-run should log what it would have patched");
  }
  console.log("PASS: dry-run counts and classifies a repairable event but writes nothing");

  // --- 2. a genuinely repaired event increments written and the right tier ---
  {
    const { repairExistingEvents } = freshScript();
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [{ id: "v1", name: "The Loft", address: "123 Main St", city: "Detroit" }] };
      if (url.includes("/rest/v1/events")) return { ok: true, status: 200, json: async () => [] };
      throw new Error("unmocked: " + url);
    };
    const applyCalls = [];
    const counts = await repairExistingEvents({
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger(),
      fetchCandidates: async () => [
        { id: "e1", venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null, start_date: "2026-12-01", status: "approved" },
      ],
      applyPatchFn: async (url2, headers, id, patch) => { applyCalls.push({ id, patch }); return true; },
    });
    assert.strictEqual(counts.written, 1);
    assert.strictEqual(counts.repairableFromCanonicalVenueId, 1);
    assert.strictEqual(applyCalls.length, 1);
    assert.strictEqual(applyCalls[0].id, "e1");
    assert.deepStrictEqual(applyCalls[0].patch, { venue_address_raw: "123 Main St", venue_city_raw: "Detroit" });
  }
  console.log("PASS: a repairable existing event is written exactly once with exactly the missing fields");

  // --- 3. concurrent-change: applyPatchFn reports no row matched -> counted,
  //     not treated as an error, and does not stop the run ---
  {
    const { repairExistingEvents } = freshScript();
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [{ id: "v1", name: "The Loft", address: "123 Main St", city: "Detroit" }] };
      if (url.includes("/rest/v1/events")) return { ok: true, status: 200, json: async () => [] };
      throw new Error("unmocked: " + url);
    };
    const logger = silentLogger();
    const counts = await repairExistingEvents({
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger,
      fetchCandidates: async () => [
        { id: "e1", venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null, start_date: "2026-12-01", status: "approved" },
        { id: "e2", venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null, start_date: "2026-12-02", status: "approved" },
      ],
      applyPatchFn: async () => false, // simulate: someone else already filled it in
    });
    assert.strictEqual(counts.repairable, 2);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(counts.skippedConcurrentChange, 2);
    assert.strictEqual(logger.calls.warn.length, 2);
  }
  console.log("PASS: a concurrent-change (field no longer null at write time) is counted, not an error, and does not corrupt the run");

  // --- 4. unresolved events (no canonical or learned match) are counted
  //     and never attempt a write ---
  {
    const { repairExistingEvents } = freshScript();
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/events")) return { ok: true, status: 200, json: async () => [] };
      throw new Error("unmocked: " + url);
    };
    const applyCalls = [];
    const counts = await repairExistingEvents({
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger(),
      fetchCandidates: async () => [
        { id: "e1", venue_id: null, venue_name_raw: "Totally Unknown Venue", venue_address_raw: null, venue_city_raw: null, start_date: "2026-12-01", status: "approved" },
      ],
      applyPatchFn: async (...args) => { applyCalls.push(args); return true; },
    });
    assert.strictEqual(counts.unresolved, 1);
    assert.strictEqual(counts.repairable, 0);
    assert.strictEqual(applyCalls.length, 0);
  }
  console.log("PASS: an unresolvable existing event is counted as unresolved and never attempts a write");

  // --- 5. missing SUPABASE_URL/KEY degrades to a zeroed report, no throw ---
  {
    const { repairExistingEvents } = freshScript();
    const logger = silentLogger();
    const counts = await repairExistingEvents({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, logger });
    assert.strictEqual(counts.totalConsidered, 0);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(logger.calls.error.length, 1);
  }
  console.log("PASS: missing Supabase configuration degrades safely to a zeroed report instead of throwing");

  // --- 6. end-to-end against the real fetchRepairCandidates/applyPatch
  //     (no injection) — proves the actual query/PATCH URL construction ---
  {
    const { repairExistingEvents } = freshScript();
    const patchCalls = [];
    global.fetch = async (url, opts = {}) => {
      if (url.includes("/rest/v1/venues")) {
        return { ok: true, status: 200, json: async () => [{ id: "v1", name: "The Loft", address: "123 Main St", city: "Detroit" }] };
      }
      if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) {
        assert.ok(url.includes("start_date=gte."), "candidate query must filter to upcoming events");
        assert.ok(url.includes("status=neq.rejected"), "candidate query must exclude rejected events");
        assert.ok(url.includes("or=(venue_address_raw.is.null,venue_city_raw.is.null)"));
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: "e1", venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null, start_date: "2026-12-01", status: "approved" },
            { id: "e2", venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: "42 Already Set Ave", venue_city_raw: null, start_date: "2026-12-05", status: "approved" },
          ],
        };
      }
      if (url.includes("/rest/v1/events") && opts.method === "PATCH") {
        patchCalls.push({ url, body: JSON.parse(opts.body) });
        if (url.includes("id=eq.e1")) {
          assert.ok(url.includes("and=(venue_address_raw.is.null,venue_city_raw.is.null)"), "two-field patch must use an and() filter guarding both fields");
          return { ok: true, status: 200, json: async () => [{ id: "e1" }] };
        }
        if (url.includes("id=eq.e2")) {
          assert.ok(url.includes("venue_city_raw=is.null"), "single-field patch must guard exactly that field");
          assert.ok(!url.includes("venue_address_raw"), "e2's patch only touches venue_city_raw — the filter must not mention venue_address_raw");
          return { ok: true, status: 200, json: async () => [{ id: "e2" }] };
        }
      }
      throw new Error("unmocked: " + url);
    };

    const counts = await repairExistingEvents({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "test-key", logger: silentLogger() });
    assert.strictEqual(counts.totalConsidered, 2);
    assert.strictEqual(counts.written, 2);
    assert.strictEqual(patchCalls.length, 2);
    const e1Patch = patchCalls.find((p) => p.url.includes("id=eq.e1")).body;
    assert.deepStrictEqual(e1Patch, { venue_address_raw: "123 Main St", venue_city_raw: "Detroit" });
    const e2Patch = patchCalls.find((p) => p.url.includes("id=eq.e2")).body;
    assert.deepStrictEqual(e2Patch, { venue_city_raw: "Detroit" }, "e2 already had an address — only venue_city_raw should be in its patch");
  }
  console.log("PASS: end-to-end query and conditional-PATCH URL construction is correct for both single- and multi-field repairs");

  console.log("\nAll SH.1 existing-event repair script tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
