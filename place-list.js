// place-list.js: the ONE list of places (cities and Detroit neighborhoods) behind the shared place rule. Plain static include
// (<script src="/place-list.js">), same pattern as search-match.js / city-resolution.js. Exposes one global: `PlaceList` (also
// module.exports for node tests).
//
// WHY (issue #16, Platform-approved 2026-11-04): discovery.js (homepage), calendar.html and map.html each carried a private copy of this
// list, and the copies had already drifted (the homepage had the Eastside Historic Cemetery District neighborhood, calendar and map did
// not). A town added to one copy was invisible to the others. This is the single copy; test/drift-guard.test.js fails if any page or
// discovery.js declares the list again.
//
//   PlaceList.PLACES       the raw tuples, exactly as discovery.js has always held them
//   PlaceList.locations()  a fresh array of {name, type, region, lat, lng} objects for the calendar and map (a copy each call, so a
//                          page may push its Phase 2 cities onto its own array without touching the shared list)
//
// Load order: before discovery.js on the homepage; before the page script on calendar.html and map.html.
(function (root) {
  "use strict";

  // Places: [name, type, region, lat, lng]. City-centre / neighborhood-
  // centre estimates, hand-sourced; see SERVICE_AREA.md. Only `city`
  // entries are matched against an event's own city; neighborhoods are
  // selectable as a "from here" origin.
  var PLACES = [
    ["Detroit", "city", "Michigan", 42.3314, -83.0458],
    ["Downtown", "neighborhood", "Detroit", 42.3316, -83.0466],
    ["Midtown", "neighborhood", "Detroit", 42.3536, -83.0666],
    ["New Center", "neighborhood", "Detroit", 42.3707, -83.071],
    ["Corktown", "neighborhood", "Detroit", 42.3308, -83.068],
    ["North Corktown", "neighborhood", "Detroit", 42.3385, -83.071],
    ["Core City", "neighborhood", "Detroit", 42.339, -83.079],
    ["Woodbridge", "neighborhood", "Detroit", 42.348, -83.079],
    ["Eastern Market", "neighborhood", "Detroit", 42.3459, -83.0416],
    ["Brush Park", "neighborhood", "Detroit", 42.3435, -83.053],
    ["Lafayette Park", "neighborhood", "Detroit", 42.335, -83.029],
    ["Rivertown", "neighborhood", "Detroit", 42.3395, -83.018],
    ["Indian Village", "neighborhood", "Detroit", 42.366, -82.984],
    ["West Village", "neighborhood", "Detroit", 42.361, -82.991],
    ["Islandview", "neighborhood", "Detroit", 42.363, -82.995],
    ["Milwaukee Junction", "neighborhood", "Detroit", 42.373, -83.057],
    ["North End", "neighborhood", "Detroit", 42.38, -83.066],
    ["Poletown East", "neighborhood", "Detroit", 42.373, -83.033],
    ["Jefferson-Chalmers", "neighborhood", "Detroit", 42.4, -82.935],
    ["Belle Isle", "neighborhood", "Detroit", 42.339, -82.97],
    ["Morningside", "neighborhood", "Detroit", 42.407, -82.955],
    ["East English Village", "neighborhood", "Detroit", 42.427, -82.942],
    ["Boston-Edison", "neighborhood", "Detroit", 42.38, -83.101],
    ["Arden Park-East Boston", "neighborhood", "Detroit", 42.383, -83.09],
    ["University District", "neighborhood", "Detroit", 42.415, -83.135],
    ["Palmer Park", "neighborhood", "Detroit", 42.418, -83.135],
    ["Palmer Woods", "neighborhood", "Detroit", 42.427, -83.14],
    ["Sherwood Forest", "neighborhood", "Detroit", 42.427, -83.147],
    ["Bagley", "neighborhood", "Detroit", 42.418, -83.15],
    ["Russell Woods", "neighborhood", "Detroit", 42.386, -83.145],
    ["Fitzgerald", "neighborhood", "Detroit", 42.402, -83.167],
    ["Grandmont-Rosedale", "neighborhood", "Detroit", 42.408, -83.2],
    ["Old Redford", "neighborhood", "Detroit", 42.409, -83.226],
    ["Warrendale", "neighborhood", "Detroit", 42.367, -83.21],
    ["Brightmoor", "neighborhood", "Detroit", 42.402, -83.235],
    ["Mexicantown / Southwest Detroit", "neighborhood", "Detroit", 42.321, -83.094],
    ["Springwells", "neighborhood", "Detroit", 42.311, -83.117],
    ["Delray", "neighborhood", "Detroit", 42.29, -83.118],
    ["Dexter-Fenkell", "neighborhood", "Detroit", 42.387, -83.156],
    ["Wildemere Park", "neighborhood", "Detroit", 42.376, -83.129],
    ["Eastside Historic Cemetery District", "neighborhood", "Detroit", 42.3497, -83.0181],
    ["Windsor", "city", "Ontario", 42.3149, -83.0364],
    ["Bloomfield Hills", "city", "Michigan", 42.5836, -83.2455],
    ["Rochester", "city", "Michigan", 42.6806, -83.1341],
    ["Pontiac", "city", "Michigan", 42.6389, -83.291],
    ["Ypsilanti", "city", "Michigan", 42.2411, -83.613],
    ["Milford", "city", "Michigan", 42.5926, -83.6002],
    ["Clarkston", "city", "Michigan", 42.7364, -83.4199],
    ["Monroe", "city", "Michigan", 41.9164, -83.3977],
    ["Ann Arbor", "city", "Michigan", 42.2808, -83.743],
    ["Brighton", "city", "Michigan", 42.5297, -83.7796],
    ["Chatham", "city", "Ontario", 42.4048, -82.191],
    ["Fenton", "city", "Michigan", 42.797, -83.7054],
    ["Howell", "city", "Michigan", 42.6072, -83.9294],
    ["Toledo", "city", "Ohio", 41.6528, -83.5379],
    ["Port Huron", "city", "Michigan", 42.9709, -82.4252],
    ["Sarnia", "city", "Ontario", 42.9748, -82.4066],
    ["Flint", "city", "Michigan", 43.0125, -83.6875],
    ["Adrian", "city", "Michigan", 41.8975, -84.0372],
    ["Jackson", "city", "Michigan", 42.2459, -84.4013],
    ["Owosso", "city", "Michigan", 42.9964, -84.1783],
    ["Lansing", "city", "Michigan", 42.71417, -84.56],
    ["East Lansing", "city", "Michigan", 42.737, -84.4839],
    ["Hamtramck", "city", "Michigan", 42.3922, -83.0497],
    ["Highland Park", "city", "Michigan", 42.4054, -83.0997],
    ["Dearborn", "city", "Michigan", 42.3223, -83.1763],
    ["Dearborn Heights", "city", "Michigan", 42.3373, -83.2733],
    ["Ferndale", "city", "Michigan", 42.4606, -83.1344],
    ["Royal Oak", "city", "Michigan", 42.4895, -83.1446],
    ["Berkley", "city", "Michigan", 42.5023, -83.1838],
    ["Oak Park", "city", "Michigan", 42.4595, -83.183],
    ["Southfield", "city", "Michigan", 42.4734, -83.2219],
    ["Birmingham", "city", "Michigan", 42.5467, -83.2113],
    ["Troy", "city", "Michigan", 42.6064, -83.1499],
    ["Sterling Heights", "city", "Michigan", 42.5803, -83.0302],
    ["Warren", "city", "Michigan", 42.5145, -83.0147],
    ["Madison Heights", "city", "Michigan", 42.5292, -83.1057],
    ["Auburn Hills", "city", "Michigan", 42.6875, -83.2341],
    ["Rochester Hills", "city", "Michigan", 42.6583, -83.1499],
    ["Waterford", "city", "Michigan", 42.6892, -83.3585],
    ["Novi", "city", "Michigan", 42.4806, -83.4755],
    ["Farmington Hills", "city", "Michigan", 42.4989, -83.3677],
    ["Livonia", "city", "Michigan", 42.3684, -83.3527],
    ["Westland", "city", "Michigan", 42.3242, -83.4002],
    ["Taylor", "city", "Michigan", 42.2409, -83.2699],
    ["Lincoln Park", "city", "Michigan", 42.2506, -83.1785],
    ["Wyandotte", "city", "Michigan", 42.2142, -83.1499],
    ["Grosse Pointe", "city", "Michigan", 42.3861, -82.9116],
    ["St. Clair Shores", "city", "Michigan", 42.497, -82.8888],
    ["Roseville", "city", "Michigan", 42.4973, -82.9371],
    ["Eastpointe", "city", "Michigan", 42.467, -82.956],
    ["Utica", "city", "Michigan", 42.6264, -83.0341],
    ["Shelby Township", "city", "Michigan", 42.6642, -83.0341],
    ["Clinton Township", "city", "Michigan", 42.5869, -82.92],
    ["Mount Clemens", "city", "Michigan", 42.5973, -82.8794],
    ["Grand Blanc", "city", "Michigan", 42.927, -83.6249]
  ];
  function locations() {
    return PLACES.map(function (p) { return { name: p[0], type: p[1], region: p[2], lat: p[3], lng: p[4] }; });
  }

  var api = { PLACES: PLACES, locations: locations };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (root) root.PlaceList = api;
})(typeof globalThis !== "undefined" ? globalThis : null);
