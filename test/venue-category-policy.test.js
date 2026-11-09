"use strict";
const assert = require("assert");
const { applyVenueCategoryPolicy: apply, ANDY_ARTS_ID } = require("../api/_lib/venue-category-policy");
for (const name of ["Andy Arts", "ANDY ARTS CENTER", "AndyArts"]) {
  const row = { venue_name_raw: name, venue_city_raw: "Detroit", category: "nightlife" };
  assert.equal(apply(row).category, "visual");
  assert.equal(row.category, "nightlife");
}
assert.equal(apply({ venue_id: ANDY_ARTS_ID, category: "nightlife" }).category, "visual");
for (const row of [
  { venue_name_raw: "Andy Arts", venue_city_raw: "Chicago", category: "nightlife" },
  { venue_name_raw: "Other Gallery", venue_city_raw: "Detroit", category: "nightlife" },
  { venue_id: ANDY_ARTS_ID, category: "training" },
]) assert.strictEqual(apply(row), row);
// Stored owner corrections still win, as in the shared writer's execution order.
const { protectOwnerCorrections } = require("../api/_lib/event-contract");
const input = { external_id: "ra-test", venue_id: ANDY_ARTS_ID, category: "nightlife" };
const stored = { category: "training", internal_note: "OWNER-CORRECTION 2026-11-07 owner fields=category | class" };
assert.equal(protectOwnerCorrections([apply(input)], new Map([["ra-test",stored]])).rows[0].category,"training");
console.log("ok Andy Arts exact category policy");
