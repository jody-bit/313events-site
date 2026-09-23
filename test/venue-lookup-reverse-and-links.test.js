// test/venue-lookup-reverse-and-links.test.js — api/_lib/venue-lookup.js's
// 2026-09-23 additions: normalizeAddressCity, buildVenueDetailsMap's new
// byAddress map, resolveVenueNameFromAddressRepair (ADDRESS -> VENUE NAME,
// the mirror of SH.1's existing NAME -> ADDRESS tier), and
// resolveDigitalHomeLink (last-resort venue website/Facebook fallback).
//
// Plain Node assert, no dependencies. Does not re-test SH.1's existing
// forward tiers (test/venue-lookup.test.js / test/sh1-repair-existing-
// events.test.js already cover those and are unmodified).
// Run: node test/venue-lookup-reverse-and-links.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "test-key";

function freshLib() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/_lib/venue-lookup.js`);
}

function mockVenuesFetch(rows) {
  return async (url) => {
    if (url.includes("/rest/v1/venues")) {
      return { ok: true, status: 200, json: async () => rows };
    }
    throw new Error("unmocked URL in test: " + url);
  };
}

async function run() {
  const {
    normalizeAddressCity,
    buildVenueDetailsMap,
    resolveVenueNameFromAddressRepair,
    resolveDigitalHomeLink,
  } = freshLib();

  // --- 1. normalizeAddressCity: exact transform. ---
  {
    assert.strictEqual(normalizeAddressCity("4140 Woodward Ave", "Detroit"), "4140 woodward ave|detroit");
    assert.strictEqual(normalizeAddressCity("  4140  Woodward   Ave ", "  DETROIT "), "4140 woodward ave|detroit");
    assert.strictEqual(normalizeAddressCity(null, "Detroit"), "", "no address at all must never produce a matchable key");
    assert.strictEqual(normalizeAddressCity("", "Detroit"), "");
  }
  console.log("PASS: normalizeAddressCity trims/lowercases/collapses whitespace, and blank address never yields a key");

  // --- 2. Big Time Bingo / Garden Bowl scenario: an event with a real
  //     address on file but no venue name at all resolves to the canonical
  //     venue's own name -- exactly the "resolved once, reused for every
  //     recurrence" behavior the Product Owner asked for, IF the canonical
  //     venue row already exists (confirmed live 2026-09-23: it does not
  //     yet -- supabase/update_2026-09-22_gardenbowl-venue.sql is prepared
  //     but not yet run; this test proves the resolution code path itself
  //     is correct and ready for the moment that row exists). ---
  {
    global.fetch = mockVenuesFetch([
      { id: "venue-garden-bowl", name: "Garden Bowl", address: "4140 Woodward Ave", city: "Detroit", website: null, facebook_url: null },
    ]);
    const canonicalMaps = await buildVenueDetailsMap(SUPABASE_URL, SUPABASE_KEY);
    const event = { venue_id: null, venue_name_raw: null, venue_address_raw: "4140 Woodward Ave", venue_city_raw: "Detroit" };
    const patch = resolveVenueNameFromAddressRepair(event, canonicalMaps);
    assert.deepStrictEqual(patch, { venue_id: "venue-garden-bowl", venue_name_raw: "Garden Bowl" });
  }
  console.log("PASS: an event with a known address but no venue name resolves the canonical venue name (Garden Bowl scenario)");

  // --- 3. No canonical venue at all for this address (today's actual
  //     production state for Garden Bowl) -- stays unresolved, never
  //     invents an address-to-name mapping. ---
  {
    global.fetch = mockVenuesFetch([]);
    const canonicalMaps = await buildVenueDetailsMap(SUPABASE_URL, SUPABASE_KEY);
    const event = { venue_id: null, venue_name_raw: null, venue_address_raw: "4140 Woodward Ave", venue_city_raw: "Detroit" };
    const patch = resolveVenueNameFromAddressRepair(event, canonicalMaps);
    assert.deepStrictEqual(patch, {}, "no canonical venue row for this address must resolve to nothing, not a guess");
  }
  console.log("PASS: an address with no canonical venue row at all stays unresolved (today's real Garden Bowl production state)");

  // --- 4. Ambiguous address (two canonical venues share the same normalized
  //     address+city) -- never guess which one. ---
  {
    global.fetch = mockVenuesFetch([
      { id: "venue-a", name: "Room A", address: "123 Main St", city: "Detroit" },
      { id: "venue-b", name: "Room B", address: "123 Main St", city: "Detroit" },
    ]);
    const canonicalMaps = await buildVenueDetailsMap(SUPABASE_URL, SUPABASE_KEY);
    const event = { venue_id: null, venue_name_raw: null, venue_address_raw: "123 Main St", venue_city_raw: "Detroit" };
    const patch = resolveVenueNameFromAddressRepair(event, canonicalMaps);
    assert.deepStrictEqual(patch, {}, "an ambiguous address match (two venues, one address) must never be guessed");
  }
  console.log("PASS: an ambiguous address match (shared by two canonical venues) is left unresolved, never guessed");

  // --- 5. Never second-guesses an existing venue_id or a present venue name
  //     -- this tier only fires when there is truly nothing to go on but an
  //     address. ---
  {
    global.fetch = mockVenuesFetch([{ id: "venue-garden-bowl", name: "Garden Bowl", address: "4140 Woodward Ave", city: "Detroit" }]);
    const canonicalMaps = await buildVenueDetailsMap(SUPABASE_URL, SUPABASE_KEY);
    assert.deepStrictEqual(
      resolveVenueNameFromAddressRepair({ venue_id: "already-linked", venue_name_raw: null, venue_address_raw: "4140 Woodward Ave", venue_city_raw: "Detroit" }, canonicalMaps),
      {},
      "an event already linked to a venue_id must never be re-resolved by this tier"
    );
    assert.deepStrictEqual(
      resolveVenueNameFromAddressRepair({ venue_id: null, venue_name_raw: "Some Other Name", venue_address_raw: "4140 Woodward Ave", venue_city_raw: "Detroit" }, canonicalMaps),
      {},
      "an event with a venue_name_raw already present must never be overwritten by an address-based guess"
    );
  }
  console.log("PASS: resolveVenueNameFromAddressRepair never touches an event that already has a venue_id or a venue name");

  // --- 6. resolveDigitalHomeLink: falls back to a resolved venue's website,
  //     then Facebook, only when the event has neither ticket_url nor
  //     event_url of its own. ---
  {
    const canonicalMaps = { byId: new Map([["venue-1", { website: "https://example.com", facebook_url: "https://facebook.com/example" }]]) };
    assert.strictEqual(
      resolveDigitalHomeLink({ venue_id: "venue-1", ticket_url: null, event_url: null }, canonicalMaps),
      "https://example.com",
      "website is preferred over facebook_url when both are present"
    );

    const facebookOnlyMaps = { byId: new Map([["venue-2", { website: null, facebook_url: "https://facebook.com/example2" }]]) };
    assert.strictEqual(
      resolveDigitalHomeLink({ venue_id: "venue-2", ticket_url: null, event_url: null }, facebookOnlyMaps),
      "https://facebook.com/example2",
      "falls back to facebook_url when website is blank"
    );
  }
  console.log("PASS: resolveDigitalHomeLink prefers website, falls back to facebook_url");

  // --- 7. Never proposed when the event already has a ticket_url or
  //     event_url -- last-resort only. ---
  {
    const canonicalMaps = { byId: new Map([["venue-1", { website: "https://example.com" }]]) };
    assert.strictEqual(resolveDigitalHomeLink({ venue_id: "venue-1", ticket_url: "https://tickets.example.com/x", event_url: null }, canonicalMaps), null);
    assert.strictEqual(resolveDigitalHomeLink({ venue_id: "venue-1", ticket_url: null, event_url: "https://example.com/event" }, canonicalMaps), null);
  }
  console.log("PASS: resolveDigitalHomeLink is never proposed when a real ticket_url or event_url already exists");

  // --- 8. No website or facebook_url on file for the resolved venue --
  //     resolves to null, never invents/searches for one (today's real
  //     production state: 0 of 118 venues have either column populated,
  //     confirmed live 2026-09-23). ---
  {
    const canonicalMaps = { byId: new Map([["venue-trinosophes", { website: null, facebook_url: null }]]) };
    assert.strictEqual(resolveDigitalHomeLink({ venue_id: "venue-trinosophes", ticket_url: null, event_url: null }, canonicalMaps), null);
  }
  console.log("PASS: no digital-home link is proposed when the venue has neither website nor facebook_url on file (today's real production state)");

  // --- 9. Falls back to an already-embedded event.venues join (the shape
  //     api/admin-events.js's incomplete=1 query returns) when venue_id
  //     itself isn't resolvable via the canonical map. ---
  {
    const emptyMaps = { byId: new Map() };
    const event = { venue_id: null, ticket_url: null, event_url: null, venues: { website: "https://embedded-example.com" } };
    assert.strictEqual(resolveDigitalHomeLink(event, emptyMaps), "https://embedded-example.com");
  }
  console.log("PASS: falls back to an already-embedded venues join when venue_id isn't in the canonical map");

  console.log("\nAll venue-lookup.js reverse-resolution and digital-home-link tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
