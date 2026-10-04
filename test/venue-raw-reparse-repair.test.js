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

  // --- 3. Genuinely unparseable free text with no place in it is left
  //     completely untouched — no PATCH attempted at all, honest gap
  //     preserved. (Until 2026-10-04 this section used the documented
  //     Royal Oak "Downtown Events" string, which ends in the calendar's
  //     own "Royal Oak MI 48067"; that string now has its city kept --
  //     section 3b -- so the "nothing recoverable" case is shown with text
  //     that really has nothing recoverable.) ---
  {
    const events = [
      {
        id: "evt-3",
        venue_id: null,
        venue_name_raw: "Fifth Avenue Pedestrian Plaza (between 4th and 5th)",
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

  // --- 3b. BUG-012 (2026-10-04): text that cannot be split into a venue
  //     name but ends in the source's own "<City> <ST> <ZIP>" gets its CITY
  //     written -- and a plain street address when one is stated -- with
  //     venue_name_raw left exactly as it is and no venue invented. All
  //     four strings are real production venue_name_raw values. ---
  {
    const events = [
      { id: "evt-3b-1", venue_id: null, venue_address_raw: null, venue_city_raw: null,
        venue_name_raw: "Meet at Pronto/Five 15: 600 S Washington Ave, Royal Oak, MI 48067 - Royal Oak MI 48067" },
      { id: "evt-3b-2", venue_id: null, venue_address_raw: null, venue_city_raw: null,
        venue_name_raw: "- Wayne County Community College 21000 Northline Rd. Taylor MI 48180" },
      { id: "evt-3b-3", venue_id: null, venue_address_raw: null, venue_city_raw: null,
        venue_name_raw: "Join us as we celebrate Founder's Day! More information to come! - Rochester MI 48307" },
      { id: "evt-3b-4", venue_id: null, venue_address_raw: null, venue_city_raw: null,
        venue_name_raw: "-" },
    ];
    const patches = [];
    const counts = await repairVenueRawReparse({
      SUPABASE_URL: "https://example.test",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      fetchCandidates: async () => events,
      buildCanonicalMaps: async () => ({ byName: new Map(), byId: new Map(), byAddress: new Map() }),
      applyPatchFn: async (_url, _headers, id, patch) => { patches.push({ id, patch }); return true; },
    });
    assert.strictEqual(counts.totalConsidered, 4);
    assert.strictEqual(counts.reparsed, 3);
    assert.strictEqual(counts.cityFromTrailingText, 3);
    assert.strictEqual(counts.writtenAsRawAddressCity, 3);
    assert.strictEqual(counts.resolvedToCanonicalVenue, 0);
    assert.strictEqual(counts.stillUnparseable, 1, 'a bare "-" states nothing: nothing to write here (the feed job rewrites it on its next run)');
    assert.strictEqual(counts.written, 3);
    const byId = Object.fromEntries(patches.map((p) => [p.id, p.patch]));
    assert.deepStrictEqual(byId["evt-3b-1"], { venue_city_raw: "Royal Oak" });
    assert.deepStrictEqual(byId["evt-3b-2"], { venue_address_raw: "21000 Northline Rd.", venue_city_raw: "Taylor" });
    assert.deepStrictEqual(byId["evt-3b-3"], { venue_city_raw: "Rochester" });
    assert.ok(!("evt-3b-4" in byId));
    for (const { patch } of patches) {
      assert.ok(!("venue_name_raw" in patch), "the stored location text is never rewritten");
      assert.ok(!("venue_id" in patch), "no venue is invented");
    }
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
