"use strict";

// Owner directive, 2026-11-07: Andy Arts is an art gallery/school, never
// a nightlife venue. This exact identity policy is not a rule for all galleries.
const ANDY_ARTS_ID = "5beea3fe-f94b-49f3-874f-da55342340b8";
const ANDY_NAMES = new Set(["andy arts", "andyarts", "andy arts center"]);
function appliesToAndyArts(row) {
  if (!row || typeof row !== "object") return false;
  if (row.venue_id === ANDY_ARTS_ID) return true;
  const name = String(row.venue_name_raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  const city = String(row.venue_city_raw || "").trim().toLowerCase();
  return ANDY_NAMES.has(name) && city === "detroit";
}
function applyVenueCategoryPolicy(row) {
  return appliesToAndyArts(row) && row.category === "nightlife"
    ? { ...row, category: "visual" } : row;
}
module.exports = { applyVenueCategoryPolicy, appliesToAndyArts, ANDY_ARTS_ID };
