// api/_lib/feed-city.js
//
// GEO-003 step 2 (2026-10-16): decide whether a city string parsed from a feed's address is safe to
// store as venue_city_raw. Owner rule (Addendum 2): store the parsed city only when it agrees with the
// feed's own ZIP and _geoloc; a clear mismatch stores no city (NULL) with the raw street kept. No status is set
// here: the admin Needs Follow-up list picks the row up because its venue city is missing. A ZIP does NOT identify one municipality: a ZIP is a constraint only when
// the injected table lists it, and a multi-municipality ZIP accepts any municipality it lists.
//
// Evidence available today:
//   - the ZIP table (injected; production loads EI's Census-built Orbit v3 table with its evidence tiers)
//   - the City of Detroit boundary (api/_lib/detroit-boundary.js, simplified, so a tolerance applies)
// No evidence either way is NOT a contradiction: the parsed city is kept ("stored_unverified"), which is
// today's behaviour for non-Detroit cities. This module never invents a city.
//
// status: stored | stored_compatible | stored_unverified | needs_follow_up | no_city
// evidence: municipality (ZIP table lists the name as an incorporated/township municipality) | boundary (Detroit
//   border) | census_supported (Census overlap too weak to confirm) | cdp_compatible (name is only a Census-designated place in that ZIP: geographic compatibility, not a
//   definitive municipality resolution) | none
// Only `confirmed` (evidence municipality, i.e. a `strong` tier non-CDP name, or boundary) may replace a city already stored on the row.

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

// The Census-built Orbit ZIP -> municipality table (event-intelligence v3, 229 Detroit-area ZIPs 48001-48393, thresholds 0/0 with a
// tier per name, from the 2020 ZCTA relationship files; evidence per name is in EI's zip-municipality-table-evidence CSV). A ZIP absent from the
// table is "no evidence", never a contradiction. Names that exist only because Census lists a Census-designated place
// (30 normalized names in 12 ZIPs) are listed in orbit-zip-cdp-names.json so they can be switched off: the owner's CDP decision is
// open, so the default keeps them (feeds do use those names) and FEED_CITY_INCLUDE_CDP=0 removes them.
let orbitTable = null;
let orbitCdpNames = null;
function loadZipTable(opts) {
  const o = opts || {};
  const envOff = process.env.FEED_CITY_INCLUDE_CDP === "0";
  const includeCdp = o.includeCdp === undefined ? !envOff : !!o.includeCdp;
  if (!orbitTable) {
    orbitTable = require("./orbit-zip-table.json");
    orbitCdpNames = require("./orbit-zip-cdp-names.json");
  }
  if (includeCdp) return orbitTable;
  const out = {};
  for (const zip of Object.keys(orbitTable)) {
    const drop = new Set((orbitCdpNames[zip] || []).map(norm));
    // drop every spelling that normalizes to a CDP-only name ("Pearl Beach" and "Pearl Beach CDP")
    for (const n of orbitCdpNames[zip] || []) drop.add(norm(n.replace(/\s+CDP$/i, "")));
    out[zip] = Object.assign({}, orbitTable[zip], { municipalities: orbitTable[zip].municipalities.filter((m) => !drop.has(norm(m))) });
  }
  return out;
}

// ZIP -> normalized municipality name -> "strong" | "census_supported" (EI v3 evidence tiers).
let orbitTiers = null;
function loadZipTiers() {
  if (!orbitTiers) {
    orbitTiers = Object.assign({}, require("./orbit-zip-tiers.json"));
    delete orbitTiers._meta;
  }
  return orbitTiers;
}

function loadCdpNames() {
  if (!orbitCdpNames) loadZipTable();
  return orbitCdpNames;
}

// in:  { city, zip, lat, lng }   deps: { zipTable: { "48009": { municipalities: ["Birmingham"] } } }
// deps also: tiers (loadZipTiers()), cdpNames (loadCdpNames())
// out: { city, status, evidence, confirmed, reason }
function decideFeedCity(input, deps) {
  const city = (input && input.city ? String(input.city).trim() : "") || null;
  if (!city) return { city: null, status: "no_city", evidence: "none", confirmed: false, reason: "feed gave no city text" };
  const table = (deps && deps.zipTable) || {};
  const key = norm(city);

  let evidence = "none";
  const zipRow = input.zip && table[input.zip];
  if (zipRow && Array.isArray(zipRow.municipalities) && zipRow.municipalities.length) {
    if (!zipRow.municipalities.some((m) => norm(m) === key)) {
      return { city: null, status: "needs_follow_up", evidence: "none", confirmed: false, reason: `feed city "${city}" is not among ZIP ${input.zip}'s municipalities (${zipRow.municipalities.join(", ")})` };
    }
    const cdp = ((deps && deps.cdpNames) || {})[input.zip] || [];
    const cdpOnly = cdp.some((n) => norm(n) === key || norm(n.replace(/\s+CDP$/i, "")) === key);
    // Tier (Census overlap strength, EI v3). Only `strong` confirms a municipality; census_supported, CDP-only, or a
    // name with no tier on record are compatible. deps.tiers absent = legacy injected table (tests): treated as strong.
    const tier = deps && deps.tiers ? ((deps.tiers[input.zip] || {})[key] || "unknown") : "strong";
    evidence = cdpOnly ? "cdp_compatible" : tier === "strong" ? "municipality" : "census_supported";
  }

  if (validPoint(input.lat, input.lng) && key === "detroit") {
    if (clearlyOutsideDetroit(input.lat, input.lng)) {
      return { city: null, status: "needs_follow_up", evidence: "none", confirmed: false, reason: `feed city "Detroit" but the coordinates are outside Detroit's border${input.zip ? ` (ZIP ${input.zip})` : ""}` };
    }
    if (evidence !== "municipality") evidence = "boundary";
  }

  if (evidence === "municipality" || evidence === "boundary") return { city, status: "stored", evidence, confirmed: true, reason: "feed city agrees with the ZIP and/or coordinates" };
  if (evidence === "cdp_compatible") return { city, status: "stored_compatible", evidence, confirmed: false, reason: "feed city is a Census-designated place within the ZIP: compatible, not a definitive municipality" };
  if (evidence === "census_supported") return { city, status: "stored_compatible", evidence, confirmed: false, reason: "feed city has only weak Census overlap with the ZIP (census_supported): compatible, not confirmed" };
  return { city, status: "stored_unverified", evidence, confirmed: false, reason: "no ZIP-table or boundary evidence to confirm or contradict" };
}

// A weaker incoming city must never replace a city the row already has (e.g. one corrected by the GEO-003
// backfill): only evidence-confirmed decisions may overwrite. Returns the row to write (a copy when changed).
function protectExistingCity(row, decision, existingCity) {
  if (!row || !String(existingCity || "").trim()) return row;
  if (decision && decision.confirmed && decision.city) return row;
  const out = Object.assign({}, row);
  delete out.venue_city_raw;
  return out;
}

module.exports = { parseZip, decideFeedCity, loadZipTable, loadCdpNames, loadZipTiers, protectExistingCity, BORDER_TOLERANCE_MILES };
