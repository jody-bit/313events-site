// test/place-eligibility.test.js -- geographic parity (owner direction 2026-10-24): the homepage,
// calendar and map decide "is this event inside the place filter" with ONE rule. Covers the
// formatting variants named by the owner (Warren, MI 48092 / Clinton Twp / Grosse Pointe Farms),
// sourced Phase 2 cities, the Orbit-from-the-border rule, never guessing, and the production
// impact fixture (420 unplaced on the homepage before, 14 after). Run: node test/place-eligibility.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.REPO_DIR || process.cwd();
const { PlaceEligibility: PE } = require(path.join(ROOT, "place-eligibility.js"));
const { CityResolution: CR } = require(path.join(ROOT, "city-resolution.js"));
const { PHASE2_CITIES: P2 } = require(path.join(ROOT, "city-table-phase2.js"));
const { _build, _defaultConfig } = require(path.join(ROOT, "discovery.js"));
const { DETROIT_BOUNDARY } = require(path.join(ROOT, "api/_lib/detroit-boundary.js"));

// ---- 1. one boundary ring everywhere ----
assert.deepStrictEqual(PE.DETROIT_BOUNDARY, DETROIT_BOUNDARY, "place-eligibility.js ring == api/_lib/detroit-boundary.js");
assert.deepStrictEqual(_defaultConfig.boundary, DETROIT_BOUNDARY, "discovery.js ring == api/_lib/detroit-boundary.js");
assert.strictEqual(_defaultConfig.orbitMiles, PE.ORBIT_MILES);
console.log("PASS: one Detroit boundary ring and one 75-mile Orbit in all three places");

// ---- 2. the three surfaces share one base city table ----
function pageCities(file) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  const m = /const LOCATIONS = \[([\s\S]*?)\n\];/.exec(html);
  assert.ok(m, file + ": LOCATIONS anchor moved");
  const out = [];
  const re = /\{name:"([^"]+)",\s*type:"city",\s*region:"([^"]+)",\s*lat:([-\d.]+),\s*lng:([-\d.]+)/g;
  let x;
  while ((x = re.exec(m[1]))) out.push({ name: x[1], type: "city", region: x[2], lat: +x[3], lng: +x[4] });
  return out;
}
const homeCities = _defaultConfig.places.filter((p) => p[1] === "city").map((p) => ({ name: p[0], type: "city", region: p[2], lat: p[3], lng: p[4] }));
const calCities = pageCities("calendar.html");
const mapCities = pageCities("map.html");
for (const [label, list] of [["calendar.html", calCities], ["map.html", mapCities]]) {
  const by = new Map(list.map((c) => [c.name, c]));
  for (const c of homeCities) {
    assert.ok(by.has(c.name), `${label} is missing the city ${c.name} that discovery.js has`);
    assert.deepStrictEqual(by.get(c.name), c, `${label}: ${c.name} differs from discovery.js`);
  }
}
assert.strictEqual(homeCities.length, 56);
console.log("PASS: calendar and map carry every one of the homepage's 56 cities with identical coordinates");

// ---- the three surfaces, as pages build them ----
const calLookup = PE.buildLookup(calCities, P2);
const mapLookup = PE.buildLookup(mapCities, P2);
const D = _build(Object.assign({}, _defaultConfig, { cityResolution: CR, extraCities: P2 }));
const CTX = { now: new Date("2026-10-24T17:00:00Z"), defaultWhen: "all" };
const ORBIT = { where: { place: "Detroit", radius: "orbit" } };
const detroit = homeCities.find((c) => c.name === "Detroit");
const ev = (city, source, venue) => ({ id: "x", title: "T", venue: venue || "V", city, cat: "music", date: "2026-11-15", endDate: null, time: "8:00 PM", source: source || "", free: false, neighborhood: null });
function surfaces(city, source, venue) {
  const e = ev(city, source, venue);
  return {
    home: D.matches(e, ORBIT, CTX),
    cal: PE.withinPlace(e, calLookup, detroit, "orbit").eligible,
    map: PE.withinPlace(e, mapLookup, detroit, "orbit").eligible
  };
}
function allSame(city, source, expected, venue) {
  const s = surfaces(city, source, venue);
  assert.deepStrictEqual(s, { home: expected, cal: expected, map: expected }, `${city} / ${source}: ${JSON.stringify(s)}`);
}

// ---- 3. the cases the owner named, and their neighbours ----
for (const [city, source] of [
  ["Warren, MI 48092", "GottaGacha"], ["Warren", "x"], ["warren, michigan", "x"],
  ["Clinton Twp", "x"], ["Clinton Twp.", "x"], ["Clinton Township", "x"], ["Charter Township Of Clinton", "VisitDetroit"],
  ["Grosse Pointe Farms", "VisitDetroit"], ["Grosse Pointe Shores", "x"], ["Grosse Pointe Park", "VisitDetroit"], ["Grosse Pointe", "x"],
  ["Mt Clemens", "VisitDetroit"], ["Mt. Clemens", "VisitDetroit"], ["Mount Clemens", "x"],
  ["Detroit, MI", "Resident Advisor"], ["Detroit, MI 48207", "Resident Advisor"], ["Detroit", ""],
  ["East Lansing", "Bowling Green State University"], ["Lansing", "x"]
]) allSame(city, source, true);
console.log("PASS: formatting variants place identically on homepage, calendar and map");

// Phase 2 sourced cities: placed only for a feed that is jurisdiction evidence.
allSame("Redford", "Redford Township Community Events", true);
allSame("Richmond", "Richmond Recreation Calendar", true);
allSame("Canton", "Canton Township Community and Special Events", true);
allSame("Canton", "VisitDetroit", true);
allSame("Bowling Green", "Bowling Green State University", true);
allSame("Tecumseh, ON", "anything", true);
allSame("Highland", "VisitDetroit", true);
allSame("Highland, MI", "anything", true);
allSame("Belle River", "Tourism Windsor Essex Pelee Island", true);
allSame("Belle River", "Some Other Feed", false);
allSame("Romulus", "TechTown Detroit", true);
allSame("Inkster", "TechTown Detroit", true);
allSame("Hazel Park", "Editorial Review (Automated)", true);
allSame("Canton", "Ticketmaster", false);        // bare name, no jurisdiction evidence: not guessed
allSame("Redford", "Some Other Feed", false);
console.log("PASS: sourced Phase 2 cities place only with jurisdiction evidence, on every surface");

// Never guessed.
for (const [city, source] of [
  ["2810 Russell St.", "Eastern Market Partnership"], ["West", "Windsor Symphony Orchestra"], ["October 29", "Macomb Township Events"],
  ["Tech   Mount Clemens", "x"], ["Highland", "Ticketmaster"],
  ["Dresden", "x"], ["Warren, OH", "x"], ["Troy, NY", "x"], ["Mtn View", "x"]
]) allSame(city, source, false);
assert.strictEqual(PE.locate(ev("Dresden", "x"), mapLookup).reason, "not-in-table");
assert.strictEqual(PE.locate(ev("Dryden", "x"), mapLookup).reason, "source-not-evidence");
assert.strictEqual(PE.locate(ev("Canton", "Ticketmaster"), mapLookup).reason, "source-not-evidence");
console.log("PASS: addresses, dates, typos, other-state names and unsourced places stay unplaced (never guessed)");

// Dryden, Michigan (Census TIGERweb village point, added to Phase 2 on 2026-10-24) is eligible:
// ~34 mi from Detroit's border. Only for a feed that is jurisdiction evidence, and never as Dryden, Ontario.
allSame("Dryden", "Manual", true);
allSame("Dryden", "Avenue Ticketing", true);
allSame("Dryden, MI", "anything", true);
allSame("Dryden, Michigan", "anything", true);
allSame("Dryden", "Some Other Feed", false);
allSame("Dryden, ON", "Manual", false);
allSame("Dresden", "Manual", false);
console.log("PASS: Dryden, MI is Orbit-eligible on every surface (listed feeds or explicit state); Dryden, ON and Dresden are not");

// ---- 4. the Orbit is measured from the border, not the centre ----
const lansing = homeCities.find((c) => c.name === "Lansing");
assert.ok(PE.haversineMiles(detroit.lat, detroit.lng, lansing.lat, lansing.lng) > 75, "Lansing is more than 75 mi from Detroit's centre");
assert.ok(PE.milesFromBorder(lansing.lat, lansing.lng) <= 75, "...and within 75 mi of the border");
assert.strictEqual(PE.inOrbit(lansing), true);
const saginaw = { lat: 43.4195, lng: -83.9508 };
assert.strictEqual(PE.inOrbit(saginaw), false, "Saginaw stays a documented near-miss outside");
// A numeric radius is measured from the chosen place and stays inside the Orbit.
const ann = homeCities.find((c) => c.name === "Ann Arbor");
const e = ev("Canton", "Canton Township Community and Special Events");
assert.strictEqual(PE.withinPlace(e, mapLookup, ann, 25).eligible, true);
assert.strictEqual(PE.withinPlace(e, mapLookup, detroit, 10).eligible, false);
assert.strictEqual(PE.withinPlace(e, mapLookup, detroit, 25).eligible, true);
console.log("PASS: Orbit measured from the border; numeric radii measured from the chosen place");

// ---- 5. missing city: existing behaviour (Detroit), but counted ----
const blank = ev(undefined, "Venue Submission");
const at = PE.locate(blank, mapLookup);
assert.strictEqual(at.status, "placed");
assert.strictEqual(at.assumed, true);
const part = PE.partition([blank, ev("Detroit", "x"), ev("2810 Russell St.", "x")], mapLookup);
assert.deepStrictEqual({ placed: part.placed, unplaced: part.unplaced, assumed: part.assumed }, { placed: 2, unplaced: 1, assumed: 1 });
console.log("PASS: a blank city is still treated as Detroit, and is counted as assumed");

// ---- 6. production impact fixture (2026-10-24, 420 upcoming approved events) ----
const rows = fs.readFileSync(path.join(ROOT, "test/fixtures/geo-impact-unplaced-cities-2026-10-24.tsv"), "utf8").trim().split("\n").map((l) => { const [c, s, n] = l.split("\t"); return { c, s, n: +n }; });
assert.strictEqual(rows.reduce((a, r) => a + r.n, 0), 420);
const events = [];
rows.forEach((r) => { for (let i = 0; i < r.n; i++) events.push(Object.assign(ev(r.c, r.s), { id: "e" + events.length })); });
const BEFORE_HOMEPAGE_EXACT = events.filter((x) => !homeCities.some((c) => c.name.toLowerCase() === x.city.toLowerCase())).length;
assert.strictEqual(BEFORE_HOMEPAGE_EXACT, 420, "all 420 fixture rows were dropped by exact-name matching");
const unplacedOn = {
  home: Number(D.facets(events, ORBIT, CTX, "placement").get("unplaced")) + 0,
  cal: PE.partition(events, calLookup).unplaced,
  map: PE.partition(events, mapLookup).unplaced
};
// Placement facet counts events that pass every other filter; with 'when: all' that is all of them.
assert.deepStrictEqual(unplacedOn, { home: 9, cal: 9, map: 9 }, "420 -> 9 on every surface: " + JSON.stringify(unplacedOn));
const residual = events.filter((x) => PE.locate(x, mapLookup).status !== "placed").map((x) => x.city + " / " + x.source);
assert.deepStrictEqual([...new Set(residual)].sort(), [
  "2810 Russell St. / Eastern Market Partnership",
  "October 29 / Macomb Township Events",
  "Tech   Mount Clemens / Mount Clemens Public Library - Adult Events", "West / Windsor Symphony Orchestra"
].sort());
// Every one of the 411 recovered events is inside the Orbit by the border rule.
const placed = events.filter((x) => PE.locate(x, mapLookup).status === "placed");
assert.strictEqual(placed.length, 411);
assert.ok(placed.every((x) => PE.inOrbit(PE.locate(x, mapLookup).loc)), "no recovered event is outside the Orbit");
console.log("PASS: production impact fixture, 420 unplaced -> 9 (exceptions named), 411 recovered all inside the Orbit");

console.log("\nAll place-eligibility tests passed.");
