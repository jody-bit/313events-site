"use strict";

// api/_lib/bgsu-geo-audit.js
//
// Admin Queue Modernization, Stage 4: a READ-SIDE geographic evidence audit
// of the approved Bowling Green State University rows.
//
// What it is: given a stored event row, say what geographic evidence the row
// actually carries and how far from Detroit's municipal border that evidence
// puts it. It annotates. It never changes a row, never changes a status, and
// introduces no eligibility rule: the boundary is the existing 75-mile
// ORBIT_MILES, measured by the existing milesFromDetroitBorder() from the
// border, not downtown.
//
// What the stored rows carry (measured 2026-10-16): venue_name_raw,
// venue_city_raw, venue_address_raw. No state, and for 208 of 209 upcoming
// rows no venue link and so no coordinates. So the strongest evidence a row
// has is almost always "a named venue in a named city", and the distance is
// the distance of that CITY's sourced centre point, which is said so in
// `distance_basis` and never presented as the venue's own location.
//
// Nothing here is inferred: a city whose name matches more than one state in
// the sourced tables, or that matches none, is reported as such and sent to
// human review rather than guessed.

const { milesFromDetroitBorder } = require("./detroit-boundary");
const { ORBIT_MILES } = require("./localist-rows");
const { PHASE2_CITIES } = require("../../city-table-phase2");
const { _defaultConfig } = require("../../discovery");

const CLASSES = Object.freeze({
  STORED_COORDINATES: "stored_venue_coordinates",
  STREET_AND_CITY: "street_and_city",
  VENUE_AND_CITY: "venue_and_city",
  PLACE_TEXT_ONLY: "place_text_only",
  CITY_ONLY: "city_only",
  CITY_NOT_EVIDENCED: "city_not_evidenced",
  OUTSIDE_ORBIT: "outside_orbit",
  NO_EVIDENCE: "no_evidence",
});

// Classes that need a human look. no_evidence needs one only while the event
// is still ahead: an ended event with no place is history, counted not queued.
const REVIEW_CLASSES = Object.freeze([
  CLASSES.PLACE_TEXT_ONLY,
  CLASSES.CITY_NOT_EVIDENCED,
  CLASSES.OUTSIDE_ORBIT,
  CLASSES.CITY_ONLY,
]);

const STATE_WORDS = {
  mich: "Michigan", mi: "Michigan", michigan: "Michigan",
  ohio: "Ohio", oh: "Ohio",
};

function norm(value) {
  return String(value == null ? "" : value).toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

// name -> [{ region, lat, lng, table }], built once from the two sourced tables.
const CITY_INDEX = (() => {
  const index = new Map();
  const add = (name, region, lat, lng, table) => {
    const key = norm(name);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ region, lat, lng, table });
  };
  for (const c of PHASE2_CITIES) add(c.name, c.region, c.lat, c.lng, "city-table-phase2 (Census TIGERweb)");
  for (const p of _defaultConfig.places || []) {
    if (Array.isArray(p) && p[1] === "city") add(p[0], p[2], p[3], p[4], "discovery places");
  }
  return index;
})();

// "East Lansing, Mich." / "Rochester, Mich." / "Ann Arbor, Mich.": a venue
// field that is only the place line, with a state word.
function placeTextState(venueName, city) {
  const m = String(venueName || "").match(/^(.+?),\s*([A-Za-z.]+)\s*$/);
  if (!m) return null;
  const state = STATE_WORDS[norm(m[2])];
  if (!state) return null;
  if (norm(m[1]) !== norm(city)) return null;
  return state;
}

function cityEvidence(city, stateHint) {
  const key = norm(city);
  if (!key) return { status: "none" };
  if (key === "detroit") return { status: "found", region: "Michigan", miles: 0, table: "inside Detroit's border" };
  const all = CITY_INDEX.get(key) || [];
  // Entries that agree on region and sit within a mile of each other are one place.
  const byRegion = new Map();
  for (const e of all) if (!byRegion.has(e.region)) byRegion.set(e.region, e);
  let regions = [...byRegion.keys()];
  if (regions.length > 1 && stateHint) regions = regions.filter((r) => r === stateHint);
  if (regions.length === 0) return { status: "unlisted" };
  if (regions.length > 1) return { status: "ambiguous", regions };
  const e = byRegion.get(regions[0]);
  return { status: "found", region: e.region, miles: milesFromDetroitBorder(e.lat, e.lng), table: e.table };
}

function isUpcoming(row, today) {
  const end = row.end_date || row.start_date;
  return !end || String(end).slice(0, 10) >= today;
}

function clean(v) {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

function auditRow(row, today) {
  const venueName = clean(row.venue_name_raw);
  const city = clean(row.venue_city_raw);
  const street = clean(row.venue_address_raw);
  const linked = row.venues && Number.isFinite(Number(row.venues.lat)) && Number.isFinite(Number(row.venues.lng)) &&
    row.venues.lat != null && row.venues.lng != null;
  const upcoming = isUpcoming(row, today);

  const out = {
    id: row.id,
    upcoming,
    evidence_class: null,
    needs_review: false,
    review_reason: null,
    distance_miles: null,
    distance_basis: null,
    margin_miles: null,
    evidence: { venue: venueName, city, street },
  };

  const finish = (cls, extra) => {
    out.evidence_class = cls;
    Object.assign(out, extra || {});
    if (Number.isFinite(out.distance_miles)) {
      out.distance_miles = Math.round(out.distance_miles * 10) / 10;
      out.margin_miles = Math.round((ORBIT_MILES - out.distance_miles) * 10) / 10;
    }
    if (REVIEW_CLASSES.includes(cls) || (cls === CLASSES.NO_EVIDENCE && upcoming)) out.needs_review = true;
    return out;
  };

  if (linked) {
    const miles = milesFromDetroitBorder(Number(row.venues.lat), Number(row.venues.lng));
    const outside = miles > ORBIT_MILES;
    return finish(outside ? CLASSES.OUTSIDE_ORBIT : CLASSES.STORED_COORDINATES, {
      distance_miles: miles,
      distance_basis: "stored venue coordinates",
      review_reason: outside ? "stored venue coordinates are more than 75 miles from Detroit's border" : null,
    });
  }

  if (!venueName && !city && !street) {
    return finish(CLASSES.NO_EVIDENCE, {
      review_reason: upcoming ? "no venue, city or address is stored for an upcoming event" : "no venue, city or address stored (event has ended)",
    });
  }

  const stateHint = placeTextState(venueName, city);
  const ce = cityEvidence(city, stateHint);

  if (ce.status === "none") {
    return finish(CLASSES.CITY_NOT_EVIDENCED, { review_reason: "venue or address stored but no city, so no distance can be measured" });
  }
  if (ce.status === "unlisted") {
    return finish(CLASSES.CITY_NOT_EVIDENCED, { review_reason: `city "${city}" has no sourced coordinates in the site's city tables` });
  }
  if (ce.status === "ambiguous") {
    return finish(CLASSES.CITY_NOT_EVIDENCED, {
      review_reason: `city "${city}" matches more than one state (${ce.regions.join(", ")}) and the row stores none`,
    });
  }

  const basis = ce.table === "inside Detroit's border" ? "inside Detroit's border" : `city centre point, ${ce.region} (${ce.table})`;
  if (ce.miles > ORBIT_MILES) {
    return finish(CLASSES.OUTSIDE_ORBIT, {
      distance_miles: ce.miles,
      distance_basis: basis,
      review_reason: `city centre point is ${Math.round(ce.miles * 10) / 10} miles from Detroit's border (limit ${ORBIT_MILES})`,
    });
  }
  const measured = { distance_miles: ce.miles, distance_basis: basis };
  if (stateHint && venueName && norm(venueName).startsWith(norm(city)) && !street) {
    return finish(CLASSES.PLACE_TEXT_ONLY, {
      ...measured,
      review_reason: "the stored venue is only the place line; the actual venue is not identified",
    });
  }
  if (!venueName && !street) {
    return finish(CLASSES.CITY_ONLY, { ...measured, review_reason: "only a city is stored; no venue or address" });
  }
  if (venueName && street) return finish(CLASSES.STREET_AND_CITY, measured);
  if (venueName) return finish(CLASSES.VENUE_AND_CITY, measured);
  return finish(CLASSES.CITY_ONLY, { ...measured, review_reason: "only a city and street are stored; no venue name" });
}

// Streets stored against more than one distinct venue name could be a
// generic (administrative) address standing in for several places.
function sharedStreets(rows) {
  const byStreet = new Map();
  for (const r of rows) {
    const street = clean(r.venue_address_raw);
    const name = clean(r.venue_name_raw);
    if (!street || !name) continue;
    const k = norm(street);
    if (!byStreet.has(k)) byStreet.set(k, new Set());
    byStreet.get(k).add(norm(name));
  }
  return [...byStreet].filter(([, names]) => names.size > 1).map(([street, names]) => ({ street, venues: [...names].sort() }));
}

function auditRows(rows, today) {
  const list = Array.isArray(rows) ? rows : [];
  const audited = list.map((r) => auditRow(r, today));
  const shared = sharedStreets(list);
  const sharedKeys = new Set(shared.map((s) => s.street));
  audited.forEach((a, i) => {
    const street = clean(list[i].venue_address_raw);
    if (street && sharedKeys.has(norm(street))) {
      a.needs_review = true;
      a.review_reason = a.review_reason || "this street address is stored against more than one venue name";
    }
  });
  const counts = {};
  const upcomingCounts = {};
  for (const a of audited) {
    counts[a.evidence_class] = (counts[a.evidence_class] || 0) + 1;
    if (a.upcoming) upcomingCounts[a.evidence_class] = (upcomingCounts[a.evidence_class] || 0) + 1;
  }
  return {
    rows: audited,
    total: audited.length,
    upcoming: audited.filter((a) => a.upcoming).length,
    counts,
    upcoming_counts: upcomingCounts,
    review: audited.filter((a) => a.needs_review),
    shared_streets: shared,
  };
}

module.exports = { auditRow, auditRows, sharedStreets, CLASSES, REVIEW_CLASSES, ORBIT_MILES };
