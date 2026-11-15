"use strict";
const assert = require("assert");
const path = require("path");
const { resolveVenue } = require(path.join(__dirname, "..", "api", "_lib", "venue-resolver"));

const venues = [
  { id: "v1", name: "Fillmore Detroit", address: "2115 Woodward Ave", city: "Detroit", zip: "48201" },
  { id: "v2", name: "Dupe Hall", address: "1 A St", city: "Detroit" },
  { id: "v3", name: "Dupe Hall", address: "2 B St", city: "Ferndale" },
  { id: "v4", name: "Small Room", address: "9 C St", city: "Hamtramck" },
];
const knowledge = [
  { venue_id: "v1", tier: "canonical", sources: ["a", "b"], url: "https://example.org" },
  { venue_id: "v4", tier: "learned", sources: ["a"] },
];
const ctx = { venues, knowledge };
const r = (i) => resolveVenue(i, ctx);

let x = r({ venue_name_raw: "fillmore  detroit", city: "", address: "" });
assert.strictEqual(x.status, "verified");
assert.strictEqual(x.identity.venue_id, "v1");
assert.deepStrictEqual(Object.keys(x.fill).sort(), ["address", "city", "zip"]);
assert.strictEqual(x.write, "none");

x = r({ venue_name_raw: "Fillmore Detroit", address: "mine", city: "Detroit" });
assert.deepStrictEqual(x.fill, { zip: "48201" }, "never overwrites a stated value");

assert.strictEqual(r({ venue_name_raw: "Small Room" }).status, "proposed");
assert.strictEqual(r({ venue_name_raw: "Dupe Hall" }).status, "ambiguous");
assert.strictEqual(r({ venue_name_raw: "Dupe Hall" }).candidates.length, 2);
assert.strictEqual(r({ venue_name_raw: "Nowhere Bar" }).status, "unresolved");
assert.strictEqual(r({ venue_name_raw: "Fillmore Detroit", city: "Toledo" }).status, "conflict");
assert.strictEqual(r({ venue_name_raw: "Fillmore Detroit", city: "Toledo" }).flags[0], "EXISTING_VALUE_CONFLICT");
assert.strictEqual(r({ venue_name_raw: "", address: "2115 Woodward Ave", city: "Detroit" }).flags[0], "TBA");

for (const [n, f] of [["Online", "ONLINE"], ["Food Truck Rally", "MOBILE"], ["Multiple venues", "MULTISITE"], ["TBA", "TBA"]]) {
  x = r({ venue_name_raw: n });
  assert.strictEqual(x.status, "preserved");
  assert.ok(x.flags.includes(f), n);
  assert.deepStrictEqual(x.fill, {});
}
x = r({ venue_name_raw: "Fillmore Detroit", internal_note: "OWNER-CORRECTION 2026 e1 fields=venue" });
assert.strictEqual(x.status, "preserved");
assert.ok(x.flags.includes("OWNER_LOCKED"));
assert.strictEqual(r({ venue_name_raw: "Fillmore Detroit", source: "Manual" }).status, "preserved");

// address tier
assert.strictEqual(r({ venue_name_raw: "The Rock Room", address: "9 C St", city: "Hamtramck" }).identity.venue_id, "v4");
// pure: input not mutated
const inp = { venue_name_raw: "Fillmore Detroit" }; r(inp);
assert.deepStrictEqual(inp, { venue_name_raw: "Fillmore Detroit" });
console.log("venue-resolver ok");
