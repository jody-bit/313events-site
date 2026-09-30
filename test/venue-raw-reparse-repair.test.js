// test/venue-raw-reparse-repair.test.js
//
// Unit tests for scripts/venue-raw-reparse-repair.js — the backfill half
// of the 2026-09-30 root-cause fix (see NEEDS_FOLLOWUP_ROOT_CAUSE.md and
// api/_lib/ics-location.js's own header). All Supabase I/O is injected
// (fetchCandidates/applyPatchFn/buildCanonicalMaps) so these run with no
// network call, same convention as sh1-repair-existing-venue-address-
// city.js's own tests.
//
// Run: node test/venue-raw-reparse-repair.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { repairVenueRawReparse } = require(`${REPO_DIR}/scripts/venue-raw-reparse-repair.js`);

async function run() {
  // --- 1. A real Downtown Windsor BIA-shaped row (region spelled out in
  //     full) with no canonical venue on file: re-parses to structured
  //     address/city and gets those two fields written, venue_name_raw
  //     left untouched (never overwritten, never guessed at further). ---
  {
    const events = [
      {
        id: "evt-1",
        venue_id: null,
        venue_name_raw: "Windsor Public Library, 185 Ouellette Ave, Windsor, Ontario, WindN9A 5S8, Canada",
        venue_address_raw: null,
        venue_city_raw: null,
      },
    ];
    const patches = [];
    const counts = await repairVenueRawReparse({
      SUPABASE_URL: "https://example.test",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      fetchCandidates: async () => events,
      buildCanonicalMaps: async () => ({ byName: new Map(), byId: new Map(), byAddress: new Map() }),
      applyPatchFn: async (_url, _headers, id, patch) => { patches.push({ id, patch }); return true; },
    });
    assert.strictEqual(counts.totalConsidered, 1);
    assert.strictEqual(counts.reparsed, 1);
    assert.strictEqual(counts.resolvedToCanonicalVenue, 0);
    assert.strictEqual(counts.writtenAsRawAddressCity, 1);
    assert.strictEqual(counts.written, 1);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].patch.venue_address_raw, "185 Ouellette Ave");
    assert.strictEqual(patches[0].patch.venue_city_raw, "Windsor");
    assert.ok(!("venue_name_raw" in patches[0].patch), "must never rewrite an already-populated venue_name_raw");
    assert.ok(!("venue_id" in patches[0].patch), "no canonical match — must not invent a venue_id");
  }

  // --- 2. Same shape, but the parsed name DOES match a canonical venue —
  //     links venue_id and uses the canonical venue's own name/address/
  //     city, exactly the same resolveVenueFromCandidate tiering
  //     cron-feeds.js itself uses at ingestion time. ---
  {
    const events = [
      {
        id: "evt-2",
        venue_id: null,
        venue_name_raw: "Cool Cities / Hope Village, 14150 Woodrow Wilson, Detroit, 48238, United States",
        venue_address_raw: null,
        venue_city_raw: null,
      },
    ];
    const byName = new Map();
    byName.set("cool cities / hope village", { id: "venue-42", name: "Cool Cities / Hope Village", address: "14150 Woodrow Wilson St", city: "Detroit" });
    const patches = [];
    const counts = await repairVenueRawReparse({
      SUPABASE_URL: "https://example.test",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      fetchCandidates: async () => events,
      buildCanonicalMaps: async () => ({ byName, byId: new Map(), byAddress: new Map() }),
      applyPatchFn: async (_url, _headers, id, patch) => { patches.push({ id, patch }); return true; },
    });
    assert.strictEqual(counts.resolvedToCanonicalVenue, 1);
    assert.strictEqual(patches[0].patch.venue_id, "venue-42");
    assert.strictEqual(patches[0].patch.venue_address_raw, "14150 Woodrow Wilson St");
    assert.strictEqual(patches[0].patch.venue_city_raw, "Detroit");
  }

  // --- 3. Genuinely unparseable free text (the documented Royal Oak
  //     "Downtown Events" shape) is left completely untouched — no PATCH
  //     attempted at all, honest gap preserved. ---
  {
    const events = [
      {
        id: "evt-3",
        venue_id: null,
        venue_name_raw: "Meet at Pronto/Five 15: 600 S Washington Ave, Royal Oak, MI 48067 - Royal Oak MI 48067",
        venue_address_raw: null,
        venue_city_raw: null,
      },
    ];
    let patchCalled = false;
    const counts = await repairVenueRawReparse({
      SUPABASE_URL: "https://example.test",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      fetchCandidates: async () => events,
      buildCanonicalMaps: async () => ({ byName: new Map(), byId: new Map(), byAddress: new Map() }),
      applyPatchFn: async () => { patchCalled = true; return true; },
    });
    assert.strictEqual(counts.stillUnparseable, 1);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(patchCalled, false);
  }

  // --- 4. A concurrent write (field no longer null by the time the PATCH
  //     runs) is counted, never thrown, never miscounted as a success. ---
  {
    const events = [
      {
        id: "evt-4",
        venue_id: null,
        venue_name_raw: "Boll Family YMCA, 1401 Broadway St, Detroit, 48226, United States",
        venue_address_raw: null,
        venue_city_raw: null,
      },
    ];
    const counts = await repairVenueRawReparse({
      SUPABASE_URL: "https://example.test",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      fetchCandidates: async () => events,
      buildCanonicalMaps: async () => ({ byName: new Map(), byId: new Map(), byAddress: new Map() }),
      applyPatchFn: async () => false, // simulate concurrent change
    });
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(counts.skippedConcurrentChange, 1);
  }

  console.log("venue-raw-reparse-repair.test.js: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
