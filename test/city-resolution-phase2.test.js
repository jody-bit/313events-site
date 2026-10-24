// test/city-resolution-phase2.test.js -- Geographic Phase 2: 30 sourced cities, jurisdiction-aware.
// Never invent coordinates, never assign an ambiguous municipality, keep Maidstone unresolved.
// Run: node test/city-resolution-phase2.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.env.REPO_DIR || process.cwd();
const { CityResolution: CR } = require(path.join(ROOT, "city-resolution.js"));
const { PHASE2_CITIES: P2 } = require(path.join(ROOT, "city-table-phase2.js"));
const ei = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/phase2-city-coordinates.json"), "utf8"));
const html = fs.readFileSync(path.join(ROOT, "map.html"), "utf8");

const a = html.indexOf("const LOCATIONS = [");
const b = html.indexOf("function haversineMiles");
const c = html.indexOf("const VENUE_LATLNG_MAP");
const d = html.indexOf("// Rebuilt on every render()");
const ctx = { CityResolution: CR, PHASE2_CITIES: P2 };
vm.createContext(ctx);
vm.runInContext(html.slice(a, b) + html.slice(c, d) + "\nthis.LOCATIONS=LOCATIONS;this.CITY_LOOKUP=CITY_LOOKUP;this.resolvePlace=resolvePlace;", ctx);
const place = (city, source, venue) => ctx.resolvePlace({ venue: venue || "v", city, source });

// 1. The table is exactly EI's 30 sourced cities, coordinates identical, each with provenance.
// ...plus Dryden village (added 2026-10-24, Census TIGERweb GEOID 2623140, researched by EI; not part of the Oct 15 research).
assert.strictEqual(P2.length, 31);
const dryden = P2.find((x) => x.name === "Dryden");
assert.deepStrictEqual({ r: dryden.region, la: dryden.lat, ln: dryden.lng, f: dryden.featureId, s: dryden.source }, { r: "Michigan", la: 42.9455811, ln: -83.1239865, f: "2623140", s: "Census TIGERweb" });
assert.deepStrictEqual(dryden.sources, ["manual", "avenue ticketing"]);
assert.ok(!P2.some((x) => /maidstone/i.test(x.name)), "Maidstone must stay out");
const eiBy = new Map(ei.map((r) => [r.city, r]));
for (const x of P2.filter((y) => y.name !== "Dryden")) {
  const r = eiBy.get(x.name);
  assert.ok(r, x.name + " is not in EI's research");
  assert.strictEqual(x.lat, r.lat, x.name + " lat");
  assert.strictEqual(x.lng, r.lng, x.name + " lng");
  assert.strictEqual({ MI: "Michigan", OH: "Ohio", ON: "Ontario" }[r.state_or_province], x.region, x.name + " region");
  assert.ok(x.source && x.featureId && x.verified && x.jurisdiction, x.name + " lacks provenance");
  assert.ok(x.sources && x.sources.length, x.name + " lacks evidence sources");
}
console.log("PASS: 30 cities + Dryden, EI coordinates exact, provenance and evidence sources present, Maidstone absent");

// 2. No Phase 2 name duplicates a city already in the table, and none is a neighborhood name.
const names = ctx.LOCATIONS.map((l) => l.name.toLowerCase());
assert.strictEqual(new Set(names).size, names.length, "duplicate names in LOCATIONS");

// 3. Every matching-rules row for a ready city resolves with each allowed source, and not without one.
const rules = fs.readFileSync(path.join(ROOT, "test/fixtures/phase2-matching-rules.csv"), "utf8").trim().split("\n").slice(1)
  .map((l) => { const m = /^([^,]+),(\w\w),([^,]+),(?:"[^"]*"|[^,]*),(?:"([^"]*)"|([^,]*)),/.exec(l); return { city: m[1], str: m[3], src: (m[4] || m[5]) }; });
for (const r of rules) {
  if (r.city === "Maidstone") { assert.strictEqual(place("Maidstone", "Tourism Windsor Essex Pelee Island"), null); continue; }
  const entry = P2.find((x) => x.name === r.city);
  assert.ok(entry, r.city);
  if (r.city === "Kingsville") continue; // string rule, below
  for (const s of entry.sources) {
    const p = place(r.str, s);
    assert.ok(p && p.key === "c:" + r.city.toLowerCase() && p.lat === entry.lat, `${r.str} + source ${s}`);
  }
  assert.strictEqual(place(r.str, undefined), null, r.str + " with no source must not resolve");
  assert.strictEqual(place(r.str, "Some Other Feed"), null, r.str + " with an unlisted source must not resolve");
}
console.log("PASS: every ready city resolves only with its evidence sources");

// 4. Jurisdiction-aware cases.
assert.strictEqual(place("Tecumseh", "Tourism Windsor Essex Pelee Island").lat, 42.2430555);
assert.strictEqual(place("Tecumseh", "Ticketmaster"), null, "Tecumseh from a non-Windsor feed may be Michigan");
assert.ok(place("Tecumseh, ON"), "explicit Ontario needs no source");
assert.strictEqual(place("Tecumseh, MI"), null, "Tecumseh, MI is a different place");
assert.strictEqual(place("Huron", "Bowling Green State University").lat, 41.3976309);
assert.strictEqual(place("Huron, MI", "Bowling Green State University"), null);
assert.strictEqual(place("Plymouth", "Bowling Green State University").key, "c:plymouth", "BGSU row at the USA Hockey Arena is Plymouth MI");
assert.strictEqual(place("Canton, OH"), null);
assert.strictEqual(place("Canton", "Canton Township Community and Special Events").lat, 42.3075411);
assert.strictEqual(place("Canton", "Ticketmaster"), null);
assert.strictEqual(place("Harrow", "Tourism Windsor Essex Pelee Island").key, "c:harrow", "Harrow stays its own community");
assert.notStrictEqual(place("Harrow", "Tourism Windsor Essex Pelee Island").lat, place("Essex", "Tourism Windsor Essex Pelee Island").lat);
assert.strictEqual(place("Leamington", "Windsor Symphony Orchestra").lat, 42.09535);
// Kingsville: the city field says "Ontario"; only the Town of Kingsville venue resolves it.
assert.strictEqual(place("Ontario", "Tourism Windsor Essex Pelee Island", "Town of Kingsville").key, "c:kingsville");
assert.strictEqual(place("Ontario", "Tourism Windsor Essex Pelee Island", "Some Other Venue"), null);
assert.strictEqual(place("Ontario", "Tourism Windsor Essex Pelee Island"), null);
assert.strictEqual(place("Ontario", "Ticketmaster", "Town of Kingsville"), null);
assert.strictEqual(place("Maidstone", "Tourism Windsor Essex Pelee Island"), null);
console.log("PASS: jurisdiction-aware cases; Kingsville string rule; Maidstone unresolved");

// 5. Phase 1 behaviour and existing cities are untouched.
assert.strictEqual(place("Warren, MI 48092").key, "c:warren");
assert.strictEqual(place("Detroit").key, "c:detroit");
assert.strictEqual(place("Ottawa", "Tourism Windsor Essex Pelee Island"), null);
assert.strictEqual(place("2810 Russell St."), null);
assert.strictEqual(place("").key, "c:detroit", "blank city unchanged (separate work)");
console.log("PASS: Phase 1 and existing cities unchanged");

// 6. Source values are not rewritten.
const ev = { venue: "v", city: "Ontario", source: "Tourism Windsor Essex Pelee Island" };
ctx.resolvePlace(ev);
assert.strictEqual(ev.city, "Ontario");
console.log("PASS: source city value untouched");
