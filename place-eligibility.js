// place-eligibility.js -- the ONE definition of whether an event's city can be placed and
// whether that place is inside the Detroit Orbit. Plain static include (same pattern as
// city-resolution.js); exposes one global `PlaceEligibility`, and module.exports in Node.
//
// WHY (2026-10-24, owner direction "search unification + geographic parity"): the homepage,
// calendar and map each decided this separately -- exact city-name match against three
// different tables, two different Orbit rules -- so the same event could show on one surface
// and vanish from another under a place filter. All three now call this file:
//   - the city table is the surface's own `LOCATIONS`/places list PLUS the sourced Phase 2
//     cities (city-table-phase2.js), looked up through CityResolution (state/ZIP, Twp,
//     Charter Township, Mt = Mount, Grosse Pointe aliases, source-gated bare names);
//   - the Orbit is 75 miles from Detroit's BORDER (SERVICE_AREA.md, 2026-09-20), measured
//     with the same polygon and projection as discovery.js and api/_lib/detroit-boundary.js
//     (test/place-eligibility.test.js fails if the three rings drift apart);
//   - a city that cannot be placed is NEVER guessed. It is reported as `unplaced` with a
//     reason so a surface can count it, and an exception list can name it.
// Nothing here changes which events are public; it only decides the place filter.
(function (root) {
  "use strict";

  var ORBIT_MILES = 75;

  // [lon, lat] pairs, closed ring. Same ring as api/_lib/detroit-boundary.js.
  var DETROIT_BOUNDARY = [
  [-82.91625,42.42135],[-82.91034,42.41902],[-82.91055,42.41719],[-82.91863,42.39956],[-82.92149,42.39546],[-82.93542,42.38978],[-82.9468,42.38699],[-82.93027,42.36214],[-82.93087,42.3619],[-82.92859,42.358],[-82.92397,42.35212],[-82.94541,42.3474],[-82.95977,42.33977],[-82.98912,42.33248],[-83.01895,42.33062],[-83.06356,42.31686],[-83.07994,42.30717],[-83.0999,42.2867],[-83.11463,42.29018],[-83.11813,42.28973],[-83.11987,42.28755],[-83.11764,42.28041],[-83.11877,42.27913],[-83.13745,42.28279],[-83.16097,42.25496],[-83.16635,42.25968],[-83.16811,42.26391],[-83.16983,42.26458],[-83.15816,42.27884],[-83.167,42.28957],[-83.16166,42.29178],[-83.15825,42.29202],[-83.15769,42.29496],[-83.15169,42.29626],[-83.14999,42.29583],[-83.14894,42.29341],[-83.14724,42.29257],[-83.14256,42.29441],[-83.14045,42.29775],[-83.14242,42.30569],[-83.1406,42.30668],[-83.13964,42.30866],[-83.1407,42.31101],[-83.15313,42.32809],[-83.15647,42.32724],[-83.1569,42.33696],[-83.15296,42.33759],[-83.14994,42.33984],[-83.14835,42.34469],[-83.14766,42.35192],[-83.19653,42.35089],[-83.19606,42.33644],[-83.21534,42.33614],[-83.21528,42.32902],[-83.22514,42.32881],[-83.22783,42.3326],[-83.23458,42.32984],[-83.23503,42.33584],[-83.23749,42.33574],[-83.23777,42.34309],[-83.26384,42.34169],[-83.26591,42.35705],[-83.26658,42.37879],[-83.27491,42.37859],[-83.27586,42.40728],[-83.28638,42.407],[-83.28773,42.44268],[-82.94053,42.45037],[-82.95128,42.43581],[-82.91625,42.42135]
  ];

  var LAT0 = 42.35, MI_PER_LAT = 69.0, MI_PER_LNG = 69.0 * Math.cos(LAT0 * Math.PI / 180);
  var BOUNDARY_XY = DETROIT_BOUNDARY.map(function (pt) {
    return [(pt[0] + 83.4) * MI_PER_LNG, (pt[1] - LAT0) * MI_PER_LAT];
  });

  function milesFromBorder(lat, lng) {
    var px = (lng + 83.4) * MI_PER_LNG, py = (lat - LAT0) * MI_PER_LAT, min = Infinity;
    for (var i = 0; i < BOUNDARY_XY.length - 1; i++) {
      var ax = BOUNDARY_XY[i][0], ay = BOUNDARY_XY[i][1];
      var dx = BOUNDARY_XY[i + 1][0] - ax, dy = BOUNDARY_XY[i + 1][1] - ay;
      var len2 = dx * dx + dy * dy;
      var t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      var d = Math.sqrt(Math.pow(px - (ax + t * dx), 2) + Math.pow(py - (ay + t * dy), 2));
      if (d < min) min = d;
    }
    return min;
  }

  function haversineMiles(lat1, lng1, lat2, lng2) {
    var R = 3958.8, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.pow(Math.sin(dLng / 2), 2);
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  // Is this place within 75 miles of Detroit's border?
  function inOrbit(loc) {
    return !!loc && milesFromBorder(loc.lat, loc.lng) <= ORBIT_MILES;
  }

  // Lowercase-name -> place, for the cities of `locations` (type "city" or untyped), then the
  // Phase 2 cities. A city already in `locations` is never replaced by a Phase 2 row.
  function buildLookup(locations, phase2) {
    var map = new Map();
    (locations || []).forEach(function (l) {
      if (l && (l.type === undefined || l.type === "city")) map.set(String(l.name).toLowerCase(), l);
    });
    (phase2 || []).forEach(function (c) {
      var k = String(c.name).toLowerCase();
      if (!map.has(k)) map.set(k, c);
    });
    return map;
  }

  function cityResolution() {
    var CR = root.CityResolution;
    if (!CR && typeof require === "function") { try { CR = require("./city-resolution.js").CityResolution; } catch (e) { /* none */ } }
    return CR || null;
  }

  // Where is this event? Returns
  //   { status: "placed",   loc, key, alias, assumed }   assumed = the city was blank and Detroit
  //                                                      was assumed (existing behaviour, counted)
  //   { status: "unplaced", reason }                     reason: "not-in-table" | "source-not-evidence" | "no-resolver"
  // The raw city is never modified.
  function locate(e, lookup) {
    var raw = e && e.city;
    if (raw == null || String(raw).trim() === "") {
      var d = lookup.get("detroit");
      return d ? { status: "placed", loc: d, key: "detroit", alias: null, assumed: true }
               : { status: "unplaced", reason: "no-detroit" };
    }
    var exact = lookup.get(String(raw).trim().toLowerCase());
    if (exact && !exact.sources) return { status: "placed", loc: exact, key: String(exact.name).toLowerCase(), alias: null, assumed: false };
    var CR = cityResolution();
    if (!CR) return { status: "unplaced", reason: "no-resolver" };
    var hit = CR.resolve(raw, lookup, { source: e.source, venue: e.venue });
    if (hit) return { status: "placed", loc: hit.loc, key: hit.key, alias: hit.alias || null, assumed: false };
    // A bare name that IS in the table but gated on source evidence this event's feed lacks.
    var gated = lookup.get(CR.normalize(raw));
    return { status: "unplaced", reason: gated && gated.sources ? "source-not-evidence" : "not-in-table" };
  }

  // The place filter. `radius` is "orbit"/"all" or a number of miles from `origin`
  // ({lat,lng}). Every radius stays inside the Orbit. Returns {eligible, status, reason}:
  // an unplaced event is `eligible:false` under a place filter but the caller can count it
  // by status and offer it, rather than losing it silently.
  function withinPlace(e, lookup, origin, radius) {
    var at = locate(e, lookup);
    if (at.status !== "placed") return { eligible: false, status: "unplaced", reason: at.reason };
    if (!inOrbit(at.loc)) return { eligible: false, status: "placed", reason: "outside-orbit", loc: at.loc };
    if (radius === "orbit" || radius === "all" || radius == null) return { eligible: true, status: "placed", loc: at.loc };
    var d = haversineMiles(origin.lat, origin.lng, at.loc.lat, at.loc.lng);
    return d <= radius ? { eligible: true, status: "placed", loc: at.loc } : { eligible: false, status: "placed", reason: "too-far", loc: at.loc };
  }

  // Counts for a list of events: { placed, unplaced, assumed, byReason }.
  function partition(events, lookup) {
    var out = { placed: 0, unplaced: 0, assumed: 0, byReason: {} };
    (events || []).forEach(function (e) {
      var at = locate(e, lookup);
      if (at.status === "placed") { out.placed++; if (at.assumed) out.assumed++; }
      else { out.unplaced++; out.byReason[at.reason] = (out.byReason[at.reason] || 0) + 1; }
    });
    return out;
  }

  var api = {
    ORBIT_MILES: ORBIT_MILES, DETROIT_BOUNDARY: DETROIT_BOUNDARY,
    milesFromBorder: milesFromBorder, haversineMiles: haversineMiles, inOrbit: inOrbit,
    buildLookup: buildLookup, locate: locate, withinPlace: withinPlace, partition: partition
  };
  if (typeof module !== "undefined" && module.exports) module.exports = { PlaceEligibility: api };
  else (typeof window !== "undefined" ? window : globalThis).PlaceEligibility = api;
})(this);
