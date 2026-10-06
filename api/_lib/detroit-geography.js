"use strict";

// api/_lib/detroit-geography.js
//
// WHERE IN DETROIT IS THIS POINT? Two separate questions, answered from two
// separate layers of the City of Detroit's own open GIS data, both committed
// to this repository as a snapshot (data/geography/ -- see SNAPSHOT.txt there
// for the source URLs, the City's own "data last edited" dates, and when the
// copy was taken):
//
//   1. IS IT INSIDE THE CITY LIMITS?   City_of_Detroit_Boundary -- the outer
//      ring AND the hole in it. Hamtramck and Highland Park are separate
//      cities entirely surrounded by Detroit; a point there is inside the
//      outer ring and is NOT in Detroit. (api/_lib/detroit-boundary.js, used
//      for "how many miles from Detroit's border", is a 70-point
//      simplification without the hole: right for distances, wrong for this.)
//   2. WHICH NEIGHBORHOOD?   Current_City_of_Detroit_Neighborhoods -- 205
//      polygons, each with the City's name for it (`nhood_name`).
//
// Nothing here reads the network. Nightly operation never depends on the
// City's ArcGIS service being up: the snapshot is refreshed by a person
// running scripts/fetch-detroit-geography.sh and committing the result.
//
// WHAT THIS FILE WILL NOT DO (Product Owner, 2026-10-05)
//   - infer a neighborhood from a venue's name, a ZIP code or similar text;
//   - name a neighborhood for a point outside the city limits;
//   - guess between two polygons: a point that falls in none, or in more than
//     one, has no answer;
//   - map a City polygon onto a 313.events label it has not been told is the
//     same place: see "City name -> 313 label" below for the two approved
//     aliases, the polygons held for a decision, and the cultural labels that
//     only a person assigns.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data", "geography");
const NEIGHBORHOODS_FILE = "detroit-neighborhoods.geojson";
const BOUNDARY_FILE = "detroit-city-boundary.geojson";
const NEIGHBORHOODS_LAYER_FILE = "detroit-neighborhoods.layer.json";
const BOUNDARY_LAYER_FILE = "detroit-city-boundary.layer.json";

// ---------------------------------------------------------------- geometry

// Ray casting, even-odd. `ring` is [[lng, lat], ...]. The comparison is
// half-open, so a point exactly on a shared edge belongs to exactly one of
// the two polygons that share it, the same one every time.
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// A polygon's coordinates: [outer ring, ...holes].
function pointInPolygonRings(lng, lat, rings) {
  if (!Array.isArray(rings) || !rings.length || !pointInRing(lng, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(lng, lat, rings[i])) return false;
  return true;
}

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function pointInGeometry(lng, lat, geometry) {
  return polygonsOf(geometry).some((rings) => pointInPolygonRings(lng, lat, rings));
}

// Metres from a point to the nearest edge of a geometry (any ring). A flat
// local projection: exact enough over a city for "how close to the line".
const METERS_PER_DEG_LAT = 111320;
function metersToEdge(lng, lat, geometry) {
  const mPerDegLng = METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const rings of polygonsOf(geometry)) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const ax = (ring[i][0] - lng) * mPerDegLng;
        const ay = (ring[i][1] - lat) * METERS_PER_DEG_LAT;
        const bx = (ring[i + 1][0] - lng) * mPerDegLng;
        const by = (ring[i + 1][1] - lat) * METERS_PER_DEG_LAT;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

function bboxOf(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rings of polygonsOf(geometry)) {
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

const validCoordinate = (lat, lng) => typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// ------------------------------------------------------------------- index

// Builds the two questions from the two GeoJSON layers.
//   insideDetroit(lat, lng) -> boolean
//   neighborhoodAt(lat, lng) -> { status, name, number, district, edgeMeters }
//       status "found"            one polygon contains the point
//              "outside_detroit"  the point is not inside the city limits
//              "no_polygon"       inside the limits, in no neighborhood polygon
//              "ambiguous"        in more than one polygon (they overlap there)
//              "invalid"          not a coordinate
function buildGeography(neighborhoodsGeojson, boundaryGeojson) {
  const boundary = (boundaryGeojson && boundaryGeojson.features ? boundaryGeojson.features : []).map((f) => f.geometry).filter(Boolean);
  const polygons = (neighborhoodsGeojson && neighborhoodsGeojson.features ? neighborhoodsGeojson.features : [])
    .filter((f) => f && f.geometry && f.properties && typeof f.properties.nhood_name === "string" && f.properties.nhood_name.trim())
    .map((f) => ({
      name: f.properties.nhood_name.trim(),
      number: f.properties.nhood_num == null ? null : f.properties.nhood_num,
      district: f.properties.council_district == null ? null : f.properties.council_district,
      geometry: f.geometry,
      bbox: bboxOf(f.geometry),
    }));
  if (!boundary.length) throw new Error("detroit-geography: the city boundary layer has no geometry");
  if (!polygons.length) throw new Error("detroit-geography: the neighborhoods layer has no named polygons");

  const insideDetroit = (lat, lng) => validCoordinate(lat, lng) && boundary.some((g) => pointInGeometry(lng, lat, g));
  function neighborhoodAt(lat, lng) {
    if (!validCoordinate(lat, lng)) return { status: "invalid" };
    if (!insideDetroit(lat, lng)) return { status: "outside_detroit" };
    const hits = polygons.filter((p) => lng >= p.bbox[0] && lng <= p.bbox[2] && lat >= p.bbox[1] && lat <= p.bbox[3] && pointInGeometry(lng, lat, p.geometry));
    if (!hits.length) return { status: "no_polygon" };
    if (hits.length > 1) return { status: "ambiguous", names: hits.map((h) => h.name).sort() };
    const hit = hits[0];
    return { status: "found", name: hit.name, number: hit.number, district: hit.district, edgeMeters: Math.round(metersToEdge(lng, lat, hit.geometry)) };
  }
  // Metres from a point to the named polygon: 0 inside it, otherwise the
  // distance to its nearest edge. Infinity when no polygon has that name.
  function metersToPolygon(name, lat, lng) {
    const polygon = polygons.find((p) => nameKey(p.name) === nameKey(name));
    if (!polygon || !validCoordinate(lat, lng)) return Infinity;
    return pointInGeometry(lng, lat, polygon.geometry) ? 0 : metersToEdge(lng, lat, polygon.geometry);
  }
  return { insideDetroit, neighborhoodAt, metersToPolygon, names: polygons.map((p) => p.name).sort(), count: polygons.length };
}

// The committed snapshot, read once per process.
let cached = null;
function loadGeography() {
  if (cached) return cached;
  const read = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  const geography = buildGeography(read(NEIGHBORHOODS_FILE), read(BOUNDARY_FILE));
  const editedOn = (file) => {
    try {
      const info = read(file).editingInfo || {};
      const ms = info.dataLastEditDate || info.lastEditDate;
      return ms ? new Date(ms).toISOString().slice(0, 10) : null;
    } catch {
      return null;
    }
  };
  cached = { ...geography, neighborhoodsEditedOn: editedOn(NEIGHBORHOODS_LAYER_FILE), boundaryEditedOn: editedOn(BOUNDARY_LAYER_FILE) };
  return cached;
}

// ------------------------------------------------- City name -> 313 label
//
// TWO NAMINGS, KEPT APART (Product Owner, 2026-10-05). The City's polygon is
// GEOGRAPHY: where a point is. A 313.events neighborhood label is what the
// site shows, and some labels are cultural or historic names with no polygon
// at all. Geography may support a label; it does not have to equal one. So a
// venue's record keeps both: the polygon its point fell in (written to the
// venue's geography line) and, only where the rules below allow it, a label.
//
//   1. THE SAME NAME. A label and a polygon that differ only in case,
//      punctuation and spacing are the same neighborhood:
//      "Fitzgerald/Marygrove" = "Fitzgerald-Marygrove", "Boston Edison" =
//      "Boston-Edison", "Jefferson Chalmers" = "Jefferson-Chalmers".
//   2. AN APPROVED GEOGRAPHIC ALIAS (GEOGRAPHIC_ALIASES): a polygon that is a
//      label under another name. The label keeps its display name.
//   3. HELD (HELD_POLYGONS): polygons that bear on a label whose mapping the
//      Product Owner has reserved. A venue there gets coordinates and no
//      label, and no rival label is created beside the reserved one.
//   4. NO LABEL OF THAT NAME. Nothing is assigned unless the caller asks for
//      labels to be created from City names (off by default).
// Labels in PERSON_ASSIGNED_LABELS are never assigned by geography at all.

function nameKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
}

// City polygon (by nameKey) -> the 313.events label it is. Approved by the
// Product Owner on 2026-10-05; the labels' display names are unchanged.
const GEOGRAPHIC_ALIASES = Object.freeze({
  rivertown: "Rivertown-Warehouse District",
  "arden park": "Arden Park-East Boston",
});

// 313.events label -> the City polygons held for it.
//   Grandmont-Rosedale: "spans multiple City polygons and needs a deliberate
//     mapping" -- the label's own note calls it an umbrella for four platted
//     subdivisions, and four polygons carry its two names.
//   Mexicantown / Southwest Detroit: "intentionally broader than the City's
//     Mexicantown polygon. Do not collapse it to that polygon." Assigning the
//     label from that one polygon would do exactly that; creating a label
//     "Mexicantown" beside it would split it.
const HELD_POLYGONS = Object.freeze({
  "Grandmont-Rosedale": ["Grandmont", "Grandmont #1", "Rosedale Park", "North Rosedale Park"],
  "Mexicantown / Southwest Detroit": ["Mexicantown"],
});
const HELD_CITY_NAMES = new Map();
for (const [label, cityNames] of Object.entries(HELD_POLYGONS)) for (const cityName of cityNames) HELD_CITY_NAMES.set(nameKey(cityName), label);

// Cultural and historic 313.events labels, and the two reserved above: a
// person may assign them; geography never does. None has a polygon of its
// own name, so rule 1 cannot reach them; this list makes that a guarantee
// rather than a coincidence.
const PERSON_ASSIGNED_LABELS = Object.freeze([
  "The District Detroit",
  "Cass Corridor",
  "Bricktown Historic District",
  "Eastside Historic Cemetery District",
  "Grandmont-Rosedale",
  "Mexicantown / Southwest Detroit",
]);
const PERSON_ASSIGNED_KEYS = new Set(PERSON_ASSIGNED_LABELS.map(nameKey));

// cityName: a polygon's `nhood_name`. existingLabels: the names in the
// neighborhoods table. ->
//   { action: "use", label }         an existing label is this polygon
//   { action: "hold", pendingLabel } reserved for a Product Owner mapping
//   { action: "create", label }      no label is; the City's name could become one
function labelForCityName(cityName, existingLabels) {
  const key = nameKey(cityName);
  if (HELD_CITY_NAMES.has(key)) return { action: "hold", pendingLabel: HELD_CITY_NAMES.get(key) };
  const wanted = nameKey(GEOGRAPHIC_ALIASES[key] || cityName);
  if (PERSON_ASSIGNED_KEYS.has(wanted)) return { action: "hold", pendingLabel: PERSON_ASSIGNED_LABELS.find((label) => nameKey(label) === wanted) };
  const existing = (existingLabels || []).find((label) => nameKey(label) === wanted);
  if (existing) return { action: "use", label: existing };
  return { action: "create", label: String(cityName).trim() };
}

module.exports = {
  pointInRing,
  pointInPolygonRings,
  pointInGeometry,
  metersToEdge,
  buildGeography,
  loadGeography,
  nameKey,
  labelForCityName,
  GEOGRAPHIC_ALIASES,
  HELD_POLYGONS,
  PERSON_ASSIGNED_LABELS,
  DATA_DIR,
  NEIGHBORHOODS_FILE,
  BOUNDARY_FILE,
};
