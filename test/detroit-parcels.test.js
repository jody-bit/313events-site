// test/detroit-parcels.test.js — the City's parcel record settles a venue
// that the geocoder left on a neighborhood boundary (api/_lib/detroit-parcels.js).
//
// The service answers below are the City of Detroit's own, word for word, as
// its "Parcels (Current)" service returned them on 2026-10-05 for the three
// boundary venues the Product Owner asked about. They are checked against the
// COMMITTED snapshot of the City's neighborhood polygons (data/geography/).
//
// Run: node test/detroit-parcels.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { findParcel, readParcelAnswer, parcelQueryUrl, SERVICE } = require(`${REPO_DIR}/api/_lib/detroit-parcels.js`);
const { loadGeography, buildGeography } = require(`${REPO_DIR}/api/_lib/detroit-geography.js`);
const { parseStreet } = require(`${REPO_DIR}/api/_lib/street-address.js`);
const small = require(`${REPO_DIR}/test/fixtures/geography-small-city.js`);

// As returned by the service on 2026-10-05.
const CONGREGATION = { type: "FeatureCollection", crs: { type: "name", properties: { name: "EPSG:4326" } }, features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[-83.100758, 42.377505], [-83.100458, 42.377617], [-83.100234, 42.37729], [-83.100538, 42.377177], [-83.100539, 42.377178], [-83.100758, 42.377504], [-83.100758, 42.377505]]] }, properties: { parcel_id: "08002811.", address: "9321 ROSA PARKS BLVD", street_number: 9321, street_prefix: "", street_name: "ROSA PARKS", neighborhood: "Historic Atkinson" } }] };
const PARIS_BAR = { type: "FeatureCollection", crs: { type: "name", properties: { name: "EPSG:4326" } }, features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[-83.071279, 42.418952], [-83.071138, 42.418745], [-83.071518, 42.418743], [-83.071583, 42.41884], [-83.071279, 42.418952]]] }, properties: { parcel_id: "09011086.000", address: "2961 E MCNICHOLS", street_number: 2961, street_prefix: "E", street_name: "MCNICHOLS", neighborhood: "Cadillac Heights" } }] };
const MENJOS = { type: "FeatureCollection", crs: { type: "name", properties: { name: "EPSG:4326" } }, features: [] };
// The only parcel the file has on that block of W McNichols: number 900, not 928.
const NINE_HUNDRED = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-83.115677, 42.417699], [-83.115863, 42.41797], [-83.11458, 42.417992], [-83.114567, 42.417718], [-83.115677, 42.417699]]] }, properties: { parcel_id: "02002493-500", address: "900 W MCNICHOLS", street_number: 900, street_prefix: "W", street_name: "MCNICHOLS", neighborhood: "Palmer Park" } };

const street = (text) => parseStreet(text);
// Where the Census geocoder placed each venue (2026-10-05).
const AT_CONGREGATION = { point: { lat: 42.37743, lng: -83.100305 }, maxMetersFromPolygon: 50 };
const AT_PARIS_BAR = { point: { lat: 42.418662, lng: -83.071366 }, maxMetersFromPolygon: 50 };
const AT_MENJOS = { point: { lat: 42.417666, lng: -83.114866 }, maxMetersFromPolygon: 50 };
const where = (url) => new URL(url).searchParams.get("where");

async function run() {
  const city = loadGeography();

  // --- 1. the question asked of the service ----------------------------------
  {
    const url = parcelQueryUrl(street("9321 Rosa Parks Blvd"));
    assert.ok(url.startsWith(`${SERVICE}/query?`));
    assert.strictEqual(where(url), "street_number = 9321 AND street_name = 'ROSA PARKS'");
    assert.strictEqual(new URL(url).searchParams.get("f"), "geojson");
    assert.strictEqual(new URL(url).searchParams.get("outSR"), "4326");
    assert.strictEqual(where(parcelQueryUrl(street("2961 E McNichols Rd"))), "street_number = 2961 AND street_name = 'MCNICHOLS' AND street_prefix = 'E'");
    assert.strictEqual(where(parcelQueryUrl(street("928 W. McNichols Rd"))), "street_number = 928 AND street_name = 'MCNICHOLS' AND street_prefix = 'W'");
    // Nothing that is not a plain house number and a plain street name is ever sent.
    assert.strictEqual(parcelQueryUrl({ number: "12a", name: "main" }), null);
    assert.strictEqual(parcelQueryUrl({ number: "100", name: "o'brien" }), null, "a quote cannot reach the query");
    assert.strictEqual(parcelQueryUrl({ number: "100", name: "main'; DROP" }), null);
    assert.strictEqual(parcelQueryUrl({ number: "100", name: "" }), null);
    assert.strictEqual(parcelQueryUrl({ number: "100", name: "main", dir: "x" }), null);
    assert.strictEqual(parcelQueryUrl(null), null);
    // A direction written after the street counts as the direction.
    assert.strictEqual(where(parcelQueryUrl(street("18100 Outer Dr E"))), "street_number = 18100 AND street_name = 'OUTER' AND street_prefix = 'E'");
  }
  console.log("PASS: the parcel question — exact house number, street name and direction; nothing else can reach the query");

  // --- 2. the three venues, against the City's real polygons -------------------
  {
    assert.deepStrictEqual(readParcelAnswer(CONGREGATION, city, street("9321 Rosa Parks Blvd"), AT_CONGREGATION), { status: "settled", polygon: "Historic Atkinson", parcelIds: ["08002811."] });
    assert.deepStrictEqual(readParcelAnswer(PARIS_BAR, city, street("2961 E McNichols Rd"), AT_PARIS_BAR), { status: "settled", polygon: "Cadillac Heights", parcelIds: ["09011086.000"] });
    // Menjo's: the file has no parcel at 928. Not settled -- and the parcel
    // numbered 900 next to it is NOT taken for it, even if the service were to return it.
    assert.deepStrictEqual(readParcelAnswer(MENJOS, city, street("928 W McNichols Rd"), AT_MENJOS), { status: "not_settled", reason: "no_parcel" });
    assert.deepStrictEqual(readParcelAnswer({ type: "FeatureCollection", features: [NINE_HUNDRED] }, city, street("928 W McNichols Rd"), AT_MENJOS), { status: "not_settled", reason: "no_parcel" }, "a neighbouring house number is not this address");
    assert.strictEqual(readParcelAnswer({ type: "FeatureCollection", features: [NINE_HUNDRED] }, city, street("900 W McNichols Rd"), AT_MENJOS).polygon, "Palmer Park");
    // The geocoder's own point for each settled venue is in the same polygon -- on the line, which is why the parcel was needed.
    const congregation = city.neighborhoodAt(42.37743, -83.100305);
    assert.deepStrictEqual([congregation.name, congregation.edgeMeters < 50], ["Historic Atkinson", true]);
    const parisBar = city.neighborhoodAt(42.418662, -83.071366);
    assert.deepStrictEqual([parisBar.name, parisBar.edgeMeters < 50], ["Cadillac Heights", true]);
  }
  console.log("PASS: The Congregation (Historic Atkinson) and Paris Bar (Cadillac Heights) are settled by their parcels; Menjo's is not");

  // --- 3. what does NOT settle it ----------------------------------------------
  {
    const parcel = (extra, coordinates) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: coordinates || PARIS_BAR.features[0].geometry.coordinates }, properties: { ...PARIS_BAR.features[0].properties, ...extra } });
    const asked = street("2961 E McNichols Rd");
    const read = (...features) => readParcelAnswer({ type: "FeatureCollection", features }, city, asked, AT_PARIS_BAR);
    // The record names one neighborhood, the drawing lies in another.
    assert.deepStrictEqual(read(parcel({ neighborhood: "Palmer Park" })), { status: "not_settled", reason: "record_and_drawing_disagree", detail: "record: Palmer Park; drawing: Cadillac Heights" });
    // The record names none.
    assert.strictEqual(read(parcel({ neighborhood: null })).reason, "parcels_disagree");
    // Two parcels at the address that name different neighborhoods.
    assert.strictEqual(read(parcel({}), parcel({ parcel_id: "x", neighborhood: "Palmer Park" })).reason, "parcels_disagree");
    // Two units at one address, same neighborhood, both drawn inside it: settled, both ids kept.
    assert.deepStrictEqual(read(parcel({}), parcel({ parcel_id: "09011086.001" })).parcelIds, ["09011086.000", "09011086.001"]);
    // A parcel not all in one polygon (here: one corner moved a kilometre north).
    const stretched = [[[-83.071279, 42.418952], [-83.071138, 42.418745], [-83.071518, 42.418743], [-83.071583, 42.42884], [-83.071279, 42.418952]]];
    assert.strictEqual(read(parcel({}, stretched)).reason, "parcel_crosses_boundary");
    // No drawing; a "polygon" that is one point three times.
    assert.strictEqual(readParcelAnswer({ type: "FeatureCollection", features: [{ type: "Feature", geometry: null, properties: PARIS_BAR.features[0].properties }] }, city, asked, AT_PARIS_BAR).reason, "no_geometry");
    assert.strictEqual(read(parcel({}, [[[-83.0712, 42.4188], [-83.0712, 42.4188], [-83.0712, 42.4188], [-83.0712, 42.4188]]])).reason, "no_geometry");
    // EAST AND WEST ARE DIFFERENT ADDRESSES. An address that states no
    // direction is not matched to a parcel that has one.
    assert.deepStrictEqual(readParcelAnswer(PARIS_BAR, city, street("2961 McNichols Rd"), AT_PARIS_BAR), { status: "not_settled", reason: "direction_not_stated", detail: "E" });
    assert.strictEqual(readParcelAnswer(PARIS_BAR, city, street("2961 W McNichols Rd"), AT_PARIS_BAR).reason, "no_parcel");
    assert.strictEqual(readParcelAnswer(PARIS_BAR, city, street("2961 McNichols Rd E"), AT_PARIS_BAR).status, "settled", "the direction written after the street");
    // ANOTHER STREET TYPE IS ANOTHER STREET, where both state one.
    assert.deepStrictEqual(readParcelAnswer(CONGREGATION, city, street("9321 Rosa Parks Ave"), AT_CONGREGATION), { status: "not_settled", reason: "different_street_type", detail: "9321 ROSA PARKS BLVD" });
    assert.strictEqual(readParcelAnswer(CONGREGATION, city, street("9321 Rosa Parks"), AT_CONGREGATION).status, "settled", "the address states no type: nothing to contradict");
    assert.strictEqual(readParcelAnswer(PARIS_BAR, city, street("2961 E McNichols Rd"), AT_PARIS_BAR).status, "settled", "the parcel record states no type: nothing to contradict");
    // THE PARCEL MUST BE WHERE THE VENUE'S COORDINATES ARE. The same-numbered
    // parcel is real, and wholly inside its neighborhood -- but the venue's
    // point is downtown, six kilometres away.
    assert.deepStrictEqual(readParcelAnswer(CONGREGATION, city, street("9321 Rosa Parks Blvd"), { point: { lat: 42.3351, lng: -83.0466 }, maxMetersFromPolygon: 50 }), { status: "not_settled", reason: "parcel_not_at_the_point", detail: "6445 m from the venue's coordinates" });
    assert.strictEqual(readParcelAnswer(CONGREGATION, city, street("9321 Rosa Parks Blvd"), {}).reason, "parcel_not_at_the_point", "no coordinates given: nothing to tie it to");
    // Three hundred metres up the street is another block: not this venue's parcel.
    const upTheStreet = { point: { lat: AT_CONGREGATION.point.lat + 300 / 111320, lng: AT_CONGREGATION.point.lng }, maxMetersFromPolygon: 50 };
    assert.strictEqual(readParcelAnswer(CONGREGATION, city, street("9321 Rosa Parks Blvd"), upTheStreet).reason, "parcel_not_at_the_point");
    // ...and so is a spot 200 m away that is still inside Historic Atkinson: the
    // right neighborhood is not enough, the parcel has to be the venue's.
    const sameNeighborhood = { point: { lat: 42.376083, lng: -83.102129 }, maxMetersFromPolygon: 50 };
    assert.strictEqual(city.neighborhoodAt(sameNeighborhood.point.lat, sameNeighborhood.point.lng).name, "Historic Atkinson");
    assert.strictEqual(readParcelAnswer(CONGREGATION, city, street("9321 Rosa Parks Blvd"), sameNeighborhood).reason, "parcel_not_at_the_point");
    const nextDoor = { point: { lat: AT_CONGREGATION.point.lat + 60 / 111320, lng: AT_CONGREGATION.point.lng }, maxMetersFromPolygon: 50 };
    assert.strictEqual(readParcelAnswer(CONGREGATION, city, street("9321 Rosa Parks Blvd"), nextDoor).status, "settled", "the same block");
    // Close by, but its neighborhood is not one that meets the boundary the point lies on.
    assert.strictEqual(readParcelAnswer(CONGREGATION, city, street("9321 Rosa Parks Blvd"), { point: AT_CONGREGATION.point, maxMetersFromPolygon: -1 }).reason, "parcel_not_at_the_point");
    // A house number that is not a number.
    assert.strictEqual(readParcelAnswer({ type: "FeatureCollection", features: [parcel({ street_number: null })] }, city, { number: "0", name: "mcnichols", dir: "e" }, AT_PARIS_BAR).reason, "no_parcel");
    // A parcel outside the city limits settles nothing.
    const hamtramck = [[[-83.0646, 42.3981], [-83.0644, 42.3981], [-83.0644, 42.3983], [-83.0646, 42.3983], [-83.0646, 42.3981]]];
    assert.strictEqual(read(parcel({}, hamtramck)).reason, "parcel_crosses_boundary");
    // Not an answer at all.
    assert.deepStrictEqual(readParcelAnswer({ error: { code: 400 } }, city, asked, AT_PARIS_BAR), { status: "unreadable" });
    assert.deepStrictEqual(readParcelAnswer({ type: "FeatureCollection", properties: { exceededTransferLimit: true }, features: [parcel({})] }, city, asked, AT_PARIS_BAR), { status: "unreadable" });
    assert.deepStrictEqual(readParcelAnswer(null, city, asked, AT_PARIS_BAR), { status: "unreadable" });
  }
  console.log("PASS: a parcel settles nothing when the address is not exactly it, it is not at the venue's coordinates, record and drawing disagree, or it crosses a boundary");

  // --- 4. the request ------------------------------------------------------------
  {
    const urls = [];
    const ok = (body) => async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => body }; };
    assert.deepStrictEqual(await findParcel(street("9321 Rosa Parks Blvd"), city, { ...AT_CONGREGATION, fetchFn: ok(CONGREGATION) }), { status: "settled", polygon: "Historic Atkinson", parcelIds: ["08002811."] });
    assert.strictEqual(where(urls[0]), "street_number = 9321 AND street_name = 'ROSA PARKS'");
    assert.deepStrictEqual(await findParcel(street("928 W McNichols Rd"), city, { ...AT_MENJOS, fetchFn: ok(MENJOS) }), { status: "not_settled", reason: "no_parcel" });
    // The service not answering is not "no parcel": nothing is concluded.
    assert.deepStrictEqual(await findParcel(street("9321 Rosa Parks Blvd"), city, { ...AT_CONGREGATION, fetchFn: async () => { throw new Error("ETIMEDOUT"); } }), { status: "error", detail: "ETIMEDOUT" });
    assert.strictEqual((await findParcel(street("9321 Rosa Parks Blvd"), city, { ...AT_CONGREGATION, fetchFn: async () => ({ ok: false, status: 503 }) })).status, "error");
    assert.strictEqual((await findParcel(street("9321 Rosa Parks Blvd"), city, { ...AT_CONGREGATION, fetchFn: ok({ error: { code: 499, message: "Token Required" } }) })).status, "error", "ArcGIS reports failures with HTTP 200");
    assert.strictEqual((await findParcel(street("9321 Rosa Parks Blvd"), city, { ...AT_CONGREGATION, fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }) })).status, "error");
    // An address that cannot be asked about is never sent.
    let called = false;
    assert.deepStrictEqual(await findParcel({ number: "100", name: "o'brien" }, city, { fetchFn: async () => { called = true; } }), { status: "not_settled", reason: "address_not_askable" });
    assert.strictEqual(called, false);
  }
  console.log("PASS: the request — an outage or a service error concludes nothing; an unaskable address is never sent");

  // --- 5. the rule does not depend on Detroit's own data -------------------------
  {
    const g = buildGeography(small.neighborhoods, small.boundary);
    const at = { point: small.POINTS.midtownOnTheLine, maxMetersFromPolygon: 50 };
    const asked = { number: "400", name: "line", dir: null, suffix: "st" };
    const answer = (coordinates, neighborhood) => ({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates }, properties: { parcel_id: "p1", address: "400 LINE ST", street_number: 400, street_prefix: "", street_name: "LINE", neighborhood } }] });
    // A lot just north of the line, by the venue's point.
    const lot = small.rect(-83.0553, 42.3451, -83.0548, 42.3454);
    assert.deepStrictEqual(readParcelAnswer(answer(lot, "MIDTOWN"), g, asked, at), { status: "settled", polygon: "Midtown", parcelIds: ["p1"] }, "names are compared without regard to case");
    // The same lot drawn across the Downtown/Midtown line.
    assert.deepStrictEqual(readParcelAnswer(answer(small.rect(-83.0553, 42.3448, -83.0548, 42.3454), "Midtown"), g, asked, at), { status: "not_settled", reason: "parcel_crosses_boundary", detail: "Downtown / Midtown" });
    // A lot whose CORNERS are all in one neighborhood but whose side cuts
    // through another: the sides are checked, not only the corners.
    {
      const u = (x, y) => [-83.06 + x * 0.001, 42.34 + y * 0.001];
      const ring = (...xy) => [xy.map(([x, y]) => u(x, y))];
      const hood = (name, coordinates) => ({ type: "Feature", properties: { nhood_name: name }, geometry: { type: "Polygon", coordinates } });
      const town = buildGeography(
        { type: "FeatureCollection", features: [hood("Arm", ring([0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3], [0, 0])), hood("Notch", ring([1, 1], [3, 1], [3, 3], [1, 3], [1, 1]))] },
        { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: ring([-1, -1], [4, -1], [4, 4], [-1, 4], [-1, -1]) } }] }
      );
      const triangle = ring([0.5, 2.5], [2.5, 0.5], [0.5, 0.5], [0.5, 2.5]);
      assert.deepStrictEqual(triangle[0].slice(0, 3).map(([x, y]) => town.neighborhoodAt(y, x).name), ["Arm", "Arm", "Arm"], "every corner is in Arm");
      const [px, py] = u(0.5, 0.6);
      assert.deepStrictEqual(readParcelAnswer(answer(triangle, "Arm"), town, asked, { point: { lat: py, lng: px }, maxMetersFromPolygon: 50 }), { status: "not_settled", reason: "parcel_crosses_boundary", detail: "Arm / Notch" });
      const small1 = ring([0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]);
      assert.strictEqual(readParcelAnswer(answer(small1, "Arm"), town, asked, { point: { lat: py, lng: px }, maxMetersFromPolygon: 50 }).status, "settled");
    }
    // The only parcel "400 LINE" is in Boston Edison, kilometres from the venue's point in Midtown.
    const elsewhere = small.rect(-83.095, 42.378, -83.094, 42.379);
    assert.strictEqual(readParcelAnswer(answer(elsewhere, "Boston Edison"), g, asked, at).reason, "parcel_not_at_the_point");
    // Across the line from the point, 5 m away: Downtown meets the boundary the point lies on. Settled as Downtown.
    const across = small.rect(-83.0553, 42.3446, -83.0548, 42.34495);
    assert.deepStrictEqual(readParcelAnswer(answer(across, "Downtown"), g, asked, at), { status: "settled", polygon: "Downtown", parcelIds: ["p1"] }, "the parcel, not the 5 metres, says which side of the street");
  }
  console.log("PASS: a parcel by the venue's point and wholly inside one polygon settles it — on either side of the line; a distant or straddling one does not");

  console.log("\nAll detroit-parcels tests passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
