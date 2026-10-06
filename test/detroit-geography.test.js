// test/detroit-geography.test.js — "is this point in Detroit, and in which
// City neighborhood polygon?" (api/_lib/detroit-geography.js).
//
// Part 1 uses a small made-up city (test/fixtures/geography-small-city.js),
// so the rules are proved without the real data. Part 2 reads the COMMITTED
// snapshot of the City of Detroit's layers (data/geography/) and checks it
// against what was measured from the City's live service on 2026-10-05.
//
// Run: node test/detroit-geography.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const geo = require(`${REPO_DIR}/api/_lib/detroit-geography.js`);
const small = require(`${REPO_DIR}/test/fixtures/geography-small-city.js`);

// The 45 neighborhood labels in production on 2026-10-05.
const LABELS_2026_10_05 = [
  "Arden Park-East Boston", "Bagley", "Belle Isle", "Boston-Edison", "Bricktown Historic District", "Brightmoor", "Brush Park",
  "Cass Corridor", "Core City", "Corktown", "Delray", "Dexter-Fenkell", "Downtown", "East English Village", "Eastern Market",
  "Eastside Historic Cemetery District", "Fitzgerald-Marygrove", "Grandmont-Rosedale", "Gratiot-Findlay", "Indian Village",
  "Islandview", "Jefferson-Chalmers", "Lafayette Park", "Mexicantown / Southwest Detroit", "Midtown", "Milwaukee Junction",
  "Morningside", "New Center", "North Corktown", "North End", "Old Redford", "Palmer Park", "Palmer Woods", "Poletown East",
  "Rivertown-Warehouse District", "Russell Woods", "Sherwood Forest", "Springwells", "The District Detroit", "University District",
  "Warrendale", "West End", "West Village", "Wildemere Park", "Woodbridge",
];

function run() {
  // --- 1. point in ring / polygon ------------------------------------------
  {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    assert.strictEqual(geo.pointInRing(5, 5, square), true);
    assert.strictEqual(geo.pointInRing(15, 5, square), false);
    assert.strictEqual(geo.pointInRing(5, -1, square), false);
    const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
    assert.strictEqual(geo.pointInPolygonRings(5, 5, [square, hole]), false, "in the hole is not in the polygon");
    assert.strictEqual(geo.pointInPolygonRings(2, 2, [square, hole]), true);
    assert.strictEqual(geo.pointInGeometry(25, 5, { type: "MultiPolygon", coordinates: [[square], [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]]] }), true, "any part of a multi-part shape");
    assert.strictEqual(geo.pointInGeometry(5, 5, null), false);
    // A point exactly on the edge two polygons share belongs to exactly one
    // of them -- never both, never neither -- and the same one every time.
    const west = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const east = [[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]];
    for (const y of [1, 5, 9.5]) {
      const inWest = geo.pointInRing(10, y, west);
      const inEast = geo.pointInRing(10, y, east);
      assert.strictEqual(Number(inWest) + Number(inEast), 1, `a point on the shared edge (y=${y}) is in exactly one`);
    }
  }
  console.log("PASS: point-in-polygon — inside, outside, holes, multi-part shapes; a point on a shared edge belongs to exactly one side");

  // --- 2. the two questions, on the small city -----------------------------
  const g = geo.buildGeography(small.neighborhoods, small.boundary);
  const at = (p) => g.neighborhoodAt(p.lat, p.lng);
  {
    const P = small.POINTS;
    assert.strictEqual(g.count, 8);
    assert.deepStrictEqual({ status: at(P.downtown).status, name: at(P.downtown).name }, { status: "found", name: "Downtown" });
    assert.strictEqual(at(P.midtown).name, "Midtown");
    assert.strictEqual(at(P.downtown).number, 1);
    assert.strictEqual(g.insideDetroit(P.downtown.lat, P.downtown.lng), true);

    // Outside the limits, whether beyond them or in the city they surround.
    assert.deepStrictEqual(at(P.outside), { status: "outside_detroit" });
    assert.deepStrictEqual(at(P.inTheHole), { status: "outside_detroit" }, "a surrounded city is not Detroit");
    assert.strictEqual(g.insideDetroit(P.inTheHole.lat, P.inTheHole.lng), false);

    // Inside the limits with no answer.
    assert.deepStrictEqual(at(P.noPolygon), { status: "no_polygon" });
    assert.deepStrictEqual(at(P.overlap), { status: "ambiguous", names: ["Overlap A", "Overlap B"] }, "two polygons is not an answer");

    // Not a coordinate.
    for (const [lat, lng] of [[null, null], ["42.3", "-83.0"], [NaN, -83], [420, -83], [42.3, undefined]]) {
      assert.deepStrictEqual(g.neighborhoodAt(lat, lng), { status: "invalid" });
      assert.strictEqual(g.insideDetroit(lat, lng), false);
    }

    // How close to the line: 0.00005 degrees of latitude is about 5.6 metres.
    const near = at(P.midtownOnTheLine);
    assert.strictEqual(near.name, "Midtown");
    assert.ok(near.edgeMeters >= 5 && near.edgeMeters <= 6, `about 5.6 m from the edge, got ${near.edgeMeters}`);
    assert.ok(at(P.midtown).edgeMeters > 1000, "the middle of Midtown is far from any edge");

    assert.throws(() => geo.buildGeography(small.neighborhoods, { features: [] }), /boundary layer has no geometry/);
    assert.throws(() => geo.buildGeography({ features: [] }, small.boundary), /no named polygons/);
  }
  console.log("PASS: in the city / outside it / in the surrounded city; one polygon, none, two; distance to the nearest edge");

  // --- 3. the City's name -> a 313.events label -----------------------------
  {
    const L = LABELS_2026_10_05;
    // The same name, however it is punctuated.
    assert.deepStrictEqual(geo.labelForCityName("Downtown", L), { action: "use", label: "Downtown" });
    assert.deepStrictEqual(geo.labelForCityName("Boston Edison", L), { action: "use", label: "Boston-Edison" });
    assert.deepStrictEqual(geo.labelForCityName("Fitzgerald/Marygrove", L), { action: "use", label: "Fitzgerald-Marygrove" });
    assert.deepStrictEqual(geo.labelForCityName("Jefferson Chalmers", L), { action: "use", label: "Jefferson-Chalmers" });
    // The two approved geographic aliases: the polygon IS the label, which keeps its name.
    assert.deepStrictEqual(geo.labelForCityName("Rivertown", L), { action: "use", label: "Rivertown-Warehouse District" });
    assert.deepStrictEqual(geo.labelForCityName("Arden Park", L), { action: "use", label: "Arden Park-East Boston" });
    assert.deepStrictEqual(geo.GEOGRAPHIC_ALIASES, { rivertown: "Rivertown-Warehouse District", "arden park": "Arden Park-East Boston" });
    // No label of that name: the City's own name is offered as one (the
    // caller decides whether to create it). Never a look-alike: "North
    // Corktown" is not "Corktown", "Midtown" is not "Cass Corridor".
    assert.deepStrictEqual(geo.labelForCityName("Elijah McCoy", L), { action: "create", label: "Elijah McCoy" });
    assert.deepStrictEqual(geo.labelForCityName("Greektown", L), { action: "create", label: "Greektown" });
    assert.deepStrictEqual(geo.labelForCityName("Wayne State", L), { action: "create", label: "Wayne State" });
    assert.deepStrictEqual(geo.labelForCityName("New Center Commons", L), { action: "create", label: "New Center Commons" });
    assert.deepStrictEqual(geo.labelForCityName("Central Southwest", L), { action: "create", label: "Central Southwest" });
    assert.deepStrictEqual(geo.labelForCityName("North Corktown", L), { action: "use", label: "North Corktown" });
    // HELD: polygons that bear on a label whose mapping is reserved.
    //   Grandmont-Rosedale "spans multiple City polygons and needs a deliberate mapping".
    for (const name of ["Grandmont", "Grandmont #1", "Rosedale Park", "North Rosedale Park"]) {
      assert.deepStrictEqual(geo.labelForCityName(name, L), { action: "hold", pendingLabel: "Grandmont-Rosedale" });
    }
    //   Mexicantown / Southwest Detroit "is intentionally broader than the
    //   City's Mexicantown polygon. Do not collapse it to that polygon."
    assert.deepStrictEqual(geo.labelForCityName("Mexicantown", L), { action: "hold", pendingLabel: "Mexicantown / Southwest Detroit" });
    // "Grandmont #1" is its own polygon, not "Grandmont".
    assert.notStrictEqual(geo.nameKey("Grandmont #1"), geo.nameKey("Grandmont"));

    // CULTURAL AND RESERVED LABELS: a person assigns them; geography never does,
    // whatever a polygon is called -- for every one of the City's 205 names.
    assert.deepStrictEqual([...geo.PERSON_ASSIGNED_LABELS].sort(), [
      "Bricktown Historic District", "Cass Corridor", "Eastside Historic Cemetery District",
      "Grandmont-Rosedale", "Mexicantown / Southwest Detroit", "The District Detroit",
    ]);
    for (const label of geo.PERSON_ASSIGNED_LABELS) {
      assert.ok(L.includes(label), `${label} is a real label`);
      assert.strictEqual(geo.labelForCityName(label, L).action, "hold", "even a polygon that took the label's exact name would not be assigned into it");
    }
    for (const label of Object.keys(geo.HELD_POLYGONS)) assert.ok(geo.PERSON_ASSIGNED_LABELS.includes(label));
    for (const label of Object.values(geo.GEOGRAPHIC_ALIASES)) assert.ok(L.includes(label) && !geo.PERSON_ASSIGNED_LABELS.includes(label));
  }
  console.log("PASS: City name -> label: same name used, two approved aliases, reserved polygons held, cultural labels never assigned by geography");

  // --- 4. the committed snapshot of the City's layers -----------------------
  {
    for (const file of ["detroit-neighborhoods.geojson", "detroit-city-boundary.geojson", "detroit-neighborhoods.layer.json", "detroit-city-boundary.layer.json", "SNAPSHOT.txt"]) {
      assert.ok(fs.existsSync(`${REPO_DIR}/data/geography/${file}`), `data/geography/${file} is committed`);
    }
    const real = geo.loadGeography();
    // As measured from the City's service on 2026-10-05.
    assert.strictEqual(real.count, 205, "205 neighborhood polygons");
    assert.strictEqual(new Set(real.names.map(geo.nameKey)).size, 205, "no two polygons share a name");
    assert.strictEqual(real.neighborhoodsEditedOn, "2023-12-06", "the City's own last-edit date for the neighborhoods layer");
    assert.strictEqual(real.boundaryEditedOn, "2023-05-16");
    const snapshot = fs.readFileSync(`${REPO_DIR}/data/geography/SNAPSHOT.txt`, "utf8");
    assert.ok(/Current_City_of_Detroit_Neighborhoods\/FeatureServer\/0/.test(snapshot) && /City_of_Detroit_Boundary\/FeatureServer\/0/.test(snapshot), "the snapshot records both source URLs");
    assert.ok(/Copied on:\s+20\d\d-\d\d-\d\dT/.test(snapshot) && /sha256:\s+[0-9a-f]{64}/.test(snapshot));

    const where = (lat, lng) => real.neighborhoodAt(lat, lng);
    // Census geocoder coordinates for these addresses, 2026-10-05.
    assert.strictEqual(where(42.338396, -83.051923).name, "Downtown", "Fox Theatre, 2211 Woodward Ave");
    assert.strictEqual(where(42.331329, -83.072748).name, "Corktown", "MotorCity Wine, 1949 Michigan Ave");
    assert.strictEqual(where(42.344109, -83.060894).name, "Midtown", "Detroit Shipping Company, 474 Peterboro St");
    assert.strictEqual(where(42.424339, -83.151651).name, "Bagley", "Bagley Elementary, 8100 Curtis St");
    assert.strictEqual(where(42.347357, -82.963658).name, "Belle Isle", "Belle Isle Nature Center");
    assert.strictEqual(where(42.362841, -83.082573).name, "Elijah McCoy", "Lincoln Factory, 1331 Holden St");
    // Surrounded by Detroit and not Detroit.
    assert.strictEqual(where(42.398171, -83.064463).status, "outside_detroit", "2357 Caniff, Hamtramck");
    assert.strictEqual(where(42.40145, -83.060937).status, "outside_detroit", "11474 Joseph Campau, Hamtramck (stored as Detroit)");
    assert.strictEqual(where(42.416523, -83.115641).status, "outside_detroit", "16940 Hamilton Ave, Highland Park");
    // Suburbs.
    assert.strictEqual(where(42.459206, -83.133305).status, "outside_detroit", "Ferndale");
    assert.strictEqual(where(42.487253, -83.147731).status, "outside_detroit", "Royal Oak");
    // On a boundary street: the answer exists, and it is 6 metres from being the other one.
    const dia = where(42.358602, -83.065385);
    assert.strictEqual(dia.name, "Cultural Center", "Detroit Institute of Arts, 5200 Woodward Ave");
    assert.ok(dia.edgeMeters < 20, `the DIA's geocoded point is on the Woodward line (${dia.edgeMeters} m)`);

    // Every existing label has a polygon of its own name, or is one of the two
    // aliased labels, or is a label only a person assigns.
    const cityKeys = new Set(real.names.map(geo.nameKey));
    const unmatched = LABELS_2026_10_05.filter((label) => !cityKeys.has(geo.nameKey(label)));
    assert.deepStrictEqual(unmatched.sort(), [...geo.PERSON_ASSIGNED_LABELS, ...Object.values(geo.GEOGRAPHIC_ALIASES)].sort(), "37 labels match a polygon by name; the other 8 are the two aliases and the six a person assigns");
    // The aliases and the held polygons are real polygons.
    for (const key of Object.keys(geo.GEOGRAPHIC_ALIASES)) assert.ok(cityKeys.has(key), `"${key}" is a City polygon`);
    for (const names of Object.values(geo.HELD_POLYGONS)) for (const name of names) assert.ok(cityKeys.has(geo.nameKey(name)), `"${name}" is a City polygon`);
    // No City polygon can ever be assigned into a person-assigned label.
    for (const name of real.names) {
      const mapped = geo.labelForCityName(name, LABELS_2026_10_05);
      if (mapped.action === "use") assert.ok(!geo.PERSON_ASSIGNED_LABELS.includes(mapped.label), `${name} -> ${mapped.label}`);
    }
    // Big Pink, 6440 Wight St: the City's "Rivertown", the label "Rivertown-Warehouse District".
    assert.strictEqual(where(42.342349, -83.007843).name, "Rivertown");
  }
  console.log("PASS: the committed City snapshot — 205 polygons, dated, sourced; known venues land where the City's map puts them; Hamtramck and Highland Park are outside");

  console.log("\nAll detroit-geography tests passed.");
}

run();
