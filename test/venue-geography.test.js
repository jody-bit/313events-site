// test/venue-geography.test.js — venue address -> coordinates -> City
// neighborhood polygon -> the venue's neighborhood (scripts/venue-geography.js,
// api/_lib/census-geocoder.js).
//
// The addresses, geocoder answers and venue names below are production's, as
// read on 2026-10-05. The geography in the end-to-end part is a small made-up
// city (test/fixtures/geography-small-city.js); the real City snapshot has
// its own test (test/detroit-geography.test.js).
//
// Run: node test/venue-geography.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const pass = require(`${REPO_DIR}/scripts/venue-geography.js`);
const { readGeocodeResponse, geocodeUrl, geocodeAddress } = require(`${REPO_DIR}/api/_lib/census-geocoder.js`);
const { buildGeography, loadGeography } = require(`${REPO_DIR}/api/_lib/detroit-geography.js`);
const parcels = require(`${REPO_DIR}/api/_lib/detroit-parcels.js`);
const { normalizeVenueName, resolveVenueId } = require(`${REPO_DIR}/api/_lib/venue-lookup.js`);
const { makeMockPostgrest } = require(`${REPO_DIR}/test/fixtures/mock-postgrest.js`);
const small = require(`${REPO_DIR}/test/fixtures/geography-small-city.js`);

const BASE = "https://example.supabase.co";
const P = small.POINTS;
const geography = buildGeography(small.neighborhoods, small.boundary);

// A geocoder answer, shaped as the Census Bureau returns it.
const match = (y, x, matchedAddress, state = "MI", zip = "48201") => ({ coordinates: { x, y }, matchedAddress, addressComponents: { state, zip } });
const censusBody = (...matches) => ({ result: { addressMatches: matches } });

async function run() {
  // --- 1. reading a street address ------------------------------------------
  {
    const s = pass.parseStreet;
    assert.deepStrictEqual({ ...s("660 W. Baltimore Street #2") }, { number: "660", dir: "w", name: "baltimore", key: "baltimore", suffix: "st", postDir: null, text: "660 W. Baltimore Street" });
    // The street is the first part that starts with a house number.
    assert.strictEqual(s("Fox Theatre, 2211 Woodward Ave, Detroit, MI 48201, United States").text, "2211 Woodward Ave");
    assert.strictEqual(s("15 South Saginaw Street; Pontiac, MI 48342; United States").text, "15 South Saginaw Street");
    assert.strictEqual(s("2548 Grand River Avenue").key, "grandriver");
    assert.strictEqual(s("377 Riverside Dr E").postDir, "e");
    assert.strictEqual(s("12138 St Aubin").key, s("12138 SAINT AUBIN ST").key, "Saint = St");
    assert.strictEqual(s("378 Meadow Brook Rd").key, s("378 MEADOWBROOK RD").key);
    assert.strictEqual(s("14500 E 12 Mile Rd").name, "12 mile");
    // Not one house number on one street: no answer.
    assert.strictEqual(s("4120-4140 Woodward Avenue"), null, "a range of numbers");
    assert.strictEqual(s("Shed 5"), null);
    assert.strictEqual(s("11 Mile Road"), null, "a road called 11 Mile, not number 11");
    assert.strictEqual(s("Center Campus, C Building"), null);
    assert.strictEqual(s(""), null);
    assert.strictEqual(s(null), null);

    const same = (a, b) => pass.sameStreet(s(a), s(b));
    assert.strictEqual(same("2934 Russell", "2934 Russell Street"), true, "one leaves out the type");
    assert.strictEqual(same("200 E Grand River Ave", "200 Grand River Ave"), true, "one leaves out the direction");
    assert.strictEqual(same("8045 Linwood St", "8045 Linwood St #2"), true);
    assert.strictEqual(same("4120 Woodward Ave", "4140 Woodward Ave"), false);
    assert.strictEqual(same("660 W Baltimore Ave", "660 W Baltimore St"), false, "two different types stated");
    assert.strictEqual(same("15 S Saginaw St", "15 N Saginaw St"), false);
    // A direction contradicts wherever it is written.
    assert.strictEqual(same("18100 Outer Dr E", "18100 W Outer Dr"), false);
    assert.strictEqual(same("100 Jefferson Ave E", "100 E Jefferson Ave"), true);
    // "Ste." before a name is Sainte, not Suite; a unit is something at the END.
    assert.strictEqual(s("1000 Ste. Anne St").text, "1000 Ste. Anne St");
    assert.strictEqual(same("1000 Ste. Anne St", "1000 Ste. Claire St"), false);
    assert.strictEqual(s("100 Main St, Ste. B").text, "100 Main St");
    assert.strictEqual(s("100 Main St Suite 200").text, "100 Main St");
    // A time of day is not a house number.
    assert.strictEqual(s("2 pm, 100 Main St").text, "100 Main St");
    assert.strictEqual(s("7 PM"), null);
  }
  console.log("PASS: street addresses — number, direction, name, type; ranges and non-addresses give no answer");

  // --- 2. which address to ask about -----------------------------------------
  {
    const choose = pass.chooseAddress;
    // The venue's own address, with its ZIP when on file.
    assert.deepStrictEqual(
      (({ status, from, asked }) => ({ status, from, asked }))(choose({ address: "7096 E 14 Mile Rd", city: "Warren", zip_code: "48092" }, [])),
      { status: "ok", from: "venue", asked: "7096 E 14 Mile Rd, Warren, MI 48092" }
    );
    // No address on the venue: the one its events all state.
    const eastern = choose({ address: null, city: "Detroit" }, [{ address: "2934 Russell", city: "Detroit" }, { address: "2934 Russell Street", city: "Detroit" }, { address: "Shed 5", city: "Detroit" }]);
    assert.deepStrictEqual({ status: eastern.status, from: eastern.from, asked: eastern.asked }, { status: "ok", from: "events", asked: "2934 Russell Street, Detroit, MI" }, "the fullest statement; 'Shed 5' is not an address");
    // ...and not when they state two.
    const market = choose({ address: null, city: "Detroit" }, [{ address: "2934 Russell", city: "Detroit" }, { address: "Shed 5, 2810 Russell St.", city: "Detroit" }]);
    assert.strictEqual(market.status, "addresses_disagree");
    assert.strictEqual(choose({ address: null, city: "Detroit" }, [{ address: "4120-4140 Woodward Avenue", city: "Detroit" }]).status, "unusable_address");
    assert.strictEqual(choose({ address: null, city: "Detroit" }, []).status, "no_address");
    assert.strictEqual(choose({ address: null, city: "Detroit" }, undefined).status, "no_address");
    // The venue's own address is used even when its events say something else.
    assert.strictEqual(choose({ address: "2961 E McNichols Rd", city: "Detroit" }, [{ address: "1 Elsewhere St", city: "Hamtramck" }]).asked, "2961 E McNichols Rd, Detroit, MI");
    // An address taken from events comes with the city THEY give for it:
    // "Vault313 (Highland Park)" is stored with city Detroit.
    assert.strictEqual(choose({ address: null, city: "Detroit" }, [{ address: "16940 Hamilton Ave", city: "Highland Park" }]).asked, "16940 Hamilton Ave, Highland Park, MI");
    assert.strictEqual(choose({ address: null, city: "Detroit" }, [{ address: "1464 Gratiot Ave", city: "Detroit" }, { address: "1464 Gratiot Ave", city: "Detroit, MI 48207" }]).asked, "1464 Gratiot Ave, Detroit, MI");
    assert.strictEqual(choose({ address: null, city: "Detroit" }, [{ address: "5 Main St", city: "Detroit" }, { address: "5 Main St", city: "Warren" }]).status, "cities_disagree");
    assert.strictEqual(choose({ address: null, city: "Detroit" }, [{ address: "350 Madison Street", city: null }]).asked, "350 Madison Street, Detroit, MI", "no city stated: the venue's");
    // Ohio is covered; Ontario is not (the Census Bureau geocodes the United States).
    assert.strictEqual(choose({ address: "1001 E Wooster St", city: "Bowling Green" }, []).state, "OH");
    assert.deepStrictEqual(choose({ address: "377 Riverside Dr E", city: "Windsor" }, []), { status: "outside_coverage", detail: "Windsor" });
    assert.strictEqual(choose({ address: "1 Main St", city: "" }, []).status, "no_city");
    // A ZIP that is not five digits is not sent.
    assert.strictEqual(choose({ address: "1 Main St", city: "Detroit", zip_code: "4820" }, []).asked, "1 Main St, Detroit, MI");
  }
  console.log("PASS: the venue's own address first; otherwise the one street its events agree on, with their city; Windsor is outside coverage");

  // --- 3. reading the geocoder's answer ---------------------------------------
  {
    assert.strictEqual(geocodeUrl({ street: "2211 Woodward Ave", city: "Detroit", state: "MI" }), "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=2211+Woodward+Ave%2C+Detroit%2C+MI&benchmark=Public_AR_Current&format=json");
    const one = readGeocodeResponse(censusBody(match(42.338395704875, -83.051922693254, "2211 WOODWARD AVE, DETROIT, MI, 48201")), "MI");
    assert.deepStrictEqual(one, { status: "match", lat: 42.338395704875, lng: -83.051922693254, matchedAddress: "2211 WOODWARD AVE, DETROIT, MI, 48201", matchedAddresses: ["2211 WOODWARD AVE, DETROIT, MI, 48201"], zip: "48201" });
    // Two names for one spot is one answer.
    const twoNames = readGeocodeResponse(censusBody(match(42.536581, -83.029531, "7096 E FOURTEEN MILE RD, WARREN, MI, 48092"), match(42.536581, -83.029531, "7096 E 14 MILE RD, WARREN, MI, 48092")), "MI");
    assert.strictEqual(twoNames.status, "match");
    assert.strictEqual(twoNames.matchedAddresses.length, 2);
    // Two places is none. ("608 S Washington Ave, Detroit" -- a Royal Oak address stored as Detroit.)
    const twoPlaces = readGeocodeResponse(censusBody(match(42.328886, -83.049217, "608 WASHINGTON BLVD, DETROIT, MI, 48226"), match(42.394806, -82.909741, "608 WASHINGTON RD, DETROIT, MI, 48230")), "MI");
    assert.strictEqual(twoPlaces.status, "ambiguous");
    assert.strictEqual(readGeocodeResponse(censusBody(), "MI").status, "no_match");
    assert.strictEqual(readGeocodeResponse(censusBody(match(41.6, -83.5, "1 MAIN ST, TOLEDO, OH, 43604", "OH")), "MI").status, "wrong_state");
    assert.strictEqual(readGeocodeResponse(censusBody(match(42.3, -83.0, "1 MAIN ST, DETROIT, MI, 48201"), match(42.3, -83.0, "1 MAIN ST, TOLEDO, OH, 43604", "OH")), "MI").status, "wrong_state", "every match, not only the first");
    assert.strictEqual(readGeocodeResponse(censusBody({ coordinates: { x: -83.05, y: 42.33 }, matchedAddress: "1 MAIN ST, DETROIT", addressComponents: {} }), "MI").status, "unreadable", "a match that does not say its state");
    assert.strictEqual(readGeocodeResponse({ errors: ["Address cannot be empty"] }, "MI").status, "unreadable");
    assert.strictEqual(readGeocodeResponse(null, "MI").status, "unreadable");
    // A match whose coordinates cannot be read is not "no such address" (and not the point 0,0): it is no answer at all.
    assert.strictEqual(readGeocodeResponse(censusBody({ coordinates: {}, matchedAddress: "x" }), "MI").status, "unreadable");
    assert.strictEqual(readGeocodeResponse(censusBody({ coordinates: { x: null, y: null }, matchedAddress: "x", addressComponents: { state: "MI" } }), "MI").status, "unreadable");
    assert.strictEqual(readGeocodeResponse(censusBody(match(0, 0, "1 MAIN ST, DETROIT, MI, 48201")), "MI").status, "unreadable");
    assert.strictEqual(readGeocodeResponse(censusBody(match(-83.05, 42.33, "1 MAIN ST, DETROIT, MI, 48201")), "MI").status, "unreadable", "latitude and longitude swapped");

    // The request never throws; a failure is an answer of its own kind.
    const down = await geocodeAddress({ street: "1 Main St", city: "Detroit", state: "MI" }, { fetchFn: async () => { throw new Error("connect ETIMEDOUT"); } });
    assert.deepStrictEqual(down, { status: "error", detail: "connect ETIMEDOUT" });
    assert.strictEqual((await geocodeAddress({ street: "1 Main St", city: "Detroit", state: "MI" }, { fetchFn: async () => ({ ok: false, status: 503 }) })).detail, "HTTP 503");
    assert.strictEqual((await geocodeAddress({ street: "1 Main St", city: "Detroit" }, { fetchFn: async () => { throw new Error("must not be called"); } })).status, "error", "no state: not asked");
    // An answer that cannot be read -- even one delivered with HTTP 200 -- is an
    // outage, not "no such address": the caller records nothing and asks again.
    for (const body of [{ errors: ["Internal error"], status: "500" }, {}, null, { result: {} }]) {
      assert.deepStrictEqual(await geocodeAddress({ street: "1 Main St", city: "Detroit", state: "MI" }, { fetchFn: async () => ({ ok: true, status: 200, json: async () => body }) }), { status: "error", detail: "unreadable answer" });
    }

    // Is the match the address that was asked about?
    const isIt = (asked, matched, zips) => pass.matchIsTheAddressAsked(pass.parseStreet(asked), matched, zips);
    assert.strictEqual(isIt("2211 Woodward Ave", ["2211 WOODWARD AVE, DETROIT, MI, 48201"]), "yes");
    assert.strictEqual(isIt("7096 E 14 Mile Rd", ["7096 E FOURTEEN MILE RD, WARREN, MI, 48092", "7096 E 14 MILE RD, WARREN, MI, 48092"]), "yes", "any of the names the geocoder gave the spot");
    assert.strictEqual(isIt("12138 St Aubin", ["12138 ST AUBIN ST, HAMTRAMCK, MI, 48212"]), "yes", "the address states no type: nothing to contradict");
    // Another NAME, number or direction is another street.
    assert.strictEqual(isIt("49345 S Interstate 94 Service Dr", ["49345 S I- 94 SVC RD, BELLEVILLE, MI, 48111"]), "different_street");
    assert.strictEqual(isIt("100 Strand on Belle Isle", ["100 THE STRAND, DETROIT, MI, 48207"]), "different_street");
    assert.strictEqual(isIt("2211 Woodward Ave", ["2213 WOODWARD AVE, DETROIT, MI, 48201"]), "different_street");
    assert.strictEqual(isIt("15 S Saginaw St", ["15 N SAGINAW ST, PONTIAC, MI, 48342"]), "different_street");
    assert.strictEqual(isIt("18100 Outer Dr E", ["18100 W OUTER DR, DETROIT, MI, 48235"]), "different_street", "East asked, West answered");
    // Another street TYPE: the same street only if the venue's own ZIP says so.
    assert.strictEqual(isIt("2357 Caniff Ave", ["2357 CANIFF ST, HAMTRAMCK, MI, 48212"], { onFile: "48212", matched: "48212" }), "yes");
    assert.strictEqual(isIt("7032 E Ferry St", ["7032 E FERRY AVE, DETROIT, MI, 48211"], { onFile: "48211", matched: "48211" }), "yes");
    assert.strictEqual(isIt("11474 Joseph Campau Ave", ["11474 JOSEPH CAMPAU ST, DETROIT, MI, 48212"]), "different_street_type", "no ZIP on file");
    assert.strictEqual(isIt("1 Park St", ["1 PARK AVE, DETROIT, MI, 48226"], { onFile: "48201", matched: "48226" }), "different_street_type", "another ZIP");
    assert.strictEqual(isIt("1 Park St", ["1 PARK AVE, DETROIT, MI, 48226"], { onFile: "", matched: "" }), "different_street_type", "two blanks are not a match");
  }
  console.log("PASS: the geocoder's answer — one spot is a match; two places, another state, another street or (without a ZIP) another street type is none; an unreadable answer is an outage");

  // --- 4. the line written to the venue ----------------------------------------
  {
    const line = pass.geographyLine({ polygon: "Corktown", label: "Corktown", point: "42.33133,-83.07275", address: "1949 Michigan Ave, Detroit, MI" }, "2026-10-05");
    assert.strictEqual(line, "GEOGRAPHY | v1 | polygon=Corktown | label=Corktown | point=42.33133,-83.07275 | address=1949 Michigan Ave, Detroit, MI | at=2026-10-05");
    assert.deepStrictEqual(pass.readGeographyLine(line), { polygon: "Corktown", label: "Corktown", point: "42.33133,-83.07275", address: "1949 Michigan Ave, Detroit, MI", at: "2026-10-05" });
    assert.strictEqual(pass.readGeographyLine("Researched by hand: metrotimes.com + the venue's own site."), null);
    assert.strictEqual(pass.readGeographyLine(null), null);
    // A person's notes are kept, word for word; only the pass's own line is replaced.
    const notes = "marygroveconservancy.org (own contact page) + this project's Fitzgerald area_note.";
    const first = pass.withGeographyLine(notes, pass.geographyLine({ none: "no_match", address: "8425 W. McNichols Rd, Detroit, MI 48221" }, "2026-10-05"));
    assert.strictEqual(first, `${notes}\nGEOGRAPHY | v1 | none=no_match | address=8425 W. McNichols Rd, Detroit, MI 48221 | at=2026-10-05`);
    const second = pass.withGeographyLine(first, pass.geographyLine({ none: "no_match", address: "8425 W McNichols Rd, Detroit, MI 48221" }, "2026-10-12"));
    assert.strictEqual(second, `${notes}\nGEOGRAPHY | v1 | none=no_match | address=8425 W McNichols Rd, Detroit, MI 48221 | at=2026-10-12`);
    assert.strictEqual(pass.withGeographyLine(null, "GEOGRAPHY | v1 | none=x | at=2026-10-05"), "GEOGRAPHY | v1 | none=x | at=2026-10-05");
    // BYTE FOR BYTE. Trailing blank lines, odd spacing, a person's line that
    // merely starts like one of the pass's: all of it stays.
    const untidy = "  Research, 2026-09-12:  \n\nGEOGRAPHY | v1 | I wrote this myself, it is a note\n\n";
    const lineA = pass.geographyLine({ none: "no_match", address: "1 Main St, Detroit, MI" }, "2026-10-05");
    assert.strictEqual(pass.withGeographyLine(untidy, lineA), `${untidy}\n${lineA}`);
    assert.strictEqual(pass.withGeographyLine(`${untidy}\n${lineA}`, lineA.replace("10-05", "10-06")), `${untidy}\n${lineA.replace("10-05", "10-06")}`);
    // The pass's line in the middle of someone's notes: replaced where it is.
    assert.strictEqual(pass.withGeographyLine(`before\n${lineA}\nafter`, "GEOGRAPHY | v1 | none=x | at=2026-10-07"), "before\nGEOGRAPHY | v1 | none=x | at=2026-10-07\nafter");
    // What counts as a person's text.
    assert.strictEqual(pass.hasPersonsText(lineA), false);
    assert.strictEqual(pass.hasPersonsText(null), false);
    assert.strictEqual(pass.hasPersonsText(`${lineA}\n\n  `), false, "blank lines are nobody's");
    assert.strictEqual(pass.hasPersonsText(`${lineA} -- checked with the owner, J.`), true, "words added to the pass's own line make it a person's line");
    assert.strictEqual(pass.hasPersonsText(`Jody: confirmed.\n${lineA}`), true);
    assert.strictEqual(pass.readGeographyLine(`${lineA} -- checked`), null);
    // Words set between the tag and a date are not one of the pass's lines either:
    // its own lines are made of the fields it writes and nothing else.
    assert.strictEqual(pass.hasPersonsText("GEOGRAPHY | v1 | ok per Jody | at=2026-10-09"), true);
    assert.strictEqual(pass.hasPersonsText("xGEOGRAPHY | v1 | none=no_match | at=2026-10-09"), true);
    assert.strictEqual(pass.hasPersonsText("GEOGRAPHY | v1 | none=no_match | reviewed=yes | at=2026-10-09"), true);
    // A "|" inside a value cannot break the line apart.
    assert.ok(!/Bar \| Grill/.test(pass.geographyLine({ address: "Bar | Grill, 1 Main St" }, "2026-10-05")));
  }
  console.log("PASS: the geography line round-trips; a person's source notes are kept word for word beside it");

  // --- 5. the decision, venue by venue -----------------------------------------
  const labels = [
    { id: "n-downtown", name: "Downtown" }, { id: "n-midtown", name: "Midtown" }, { id: "n-boston", name: "Boston-Edison" },
    { id: "n-mex", name: "Mexicantown / Southwest Detroit" }, { id: "n-rivertown", name: "Rivertown-Warehouse District" },
    { id: "n-district", name: "The District Detroit" }, { id: "n-cass", name: "Cass Corridor" },
  ];
  const venue = (point, extra) => ({ id: "v", name: "A Venue", city: "Detroit", lat: point.lat, lng: point.lng, neighborhood_id: null, neighborhood_confidence: "unconfirmed", neighborhood_source: null, ...extra });
  const decide = (v) => pass.decide(v, geography, labels);
  {
    // Nobody has decided: the City's polygon decides.
    assert.deepStrictEqual((({ action, label, polygon, create }) => ({ action, label, polygon, create }))(decide(venue(P.downtown))), { action: "assign", label: "Downtown", polygon: "Downtown", create: false });
    assert.strictEqual(decide(venue(P.bostonEdison)).label, "Boston-Edison", "the City's 'Boston Edison' is the label 'Boston-Edison'");
    // An approved geographic alias: the City's "Rivertown" IS the label
    // "Rivertown-Warehouse District", which keeps its name.
    assert.deepStrictEqual((({ action, label, polygon, create }) => ({ action, label, polygon, create }))(decide(venue(P.rivertown))), { action: "assign", label: "Rivertown-Warehouse District", polygon: "Rivertown", create: false });
    // A polygon no label names: recorded, not labelled -- unless labels from City names are asked for.
    assert.deepStrictEqual(decide(venue(P.elijahMcCoy)), { action: "none", reason: "no_label_for_polygon", polygon: "Elijah McCoy", byParcel: false });
    assert.deepStrictEqual((({ action, label, create }) => ({ action, label, create }))(pass.decide(venue(P.elijahMcCoy), geography, labels, { createLabels: true })), { action: "assign", label: "Elijah McCoy", create: true });

    // No Detroit neighborhood outside Detroit -- whatever the stored city says.
    assert.deepStrictEqual(decide(venue(P.outside, { city: "Ferndale" })), { action: "none", reason: "outside_detroit" });
    assert.deepStrictEqual(decide(venue(P.inTheHole, { city: "Hamtramck" })), { action: "none", reason: "outside_detroit" });
    assert.deepStrictEqual(decide(venue(P.inTheHole)), { action: "none", reason: "outside_detroit_but_city_says_detroit" }, "'The High Dive', stored as Detroit, stands in Hamtramck");
    // Inside the limits but stored as another city: the two disagree; a person's to settle.
    assert.strictEqual(decide(venue(P.downtown, { city: "Hamtramck" })).reason, "inside_detroit_but_city_says_otherwise");
    // No polygon, two polygons.
    assert.strictEqual(decide(venue(P.noPolygon)).reason, "no_polygon");
    assert.deepStrictEqual(decide(venue(P.overlap)), { action: "none", reason: "two_polygons", detail: "Overlap A / Overlap B" });
    // On the line: 5.6 m inside Midtown is not evidence of Midtown.
    const near = decide(venue(P.midtownOnTheLine));
    assert.deepStrictEqual({ action: near.action, reason: near.reason, polygon: near.polygon }, { action: "none", reason: "near_boundary", polygon: "Midtown" });
    assert.ok(near.edgeMeters < pass.MIN_EDGE_METERS);
    // A polygon held for a label the Product Owner has reserved: never assigned
    // ("do not collapse it to that polygon"), never a rival label created --
    // not even when labels from City names are asked for.
    assert.deepStrictEqual(decide(venue(P.mexicantown)), { action: "none", reason: "held_for_reconciliation", polygon: "Mexicantown", pending: "Mexicantown / Southwest Detroit", byParcel: false });
    assert.strictEqual(pass.decide(venue(P.mexicantown), geography, labels, { createLabels: true }).reason, "held_for_reconciliation");
    // On the line, but the City's parcel record settles it: the parcel's polygon decides.
    const settled = pass.decide(venue(P.midtownOnTheLine), geography, labels, { parcelPolygon: "Midtown" });
    assert.deepStrictEqual({ action: settled.action, label: settled.label, byParcel: settled.byParcel }, { action: "assign", label: "Midtown", byParcel: true });
    // ...and the parcel's polygon obeys the same label rules as any other.
    assert.strictEqual(pass.decide(venue(P.midtownOnTheLine), geography, labels, { parcelPolygon: "Mexicantown" }).reason, "held_for_reconciliation");
    assert.strictEqual(pass.decide(venue(P.midtownOnTheLine), geography, labels, { parcelPolygon: "Elijah McCoy" }).reason, "no_label_for_polygon");
    // A parcel never moves a venue that is outside Detroit, or a person's.
    assert.strictEqual(pass.decide(venue(P.inTheHole), geography, labels, { parcelPolygon: "Midtown" }).reason, "outside_detroit_but_city_says_detroit");
    assert.strictEqual(pass.decide(venue(P.midtownOnTheLine, { neighborhood_id: "n-cass", neighborhood_confidence: "editorial_judgment" }), geography, labels, { parcelPolygon: "Midtown" }).action, "protected");

    // A PERSON'S ASSIGNMENT IS NEVER CHANGED.
    for (const confidence of ["multi_source", "single_source", "editorial_judgment"]) {
      const d = decide(venue(P.downtown, { neighborhood_id: "n-district", neighborhood_confidence: confidence, neighborhood_source: "research" }));
      assert.deepStrictEqual({ action: d.action, current: d.current, agrees: d.agrees, cityPolygon: d.cityPolygon }, { action: "protected", current: "The District Detroit", agrees: false, cityPolygon: "Downtown" }, confidence);
    }
    assert.strictEqual(decide(venue(P.downtown, { neighborhood_id: "n-downtown", neighborhood_confidence: "multi_source" })).agrees, true);
    assert.strictEqual(decide(venue(P.outside, { neighborhood_id: "n-downtown", neighborhood_confidence: "editorial_judgment" })).action, "protected", "even when the point is outside Detroit");
    // The confidence alone says it: a person's, even with no notes at all.
    for (const confidence of ["multi_source", "single_source", "editorial_judgment"]) {
      assert.strictEqual(decide(venue(P.midtown, { neighborhood_id: "n-downtown", neighborhood_confidence: confidence, neighborhood_source: null })).action, "protected", confidence);
      assert.strictEqual(decide(venue(P.midtown, { neighborhood_id: null, neighborhood_confidence: confidence, neighborhood_source: null })).action, "protected", `${confidence}, no neighborhood yet`);
    }
    // 'geographic' with no line of the pass's at all: somebody else's 'geographic'.
    assert.strictEqual(decide(venue(P.midtown, { neighborhood_id: "n-downtown", neighborhood_confidence: "geographic", neighborhood_source: null })).action, "protected");
    // How close to the line is too close: 50 metres, on both sides of it.
    const off = (metres) => ({ lat: 42.345 + metres / 111320, lng: -83.055 });
    assert.strictEqual(decide(venue(off(30))).reason, "near_boundary");
    assert.strictEqual(decide(venue(off(45))).reason, "near_boundary");
    assert.strictEqual(decide(venue(off(60))).action, "assign");
    assert.strictEqual(decide(venue(off(-30))).reason, "near_boundary", "30 m into Downtown");
    assert.strictEqual(pass.MIN_EDGE_METERS, 50);
    // Research on file with no neighborhood chosen (the two Marygrove venues): a person's.
    assert.strictEqual(decide(venue(P.downtown, { neighborhood_confidence: "multi_source", neighborhood_source: "marygroveconservancy.org ..." })).action, "protected");
    assert.strictEqual(decide(venue(P.downtown, { neighborhood_source: "someone's notes" })).action, "protected", "notes without a neighborhood are still a person's");
    assert.strictEqual(decide(venue(P.downtown, { neighborhood_id: "n-cass" })).action, "protected", "a neighborhood with no stated confidence");
    // 'geographic' that this pass did not write is not this pass's to touch.
    assert.strictEqual(decide(venue(P.downtown, { neighborhood_id: "n-midtown", neighborhood_confidence: "geographic", neighborhood_source: "set by hand from a map" })).action, "protected");

    // ITS OWN EARLIER ANSWER: kept while true, corrected when the map says
    // otherwise, left alone once someone has changed it.
    const own = (label) => pass.geographyLine({ polygon: label, label, point: "42.33500,-83.04500" }, "2026-10-05");
    assert.strictEqual(decide(venue(P.downtown, { neighborhood_id: "n-downtown", neighborhood_confidence: "geographic", neighborhood_source: own("Downtown") })).action, "keep");
    const moved = decide(venue(P.midtown, { neighborhood_id: "n-downtown", neighborhood_confidence: "geographic", neighborhood_source: own("Downtown") }));
    assert.deepStrictEqual({ action: moved.action, label: moved.label }, { action: "assign", label: "Midtown" }, "the venue's coordinates now fall in another polygon");
    const changed = decide(venue(P.downtown, { neighborhood_id: "n-cass", neighborhood_confidence: "geographic", neighborhood_source: own("Downtown") }));
    assert.deepStrictEqual({ action: changed.action, owner: changed.owner, current: changed.current }, { action: "protected", owner: "changed", current: "Cass Corridor" }, "someone changed the neighborhood after the pass set it");
    // Someone REMOVED the pass's assignment: it is not put back.
    const removed = decide(venue(P.downtown, { neighborhood_id: null, neighborhood_confidence: "unconfirmed", neighborhood_source: own("Downtown") }));
    assert.deepStrictEqual({ action: removed.action, owner: removed.owner }, { action: "protected", owner: "changed" });
    // A person wrote ANYTHING beside the pass's line: the venue is theirs,
    // even though the confidence still says 'geographic' and the label still matches.
    for (const notes of [`Jody 2026-10-06: confirmed with the owner. Do not change.\n${own("Downtown")}`, `${own("Downtown")}\nconfirmed`, `${own("Downtown")} -- confirmed`]) {
      const theirs = decide(venue(P.midtown, { neighborhood_id: "n-downtown", neighborhood_confidence: "geographic", neighborhood_source: notes }));
      assert.deepStrictEqual({ action: theirs.action, owner: theirs.owner, current: theirs.current }, { action: "protected", owner: "person", current: "Downtown" }, notes);
    }
  }
  console.log("PASS: decisions — assigned from the polygon; never outside Detroit, on the line, or into an unreconciled label; a person's assignment is never changed");

  // --- 6. the whole pass, against the database ----------------------------------
  // Each venue's address is its key into this table of geocoder answers.
  const ANSWERS = {
    "100 Downtown St, Detroit, MI": { ...P.downtown, matched: "100 DOWNTOWN ST, DETROIT, MI, 48226" },
    "200 Midtown Ave, Detroit, MI": { ...P.midtown, matched: "200 MIDTOWN AVE, DETROIT, MI, 48201" },
    "300 McCoy St, Detroit, MI": { ...P.elijahMcCoy, matched: "300 MCCOY ST, DETROIT, MI, 48202" },
    "310 McCoy St, Detroit, MI": { ...P.elijahMcCoy2, matched: "310 MCCOY ST, DETROIT, MI, 48202" },
    "400 Line St, Detroit, MI": { ...P.midtownOnTheLine, matched: "400 LINE ST, DETROIT, MI, 48201" },
    "410 W Line St, Detroit, MI": { ...P.midtownOnTheLine2, matched: "410 W LINE ST, DETROIT, MI, 48201" },
    "500 River St, Detroit, MI": { ...P.rivertown, matched: "500 RIVER ST, DETROIT, MI, 48207" },
    "520 Vernor Hwy, Detroit, MI": { ...P.mexicantown, matched: "520 VERNOR HWY, DETROIT, MI, 48216" },
    "600 Campau St, Detroit, MI": { ...P.inTheHole, matched: "600 CAMPAU ST, DETROIT, MI, 48212" },
    "700 Nine Mile Rd, Ferndale, MI 48220": { ...P.outside, matched: "700 NINE MILE RD, FERNDALE, MI, 48220" },
    "800 Woodward Ave, Detroit, MI": { ...P.downtown, matched: "800 WOODWARD AVE, DETROIT, MI, 48226" },
    "900 Service Dr, Detroit, MI": { ...P.downtown, matched: "900 SVC RD, DETROIT, MI, 48226" },
    "350 Madison Street, Detroit, MI": { ...P.downtown, matched: "350 MADISON ST, DETROIT, MI, 48226" },
  };
  const makeGeocoder = (table) => {
    const asked = [];
    const fn = async (address) => {
      const line = [address.street, address.city, [address.state, address.zip].filter(Boolean).join(" ")].join(", ");
      asked.push(line);
      const answer = table[line];
      if (!answer) return readGeocodeResponse(censusBody(), address.state);
      return readGeocodeResponse(censusBody(match(answer.lat, answer.lng, answer.matched)), address.state);
    };
    return { fn, asked };
  };
  // The City's parcel file, as a table: "<number> <dir> <name>" -> an answer.
  const PARCELS = {
    "400 - line": { status: "settled", polygon: "Midtown", parcelIds: ["02001234."] },
    "410 w line": { status: "not_settled", reason: "no_parcel" },
  };
  const makeParcels = (table) => {
    const asked = [];
    const fn = async (street) => {
      const key = `${street.number} ${street.dir || "-"} ${street.name}`;
      asked.push(key);
      return table[key] || { status: "not_settled", reason: "no_parcel" };
    };
    return { fn, asked };
  };
  const HUMAN_NOTES = "metrotimes.com + the venue's own site; confirmed on a walk-through.";
  const v = (id, name, address, extra) => ({ id, name, address, city: "Detroit", zip_code: null, lat: null, lng: null, neighborhood_id: null, neighborhood_confidence: "unconfirmed", neighborhood_source: null, ...extra });
  const freshTables = () => ({
    venues: [
      v("v-downtown", "Aretha Franklin Cafe", "100 Downtown St"),
      v("v-midtown", "Garden Bowl", "200 Midtown Ave"),
      v("v-mccoy-1", "Lincoln Factory", "300 McCoy St"),
      v("v-mccoy-2", "Holden Hall", "310 McCoy St"),
      v("v-line", "The Congregation", "400 Line St"),
      v("v-line-2", "Menjo's", "410 W Line St"),
      v("v-river", "Big Pink", "500 River St"),
      v("v-mex", "El Club", "520 Vernor Hwy"),
      v("v-hole", "The High Dive", "600 Campau St"),
      v("v-suburb", "The Magic Bag", "700 Nine Mile Rd", { city: "Ferndale", zip_code: "48220" }),
      v("v-person", "Fox Theatre", "800 Woodward Ave", { neighborhood_id: "n-district", neighborhood_confidence: "editorial_judgment", neighborhood_source: HUMAN_NOTES }),
      v("v-other-street", "Diamondback", "900 Service Dr"),
      v("v-no-match", "Elmwood Cemetery", "1200 Elmwood Street", { neighborhood_id: "n-cass", neighborhood_confidence: "multi_source", neighborhood_source: HUMAN_NOTES }),
      v("v-from-events", "Aretha's Jazz Cafe", null, { neighborhood_id: "n-downtown", neighborhood_confidence: "editorial_judgment", neighborhood_source: HUMAN_NOTES }),
      v("v-no-address", "Hart Plaza", null),
      v("v-windsor", "The Colosseum at Caesars Windsor", "377 Riverside Dr E", { city: "Windsor" }),
      v("v-tba", "Venue TBA (Paxahau)", null),
      v("v-had-point", "Already Placed", "1 Old St", { lat: P.midtown.lat, lng: P.midtown.lng }),
    ],
    neighborhoods: labels.map((l) => ({ ...l, area_note: null, is_district: false })),
    events: [
      { id: "e1", venue_id: "v-from-events", status: "approved", venue_address_raw: "350 Madison Street", venue_city_raw: null },
      { id: "e2", venue_id: "v-from-events", status: "approved", venue_address_raw: "350 Madison Street", venue_city_raw: "Detroit" },
      { id: "e3", venue_id: "v-from-events", status: "rejected", venue_address_raw: "999 Retired Rd", venue_city_raw: "Detroit" },
      { id: "e4", venue_id: "v-tba", status: "approved", venue_address_raw: "4120 Woodward Ave", venue_city_raw: "Detroit" },
      { id: "e5", venue_id: "v-no-address", status: "approved", venue_address_raw: null, venue_city_raw: "Detroit" },
    ],
  });
  const options = (db, geocoder, parcelsStub, extra) => ({ SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: "service-role", fetchFn: db.fetch, geocodeFn: geocoder.fn, parcelFn: parcelsStub.fn, geography, today: "2026-10-05", logger: { error() {} }, ...extra });
  const byId = (tables, id) => tables.venues.find((row) => row.id === id);
  const writes = (db) => db.log.filter((r) => r.method !== "GET");
  const lineOf = (tables, id) => pass.readGeographyLine(byId(tables, id).neighborhood_source);

  // 6a. a dry run asks the geocoder and the parcel file, reports everything, writes nothing.
  {
    const tables = freshTables();
    const before = JSON.stringify(tables);
    const db = makeMockPostgrest(tables);
    const c = await pass.runVenueGeography(options(db, makeGeocoder(ANSWERS), makeParcels(PARCELS), { dryRun: true }));
    assert.strictEqual(writes(db).length, 0, "no write of any kind");
    assert.strictEqual(JSON.stringify(tables), before);
    assert.deepStrictEqual(
      { venues: c.venues, placeholders: c.placeholders, had: c.alreadyHadCoordinates, eligible: c.eligibleForGeocoding, geocoded: c.geocoded, assigned: c.assigned, labelsCreated: c.labelsCreated, protectedByPerson: c.protectedByPerson },
      { venues: 18, placeholders: 1, had: 1, eligible: 14, geocoded: 12, assigned: 5, labelsCreated: [], protectedByPerson: 2 }
    );
    assert.deepStrictEqual(c.notGeocoded, { no_address: 1, outside_coverage: 1, different_street: 1, no_match: 1 });
    assert.deepStrictEqual(c.noNeighborhood, { no_label_for_polygon: 2, near_boundary: 1, held_for_reconciliation: 1, outside_detroit_but_city_says_detroit: 1, outside_detroit: 1 });
    assert.deepStrictEqual(c.parcels, { asked: 2, settled: 1, notSettled: { no_parcel: 1 }, unavailable: 0 });
    assert.deepStrictEqual([c.insideDetroit, c.outsideDetroit], [11, 2], "twelve geocoded now, one that already had coordinates");
  }
  console.log("PASS: dry run — the whole plan is reported and nothing is written");

  // 6b. the real run.
  const tables = freshTables();
  const db = makeMockPostgrest(tables);
  {
    const geocoder = makeGeocoder(ANSWERS);
    const parcelFile = makeParcels(PARCELS);
    const c = await pass.runVenueGeography(options(db, geocoder, parcelFile));
    assert.strictEqual(c.failed, 0);
    assert.strictEqual(geocoder.asked.length, 14, "fourteen venues had an address to ask about");
    assert.ok(!geocoder.asked.some((a) => /Old St|Woodward Ave.*4120|Riverside/.test(a)), "not the venue that had coordinates, not a placeholder, not Windsor");
    assert.ok(geocoder.asked.includes("350 Madison Street, Detroit, MI"), "the address the venue's events agree on (the rejected event's is not counted)");

    // Assigned from the polygon, with where it came from.
    const downtown = byId(tables, "v-downtown");
    assert.deepStrictEqual({ lat: downtown.lat, lng: downtown.lng, n: downtown.neighborhood_id, c: downtown.neighborhood_confidence }, { lat: P.downtown.lat, lng: P.downtown.lng, n: "n-downtown", c: "geographic" });
    assert.strictEqual(downtown.neighborhood_source, "GEOGRAPHY | v1 | polygon=Downtown | label=Downtown | point=42.33500,-83.04500 | address=100 Downtown St, Detroit, MI | at=2026-10-05");
    assert.strictEqual(byId(tables, "v-midtown").neighborhood_id, "n-midtown");
    // The venue that already had coordinates is never asked about, and gets its neighborhood too.
    assert.strictEqual(byId(tables, "v-had-point").neighborhood_id, "n-midtown");
    // An approved alias: the City's polygon and the 313.events label are both on record.
    assert.strictEqual(byId(tables, "v-river").neighborhood_id, "n-rivertown");
    assert.deepStrictEqual((({ polygon, label }) => ({ polygon, label }))(lineOf(tables, "v-river")), { polygon: "Rivertown", label: "Rivertown-Warehouse District" });

    // ON A BOUNDARY. The parcel file is asked about exactly those two venues.
    assert.deepStrictEqual(parcelFile.asked.sort(), ["400 - line", "410 w line"]);
    // Settled by the parcel: assigned, and the line says by what.
    const settledRow = byId(tables, "v-line");
    assert.deepStrictEqual({ n: settledRow.neighborhood_id, c: settledRow.neighborhood_confidence }, { n: "n-midtown", c: "geographic" });
    assert.strictEqual(settledRow.neighborhood_source, "GEOGRAPHY | v1 | polygon=Midtown | label=Midtown | by=parcel | parcel=02001234. | parcel_for=400 Line St | point=42.34505,-83.05500 | address=400 Line St, Detroit, MI | at=2026-10-05");
    // No parcel at that address: coordinates, no neighborhood, and the reason.
    const open = byId(tables, "v-line-2");
    assert.deepStrictEqual({ lat: open.lat, n: open.neighborhood_id, c: open.neighborhood_confidence }, { lat: P.midtownOnTheLine2.lat, n: null, c: "unconfirmed" });
    assert.deepStrictEqual((({ none, polygon, parcel, parcel_for, edge_m }) => ({ none, polygon, parcel, parcel_for, edge_m }))(lineOf(tables, "v-line-2")), { none: "near_boundary", polygon: "Midtown", parcel: "no_parcel", parcel_for: "410 W Line St", edge_m: "4" });

    // A polygon with no 313.events label: recorded on the venue, NO label created.
    assert.strictEqual(tables.neighborhoods.length, labels.length, "the pass adds no neighborhood name to the site");
    for (const id of ["v-mccoy-1", "v-mccoy-2"]) {
      assert.strictEqual(byId(tables, id).neighborhood_id, null);
      assert.deepStrictEqual((({ none, polygon }) => ({ none, polygon }))(lineOf(tables, id)), { none: "no_label_for_polygon", polygon: "Elijah McCoy" });
    }
    // Held for a reserved label, outside Detroit: coordinates and no neighborhood.
    for (const [id, reason] of [["v-mex", "held_for_reconciliation"], ["v-hole", "outside_detroit_but_city_says_detroit"], ["v-suburb", "outside_detroit"]]) {
      const row = byId(tables, id);
      assert.ok(typeof row.lat === "number" && typeof row.lng === "number", `${id} has coordinates`);
      assert.deepStrictEqual({ n: row.neighborhood_id, c: row.neighborhood_confidence }, { n: null, c: "unconfirmed" }, id);
      assert.strictEqual(lineOf(tables, id).none, reason, id);
    }
    assert.deepStrictEqual((({ polygon, pending }) => ({ polygon, pending }))(lineOf(tables, "v-mex")), { polygon: "Mexicantown", pending: "Mexicantown / Southwest Detroit" });

    // A PERSON'S VENUE: coordinates only. Neighborhood, confidence and notes untouched.
    const fox = byId(tables, "v-person");
    assert.deepStrictEqual({ lat: fox.lat, n: fox.neighborhood_id, c: fox.neighborhood_confidence, s: fox.neighborhood_source }, { lat: P.downtown.lat, n: "n-district", c: "editorial_judgment", s: HUMAN_NOTES });
    const jazz = byId(tables, "v-from-events");
    assert.deepStrictEqual({ lat: jazz.lat, n: jazz.neighborhood_id, s: jazz.neighborhood_source, address: jazz.address }, { lat: P.downtown.lat, n: "n-downtown", s: HUMAN_NOTES, address: null }, "geocoded from its events' address; the venue row's own address is not filled in");
    assert.strictEqual(c.protectedByPerson, 2);
    assert.strictEqual(c.protectedAgree, 1, "Aretha's Jazz Cafe: Downtown, as the City's map says");
    assert.deepStrictEqual(c.protectedDiffer.map((d) => [d.name, d.assigned, d.city]), [["Fox Theatre", "The District Detroit", "Downtown"]], "reported, not changed");

    // Not placed: remembered on the venue, a person's notes kept in full.
    const cemetery = byId(tables, "v-no-match");
    assert.deepStrictEqual({ lat: cemetery.lat, n: cemetery.neighborhood_id, c: cemetery.neighborhood_confidence }, { lat: null, n: "n-cass", c: "multi_source" });
    assert.strictEqual(cemetery.neighborhood_source, `${HUMAN_NOTES}\nGEOGRAPHY | v1 | none=no_match | address=1200 Elmwood Street, Detroit, MI | at=2026-10-05`);
    const other = byId(tables, "v-other-street");
    assert.strictEqual(other.lat, null, "the geocoder matched a differently named street: no coordinates");
    assert.strictEqual(lineOf(tables, "v-other-street").none, "different_street");
    // Never touched at all.
    for (const id of ["v-no-address", "v-windsor", "v-tba"]) {
      assert.deepStrictEqual({ lat: byId(tables, id).lat, s: byId(tables, id).neighborhood_source }, { lat: null, s: null }, id);
    }
    // Only venues are written; events inherit through the venue.
    assert.deepStrictEqual([...new Set(writes(db).map((r) => r.table))], ["venues"]);
    assert.strictEqual(c.writtenIds.length, 15);
  }
  console.log("PASS: real run — coordinates stored once; neighborhoods from the polygon, an alias, or the parcel; no name added to the site; a person's venue gets coordinates and nothing else");

  // 6c. the second run asks the geocoder and the parcel file NOTHING and changes nothing.
  {
    const snapshot = JSON.stringify(tables);
    const writesBefore = writes(db).length;
    const geocoder = makeGeocoder(ANSWERS);
    const parcelFile = makeParcels(PARCELS);
    const c = await pass.runVenueGeography(options(db, geocoder, parcelFile, { today: "2026-10-06" }));
    assert.deepStrictEqual(geocoder.asked, [], "no address is asked about twice -- not the placed ones, not the unplaced ones");
    assert.deepStrictEqual(parcelFile.asked, [], "nor is the parcel file -- not for the settled venue, not for the unsettled one");
    assert.strictEqual(writes(db).length, writesBefore, "no write");
    assert.strictEqual(JSON.stringify(tables), snapshot);
    assert.deepStrictEqual({ geocoded: c.geocoded, assigned: c.assigned, kept: c.kept }, { geocoded: 0, assigned: 0, kept: 5 }, "the parcel-settled venue is kept, not cleared for being on the line");
    assert.deepStrictEqual(c.notGeocoded, { no_address: 1, outside_coverage: 1, different_street_before: 1, no_match_before: 1 });
  }
  console.log("PASS: second run — neither the geocoder nor the parcel file is called, and nothing is written");

  // 6d. an address that was not placed is asked about again when the address changes.
  {
    byId(tables, "v-other-street").address = "100 Downtown St";
    const geocoder = makeGeocoder(ANSWERS);
    const c = await pass.runVenueGeography(options(db, geocoder, makeParcels(PARCELS), { today: "2026-10-07" }));
    assert.deepStrictEqual(geocoder.asked, ["100 Downtown St, Detroit, MI"]);
    assert.strictEqual(byId(tables, "v-other-street").neighborhood_id, "n-downtown");
    assert.strictEqual(c.assigned, 1);
  }
  console.log("PASS: a corrected address is asked about again, once");

  // 6e. the geocoder is down: nothing is recorded, so it is tried again next run.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    const down = { fn: async () => ({ status: "error", detail: "HTTP 503" }) };
    const c = await pass.runVenueGeography(options(d, down, makeParcels(PARCELS)));
    assert.strictEqual(c.geocoded, 0);
    assert.strictEqual(c.notGeocoded.geocoder_unavailable, 14);
    assert.strictEqual(writes(d).filter((r) => r.table === "venues" && /"lat"|none=no_match|none=different/.test(r.body)).length, 0);
    assert.ok(t.venues.filter((row) => row.id !== "v-had-point").every((row) => row.lat === null), "no coordinates invented");
    assert.strictEqual(byId(t, "v-downtown").neighborhood_source, null, "an outage is not remembered as 'no such address'");
    const up = makeGeocoder(ANSWERS);
    await pass.runVenueGeography(options(d, up, makeParcels(PARCELS)));
    assert.strictEqual(up.asked.length, 14, "all of them asked again once the geocoder answers");
    assert.strictEqual(byId(t, "v-downtown").neighborhood_id, "n-downtown");
  }
  console.log("PASS: a geocoder outage records nothing; every address is tried again");

  // 6f. the per-run cap: the rest wait for the next run.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    const first = makeGeocoder(ANSWERS);
    const c1 = await pass.runVenueGeography(options(d, first, makeParcels(PARCELS), { maxGeocodes: 5 }));
    assert.strictEqual(first.asked.length, 5);
    assert.strictEqual(c1.deferredToNextRun, 9);
    const second = makeGeocoder(ANSWERS);
    const c2 = await pass.runVenueGeography(options(d, second, makeParcels(PARCELS), { maxGeocodes: 50 }));
    assert.strictEqual(second.asked.length, 9, "exactly the ones not asked the first time");
    assert.strictEqual(c2.deferredToNextRun, 0);
    assert.ok(!second.asked.some((a) => first.asked.includes(a)));
  }
  console.log("PASS: the per-run cap defers the rest; the next run asks only those");

  // 6g. a venue given a neighborhood by a person WHILE the pass runs is left as they left it.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    let intervened = false;
    const fetchFn = async (url, init) => {
      // Just before the pass writes this venue's neighborhood, a person sets one.
      if (!intervened && init && init.method === "PATCH" && /v-downtown/.test(url) && /neighborhood_id/.test(init.body)) {
        intervened = true;
        Object.assign(byId(t, "v-downtown"), { neighborhood_id: "n-cass", neighborhood_confidence: "editorial_judgment", neighborhood_source: HUMAN_NOTES });
      }
      return d.fetch(url, init);
    };
    await pass.runVenueGeography({ ...options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS)), fetchFn });
    assert.strictEqual(intervened, true);
    const row = byId(t, "v-downtown");
    assert.deepStrictEqual({ n: row.neighborhood_id, c: row.neighborhood_confidence, s: row.neighborhood_source }, { n: "n-cass", c: "editorial_judgment", s: HUMAN_NOTES });
  }
  console.log("PASS: a neighborhood a person sets mid-run is not overwritten");

  // 6h. no credentials: nothing happens. A read failure stops the pass before any write.
  {
    const quiet = { error() {} };
    const c = await pass.runVenueGeography({ SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", logger: quiet, geography, fetchFn: async () => { throw new Error("must not be called"); } });
    assert.strictEqual(c.venues, 0);
    const t = freshTables();
    const failing = makeMockPostgrest(t, { failure: (r) => (r.table === "neighborhoods" ? 500 : null) });
    await assert.rejects(() => pass.runVenueGeography(options(failing, makeGeocoder(ANSWERS), makeParcels(PARCELS))), /Failed to read neighborhoods: HTTP 500/);
    assert.strictEqual(writes(failing).length, 0);
  }
  console.log("PASS: no credentials, or an unreadable table: no geocoding and no write");

  // 6i. the parcel service is down: the venue stays unresolved, nothing is
  //     concluded about its parcel, and it is asked about again next run.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    const down = { asked: [], fn: async () => ({ status: "error", detail: "HTTP 503" }) };
    const c = await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), down));
    assert.deepStrictEqual(c.parcels, { asked: 2, settled: 0, notSettled: {}, unavailable: 2 });
    assert.strictEqual(byId(t, "v-line").neighborhood_id, null);
    assert.strictEqual(lineOf(t, "v-line").none, "near_boundary");
    assert.strictEqual(lineOf(t, "v-line").parcel, undefined, "an outage is not remembered as 'no parcel'");
    const up = makeParcels(PARCELS);
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), up, { today: "2026-10-06" }));
    assert.deepStrictEqual(up.asked.sort(), ["400 - line", "410 w line"]);
    assert.strictEqual(byId(t, "v-line").neighborhood_id, "n-midtown");
    // The cap on parcel questions per run.
    const t2 = freshTables();
    const capped = makeParcels(PARCELS);
    await pass.runVenueGeography(options(makeMockPostgrest(t2), makeGeocoder(ANSWERS), capped, { maxParcelLookups: 1 }));
    assert.strictEqual(capped.asked.length, 1);
  }
  console.log("PASS: a parcel-service outage concludes nothing; the venue is asked about again");

  // 6j. only when asked: a City name with no label becomes ONE label, shared.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    const c = await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS), { createLabels: true }));
    const created = t.neighborhoods.filter((n) => n.name === "Elijah McCoy");
    assert.strictEqual(created.length, 1, "one row, not one per venue");
    assert.strictEqual(byId(t, "v-mccoy-1").neighborhood_id, created[0].id);
    assert.strictEqual(byId(t, "v-mccoy-2").neighborhood_id, created[0].id);
    assert.strictEqual(t.neighborhoods.length, labels.length + 1, "none for Mexicantown: a held polygon never becomes a label");
    assert.deepStrictEqual(c.labelsCreated, ["Elijah McCoy"]);
    assert.strictEqual(c.assigned, 7);
  }
  console.log("PASS: labels from City names only when asked — one shared row, never for a held polygon");

  // 6k. A PERSON'S NOTE BESIDE THE PASS'S OWN LINE. The pass assigned Downtown;
  //     a person then wrote a note above its line. Later the coordinates are
  //     corrected to a point in Midtown -- and, in a second case, the city is
  //     edited. The venue is theirs now: nothing about its neighborhood moves,
  //     and their note is still there, byte for byte.
  {
    for (const edit of [{ lat: P.midtown.lat, lng: P.midtown.lng }, { city: "Hamtramck" }]) {
      const t = freshTables();
      const d = makeMockPostgrest(t);
      await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS)));
      const row = byId(t, "v-downtown");
      assert.strictEqual(row.neighborhood_id, "n-downtown");
      const notes = `Jody 2026-10-06: confirmed with the owner. Do not change.\n${row.neighborhood_source}`;
      Object.assign(row, { neighborhood_source: notes }, edit);
      const c = await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS), { today: "2026-10-07" }));
      assert.deepStrictEqual({ n: row.neighborhood_id, c: row.neighborhood_confidence, s: row.neighborhood_source }, { n: "n-downtown", c: "geographic", s: notes });
      assert.strictEqual(c.assigned, 0);
      assert.ok(c.protectedByPerson >= 3);
    }
  }
  console.log("PASS: a note written beside the pass's own line makes the venue a person's — neighborhood and note are left exactly as they are");

  // 6l. A person takes the pass's assignment OFF (no neighborhood, 'unconfirmed'): it is not put back.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS)));
    const row = byId(t, "v-downtown");
    Object.assign(row, { neighborhood_id: null, neighborhood_confidence: "unconfirmed" });
    const kept = row.neighborhood_source;
    for (const day of ["2026-10-06", "2026-10-07"]) await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS), { today: day }));
    assert.deepStrictEqual({ n: row.neighborhood_id, c: row.neighborhood_confidence, s: row.neighborhood_source }, { n: null, c: "unconfirmed", s: kept });
  }
  console.log("PASS: an assignment a person removed stays removed");

  // 6m. EDITS MADE WHILE THE PASS RUNS are never written over.
  {
    // (i) While the geocoder is being asked, a person rewrites a venue's notes.
    //     The pass then wants to remember "no match" on that venue: it must not.
    const t = freshTables();
    const d = makeMockPostgrest(t);
    const rewritten = "Rewritten by a person during the run.";
    const slowGeocoder = makeGeocoder(ANSWERS);
    const fn = async (address) => {
      if (/Elmwood/.test(address.street)) Object.assign(byId(t, "v-no-match"), { neighborhood_source: rewritten, neighborhood_id: "n-downtown" });
      return slowGeocoder.fn(address);
    };
    await pass.runVenueGeography(options(d, { fn }, makeParcels(PARCELS)));
    assert.deepStrictEqual({ s: byId(t, "v-no-match").neighborhood_source, n: byId(t, "v-no-match").neighborhood_id }, { s: rewritten, n: "n-downtown" });

    // (ii) Just before the pass writes a neighborhood, a person adds research
    //      notes to that venue (no neighborhood yet). Their notes make it theirs.
    const t2 = freshTables();
    const d2 = makeMockPostgrest(t2);
    let stepped = false;
    const fetchFn = async (url, init) => {
      if (!stepped && init && init.method === "PATCH" && /v-midtown/.test(url) && /neighborhood_id/.test(init.body)) {
        stepped = true;
        byId(t2, "v-midtown").neighborhood_source = "Looking into this one. J.";
      }
      return d2.fetch(url, init);
    };
    await pass.runVenueGeography({ ...options(d2, makeGeocoder(ANSWERS), makeParcels(PARCELS)), fetchFn });
    assert.strictEqual(stepped, true);
    assert.deepStrictEqual({ n: byId(t2, "v-midtown").neighborhood_id, c: byId(t2, "v-midtown").neighborhood_confidence, s: byId(t2, "v-midtown").neighborhood_source }, { n: null, c: "unconfirmed", s: "Looking into this one. J." });

    // (iii) A person enters coordinates by hand while the geocoder is asked: theirs stay.
    const t3 = freshTables();
    const d3 = makeMockPostgrest(t3);
    const g3 = makeGeocoder(ANSWERS);
    const fn3 = async (address) => {
      if (/Downtown St/.test(address.street)) Object.assign(byId(t3, "v-downtown"), { lat: 42.4, lng: -83.01 });
      return g3.fn(address);
    };
    await pass.runVenueGeography(options(d3, { fn: fn3 }, makeParcels(PARCELS)));
    assert.deepStrictEqual({ lat: byId(t3, "v-downtown").lat, lng: byId(t3, "v-downtown").lng }, { lat: 42.4, lng: -83.01 });
    assert.strictEqual(byId(t3, "v-downtown").neighborhood_id, null, "and no neighborhood is derived from coordinates that were never saved");

    // The guards themselves, as sent.
    const sent = writes(d).filter((r) => r.table === "venues").map((r) => decodeURIComponent(r.url.split("?")[1]));
    assert.ok(sent.filter((q) => !/neighborhood_source=/.test(q)).every((q) => /or=\(lat\.is\.null,lng\.is\.null\)/.test(q)), "a write that does not name the notes it read is a coordinates write, guarded on there being none");
    assert.ok(sent.some((q) => /neighborhood_id=is\.null&neighborhood_confidence=in\.\(unconfirmed,geographic\)&neighborhood_source=is\.null/.test(q)));
  }
  console.log("PASS: notes, neighborhoods and coordinates a person enters mid-run are not written over");

  // 6n. A venue with half a point (latitude, no longitude) is geocoded and SAVED, once.
  {
    const t = freshTables();
    byId(t, "v-downtown").lat = 42.3;
    const d = makeMockPostgrest(t);
    const first = makeGeocoder(ANSWERS);
    await pass.runVenueGeography(options(d, first, makeParcels(PARCELS)));
    assert.ok(first.asked.includes("100 Downtown St, Detroit, MI"));
    assert.deepStrictEqual({ lat: byId(t, "v-downtown").lat, lng: byId(t, "v-downtown").lng }, { lat: P.downtown.lat, lng: P.downtown.lng });
    const second = makeGeocoder(ANSWERS);
    await pass.runVenueGeography(options(d, second, makeParcels(PARCELS)));
    assert.deepStrictEqual(second.asked, []);
  }
  console.log("PASS: half a point is completed once, not asked about every night");

  // 6o. ANOTHER STREET TYPE. "100 Downtown St" answered as "100 DOWNTOWN AVE":
  //     not placed and remembered -- unless the venue's own ZIP is on file and matches.
  {
    const TYPE = { ...ANSWERS, "100 Downtown St, Detroit, MI": { ...P.downtown, matched: "100 DOWNTOWN AVE, DETROIT, MI, 48226" }, "100 Downtown St, Detroit, MI 48201": { ...P.downtown, matched: "100 DOWNTOWN AVE, DETROIT, MI, 48201" } };
    const t = freshTables();
    const d = makeMockPostgrest(t);
    const c = await pass.runVenueGeography(options(d, makeGeocoder(TYPE), makeParcels(PARCELS)));
    assert.strictEqual(c.notGeocoded.different_street_type, 1);
    assert.strictEqual(byId(t, "v-downtown").lat, null);
    assert.strictEqual(lineOf(t, "v-downtown").none, "different_street_type");
    const again = makeGeocoder(TYPE);
    await pass.runVenueGeography(options(d, again, makeParcels(PARCELS)));
    assert.deepStrictEqual(again.asked, [], "remembered: not asked again");
    // With the venue's ZIP on file, and the match in that ZIP: the same street.
    byId(t, "v-downtown").zip_code = "48201";
    const withZip = makeGeocoder(TYPE);
    await pass.runVenueGeography(options(d, withZip, makeParcels(PARCELS)));
    assert.deepStrictEqual(withZip.asked, ["100 Downtown St, Detroit, MI 48201"], "the address as asked changed, so it is asked once more");
    assert.strictEqual(byId(t, "v-downtown").neighborhood_id, "n-downtown");
  }
  console.log("PASS: a match of another street type is not taken unless the venue's own ZIP agrees");

  // 6p. THE PARCEL QUESTION is about the venue's address as it stands now, and
  //     about its coordinates. A venue with hand-entered coordinates on a
  //     boundary is asked about too.
  {
    const t = freshTables();
    t.venues.push(v("v-hand", "Hand Placed", "400 Line St", { lat: P.midtownOnTheLine.lat, lng: P.midtownOnTheLine.lng }));
    const d = makeMockPostgrest(t);
    const seen = [];
    const parcelFn = async (street, geo, opts) => { seen.push([street.text, opts.point.lat, opts.point.lng, opts.maxMetersFromPolygon]); return PARCELS[`${street.number} ${street.dir || "-"} ${street.name}`] || { status: "not_settled", reason: "no_parcel" }; };
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), { fn: parcelFn }));
    assert.ok(seen.some(([text, lat]) => text === "400 Line St" && lat === P.midtownOnTheLine.lat), "asked with the venue's own coordinates");
    assert.ok(seen.every(([, , , limit]) => limit === pass.MIN_EDGE_METERS));
    assert.strictEqual(byId(t, "v-hand").neighborhood_id, "n-midtown", "hand-entered coordinates on a boundary are settled by the parcel as well");
    // The address is corrected afterwards: the next run asks about the NEW address.
    byId(t, "v-line-2").address = "400 Line St";
    const later = [];
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), { fn: async (street) => { later.push(street.text); return PARCELS["400 - line"]; } }, { today: "2026-10-06" }));
    assert.deepStrictEqual(later, ["400 Line St"], "only the venue whose address changed, and about its new address");
    assert.strictEqual(byId(t, "v-line-2").neighborhood_id, "n-midtown");
    // The time allowed for parcel questions.
    const t2 = freshTables();
    let clock = 0;
    const slow = { asked: [], fn: async (street) => { slow.asked.push(street.text); clock += 20000; return { status: "not_settled", reason: "no_parcel" }; } };
    const c = await pass.runVenueGeography(options(makeMockPostgrest(t2), makeGeocoder(ANSWERS), slow, { now: () => clock }));
    assert.strictEqual(slow.asked.length, 1, "the second is left for the next run once the time is spent");
    assert.strictEqual(c.parcels.asked, 1);
  }
  console.log("PASS: the parcel file is asked about the venue's current address and coordinates, within a time limit");

  // 6q. The pass refreshing ITS OWN assignment (the coordinates were corrected
  //     and now fall in Midtown) while a person re-assigns the venue by hand,
  //     leaving the notes alone: theirs stands.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS)));
    const row = byId(t, "v-downtown");
    Object.assign(row, { lat: P.midtown.lat, lng: P.midtown.lng });
    let stepped = false;
    const fetchFn = async (url, init) => {
      if (!stepped && init && init.method === "PATCH" && /v-downtown/.test(url) && /neighborhood_id/.test(init.body)) { stepped = true; row.neighborhood_id = "n-cass"; }
      return d.fetch(url, init);
    };
    await pass.runVenueGeography({ ...options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS), { today: "2026-10-06" }), fetchFn });
    assert.strictEqual(stepped, true, "the pass did try to move its own assignment to Midtown");
    assert.strictEqual(row.neighborhood_id, "n-cass");
    // Undisturbed, the same refresh goes through.
    const t2 = freshTables();
    const d2 = makeMockPostgrest(t2);
    await pass.runVenueGeography(options(d2, makeGeocoder(ANSWERS), makeParcels(PARCELS)));
    Object.assign(byId(t2, "v-downtown"), { lat: P.midtown.lat, lng: P.midtown.lng });
    await pass.runVenueGeography(options(d2, makeGeocoder(ANSWERS), makeParcels(PARCELS), { today: "2026-10-06" }));
    assert.strictEqual(byId(t2, "v-downtown").neighborhood_id, "n-midtown");
  }
  console.log("PASS: the pass corrects its own earlier answer, but not over a person's change made meanwhile");

  // 6r. The time allowed for the geocoder: once it is spent, the rest wait for the next run.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    let clock = 0;
    const slow = makeGeocoder(ANSWERS);
    const fn = async (address) => { clock += 10000; return slow.fn(address); };
    const c = await pass.runVenueGeography(options(d, { fn }, makeParcels(PARCELS), { now: () => clock, budgetMs: 25000 }));
    assert.ok(slow.asked.length >= 3 && slow.asked.length < 14, `some asked, not all (${slow.asked.length})`);
    assert.strictEqual(c.deferredToNextRun, 14 - slow.asked.length);
    const rest = makeGeocoder(ANSWERS);
    await pass.runVenueGeography(options(d, rest, makeParcels(PARCELS)));
    assert.strictEqual(rest.asked.length, 14 - slow.asked.length, "exactly the ones that were not asked in time");
  }
  console.log("PASS: geocoding stops when its time is spent; the rest are asked on the next run");

  // 6s. COORDINATES REMOVED. The pass assigned Downtown. A person corrects the
  //     address and clears the coordinates so that it is looked up again. The
  //     old assignment is withdrawn at once -- it must not outlive the point it
  //     came from -- and whatever the geocoder then says is what stands.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS)));
    const row = byId(t, "v-downtown");
    assert.strictEqual(row.neighborhood_id, "n-downtown");
    // The corrected address has a typo: the geocoder cannot place it.
    Object.assign(row, { address: "200 Midtwon Ave", lat: null, lng: null });
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS), { today: "2026-10-06" }));
    assert.deepStrictEqual({ n: row.neighborhood_id, c: row.neighborhood_confidence, none: lineOf(t, "v-downtown").none }, { n: null, c: "unconfirmed", none: "no_match" }, "not left as Downtown");
    // The typo is fixed: geocoded, and assigned where the new address is.
    row.address = "200 Midtown Ave";
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS), { today: "2026-10-07" }));
    assert.deepStrictEqual({ n: row.neighborhood_id, c: row.neighborhood_confidence, lat: row.lat }, { n: "n-midtown", c: "geographic", lat: P.midtown.lat });
    // A PERSON'S venue whose coordinates are cleared keeps its neighborhood, of course.
    const fox = byId(t, "v-person");
    Object.assign(fox, { lat: null, lng: null });
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS), { today: "2026-10-08" }));
    assert.deepStrictEqual({ n: fox.neighborhood_id, c: fox.neighborhood_confidence, s: fox.neighborhood_source }, { n: "n-district", c: "editorial_judgment", s: HUMAN_NOTES });
  }
  console.log("PASS: when a venue's coordinates are removed, the pass's own assignment is withdrawn with them; a person's is not");

  // 6t. THE ADDRESS IS CORRECTED WHILE THE GEOCODER IS BEING ASKED: the answer
  //     for the old address is not saved; the next run asks about the new one.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    const g1 = makeGeocoder(ANSWERS);
    const fn = async (address) => { if (/Downtown St/.test(address.street)) byId(t, "v-downtown").address = "200 Midtown Ave"; return g1.fn(address); };
    await pass.runVenueGeography(options(d, { fn }, makeParcels(PARCELS)));
    assert.deepStrictEqual({ lat: byId(t, "v-downtown").lat, n: byId(t, "v-downtown").neighborhood_id }, { lat: null, n: null });
    const g2 = makeGeocoder(ANSWERS);
    await pass.runVenueGeography(options(d, g2, makeParcels(PARCELS), { today: "2026-10-06" }));
    assert.deepStrictEqual(g2.asked, ["200 Midtown Ave, Detroit, MI"]);
    assert.strictEqual(byId(t, "v-downtown").neighborhood_id, "n-midtown");
  }
  console.log("PASS: coordinates for an address that was corrected mid-run are not saved");

  // 6u. ONE ADDRESS, ONE QUESTION. Three venue rows at one address (production
  //     has "Fox Theatre" and "Fox Theatre Detroit"; "Majestic Theatre" three
  //     times) are one request to the geocoder, and each gets the answer.
  {
    const t = freshTables();
    t.venues.push(v("v-dup-1", "Aretha Franklin Cafe (duplicate)", "100 Downtown St"), v("v-dup-2", "Aretha's", "100 Downtown St"));
    const d = makeMockPostgrest(t);
    const g = makeGeocoder(ANSWERS);
    await pass.runVenueGeography(options(d, g, makeParcels(PARCELS)));
    assert.strictEqual(g.asked.filter((a) => a === "100 Downtown St, Detroit, MI").length, 1);
    for (const id of ["v-downtown", "v-dup-1", "v-dup-2"]) assert.deepStrictEqual({ lat: byId(t, id).lat, n: byId(t, id).neighborhood_id }, { lat: P.downtown.lat, n: "n-downtown" }, id);
    // The per-run cap counts questions: with room for one, all three venues at that one address are served.
    const t2 = freshTables();
    t2.venues = [v("a", "A", "100 Downtown St"), v("b", "B", "100 Downtown St"), v("c", "C", "200 Midtown Ave")];
    const g2 = makeGeocoder(ANSWERS);
    const c2 = await pass.runVenueGeography(options(makeMockPostgrest(t2), g2, makeParcels(PARCELS), { maxGeocodes: 1 }));
    assert.deepStrictEqual({ asked: g2.asked.length, deferred: c2.deferredToNextRun, a: byId(t2, "a").lat, b: byId(t2, "b").lat, c: byId(t2, "c").lat }, { asked: 1, deferred: 1, a: P.downtown.lat, b: P.downtown.lat, c: null });
  }
  console.log("PASS: venues that share an address share one geocoder question");

  // 6v. Only PUBLIC events place a venue: one unreviewed submission does not.
  {
    const t = freshTables();
    t.events = [{ id: "p1", venue_id: "v-no-address", status: "pending_review", venue_address_raw: "777 Submitted St", venue_city_raw: "Detroit" }];
    const g = makeGeocoder({ ...ANSWERS, "777 Submitted St, Detroit, MI": { ...P.downtown, matched: "777 SUBMITTED ST, DETROIT, MI, 48226" } });
    const c = await pass.runVenueGeography(options(makeMockPostgrest(t), g, makeParcels(PARCELS)));
    assert.ok(!g.asked.includes("777 Submitted St, Detroit, MI"));
    assert.strictEqual(byId(t, "v-no-address").lat, null);
    assert.strictEqual(c.notGeocoded.no_address, 2, "Hart Plaza, and Aretha's Jazz Cafe whose public events are gone in this fixture");
    // Once a person approves it, it counts.
    t.events[0].status = "approved";
    const g2 = makeGeocoder({ ...ANSWERS, "777 Submitted St, Detroit, MI": { ...P.downtown, matched: "777 SUBMITTED ST, DETROIT, MI, 48226" } });
    await pass.runVenueGeography(options(makeMockPostgrest(t), g2, makeParcels(PARCELS)));
    assert.ok(g2.asked.includes("777 Submitted St, Detroit, MI"));
  }
  console.log("PASS: a pending event's address does not place a venue");

  // 6w. A parcel answer is for one address at one point: when the venue's
  //     coordinates change, the question is asked afresh.
  {
    const t = freshTables();
    const d = makeMockPostgrest(t);
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), makeParcels(PARCELS)));
    assert.strictEqual(byId(t, "v-line").neighborhood_id, "n-midtown");
    Object.assign(byId(t, "v-line"), { lat: P.midtownOnTheLine2.lat, lng: P.midtownOnTheLine2.lng });
    const again = makeParcels({ "400 - line": { status: "not_settled", reason: "no_parcel" } });
    await pass.runVenueGeography(options(d, makeGeocoder(ANSWERS), again, { today: "2026-10-06" }));
    assert.deepStrictEqual(again.asked, ["400 - line"], "asked again for the new point");
    assert.deepStrictEqual({ n: byId(t, "v-line").neighborhood_id, none: lineOf(t, "v-line").none }, { n: null, none: "near_boundary" }, "and the earlier settlement does not carry over");
  }
  console.log("PASS: a parcel settlement does not carry over to different coordinates");

  // --- 7. a typographic apostrophe is an apostrophe ---------------------------
  {
    assert.strictEqual(normalizeVenueName("Terri’s Detroit"), normalizeVenueName("Terri's Detroit"));
    const venueMap = new Map([[normalizeVenueName("Terri's Detroit"), "venue-terris"]]);
    assert.strictEqual(resolveVenueId(venueMap, "Terri’s Detroit"), "venue-terris", "WDET's spelling finds the venue");
    assert.strictEqual(resolveVenueId(venueMap, "Terris Detroit"), null, "a missing apostrophe is still a different name");
  }
  console.log("PASS: \"Terri’s Detroit\" (WDET) is the venue \"Terri's Detroit\"");

  console.log("\nAll venue-geography tests passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
