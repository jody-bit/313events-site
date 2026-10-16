// test/city-resolution.test.js -- Phase 1 geographic coverage (owner-approved 2026-10-16):
// recover the 165 events whose city string carries state/ZIP, a Township spelling variant or
// a Grosse Pointe municipality, without changing any place that already plots and without
// guessing the five malformed records. Run: node test/city-resolution.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.env.REPO_DIR || process.cwd();
const { CityResolution: CR } = require(path.join(ROOT, "city-resolution.js"));
const html = fs.readFileSync(path.join(ROOT, "map.html"), "utf8");

// The real city table and resolver from map.html, evaluated in a sandbox.
const a = html.indexOf("const LOCATIONS = [");
const b = html.indexOf("function haversineMiles");
const c = html.indexOf("const VENUE_LATLNG_MAP");
const d = html.indexOf("// Rebuilt on every render()");
assert.ok(a > 0 && b > a && c > b && d > c, "map.html anchors moved");
const ctx = { CityResolution: CR };
vm.createContext(ctx);
vm.runInContext(
  html.slice(a, b) + html.slice(c, d) + "\nthis.LOCATIONS=LOCATIONS;this.CITY_LOOKUP=CITY_LOOKUP;this.resolvePlace=resolvePlace;",
  ctx
);
const place = (city) => ctx.resolvePlace({ venue: "v", city });

// 1. Rules.
assert.strictEqual(CR.normalize("  Warren,  MI   48092 "), "warren");
assert.strictEqual(CR.normalize("Detroit, MI"), "detroit");
assert.strictEqual(CR.normalize("Clinton Twp"), "clinton township");
assert.strictEqual(CR.normalize("Clinton Twp."), "clinton township");
assert.strictEqual(CR.normalize("Charter Township Of Clinton"), "clinton township");
console.log("PASS: normalisation rules");

// 2. Everything that plots today keeps exactly the same place key and coordinates.
for (const l of ctx.LOCATIONS.filter((x) => x.type === "city")) {
  for (const spelling of [l.name, l.name.toUpperCase(), l.name.toLowerCase()]) {
    const p = place(spelling);
    assert.ok(p, spelling);
    assert.strictEqual(p.key, `c:${spelling.toLowerCase()}`, "place key for an exact city must not change: " + spelling);
    assert.strictEqual(p.lat, l.lat);
    assert.strictEqual(p.label, spelling);
  }
}
console.log("PASS: exact-match cities keep their place key (the 2,102 plotted events do not move)");

// 3. The EI classification: 585 unresolved events, 165 recoverable, 420 stay off the map.
const csv = fs.readFileSync(path.join(ROOT, "test/fixtures/unresolved-city-strings.csv"), "utf8");
const rows = csv.trim().split("\n").slice(1).map((line) => {
  const m = /^"((?:[^"]|"")*)",(\d+),/.exec(line);
  return { city: m[1].replace(/""/g, '"'), n: +m[2] };
});
{
  const total = rows.reduce((s, r) => s + r.n, 0);
  const recovered = rows.filter((r) => place(r.city)).reduce((s, r) => s + r.n, 0);
  assert.strictEqual(total, 585);
  assert.strictEqual(recovered, 165, "Phase 1 target: 2,102 + 165 = 2,267");
  assert.strictEqual(2102 + recovered, 2267);
  console.log("PASS: 165 of 585 recovered, 420 remain unresolved (2,102 + 165 = 2,267)");
}

// 4. Named cases, including the ones that must NOT resolve.
const key = (c) => (place(c) || {}).key;
assert.strictEqual(key("Warren, MI 48092"), "c:warren");
assert.strictEqual(key("Highland Park, MI 48203"), "c:highland park");
assert.strictEqual(key("Detroit, MI 48216"), "c:detroit");
assert.strictEqual(key("Clinton Township"), "c:clinton township");
assert.strictEqual(key("Charter Township Of Clinton"), "c:clinton township");
assert.strictEqual(key("East Lansing"), "c:east lansing");
assert.strictEqual(key("Grosse Pointe Farms"), "c:grosse pointe");
assert.strictEqual(key("Grosse Pointe Shores"), "c:grosse pointe");
for (const bad of ["Warren, OH", "Troy, NY", "Warren, ZZ", "Windsor, MI", "Toledo, MI"]) {
  assert.strictEqual(place(bad), null, bad + ": a state that disagrees with the table city must not resolve");
}
assert.strictEqual(key("Windsor, ON"), "c:windsor");
assert.strictEqual(key("Toledo, OH 43604"), "c:toledo");
assert.strictEqual(key("Warren, mi 48092"), "c:warren");
for (const bad of ["2810 Russell St.", "Tech   Mount Clemens", "West", "Ottawa", "Maidstone", "Bowling Green"]) {
  assert.strictEqual(place(bad), null, bad + " must stay unresolved (never guessed)");
}
console.log("PASS: named cases; malformed records, Ottawa and Phase 2 cities stay unresolved");

// 4b. Grosse Pointe municipalities share one marker but keep their names on its label.
{
  const src = html.slice(html.indexOf("function buildPlaces()"), html.indexOf("let leafletMap"));
  const c2 = { resolvePlace: ctx.resolvePlace, matchesFilters: () => true, timeSortMinutes: () => 0 };
  const mk = (city, i) => ({ venue: "v" + i, city, date: "2026-10-20", time: "7 PM" });
  const run = (cities) => {
    c2.EVENTS = cities.map(mk);
    vm.createContext(c2);
    vm.runInContext(src + "\nthis.out=buildPlaces();", c2);
    return [...c2.out.values()];
  };
  let out = run(["Grosse Pointe Farms", "Grosse Pointe Shores", "Grosse Pointe Farms"]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].label, "Grosse Pointe (Farms, Shores)");
  assert.strictEqual(out[0].events.length, 3);
  out = run(["Grosse Pointe", "Grosse Pointe Shores"]);
  assert.strictEqual(out[0].label, "Grosse Pointe (incl. Shores)");
  out = run(["Grosse Pointe"]);
  assert.strictEqual(out[0].label, "Grosse Pointe");
  out = run(["Warren, MI 48092", "Warren"]);
  assert.strictEqual(out[0].label, "Warren");
  console.log("PASS: Grosse Pointe municipality names kept on the shared label");
}

// 5. Source values are preserved: resolution never rewrites the event.
const ev = { venue: "v", city: "Warren, MI 48092" };
ctx.resolvePlace(ev);
assert.strictEqual(ev.city, "Warren, MI 48092");
console.log("PASS: source city value untouched");

// 6. Blank city behaviour is unchanged in this PR (separate correction).
assert.strictEqual(place("").key, "c:detroit");
console.log("PASS: blank-city behaviour unchanged (handled in a separate PR)");

// 7. Radius filter shares the resolver.
assert.ok(/CityResolution\.resolve\(e\.city, CITY_LOOKUP\)/.test(html), "radius filter must use CityResolution");
console.log("PASS: radius filter uses the shared resolver");
