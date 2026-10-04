// test/venue-lookup-placeholder-and-city.test.js — two rules added to the
// venue lookup on 2026-10-04, both about NAME matches:
//
//   1. A placeholder is not a venue. "Venue TBA" is never matched by name to
//      the venues row of that name, and never takes that row's city.
//   2. A name match is refused when the event's own city says otherwise.
//
// WHAT WAS MEASURED (production, 2026-10-04): eight upcoming public events —
// four in Livonia, two in St. Clair Shores, one each in Madison Heights and
// Sterling Heights — were linked to the venues row "Venue TBA". That row's
// city is "Detroit", the column's default. The public view shows a linked
// venue's city ahead of the event's own, so all eight were listed in
// Detroit. Their feed had given a city and no venue name; the placeholder
// name matched the placeholder row.
//
// Run: node test/venue-lookup-placeholder-and-city.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const {
  resolveVenueAddressCityRepair, resolveVenueFromCandidate, isPlaceholderVenueName, citiesConflict, normalizeVenueName, normalizeAddressCity,
} = require(`${REPO_DIR}/api/_lib/venue-lookup.js`);

function maps(venues) {
  const byName = new Map(), byId = new Map(), byAddress = new Map();
  for (const v of venues) {
    byId.set(v.id, v);
    byName.set(normalizeVenueName(v.name), v);
    const key = normalizeAddressCity(v.address, v.city);
    if (key) byAddress.set(key, v);
  }
  return { byName, byId, byAddress };
}

const TBA = { id: "venue-tba", name: "Venue TBA", address: null, city: "Detroit" };
const SECRET = { id: "venue-secret", name: "Venue TBA (secret loft, revealed to ticket holders)", address: null, city: "Detroit" };
const DETROIT_CC = { id: "venue-cc-det", name: "Community Center", address: "100 Main St", city: "Detroit" };
const BAR = { id: "venue-bar", name: "Paris Bar", address: "1300 Porter St", city: "Detroit" };
const M = maps([TBA, SECRET, DETROIT_CC, BAR]);
const NO_LEARNED = new Map();

// --- 1. The placeholder is never matched by name. ---
{
  for (const name of ["Venue TBA", "venue tba", "  Venue   TBA ", "Location TBA", "TBA", "TBD", "To Be Announced"]) {
    assert.strictEqual(isPlaceholderVenueName(name), true, `${JSON.stringify(name)} is a placeholder`);
  }
  for (const name of ["Venue TBA (Paxahau)", "Venue TBA (secret loft, revealed to ticket holders)", "TBA - Secret Location", "The TBA Lounge", "", null, undefined]) {
    assert.strictEqual(isPlaceholderVenueName(name), false, `${JSON.stringify(name)} is not the generic placeholder`);
  }

  // The live case: a city, no venue name.
  const livonia = { venue_id: null, venue_name_raw: "Venue TBA", venue_address_raw: null, venue_city_raw: "Livonia" };
  assert.deepStrictEqual(resolveVenueAddressCityRepair(livonia, M, NO_LEARNED), {}, "a Livonia event is not linked to the Detroit placeholder");

  // No city at all: still not "Detroit".
  const unknown = { venue_id: null, venue_name_raw: "Venue TBA", venue_address_raw: null, venue_city_raw: null };
  assert.deepStrictEqual(resolveVenueAddressCityRepair(unknown, M, NO_LEARNED), {}, "an unknown location is not given the placeholder row's city");

  // Nor through what other events called "Venue TBA" happened to store.
  const learned = new Map([["venue tba", { address: "39000 Van Born Road", city: "Canton" }]]);
  assert.deepStrictEqual(resolveVenueAddressCityRepair(unknown, M, learned), {}, "another event's address is not learned onto a placeholder");

  // Nor as a parsed candidate.
  assert.strictEqual(resolveVenueFromCandidate({ name: "Venue TBA", address: null, city: "Livonia" }, M), null);
  assert.strictEqual(resolveVenueFromCandidate({ name: "Venue TBA", address: null, city: null }, M), null);
}
console.log("PASS: \"Venue TBA\" is never matched by name — no link, no city, no learned address");

// --- 1b. What is unchanged around the placeholder. ---
{
  // An event already linked to a placeholder row (tier A) is left as it is.
  const linked = { venue_id: "venue-tba", venue_name_raw: "Venue TBA", venue_address_raw: null, venue_city_raw: null };
  assert.deepStrictEqual(resolveVenueAddressCityRepair(linked, M, NO_LEARNED), { venue_city_raw: "Detroit" });
  // A specific, deliberately created row is a different name and still matches.
  const secret = { venue_id: null, venue_name_raw: "Venue TBA (secret loft, revealed to ticket holders)", venue_address_raw: null, venue_city_raw: null };
  assert.deepStrictEqual(resolveVenueAddressCityRepair(secret, M, NO_LEARNED), { venue_city_raw: "Detroit", venue_id: "venue-secret" });
  // A real venue still resolves exactly as before.
  const bar = { venue_id: null, venue_name_raw: "Paris Bar", venue_address_raw: null, venue_city_raw: null };
  assert.deepStrictEqual(resolveVenueAddressCityRepair(bar, M, NO_LEARNED), { venue_address_raw: "1300 Porter St", venue_city_raw: "Detroit", venue_id: "venue-bar" });
}
console.log("PASS: an existing link, a specific placeholder row and a real venue all behave as before");

// --- 2. A name match is refused when the event's own city says otherwise. ---
{
  assert.strictEqual(citiesConflict("Livonia", "Detroit"), true);
  assert.strictEqual(citiesConflict("Detroit", "Detroit"), false);
  assert.strictEqual(citiesConflict("detroit", "Detroit"), false);
  assert.strictEqual(citiesConflict("Detroit, MI 48207", "Detroit"), false, "a city with a state and ZIP after it is the same city");
  assert.strictEqual(citiesConflict("Grosse Pointe Park", "Grosse Pointe"), false, "one contains the other: not treated as a contradiction");
  assert.strictEqual(citiesConflict(null, "Detroit"), false, "no stated city contradicts nothing");
  assert.strictEqual(citiesConflict("Livonia", null), false);
  assert.strictEqual(citiesConflict("", ""), false);

  // "Community Center" in Livonia is not the Detroit venue of the same name.
  const livoniaCc = { venue_id: null, venue_name_raw: "Community Center", venue_address_raw: null, venue_city_raw: "Livonia" };
  assert.deepStrictEqual(resolveVenueAddressCityRepair(livoniaCc, M, NO_LEARNED), {}, "same name, different stated city: no address, no link");
  assert.strictEqual(resolveVenueFromCandidate({ name: "Community Center", address: null, city: "Livonia" }, M), null);
  // ...nor is another event's address for that name learned across cities.
  const learned = new Map([["rec center", { address: "5 Elm St", city: "Troy" }]]);
  const livoniaRec = { venue_id: null, venue_name_raw: "Rec Center", venue_address_raw: null, venue_city_raw: "Livonia" };
  assert.deepStrictEqual(resolveVenueAddressCityRepair(livoniaRec, M, learned), {});

  // Same city, or no stated city: exactly as before.
  const detroitCc = { venue_id: null, venue_name_raw: "Community Center", venue_address_raw: null, venue_city_raw: "Detroit" };
  assert.deepStrictEqual(resolveVenueAddressCityRepair(detroitCc, M, NO_LEARNED), { venue_address_raw: "100 Main St", venue_id: "venue-cc-det" });
  const noCityCc = { venue_id: null, venue_name_raw: "Community Center", venue_address_raw: null, venue_city_raw: null };
  assert.deepStrictEqual(resolveVenueAddressCityRepair(noCityCc, M, NO_LEARNED), { venue_address_raw: "100 Main St", venue_city_raw: "Detroit", venue_id: "venue-cc-det" });
  assert.strictEqual(resolveVenueFromCandidate({ name: "Community Center", address: null, city: "Detroit" }, M), DETROIT_CC);
  assert.strictEqual(resolveVenueFromCandidate({ name: "Community Center", address: null, city: null }, M), DETROIT_CC);
  // An existing link (tier A) is not second-guessed by a city difference.
  const linkedElsewhere = { venue_id: "venue-bar", venue_name_raw: "Paris Bar", venue_address_raw: null, venue_city_raw: "Hamtramck" };
  assert.deepStrictEqual(resolveVenueAddressCityRepair(linkedElsewhere, M, NO_LEARNED), { venue_address_raw: "1300 Porter St" });
  // The address tier already required the same city.
  assert.strictEqual(resolveVenueFromCandidate({ name: null, address: "1300 Porter St", city: "Detroit" }, M), BAR);
  assert.strictEqual(resolveVenueFromCandidate({ name: null, address: "1300 Porter St", city: "Livonia" }, M), null);
}
console.log("PASS: a name match in a different stated city is refused; the same city, no city, an existing link and the address tier are unchanged");

console.log("\nAll venue-lookup-placeholder-and-city.test.js checks passed.");
