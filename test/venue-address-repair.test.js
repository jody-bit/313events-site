// test/venue-address-repair.test.js — SH.1 (Metadata Self-Healing).
//
// Pure-logic tests for api/_lib/venue-lookup.js's SH.1 additions:
// buildVenueDetailsMap, buildLearnedVenueAddressCityMap, and the core
// decision function resolveVenueAddressCityRepair. Covers every scenario
// listed in the Product Owner's 2026-09-21 "APPROVED WITH REFINEMENTS"
// review (refinement 9), plus the map-builder ambiguity/conflict logic
// that backs it.
//
// resolveVenueAddressCityRepair itself takes no network dependency, so
// most of these are plain synchronous assertions against in-memory Maps
// shaped exactly like buildVenueDetailsMap/buildLearnedVenueAddressCityMap
// produce. A handful of tests exercise the map builders themselves against
// a mocked fetch to prove the ambiguity/conflict detection they're
// responsible for.
//
// Run: node test/venue-address-repair.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshLib() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/_lib/venue-lookup.js`);
}

function canonical(byNameEntries, byIdEntries) {
  return { byName: new Map(byNameEntries), byId: new Map(byIdEntries) };
}

async function run() {
  const {
    resolveVenueAddressCityRepair,
    buildVenueDetailsMap,
    buildLearnedVenueAddressCityMap,
    isBlank,
  } = freshLib();

  // --- 1. venue_id + canonical address/city -> missing fields repaired ---
  {
    const canon = canonical(
      [],
      [["v1", { id: "v1", address: "123 Main St", city: "Detroit" }]]
    );
    const event = { venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null };
    const patch = resolveVenueAddressCityRepair(event, canon, new Map());
    assert.deepStrictEqual(patch, { venue_address_raw: "123 Main St", venue_city_raw: "Detroit" });
  }
  console.log("PASS: venue_id + canonical address/city repairs both blank fields");

  // --- 2. venue_id + existing event address/city -> existing values preserved ---
  {
    const canon = canonical(
      [],
      [["v1", { id: "v1", address: "999 Other St", city: "Ferndale" }]]
    );
    const event = { venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: "123 Main St", venue_city_raw: "Detroit" };
    const patch = resolveVenueAddressCityRepair(event, canon, new Map());
    assert.deepStrictEqual(patch, {}, "a fully-populated event must never be touched, even if canonical data disagrees");
  }
  console.log("PASS: venue_id + fully-populated event leaves existing address/city untouched");

  // --- 3. only address missing -> only address repaired ---
  {
    const canon = canonical([], [["v1", { id: "v1", address: "123 Main St", city: "Detroit" }]]);
    const event = { venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: "Detroit" };
    const patch = resolveVenueAddressCityRepair(event, canon, new Map());
    assert.deepStrictEqual(patch, { venue_address_raw: "123 Main St" });
  }
  console.log("PASS: only venue_address_raw missing repairs only that field");

  // --- 4. only city missing -> only city repaired ---
  {
    const canon = canonical([], [["v1", { id: "v1", address: "123 Main St", city: "Detroit" }]]);
    const event = { venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: "123 Main St", venue_city_raw: null };
    const patch = resolveVenueAddressCityRepair(event, canon, new Map());
    assert.deepStrictEqual(patch, { venue_city_raw: "Detroit" });
  }
  console.log("PASS: only venue_city_raw missing repairs only that field");

  // --- 5. no venue_id + exact canonical-name match -> canonical data used,
  //     and venue_id itself is resolved ---
  {
    const canon = canonical(
      [["the loft", { id: "v1", address: "123 Main St", city: "Detroit" }]],
      [["v1", { id: "v1", address: "123 Main St", city: "Detroit" }]]
    );
    const event = { venue_id: null, venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null };
    const patch = resolveVenueAddressCityRepair(event, canon, new Map());
    assert.deepStrictEqual(patch, { venue_address_raw: "123 Main St", venue_city_raw: "Detroit", venue_id: "v1" });
  }
  console.log("PASS: no venue_id + exact canonical name match resolves venue_id and canonical address/city");

  // --- 6. canonical data beats learned historical data ---
  {
    const canon = canonical(
      [["the loft", { id: "v1", address: "123 Main St", city: "Detroit" }]],
      [["v1", { id: "v1", address: "123 Main St", city: "Detroit" }]]
    );
    const learned = new Map([["the loft", { address: "999 Wrong Historical Ave", city: "Ferndale" }]]);
    const event = { venue_id: null, venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null };
    const patch = resolveVenueAddressCityRepair(event, canon, learned);
    assert.deepStrictEqual(patch, { venue_address_raw: "123 Main St", venue_city_raw: "Detroit", venue_id: "v1" });
  }
  console.log("PASS: canonical data wins over conflicting learned historical data");

  // --- 7. learned exact-name data fills a gap only when canonical data is absent ---
  {
    const canon = canonical([], []); // no canonical venue at all for this name
    const learned = new Map([["popps packing annex", { address: "477 Sherman St", city: "Hamtramck" }]]);
    const event = { venue_id: null, venue_name_raw: "Popps Packing Annex", venue_address_raw: null, venue_city_raw: null };
    const patch = resolveVenueAddressCityRepair(event, canon, learned);
    assert.deepStrictEqual(patch, { venue_address_raw: "477 Sherman St", venue_city_raw: "Hamtramck" });
    assert.strictEqual(patch.venue_id, undefined, "learned-tier matches never resolve venue_id — there is no canonical venue to link");
  }
  console.log("PASS: learned historical data fills a gap only when no canonical value exists, and never sets venue_id");

  // --- 8. ambiguous canonical name (via the real map builder) -> no repair ---
  {
    const rows = [
      { id: "v1", name: "The Loft", address: "1 First St", city: "Detroit" },
      { id: "v2", name: "the loft", address: "2 Second St", city: "Ferndale" }, // same normalized name, different venue
    ];
    global.fetch = async (url) => {
      assert.ok(url.includes("/rest/v1/venues"));
      return { ok: true, status: 200, json: async () => rows };
    };
    const canon = await buildVenueDetailsMap("https://example.supabase.co", "test-key");
    const event = { venue_id: null, venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null };
    const patch = resolveVenueAddressCityRepair(event, canon, new Map());
    assert.deepStrictEqual(patch, {}, "an ambiguous canonical name must resolve to no repair, not a guess");
  }
  console.log("PASS: an ambiguous canonical venue name (two venues, same name) resolves to no repair");

  // --- 9. no exact match at all (canonical or learned) -> no repair ---
  {
    const canon = canonical([["some other venue", { id: "v9", address: "1 X St", city: "Detroit" }]], []);
    const learned = new Map([["yet another venue", { address: "2 Y St", city: "Detroit" }]]);
    const event = { venue_id: null, venue_name_raw: "Totally Unknown Venue", venue_address_raw: null, venue_city_raw: null };
    const patch = resolveVenueAddressCityRepair(event, canon, learned);
    assert.deepStrictEqual(patch, {});
  }
  console.log("PASS: no exact canonical or learned match leaves the event unresolved (no fuzzy fallback)");

  // --- 10. conflicting learned historical data -> that name dropped from the learned map entirely ---
  {
    const rows = [
      { venue_name_raw: "Popps Packing Annex", venue_address_raw: "477 Sherman St", venue_city_raw: "Hamtramck", updated_at: "2026-09-01T00:00:00Z" },
      { venue_name_raw: "Popps Packing Annex", venue_address_raw: "999 Different Ave", venue_city_raw: "Hamtramck", updated_at: "2026-01-01T00:00:00Z" },
    ];
    global.fetch = async (url) => {
      assert.ok(url.includes("/rest/v1/events"));
      return { ok: true, status: 200, json: async () => rows };
    };
    const learned = await buildLearnedVenueAddressCityMap("https://example.supabase.co", "test-key");
    assert.strictEqual(learned.has("popps packing annex"), false, "conflicting historical addresses for the same name must not be guessed at");
  }
  console.log("PASS: conflicting historical addresses for the same venue name are dropped from the learned map, not guessed");

  // --- 11. repair never touches unrelated fields; input event object is never mutated ---
  {
    const canon = canonical([], [["v1", { id: "v1", address: "123 Main St", city: "Detroit" }]]);
    const event = {
      venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null,
      status: "approved", description: "do not touch", category: "music", start_date: "2026-10-01",
    };
    const patch = resolveVenueAddressCityRepair(event, canon, new Map());
    const allowedKeys = new Set(["venue_address_raw", "venue_city_raw", "venue_id"]);
    for (const k of Object.keys(patch)) assert.ok(allowedKeys.has(k), `unexpected key in patch: ${k}`);
    assert.strictEqual(event.status, "approved", "the input event object itself must never be mutated");
    assert.strictEqual(event.description, "do not touch");
  }
  console.log("PASS: patch never contains unrelated fields, and the input event object is never mutated");

  // --- 12. malformed/missing inputs degrade safely (no throw); repair "failure" never corrupts the event ---
  {
    assert.deepStrictEqual(resolveVenueAddressCityRepair(null, canonical([], []), new Map()), {});
    assert.deepStrictEqual(resolveVenueAddressCityRepair({}, undefined, undefined), {});
    assert.strictEqual(isBlank(""), true);
    assert.strictEqual(isBlank("   "), true);
    assert.strictEqual(isBlank(null), true);
    assert.strictEqual(isBlank(undefined), true);
    assert.strictEqual(isBlank("123 Main St"), false);
  }
  console.log("PASS: malformed/missing inputs degrade safely without throwing, never corrupting the event");

  // --- 13. map builders fail soft to empty maps on fetch failure ---
  {
    global.fetch = async () => { throw new Error("network down"); };
    const canon = await buildVenueDetailsMap("https://example.supabase.co", "test-key");
    assert.strictEqual(canon.byName.size, 0);
    assert.strictEqual(canon.byId.size, 0);
    const learned = await buildLearnedVenueAddressCityMap("https://example.supabase.co", "test-key");
    assert.strictEqual(learned.size, 0);
  }
  console.log("PASS: map builders fail soft (empty maps) on a network/fetch failure, never throw");

  console.log("\nAll venue-address-repair (SH.1) unit tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
