// Detroit's official city-boundary polygon, used to measure "how far is X
// from Detroit" against the city's real border rather than an abstract
// center point -- see SERVICE_AREA.md ("75 miles from Detroit's border",
// switched 2026-09-20 from the original center-point-based radius) for why.
//
// Source: the City of Detroit's own open-data GIS layer,
// `City_of_Detroit_Boundary` (ArcGIS Feature Layer, serviceItemId
// 86b221bb68ca4364afe81d156e54f95c):
// https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/city_of_detroit_boundary/FeatureServer/0
// queried 2026-09-20. The real outer boundary ring has 1,090 vertices;
// simplified here via Douglas-Peucker (tolerance ~0.05mi) down to 70 points
// so it's cheap to embed and iterate over on every event -- verified during
// development to reproduce the full-precision, full-1,090-vertex distance
// to the fraction-of-a-mile for every city checked against it (Lansing,
// Saginaw, Bowling Green OH). The boundary layer's interior ring (a hole
// cut out around the Hamtramck/Highland Park enclaves, which are real
// separate cities entirely surrounded by Detroit) is intentionally not
// included here -- it can never be the nearest edge to a point outside
// Detroit, so carrying it would only add data with no effect on this
// function's output.
//
// [lon, lat] pairs, closed ring (first point repeats as the last). This is
// the SAME ring embedded in index.html's own copy of this logic (that page
// is a self-contained static file with no shared JS module across pages --
// see AUDIT_AND_ARCHITECTURE.md -- so it can't require() this file). Keep
// both copies in sync if the boundary source or simplification ever changes.
const DETROIT_BOUNDARY = [
  [-82.91625,42.42135],[-82.91034,42.41902],[-82.91055,42.41719],[-82.91863,42.39956],[-82.92149,42.39546],[-82.93542,42.38978],[-82.9468,42.38699],[-82.93027,42.36214],[-82.93087,42.3619],[-82.92859,42.358],[-82.92397,42.35212],[-82.94541,42.3474],[-82.95977,42.33977],[-82.98912,42.33248],[-83.01895,42.33062],[-83.06356,42.31686],[-83.07994,42.30717],[-83.0999,42.2867],[-83.11463,42.29018],[-83.11813,42.28973],[-83.11987,42.28755],[-83.11764,42.28041],[-83.11877,42.27913],[-83.13745,42.28279],[-83.16097,42.25496],[-83.16635,42.25968],[-83.16811,42.26391],[-83.16983,42.26458],[-83.15816,42.27884],[-83.167,42.28957],[-83.16166,42.29178],[-83.15825,42.29202],[-83.15769,42.29496],[-83.15169,42.29626],[-83.14999,42.29583],[-83.14894,42.29341],[-83.14724,42.29257],[-83.14256,42.29441],[-83.14045,42.29775],[-83.14242,42.30569],[-83.1406,42.30668],[-83.13964,42.30866],[-83.1407,42.31101],[-83.15313,42.32809],[-83.15647,42.32724],[-83.1569,42.33696],[-83.15296,42.33759],[-83.14994,42.33984],[-83.14835,42.34469],[-83.14766,42.35192],[-83.19653,42.35089],[-83.19606,42.33644],[-83.21534,42.33614],[-83.21528,42.32902],[-83.22514,42.32881],[-83.22783,42.3326],[-83.23458,42.32984],[-83.23503,42.33584],[-83.23749,42.33574],[-83.23777,42.34309],[-83.26384,42.34169],[-83.26591,42.35705],[-83.26658,42.37879],[-83.27491,42.37859],[-83.27586,42.40728],[-83.28638,42.407],[-83.28773,42.44268],[-82.94053,42.45037],[-82.95128,42.43581],[-82.91625,42.42135]
];

// Great-circle-ish distance in miles from an arbitrary point to the nearest
// point anywhere on Detroit's boundary. Uses a local equirectangular
// (flat-plane) projection centered near Detroit rather than true spherical
// point-to-geodesic-segment math -- accurate to within ~0.15mi against the
// full 1,090-vertex haversine-based figure at the ~65-130 mile distances
// this function is actually evaluated at in practice, which is more than
// enough precision for a "within 75 miles" cutoff that was never a
// survey-grade line to begin with (see SERVICE_AREA.md).
const LAT0 = 42.35;
const MILES_PER_DEG_LAT = 69.0;
const MILES_PER_DEG_LON = 69.0 * Math.cos((LAT0 * Math.PI) / 180);

function toXY(lon, lat) {
  return [(lon + 83.4) * MILES_PER_DEG_LON, (lat - LAT0) * MILES_PER_DEG_LAT];
}

function distPointToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function milesFromDetroitBorder(lat, lng) {
  const [px, py] = toXY(lng, lat);
  let minDist = Infinity;
  for (let i = 0; i < DETROIT_BOUNDARY.length - 1; i++) {
    const [alon, alat] = DETROIT_BOUNDARY[i];
    const [blon, blat] = DETROIT_BOUNDARY[i + 1];
    const [ax, ay] = toXY(alon, alat);
    const [bx, by] = toXY(blon, blat);
    const d = distPointToSeg(px, py, ax, ay, bx, by);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

module.exports = { DETROIT_BOUNDARY, milesFromDetroitBorder };
