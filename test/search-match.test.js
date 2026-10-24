// test/search-match.test.js — the one search matcher for homepage, calendar and map (owner decision 2026-10-24).
//
// Checks the matcher itself (normalisation, word-by-word, "&"/"and", the seven fields, no description search, no fuzzy
// match), the verified aliases, the neighborhood attach used by calendar and map, and that all three pages use only it.
// Run: node test/search-match.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const SearchMatch = require("../search-match.js");
const { Discovery } = require("../discovery.js");
const M = (e, q, o) => SearchMatch.matches(e, q, o);
const ev = (o) => Object.assign({ id: "e1", title: "Shades of HUNKS", venue: "Dryden Bar and Grill", searchCity: "Dryden", cat: "nightlife",
  neighborhood: "Corktown", source: "Avenue Ticketing", description: "A very special night with the legendary Elvis tribute", date: "2026-11-15" }, o);
const LABEL = { categoryLabel: "Nightlife" };

// 1. normalisation
{
  const n = SearchMatch.normalize;
  assert.strictEqual(n("  Dryden   Bar & Grill "), "dryden bar and grill");
  assert.strictEqual(n("Beyoncé’s Café"), "beyonces cafe");
  assert.strictEqual(n("Rock+Roll, Inc."), "rock and roll inc");
  assert.strictEqual(n(null), "");
  console.log("PASS: normalisation (case, diacritics, &/+ as and, punctuation, whitespace)");
}

// 2. the five reported searches, on the record the owner expected
{
  const e = ev();
  for (const q of ["Dryden", "dryden", "hunks", "Shades of HUNKS", "Dryden Bar and Grill"]) assert.ok(M(e, q, LABEL), `"${q}" finds the event`);
  assert.ok(!M(e, "Dresden", LABEL), "Dresden does not falsely match Dryden");
  assert.ok(!M(ev({ title: "Dresden Dolls", venue: "Fillmore", searchCity: "Detroit" }), "Dryden", LABEL), "and Dryden does not match Dresden");
  console.log("PASS: Dryden, hunks, Shades of HUNKS and Dryden Bar and Grill match; Dresden never matches Dryden");
}

// 3. word by word, any order; "&" equals "and"; case-insensitive
{
  const e = ev();
  for (const q of ["hunks dryden", "shades hunks", "grill bar", "Dryden Bar & Grill", "DRYDEN bar AND grill", "hunks, dryden!"]) assert.ok(M(e, q, LABEL), `"${q}" matches`);
  assert.ok(M(ev({ venue: "Bar & Grill" }), "bar and grill", LABEL), "stored & matches typed and");
  assert.ok(!M(e, "hunks warren", LABEL), "every word must be found");
  assert.ok(M(e, "", LABEL) && M(e, "   ", LABEL), "an empty search matches everything");
  console.log("PASS: multiword in any order, &/and equivalence, case-insensitive, every word required");
}

// 4. all seven fields, each on its own
{
  const base = { id: "x", title: "T", venue: "V", searchCity: "", cat: "music", neighborhood: "", source: "" };
  assert.ok(M(Object.assign({}, base, { title: "Zebra night" }), "zebra", LABEL), "title");
  assert.ok(M(Object.assign({}, base, { venue: "Zebra Hall" }), "zebra", LABEL), "venue name");
  assert.ok(M(Object.assign({}, base, { searchCity: "Zebraville" }), "zebraville", LABEL), "city");
  assert.ok(M(Object.assign({}, base, { searchCity: "Clinton Twp" }), "clinton township", LABEL), "verified alias: Twp is Township");
  assert.ok(M(Object.assign({}, base, { searchCity: "Clinton Township" }), "clinton twp", LABEL), "verified alias: Township is Twp");
  assert.ok(M(Object.assign({}, base, { searchCity: "Grosse Pointe Farms" }), "grosse pointe", LABEL), "verified alias: Grosse Pointe Farms answers to Grosse Pointe");
  assert.ok(M(Object.assign({}, base, { searchCity: "Grosse Pointe Shores" }), "grosse pointe", LABEL), "verified alias: Grosse Pointe Shores answers to Grosse Pointe");
  assert.ok(M(Object.assign({}, base, { cat: "theatre" }), "comedy", { categoryLabel: "Theatre & Comedy" }), "category label");
  assert.ok(M(Object.assign({}, base, { neighborhood: "Corktown" }), "corktown", LABEL), "neighborhood");
  assert.ok(M(Object.assign({}, base, { source: "Ticketmaster" }), "ticketmaster", LABEL), "source");
  assert.ok(M(Object.assign({}, base, { searchCity: "Detroit" }), "detroit", LABEL), "city Detroit is searchable even though cards hide it");
  assert.ok(M({ id: "x", title: "T", venue: "V", city: "Warren", cat: "music" }, "warren", LABEL), "falls back to the display city when no searchCity");
  console.log("PASS: title, venue, city, verified aliases, category, neighborhood and source are each searchable");
}

// 5. what is NOT searched, and nothing guessed
{
  const e = ev({ description: "Features the legendary Elvis tribute at the Zebra lounge" });
  assert.ok(!M(e, "elvis", LABEL) && !M(e, "zebra", LABEL), "descriptions are not searched (owner decision 2026-10-24)");
  assert.ok(!M(ev({ searchCity: "Warren" }), "warren, mi 48092 township", LABEL), "no alias is invented");
  assert.ok(!M(ev({ searchCity: "Clinton Township" }), "grosse pointe", LABEL), "aliases do not leak across cities");
  // a reviewed alias table can plug in, and only through the resolver
  SearchMatch.setAliasResolver((c) => (c === "Mt Clemens" ? ["mount clemens"] : []));
  assert.ok(M(ev({ searchCity: "Mt Clemens" }), "mount clemens", LABEL), "a reviewed alias from Platform's table is honoured");
  SearchMatch.setAliasResolver(null);
  assert.ok(!M(ev({ searchCity: "Mt Clemens" }), "mount clemens", LABEL), "and is gone when the resolver is removed");
  console.log("PASS: no description search, no invented aliases, reviewed aliases only through the resolver");
}

// 6. nothing the old homepage matched stops matching
{
  const e = ev({ title: "Jazz at the Fox", venue: "Fox Theatre", searchCity: "Detroit", neighborhood: "Midtown", source: "Ticketmaster" });
  for (const q of ["jazz at the", "fox theatre", "ox the", "midtown", "ticketmaster", "nightlife", "theatre", "at the fox"]) assert.ok(M(e, q, LABEL), `old query "${q}" still matches`);
  assert.ok(M(e, "ox the", LABEL), "a phrase inside a word run still matches (substring behaviour kept)");
  assert.ok(!M(e, "xx", LABEL), "two-letter words must start a word, not sit inside one");
  assert.ok(M(e, "fo", LABEL), "two-letter words match a word start");
  console.log("PASS: every old adjacent-phrase search still matches; short words start a word");
}

// 7. one implementation: Discovery (homepage) agrees with the module for the same event and query
{
  const state = (q) => Discovery.change(Discovery.defaults(), { q });
  const ctx = { now: new Date("2026-10-24T17:00:00Z"), defaultWhen: "all" };
  const e = Object.assign(ev(), { city: "Dryden" });
  for (const q of ["Dryden", "hunks dryden", "Dryden Bar & Grill", "Dresden", "nightlife", "corktown", "avenue"]) {
    assert.strictEqual(Discovery.matches(e, state(q), ctx), M(e, q, { categoryLabel: "Nightlife" }), `homepage and module agree on "${q}"`);
  }
  console.log("PASS: the homepage engine returns exactly the module's answer");
}

// 8. neighborhood attach for calendar and map
{
  const events = [{ id: "a" }, { id: "b" }, { id: "c" }];
  let askedUrl = "";
  const fake = (url) => { askedUrl = url; return Promise.resolve({ rows: [{ id: "a", neighborhood: "Corktown" }, { id: "zzz", neighborhood: "Nowhere" }] }); };
  SearchMatch.attachNeighborhoods(events, fake, "https://x.supabase.co", { apikey: "k" }, "2026-10-16").then((n) => {
    assert.strictEqual(n, 1);
    assert.strictEqual(events[0].neighborhood, "Corktown");
    assert.ok(events[1].neighborhood === undefined, "events without a neighborhood are untouched");
    assert.ok(/events_public\?neighborhood=not\.is\.null&start_date=gte\.2026-10-16&select=id,neighborhood/.test(askedUrl), "asks the public view for id and neighborhood only: " + askedUrl);
    assert.ok(!/[?&](limit|offset)=/.test(askedUrl), "paging is fetchAllRows's job");
    console.log("PASS: neighborhood is attached from the public view (id + neighborhood only)");
  }).catch((e) => { console.error("FAIL:", e); process.exit(1); });
}

// 9. the three pages use the one module and keep no private matcher
{
  for (const f of ["index.html", "calendar.html", "map.html"]) {
    const h = read(f);
    const m = h.indexOf('src="/search-match.js"');
    assert.ok(m !== -1, `${f} loads /search-match.js`);
    if (f === "index.html") assert.ok(m < h.indexOf('src="/discovery.js"'), "index loads it before discovery.js");
    assert.ok(/searchCity:/.test(h), `${f} gives the matcher the full city (Detroit included)`);
  }
  for (const f of ["calendar.html", "map.html"]) {
    const h = read(f);
    assert.ok(/SearchMatch\.matches\(e, query\)/.test(h), `${f} filters with SearchMatch.matches`);
    assert.ok(!/e\.title\.toLowerCase\(\)\.includes\(q\)/.test(h), `${f} keeps no private title/venue substring test`);
    assert.ok(/SearchMatch\.attachNeighborhoods\(/.test(h), `${f} attaches neighborhoods for search`);
  }
  const d = read("discovery.js");
  assert.ok(/sharedSearch\(\)\.matches\(/.test(d) && !/hay\.indexOf|haystack/.test(d), "discovery.js delegates to the shared matcher");
  console.log("PASS: homepage, calendar and map use only search-match.js; no page keeps its own matcher");
}
