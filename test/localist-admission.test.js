"use strict";
// Localist admission: explicit paid cost overrides the generic free flag; explicit free admission is recognized;
// unknown and conditional stay as the source flag says. Four source fixtures (before = old `e.free === true`).
const assert = require("assert");
const L = require("../api/_lib/localist-rows");

const rowFor = (e) => {
  const tenant = { tenantSlug: "t", source: "T", defaultStatus: "approved" };
  const place = { name: "Venue", street: null, city: null };
  const w = [{ event_instance: { id: 1, start: "2026-11-13T19:00:00-05:00", end: null, all_day: false } }];
  return L.rowsForEvent({ event: { id: 1, title: "X", ...e }, instanceWrappers: w, place, tenant, windowStart: "2026-11-09", windowEnd: "2027-01-01", categoryFromText: () => null })[0];
};
const FIX = [
  // [id, event, before (old rule), after (new rule)]
  ["0852e6f9 BGSU recital", { free: false, ticket_cost: null, description_text: "Morgan Thompson, clarinet, will present a student recital. This event is free and open to the public." }, false, true],
  ["798f068d Macomb market", { free: true, ticket_cost: "$5 (Under 12 Free)", description_text: "Admission: $5 (Under 12 Free)" }, true, false],
  ["b033a1b9 BGSU football", { free: true, ticket_cost: "Free Ticket Claim for Students; General Public starts at $10", description_text: "Celebrate Founders Day" }, true, false],
  ["control: Falcon Fan Fest", { free: true, ticket_cost: "FREE", description_text: "Fan Fest" }, true, true],
];
for (const [name, e, before, after] of FIX) {
  assert.strictEqual(e.free === true, before, `${name}: before`);
  assert.strictEqual(rowFor(e).is_free, after, `${name}: after`);
}
// Preserved / not inferred.
assert.strictEqual(rowFor({ free: false, ticket_cost: null, description_text: "Concert. Parking is free." }).is_free, false);
assert.strictEqual(rowFor({ free: false, ticket_cost: null, description_text: "Free admission for members only." }).is_free, false);
assert.strictEqual(rowFor({ free: false, ticket_cost: null, description_text: "Free admission is not available." }).is_free, false);
assert.strictEqual(rowFor({ free: false, ticket_cost: "$0", description_text: "" }).is_free, false, "$0 is not inferred as free");
assert.strictEqual(rowFor({ free: true, ticket_cost: "$0", description_text: "" }).is_free, true, "flag stands when cost is not a positive amount");
assert.strictEqual(rowFor({ free: false, ticket_cost: "$10", description_text: "This event is free and open to the public." }).is_free, false, "paid cost beats description");
assert.strictEqual(rowFor({ free: true, ticket_cost: null, description_text: "" }).is_free, true, "flag with no cost stands");
assert.strictEqual(rowFor({ free: false, ticket_cost: null, description_text: "" }).is_free, false);
console.log("PASS: localist admission");
