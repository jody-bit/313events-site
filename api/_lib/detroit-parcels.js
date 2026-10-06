"use strict";

// api/_lib/detroit-parcels.js
//
// THE CITY'S OWN PARCEL RECORD FOR AN ADDRESS -- used for one thing: a venue
// whose geocoded point lies on a neighborhood boundary (see MIN_EDGE_METERS in
// scripts/venue-geography.js). The geocoder places an address on the street's
// centreline; the City draws its boundaries down those centrelines. A parcel
// is the piece of land the building stands on, drawn by the City Assessor: it
// lies wholly on one side of the street, and the City records which
// neighborhood it is in.
//
// Source: City of Detroit, "Parcels (Current)" -- the Assessor's current
// parcel file, updated continuously (data last edited 2026-10-04 when this
// was written). Catalogue record (ArcGIS item 3c784c118e5c4083b37038e9b38573df):
//   https://www.arcgis.com/home/item.html?id=3c784c118e5c4083b37038e9b38573df
// Service:
//   https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/parcel_file_current/FeatureServer/0
// Fields used: parcel_id, address, street_number, street_prefix, street_name,
// neighborhood, and the parcel's polygon.
//
// WHEN A PARCEL SETTLES IT -- all of these, or it settles nothing:
//   1. The parcel file holds a parcel at EXACTLY this address: the same house
//      number, the same street name, the same direction, and -- where both
//      the address and the parcel record state one -- the same street type.
//      Not the nearest number, not a range: "928 W McNichols" has no parcel
//      of its own (the file has "900 W MCNICHOLS") and is NOT settled. An
//      address that states no direction is not matched to a parcel that has
//      one ("2961 McNichols" could be East or West).
//   2. The parcel is where the venue's coordinates are: within 150 metres of
//      the geocoded point (the same block), and its neighborhood is one of
//      those that meet at the boundary the point lies on -- the point is
//      inside that polygon or within 50 metres of it. A same-numbered parcel
//      somewhere else in the city is not this venue's.
//   3. Every parcel returned for the address -- there may be several units --
//      names the same neighborhood.
//   4. Every such parcel lies inside ONE neighborhood polygon of the
//      committed City snapshot (data/geography/): its corners and points
//      along each of its sides.
//   5. That polygon carries the name the parcel record gives.
// So the answer is the City's twice over: its parcel record says the
// neighborhood, and its parcel drawing lies entirely inside that
// neighborhood's boundary. Nothing is taken from the nearest polygon.
//
// Measured 2026-10-05 on the three boundary venues:
//   The Congregation, 9321 Rosa Parks Blvd  parcel 08002811.      Historic Atkinson  -- settled
//   Paris Bar, 2961 E McNichols Rd           parcel 09011086.000   Cadillac Heights   -- settled
//   Menjo's, 928 W McNichols Rd              no parcel at 928                         -- not settled

const path = require("path");
const { parseStreet } = require(path.join(__dirname, "street-address"));
const { metersToEdge, pointInGeometry } = require(path.join(__dirname, "detroit-geography"));

const SERVICE = "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/parcel_file_current/FeatureServer/0";
const DEFAULT_TIMEOUT_MS = 6000;
const nameKey = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();

// street: { number, dir, name } as scripts/venue-geography.js parses an
// address. -> the query URL, or null when the address cannot be asked about
// safely (a house number that is not all digits, a street name with anything
// but letters, digits and spaces in it).
function parcelQueryUrl(street) {
  if (!street || !/^\d+$/.test(String(street.number || ""))) return null;
  const name = String(street.name || "").toUpperCase().trim();
  if (!name || !/^[A-Z0-9 ]+$/.test(name)) return null;
  const clauses = [`street_number = ${Number(street.number)}`, `street_name = '${name}'`];
  const dir = String(street.dir || street.postDir || "").toUpperCase();
  if (dir) {
    if (!/^[NSEW]$/.test(dir)) return null;
    clauses.push(`street_prefix = '${dir}'`);
  }
  const params = new URLSearchParams({
    where: clauses.join(" AND "),
    outFields: "parcel_id,address,street_number,street_prefix,street_name,neighborhood",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "6",
    f: "geojson",
  });
  return `${SERVICE}/query?${params.toString()}`;
}

const MAX_METERS_FROM_POINT = 150; // the same block
const SAMPLE_EVERY_METERS = 5;

function ringsOf(geometry) {
  if (!geometry) return [];
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.flat();
}

// The corners of a ring and points along each of its sides, a few metres apart.
function pointsAlong(ring) {
  const points = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const metres = Math.hypot((x2 - x1) * 111320 * Math.cos((y1 * Math.PI) / 180), (y2 - y1) * 111320);
    const steps = Math.min(200, Math.max(1, Math.ceil(metres / SAMPLE_EVERY_METERS)));
    for (let k = 0; k < steps; k++) points.push([x1 + ((x2 - x1) * k) / steps, y1 + ((y2 - y1) * k) / steps]);
  }
  return points;
}

// body: the service's GeoJSON answer. geography: from detroit-geography.js.
// street: what was asked. options.point: the venue's coordinates.
// options.maxMetersFromPolygon: how far outside the settled polygon the
// point may lie (the distance-from-the-edge rule of the caller). ->
//   { status: "settled", polygon, parcelIds }
// | { status: "not_settled", reason, detail? }   reason: no_parcel
//       | direction_not_stated | different_street_type | parcels_disagree
//       | no_geometry | parcel_crosses_boundary | record_and_drawing_disagree
//       | parcel_not_at_the_point
// | { status: "unreadable" }
function readParcelAnswer(body, geography, street, options = {}) {
  if (!body || !Array.isArray(body.features)) return { status: "unreadable" };
  if (body.exceededTransferLimit || (body.properties && body.properties.exceededTransferLimit)) return { status: "unreadable" };
  // The service was asked for an exact address; it is checked again here.
  const wantedNumber = String(street.number);
  const wantedDir = String(street.dir || street.postDir || "").toUpperCase();
  const numberOf = (p) => (typeof p.street_number === "number" || (typeof p.street_number === "string" && /^\d+$/.test(p.street_number.trim())) ? String(Number(p.street_number)) : null);
  const here = body.features.filter((f) => {
    const p = (f && f.properties) || {};
    return numberOf(p) === wantedNumber && nameKey(p.street_name) === nameKey(street.name);
  });
  if (!here.length) return { status: "not_settled", reason: "no_parcel" };
  const prefixOf = (f) => String(f.properties.street_prefix || "").trim().toUpperCase();
  // East and West are different addresses. The address must say which,
  // unless the file has no direction for that number either.
  if (!wantedDir && here.some((f) => prefixOf(f))) return { status: "not_settled", reason: "direction_not_stated", detail: [...new Set(here.map(prefixOf))].sort().join("/") };
  const parcels = here.filter((f) => prefixOf(f) === wantedDir);
  if (!parcels.length) return { status: "not_settled", reason: "no_parcel" };
  // "1 Park Ave" is not "1 Park St": where both state a street type, the same one.
  if (street.suffix) {
    const types = new Set(parcels.map((f) => (parseStreet(f.properties.address) || {}).suffix).filter(Boolean));
    if (types.size && !(types.size === 1 && types.has(street.suffix))) return { status: "not_settled", reason: "different_street_type", detail: [...new Set(parcels.map((f) => f.properties.address))].sort().join(" / ") };
  }
  const recorded = new Set(parcels.map((f) => nameKey(f.properties.neighborhood)));
  if (recorded.size !== 1 || recorded.has("")) return { status: "not_settled", reason: "parcels_disagree", detail: [...new Set(parcels.map((f) => f.properties.neighborhood || "(none)"))].sort().join(" / ") };
  const drawn = new Set();
  for (const parcel of parcels) {
    const rings = ringsOf(parcel.geometry);
    if (!rings.length || rings.some((ring) => new Set(ring.map((c) => c.join(","))).size < 3)) return { status: "not_settled", reason: "no_geometry" };
    for (const ring of rings) {
      for (const [lng, lat] of pointsAlong(ring)) {
        const at = geography.neighborhoodAt(lat, lng);
        drawn.add(at.status === "found" ? at.name : `(${at.status})`);
      }
    }
  }
  if (drawn.size !== 1 || [...drawn][0].startsWith("(")) return { status: "not_settled", reason: "parcel_crosses_boundary", detail: [...drawn].sort().join(" / ") };
  const polygon = [...drawn][0];
  if (nameKey(polygon) !== [...recorded][0]) return { status: "not_settled", reason: "record_and_drawing_disagree", detail: `record: ${parcels[0].properties.neighborhood}; drawing: ${polygon}` };
  // Is this the venue's parcel? It must be where the venue's coordinates are.
  const point = options.point;
  if (!point || typeof point.lat !== "number" || typeof point.lng !== "number") return { status: "not_settled", reason: "parcel_not_at_the_point", detail: "no coordinates to compare" };
  const metresToParcel = Math.min(...parcels.map((f) => (pointInGeometry(point.lng, point.lat, f.geometry) ? 0 : metersToEdge(point.lng, point.lat, f.geometry))));
  if (metresToParcel > MAX_METERS_FROM_POINT) return { status: "not_settled", reason: "parcel_not_at_the_point", detail: `${Math.round(metresToParcel)} m from the venue's coordinates` };
  const limit = typeof options.maxMetersFromPolygon === "number" ? options.maxMetersFromPolygon : 50;
  if (geography.metersToPolygon(polygon, point.lat, point.lng) > limit) return { status: "not_settled", reason: "parcel_not_at_the_point", detail: `${polygon} does not meet the boundary the venue's coordinates lie on` };
  return { status: "settled", polygon, parcelIds: parcels.map((f) => String(f.properties.parcel_id || "").trim()).filter(Boolean).sort() };
}

// Never throws. { status: "error", detail } when the service did not answer:
// nothing is concluded and the venue is asked about again another day.
async function findParcel(street, geography, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const url = parcelQueryUrl(street);
  if (!url) return { status: "not_settled", reason: "address_not_askable" };
  let resp;
  try {
    resp = await fetchFn(url, { headers: { "User-Agent": "313.events event calendar" }, signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_TIMEOUT_MS) });
  } catch (err) {
    return { status: "error", detail: err && err.message ? err.message : String(err) };
  }
  if (!resp || !resp.ok) return { status: "error", detail: `HTTP ${resp ? resp.status : "no response"}` };
  let body;
  try {
    body = await resp.json();
  } catch (err) {
    return { status: "error", detail: "unparseable response" };
  }
  // ArcGIS reports its own failures with HTTP 200 and an `error` member.
  if (body && body.error) return { status: "error", detail: `service error ${body.error.code || ""}`.trim() };
  const answer = readParcelAnswer(body, geography, street, options);
  return answer.status === "unreadable" ? { status: "error", detail: "unreadable answer" } : answer;
}

module.exports = { findParcel, readParcelAnswer, parcelQueryUrl, SERVICE };
