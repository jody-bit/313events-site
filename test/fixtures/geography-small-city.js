// test/fixtures/geography-small-city.js — a made-up city shaped like the
// real problem, for tests that must not depend on the real snapshot:
//
//   - city limits: one rectangle WITH A HOLE in it (a separate city entirely
//     surrounded, as Hamtramck and Highland Park are by Detroit);
//   - neighborhood polygons carrying the names that exercise every mapping
//     rule in api/_lib/detroit-geography.js: a name an existing 313.events
//     label already has ("Downtown", "Midtown"), the same name spelled the
//     City's way ("Boston Edison" for "Boston-Edison"), an approved alias
//     ("Rivertown"), a polygon held for a reserved label ("Mexicantown"),
//     and a name no label has ("Elijah McCoy");
//   - two polygons that overlap, and a part of the city no polygon covers.
//
// One thousandth of a degree of latitude is about 111 metres.
"use strict";

const rect = (west, south, east, north) => [[[west, south], [east, south], [east, north], [west, north], [west, south]]];
const polygon = (name, number, rings) => ({ type: "Feature", properties: { nhood_name: name, nhood_num: number, council_district: 1 }, geometry: { type: "Polygon", coordinates: rings } });

const HOLE = rect(-83.08, 42.38, -83.05, 42.41)[0];
const boundary = {
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { name: "Detroit" }, geometry: { type: "Polygon", coordinates: [rect(-83.20, 42.30, -83.00, 42.45)[0], HOLE] } }],
};
const neighborhoods = {
  type: "FeatureCollection",
  features: [
    polygon("Downtown", 1, rect(-83.06, 42.32, -83.03, 42.345)),
    polygon("Midtown", 2, rect(-83.08, 42.345, -83.05, 42.37)),
    polygon("Rivertown", 3, rect(-83.03, 42.32, -83.00, 42.345)),
    polygon("Elijah McCoy", 4, rect(-83.10, 42.345, -83.08, 42.37)),
    polygon("Boston Edison", 5, rect(-83.10, 42.37, -83.08, 42.39)),
    polygon("Mexicantown", 6, rect(-83.10, 42.31, -83.08, 42.33)),
    polygon("Overlap A", 7, rect(-83.18, 42.40, -83.16, 42.42)),
    polygon("Overlap B", 8, rect(-83.17, 42.41, -83.15, 42.43)),
  ],
};

// Points, as { lat, lng }.
const POINTS = {
  downtown: { lat: 42.335, lng: -83.045 },          // well inside Downtown
  midtown: { lat: 42.36, lng: -83.065 },            // well inside Midtown
  midtownOnTheLine: { lat: 42.34505, lng: -83.055 }, // 5.6 m north of the Downtown/Midtown line
  midtownOnTheLine2: { lat: 42.34504, lng: -83.057 }, // another, 4.5 m north of it
  rivertown: { lat: 42.335, lng: -83.015 },
  elijahMcCoy: { lat: 42.36, lng: -83.09 },
  elijahMcCoy2: { lat: 42.355, lng: -83.092 },
  bostonEdison: { lat: 42.38, lng: -83.09 },
  mexicantown: { lat: 42.32, lng: -83.09 },
  inTheHole: { lat: 42.395, lng: -83.065 },         // the surrounded city
  outside: { lat: 42.50, lng: -83.10 },             // a northern suburb
  noPolygon: { lat: 42.44, lng: -83.02 },           // in the city, in no polygon
  overlap: { lat: 42.415, lng: -83.165 },           // in two polygons
};

module.exports = { boundary, neighborhoods, POINTS, rect };
