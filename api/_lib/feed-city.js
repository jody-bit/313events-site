// api/_lib/feed-city.js
//
// GEO-003 step 2 (2026-10-16): decide whether a city string parsed from a feed's address is safe to
// store as venue_city_raw. Owner rule (Addendum 2): store the parsed city only when it agrees with the
// feed's own ZIP and _geoloc; a clear mismatch stores no city, which leaves the row in Needs Follow-up
// with its raw street kept. A ZIP does NOT identify one municipality: a ZIP is a constraint only when
// the injected table lists it, and a multi-municipality ZIP accepts any municipality it lists.
//
// Evidence available today:
//   - the ZIP table (injected; the Census-built Orbit dataset is not loaded yet, so the default is empty)
//   - the City of Detroit boundary (api/_lib/detroit-boundary.js, simplified, so a tolerance applies)
// No evidence either way is NOT a contradiction: the parsed city is kept ("stored_unverified"), which is
// today's behaviour for non-Detroit cities. This module never invents a city.
//
// status: stored | stored_unverified | needs_follow_up | no_city

"use strict";

const BORDER_TOLERANCE_MILES = 0.25; // the embedded boundary is simplified to ~0.05 mi; leave margin for enclave edges

function parseZip(text) {
  const m = /\b(\d{5})(?:-\d{4})?\b/.exec(String(text || ""));
  return m ? m[1] : null;
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function validPoint(lat, lng) {
  return typeof lat === "number" && typeof lng === "number" && isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

let boundary = null;
function detroitBoundary() {
  if (!boundary) {
    boundary = require("./detroit-boundary.js");
    boundary.geo = require("./detroit-geography.js");
  }
  return boundary;
}

// true when the point is more than the tolerance outside Detroit's border
function clearlyOutsideDetroit(lat, lng) {
  const b = detroitBoundary();
  if (b.geo.pointInRing(lng, lat, b.DETROIT_BOUNDARY)) return false;
  return b.milesFromDetroitBorder(lat, lng) > BORDER_TOLERANCE_MILES;
}

// in:  { city, zip, lat, lng }   deps: { zipTable: { "48009": { municipalities: ["Birmingham"] } } }
// out: { city, status, reason }
function decideFeedCity(input, deps) {
  const city = (input && input.city ? String(input.city).trim() : "") || null;
  if (!city) return { city: null, status: "no_city", reason: "feed gave no city text" };
  const table = (deps && deps.zipTable) || {};
  const key = norm(city);
  let verified = false;

  const zipRow = input.zip && table[input.zip];
  if (zipRow && Array.isArray(zipRow.municipalities) && zipRow.municipalities.length) {
    if (!zipRow.municipalities.some((m) => norm(m) === key)) {
      return { city: null, status: "needs_follow_up", reason: `feed city "${city}" is not among ZIP ${input.zip}'s municipalities (${zipRow.municipalities.join(", ")})` };
    }
    verified = true;
  }

  if (validPoint(input.lat, input.lng) && key === "detroit") {
    if (clearlyOutsideDetroit(input.lat, input.lng)) {
      return { city: null, status: "needs_follow_up", reason: `feed city "Detroit" but the coordinates are outside Detroit's border${input.zip ? ` (ZIP ${input.zip})` : ""}` };
    }
    verified = true;
  }

  return verified
    ? { city, status: "stored", reason: "feed city agrees with the ZIP and/or coordinates" }
    : { city, status: "stored_unverified", reason: "no ZIP-table or boundary evidence to confirm or contradict" };
}

module.exports = { parseZip, decideFeedCity, BORDER_TOLERANCE_MILES };
