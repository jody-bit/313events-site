// test/discovery.test.js — the rules in discovery.js, one by one.
//
// discovery.js is the single shared definition of WHEN + WHERE + WHAT +
// SEARCH (see its header). This file pins down every rule it states:
// definitions, canonical state, change(), each dimension's semantics,
// counting, describe(), the URL codec, href(), the inventory filter, the
// declared/derived feature distinction, and genre-readiness.
//
// Companion: test/discovery-compat.test.js proves the same rules reproduce
// what the live pages do today and that old and new links interoperate.
//
// Run: node test/discovery.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SRC = fs.readFileSync(`${REPO_DIR}/discovery.js`, "utf8");
const { Discovery: D, _build, _defaultConfig } = require(`${REPO_DIR}/discovery.js`);

// Saturday 2026-10-03, 3:00 PM in Detroit (EDT, UTC-4).
const NOW = new Date("2026-10-03T19:00:00Z");
const TODAY = "2026-10-03";
const CTX = { now: NOW };
const day = (n) => new Date(Date.UTC(2026, 9, 3 + n)).toISOString().slice(0, 10);

let seq = 0;
const ev = (o) => Object.assign({ id: "e" + ++seq, date: TODAY, title: "Event", venue: "Venue", cat: "music", time: "", free: false, source: "Manual" }, o);
const st = (patch) => D.change(D.defaults(), patch);
const yes = (e, s, ctx, msg) => assert.strictEqual(D.matches(e, s, ctx || CTX), true, msg);
const no = (e, s, ctx, msg) => assert.strictEqual(D.matches(e, s, ctx || CTX), false, msg);
const plain = (x) => JSON.parse(JSON.stringify(x));

function run() {
  // =================================================================
  // A. What kind of file this is
  // =================================================================
  {
    // Loads with NOTHING available: no window, document, fetch or module.
    const bare = vm.createContext({});
    const before = new Set(Object.getOwnPropertyNames(vm.runInContext("globalThis", bare)));
    vm.runInContext(SRC, bare);
    const added = Object.getOwnPropertyNames(vm.runInContext("globalThis", bare)).filter((k) => !before.has(k));
    assert.deepStrictEqual(added, ["Discovery"], "exactly one global is defined");
    assert.strictEqual(vm.runInContext("typeof Discovery.matches", bare), "function");

    // Loads beside a page that still declares its own copies of everything
    // (calendar.html and map.html today) without a name collision.
    const page = vm.createContext({});
    vm.runInContext("var window = globalThis; const CATS = {}; const LOCATIONS = []; const CITY_LOOKUP = new Map(); const FEATURE_CHIPS = []; function matchesFilters(){ return 'page'; } function haversineMiles(){ return 'page'; } let activeCats = new Set();", page);
    vm.runInContext(SRC, page);
    assert.strictEqual(vm.runInContext("matchesFilters() + '|' + haversineMiles() + '|' + typeof Discovery.matches", page), "page|page|function");

    // No DOM, network or storage anywhere in the code (comments excluded).
    const code = SRC.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    for (const banned of [/\bdocument\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bfetch\s*\(/, /XMLHttpRequest/, /\bnavigator\b/, /\bhistory\b/, /\blocation\./, /\bsetTimeout\b/, /\brequire\s*\(/]) {
      assert.ok(!banned.test(code), `discovery.js must not use ${banned}`);
    }
    const windowLines = code.split("\n").filter((l) => /\bwindow\b/.test(l)).map((l) => l.trim());
    assert.deepStrictEqual(windowLines, [
      "window: windowFor,",
      '(typeof window !== "undefined" ? window : globalThis).Discovery = Discovery;',
    ], "`window` is touched only to export the one global (the other line is the public window() function)");

    // Encoding-proof: a page or server that mis-declares the charset cannot
    // corrupt a label (found in a real browser run: "10 mi \u00c2\u00b7 Ann Arbor").
    assert.ok(!/[^\x00-\x7F]/.test(code), "no non-ASCII characters outside comments");

    assert.ok(Object.isFrozen(D) && Object.isFrozen(D.categories) && Object.isFrozen(D.categories[0]) && Object.isFrozen(D.places[0]) && Object.isFrozen(D.features[0]));
    assert.throws(() => { D.categories.push({}); }, TypeError);
    assert.throws(() => { D.matches = null; }, TypeError);
    assert.strictEqual(D.VERSION, 1);
    assert.deepStrictEqual(Object.keys(D), [
      "VERSION", "categories", "features", "places", "whens", "radii",
      "defaults", "normalize", "change", "toQuery", "fromQuery", "href",
      "matches", "window", "count", "facets", "featuresOf", "describe", "inventoryFilter",
    ], "the public interface is exactly this");
  }
  console.log("PASS: one global, loads with no DOM/network/storage, coexists with pages' own copies, frozen, interface as approved");

  // =================================================================
  // B. Definitions
  // =================================================================
  {
    assert.deepStrictEqual(D.categories.map((c) => c.key), ["music", "theatre", "dance", "visual", "museum", "family", "fest", "food", "film", "nightlife", "sports", "community", "vendor", "training", "gaming"]);
    assert.ok(D.categories.every((c) => Array.isArray(c.children) && c.children.length === 0), "no category has children: no genre is exposed");
    assert.deepStrictEqual(D.features.map((f) => `${f.key}:${f.kind}`), ["tickets:derived", "photo:derived", "submitted:derived", "radar:derived", "clothing_optional:declared"]);
    assert.ok(D.features.every((f) => Object.keys(f).join() === "key,label,kind"), "feature definitions are plain data");
    assert.deepStrictEqual(D.whens.map((w) => w.key), ["today", "tonight", "tomorrow", "weekend", "next7", "week", "all", "dates"]);
    assert.deepStrictEqual(plain(D.radii), [5, 10, 25, 50, "orbit"]);
    assert.strictEqual(D.places.length, 96);
    assert.deepStrictEqual(plain(D.places[0]), { name: "Detroit", type: "city", region: "Michigan", lat: 42.3314, lng: -83.0458 });
    assert.strictEqual(new Set(D.places.map((p) => p.name.toLowerCase())).size, 96, "place names are unique");
    // Every city in the table is inside the Orbit, so "a radius stays
    // inside the Orbit" never removes a place the table offers.
    const orbit = st({ where: { radius: "orbit" } });
    D.places.filter((p) => p.type === "city").forEach((p) => yes(ev({ city: p.name === "Detroit" ? undefined : p.name }), orbit, CTX, `${p.name} is inside the Orbit`));
  }
  console.log("PASS: 15 categories (no children), 4 derived + 1 declared feature, 8 WHEN modes, 5 radii, 96 places all inside the Orbit");

  // =================================================================
  // C. State
  // =================================================================
  {
    const d = D.defaults();
    assert.deepStrictEqual(plain(d), {
      when: { mode: null, from: null, to: null },
      where: { place: null, radius: null, neighborhood: null, here: null },
      what: { paths: [], free: false, features: [] },
      q: "",
    });
    assert.strictEqual(D.defaults(), d);
    assert.strictEqual(D.normalize(d), d, "a canonical state normalizes to itself");
    assert.ok(Object.isFrozen(d) && Object.isFrozen(d.when) && Object.isFrozen(d.what.paths));
    for (const junk of [null, undefined, 42, "x", [], [1, 2], { when: 7, where: "nope", what: [], q: {} }, { when: { mode: "yesterday" } }]) {
      assert.deepStrictEqual(plain(D.normalize(junk)), plain(d), `garbage in, defaults out: ${JSON.stringify(junk)}`);
    }

    // WHEN
    const w = (x) => plain(D.normalize({ when: x }).when);
    assert.deepStrictEqual(w("weekend"), { mode: "weekend", from: null, to: null });
    assert.deepStrictEqual(w({ mode: "today", from: "2026-10-10", to: "2026-10-11" }), { mode: "today", from: null, to: null }, "from/to belong to 'dates' only");
    assert.deepStrictEqual(w({ mode: "dates", from: "2026-10-12" }), { mode: "dates", from: "2026-10-12", to: "2026-10-12" });
    assert.deepStrictEqual(w({ mode: "dates", to: "2026-10-12" }), { mode: "dates", from: "2026-10-12", to: "2026-10-12" });
    assert.deepStrictEqual(w({ mode: "dates", from: "2026-10-18", to: "2026-10-12" }), { mode: "dates", from: "2026-10-12", to: "2026-10-18" }, "reversed dates are put in order");
    assert.deepStrictEqual(w({ from: "2026-10-12", to: "2026-10-18" }), { mode: "dates", from: "2026-10-12", to: "2026-10-18" }, "bare from/to is a date pick");
    assert.deepStrictEqual(w({ mode: "dates" }), { mode: null, from: null, to: null });
    assert.deepStrictEqual(w({ mode: "dates", from: "2026-02-30", to: "tomorrow" }), { mode: null, from: null, to: null }, "impossible and malformed dates are rejected");

    // WHERE
    const wh = (x) => plain(D.normalize({ where: x }).where);
    assert.deepStrictEqual(wh({ place: "  ann ARBOR " }), { place: "Ann Arbor", radius: "orbit", neighborhood: null, here: null }, "place is matched case-insensitively and given the widest tier");
    assert.deepStrictEqual(wh({ place: "Atlantis", radius: 25 }), { place: null, radius: null, neighborhood: null, here: null });
    assert.strictEqual(wh({ place: "Ann Arbor", radius: "all" }).radius, "orbit", "legacy 'all' is the Orbit");
    assert.strictEqual(wh({ place: "Ann Arbor", radius: "25" }).radius, 25);
    assert.strictEqual(wh({ place: "Ann Arbor", radius: 75 }).radius, "orbit", "an unsupported number falls back to the Orbit");
    assert.strictEqual(wh({ radius: 25 }).radius, null, "a distance with nothing to measure from means nothing");
    assert.strictEqual(wh({ radius: "orbit" }).radius, "orbit", "the Orbit needs no origin");
    assert.deepStrictEqual(wh({ place: "Ann Arbor", here: { lat: 42.3, lng: -83.1 }, radius: 10 }), { place: null, radius: 10, neighborhood: null, here: { lat: 42.3, lng: -83.1 } }, "one origin at a time; device location wins");
    assert.strictEqual(wh({ here: { lat: "42", lng: null } }).here, null);
    assert.strictEqual(wh({ neighborhood: "  Corktown " }).neighborhood, "Corktown");
    assert.strictEqual(wh({ place: "Corktown" }).place, "Corktown", "a neighborhood can be an origin");

    // WHAT
    const wt = (x) => plain(D.normalize({ what: x }).what);
    assert.deepStrictEqual(wt({ paths: ["film", "bogus", "music", "film", "music.electronic"] }).paths, ["music", "film"], "unknown and duplicate paths dropped; canonical order");
    assert.deepStrictEqual(wt({ paths: "film,music" }).paths, ["music", "film"]);
    assert.deepStrictEqual(wt({ paths: D.categories.map((c) => c.key) }).paths, [], "every category selected is the same as none");
    assert.deepStrictEqual(wt({ features: ["radar", "nope", "tickets", "radar"] }).features, ["tickets", "radar"]);
    for (const truthy of [true, 1, "1"]) assert.strictEqual(wt({ free: truthy }).free, true);
    for (const falsy of [false, 0, "0", "true", "yes", null, undefined]) assert.strictEqual(wt({ free: falsy }).free, false);
    assert.strictEqual(D.normalize({ q: "  jazz  trio " }).q, "jazz  trio");
    assert.strictEqual(D.normalize({ q: "x".repeat(500) }).q.length, 200);
  }
  console.log("PASS: canonical state — defaults, immutability, and normalization of WHEN, WHERE, WHAT and search from any input");

  {
    const base = st({ what: { only: "music" }, q: "jazz" });
    const frozenCopy = JSON.stringify(base);
    // WHAT: positive / additive
    assert.deepStrictEqual(plain(st({ what: { only: "music" } }).what.paths), ["music"], "a plain selection shows that category");
    assert.deepStrictEqual(plain(D.change(base, { what: { only: "film" } }).what.paths), ["film"], "…and replaces the previous one");
    assert.deepStrictEqual(plain(D.change(base, { what: { add: "visual" } }).what.paths), ["music", "visual"], "add is the explicit multi-select");
    assert.deepStrictEqual(plain(D.change(base, { what: { add: "music" } }).what.paths), ["music"]);
    assert.deepStrictEqual(plain(D.change(base, { what: { remove: "music" } }).what.paths), [], "removing the last selection returns to ALL EVENTS");
    assert.deepStrictEqual(plain(D.change(D.change(base, { what: { add: "visual" } }), { what: { remove: "music" } }).what.paths), ["visual"]);
    assert.deepStrictEqual(plain(D.change(base, { what: { clear: true } }).what.paths), []);
    assert.deepStrictEqual(plain(D.change(base, { what: { only: "bogus" } }).what.paths), ["music"], "an unknown category changes nothing");
    assert.deepStrictEqual(plain(D.change(base, { what: { add: "music.electronic" } }).what.paths), ["music"], "a genre path cannot be selected: it is not a known node");
    // WHEN
    assert.strictEqual(D.change(base, { when: "weekend" }).when.mode, "weekend");
    assert.strictEqual(D.change(st({ when: "weekend" }), { when: null }).when.mode, null);
    assert.deepStrictEqual(plain(D.change(base, { when: { from: "2026-10-12", to: "2026-10-18" } }).when), { mode: "dates", from: "2026-10-12", to: "2026-10-18" });
    // WHERE
    const aa = D.change(base, { where: { place: "Ann Arbor", radius: 25 } });
    assert.deepStrictEqual(plain(aa.where), { place: "Ann Arbor", radius: 25, neighborhood: null, here: null });
    assert.strictEqual(D.change(aa, { where: { radius: 10 } }).where.place, "Ann Arbor", "where patches merge");
    assert.deepStrictEqual(plain(D.change(aa, { where: { place: null } }).where), { place: null, radius: null, neighborhood: null, here: null }, "removing the origin removes the distance measured from it");
    const here = D.change(aa, { where: { here: { lat: 42.33, lng: -83.05 } } });
    assert.strictEqual(here.where.place, null);
    assert.strictEqual(D.change(here, { where: { place: "Flint" } }).where.here, null);
    assert.strictEqual(D.change(D.change(aa, { where: { neighborhood: "Corktown" } }), { where: { place: null } }).where.neighborhood, "Corktown");
    assert.deepStrictEqual(plain(D.change(D.change(aa, { where: { neighborhood: "Corktown" } }), { where: null }).where), plain(D.defaults().where));
    // free / features / q / reset
    assert.strictEqual(D.change(base, { free: true }).what.free, true);
    const f2 = D.change(D.change(base, { feature: { add: "radar" } }), { feature: { add: "clothing_optional" } });
    assert.deepStrictEqual(plain(f2.what.features), ["radar", "clothing_optional"]);
    assert.deepStrictEqual(plain(D.change(f2, { feature: { remove: "radar" } }).what.features), ["clothing_optional"]);
    assert.deepStrictEqual(plain(D.change(f2, { feature: { clear: true } }).what.features), []);
    assert.deepStrictEqual(plain(D.change(f2, { feature: { add: "clothing_required" } }).what.features), ["radar", "clothing_optional"], "there is no such feature");
    assert.strictEqual(D.change(base, { q: "  bahamas " }).q, "bahamas");
    assert.strictEqual(D.change(base, { q: null }).q, "");
    assert.deepStrictEqual(plain(D.change(f2, { reset: true })), plain(D.defaults()));
    assert.deepStrictEqual(plain(D.change(f2, { reset: true, where: { neighborhood: "Corktown" } }).where.neighborhood), "Corktown", "reset then apply, in one patch");
    // purity
    assert.strictEqual(JSON.stringify(base), frozenCopy, "change() never mutates its input");
    assert.ok(Object.isFrozen(aa) && Object.isFrozen(aa.where));
    assert.strictEqual(D.change(base, {}), base, "an empty patch on a canonical state is still canonical and equal");
  }
  console.log("PASS: change() — additive WHAT (only / add / remove / clear), WHEN, merged WHERE, free, features, search, reset; never mutates");

  // =================================================================
  // D. WHAT
  // =================================================================
  {
    const music = ev({ cat: "music" }), film = ev({ cat: "film" }), odd = ev({ cat: "unlisted" });
    [music, film, odd].forEach((e) => yes(e, D.defaults(), CTX, "nothing selected shows everything, including a category this file does not know"));
    yes(music, st({ what: { only: "music" } })); no(film, st({ what: { only: "music" } }));
    const both = D.change(st({ what: { only: "music" } }), { what: { add: "film" } });
    yes(music, both); yes(film, both); no(ev({ cat: "sports" }), both, CTX, "OR within WHAT");
    no(odd, both);

    // AND with free / features
    const freeMusic = D.change(st({ what: { only: "music" } }), { free: true });
    yes(ev({ cat: "music", free: true }), freeMusic); no(ev({ cat: "music", free: false }), freeMusic); no(ev({ cat: "film", free: true }), freeMusic);
    const tp = D.change(st({ feature: { add: "tickets" } }), { feature: { add: "photo" } });
    yes(ev({ ticketUrl: "https://t", imageUrl: "https://i" }), tp);
    no(ev({ ticketUrl: "https://t" }), tp, CTX, "features are AND'd");
    yes(ev({ source: "Venue Submission" }), st({ feature: { add: "submitted" } })); no(ev({ source: "Ticketmaster" }), st({ feature: { add: "submitted" } }));

    // 'radar' reads coverage as a Set, a Map or a plain object
    const covered = ev({}), radar = st({ feature: { add: "radar" } });
    for (const coverage of [new Set([covered.id]), new Map([[covered.id, [{}]]]), { [covered.id]: [{}] }]) {
      yes(covered, radar, { now: NOW, coverage }); no(ev({}), radar, { now: NOW, coverage });
    }
    no(covered, radar, CTX, "no coverage data, no claim");
  }
  console.log("PASS: WHAT — empty means all, OR within categories, AND with free and each feature; derived features");

  {
    // DECLARED vs DERIVED: clothing optional
    const co = st({ feature: { add: "clothing_optional" } });
    yes(ev({ clothingOptional: true }), co);
    for (const notAsserted of [false, undefined, null, 0, 1, "true", "false", "yes"]) {
      no(ev({ clothingOptional: notAsserted }), co, CTX, `clothingOptional=${JSON.stringify(notAsserted)} asserts nothing`);
    }
    assert.deepStrictEqual(D.featuresOf(ev({ clothingOptional: true }), CTX), ["clothing_optional"]);
    assert.deepStrictEqual(D.featuresOf(ev({ clothingOptional: false }), CTX), [], "false produces no label and no feature");
    assert.deepStrictEqual(D.featuresOf(ev({}), CTX), [], "unset produces no label and no feature");
    assert.deepStrictEqual(D.featuresOf(ev({ clothingOptional: true, ticketUrl: "x", imageUrl: "y" }), CTX), ["tickets", "photo", "clothing_optional"]);
    assert.deepStrictEqual(D.featuresOf(null, CTX), []);
    // There is no way to ask for, label or count the opposite.
    assert.ok(!D.features.some((f) => /required|clothed|non.?nud/i.test(f.key + " " + f.label)));
    assert.ok(!/clothing[ _-]?required/i.test(SRC.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")), "no code path mentions 'clothing required'");
    // An event that asserts nothing is not excluded from ordinary discovery.
    yes(ev({ clothingOptional: false }), D.defaults()); yes(ev({}), D.defaults());
    assert.deepStrictEqual(D.describe(co).map((d) => d.label), ["Clothing optional"]);
    assert.strictEqual(D.facets([ev({ clothingOptional: true }), ev({ clothingOptional: false }), ev({})], D.defaults(), CTX, "feature").get("clothing_optional"), 1);
  }
  console.log("PASS: declared features — clothing optional applies only when true; false/unset asserts nothing; no 'clothing required' exists");

  // =================================================================
  // E. SEARCH
  // =================================================================
  {
    const e = ev({ title: "Bahamas", venue: "El Club", city: "Hamtramck", cat: "music", neighborhood: "North End", source: "Resident Advisor", note: "Doors at eight", description: "zebra" });
    for (const q of ["bahamas", "BAHAMAS", "el club", "hamtramck", "music", "north end", "resident advisor", "doors at"]) yes(e, st({ q }), CTX, `search finds "${q}"`);
    no(e, st({ q: "zebra" }), CTX, "description is not part of the search text");
    no(e, st({ q: "bahamas zzz" }));
    yes(ev({ title: "No extras" }), st({ q: "no extras" }), CTX, "missing optional fields are fine");
    no(ev({ title: "Local show" }), st({ q: "detroit" }), CTX, "Detroit events store no city, exactly as the pages do today");
  }
  console.log("PASS: SEARCH — one haystack (title, venue, city, category label, neighborhood, source, note), case-insensitive");

  // =================================================================
  // F. WHERE
  // =================================================================
  {
    const cork = st({ where: { neighborhood: "Corktown" } });
    yes(ev({ neighborhood: "Corktown" }), cork); no(ev({ neighborhood: "North Corktown" }), cork, CTX, "neighborhood is an exact match"); no(ev({}), cork);

    const lansing = D.places.find((p) => p.name === "Lansing"), detroit = D.places[0];
    const R = 3958.8, rad = Math.PI / 180;
    const hav = (a, b) => { const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2; return R * 2 * Math.asin(Math.sqrt(x)); };
    assert.ok(hav(detroit, lansing) > 75, "Lansing is more than 75 miles from Detroit's CENTRE…");
    yes(ev({ city: "Lansing" }), st({ where: { radius: "orbit" } }), CTX, "…and inside the Orbit, because the Orbit is measured from Detroit's BORDER (DEC-003)");

    const mystery = ev({ city: "Richmond" });
    yes(mystery, D.defaults(), CTX, "an event in an unlisted city is still an event");
    no(mystery, st({ where: { radius: "orbit" } }), CTX, "…but cannot be placed, so no distance filter includes it");
    no(mystery, st({ where: { place: "Detroit", radius: 50 } }));

    const aa10 = st({ where: { place: "Ann Arbor", radius: 10 } });
    yes(ev({ city: "Ypsilanti" }), aa10); yes(ev({ city: "Ann Arbor" }), aa10); no(ev({}), aa10, CTX, "Detroit is not within 10 miles of Ann Arbor"); no(ev({ city: "Flint" }), aa10);
    yes(ev({}), st({ where: { place: "Ann Arbor", radius: "orbit" } }), CTX, "the Orbit tier is not narrowed by the chosen place");
    yes(ev({ city: "ann arbor" }), aa10, CTX, "city names match case-insensitively");

    const near = st({ where: { here: { lat: 42.2808, lng: -83.743 }, radius: 10 } });
    yes(ev({ city: "Ypsilanti" }), near); no(ev({}), near);
    yes(ev({}), st({ where: { place: "Corktown", radius: 5 } }), CTX, "from a neighborhood origin, Detroit events are measured at Detroit's centre — city-level, as labelled");

    const both = st({ where: { place: "Ann Arbor", radius: 10, neighborhood: "Corktown" } });
    no(ev({ city: "Ypsilanti" }), both, CTX, "neighborhood AND radius are both applied");
  }
  console.log("PASS: WHERE — exact neighborhood, city-centre radius, Orbit from Detroit's border, device origin, unplaceable events never guessed");

  // =================================================================
  // G. WHEN
  // =================================================================
  {
    // "Today" is Detroit's, whatever the visitor's clock or timezone says.
    const lateNight = { now: new Date("2026-10-04T03:30:00Z") }; // Oct 3, 11:30 PM in Detroit; already Oct 4 in UTC
    const today = st({ when: "today" });
    yes(ev({ date: "2026-10-03" }), today, lateNight); no(ev({ date: "2026-10-04" }), today, lateNight);
    const afterMidnight = { now: new Date("2026-10-04T04:30:00Z") }; // Oct 4, 12:30 AM in Detroit
    no(ev({ date: "2026-10-03" }), today, afterMidnight); yes(ev({ date: "2026-10-04" }), today, afterMidnight);
    const winter = { now: new Date("2026-12-15T04:30:00Z") }; // Dec 14, 11:30 PM EST (UTC-5)
    assert.strictEqual(D.window(today, winter).from, "2026-12-14", "standard time is handled too");
    assert.strictEqual(D.window(today, { now: "2026-10-03T19:00:00Z" }).from, TODAY, "now may be an ISO string");
    assert.strictEqual(D.window(today, { now: NOW.getTime() }).from, TODAY, "…or milliseconds");
  }
  console.log("PASS: WHEN — 'today' is America/Detroit time across midnight, UTC date change and standard time");

  {
    const all = st({ when: "all" }), today = st({ when: "today" });
    // What "current" means.
    yes(ev({ date: day(0) }), all); yes(ev({ date: day(40) }), all); no(ev({ date: day(-1) }), all, CTX, "a single-day event from yesterday is over");
    no(ev({ date: day(-1), endDate: null }), all, CTX, "no end date means a single-day event");
    no(ev({ date: day(-1), endDate: day(-5) }), all, CTX, "an end date before the start is ignored");
    yes(ev({ date: day(-1), endDate: day(1) }), all, CTX, "an event in progress is current");
    yes(ev({ date: day(-1), endDate: day(1) }), today, CTX, "…and it is on today");
    yes(ev({ date: day(-300), endDate: day(60) }), today, CTX, "a long-running exhibition is on today");
    no(ev({ date: day(-10), endDate: day(-1) }), all, CTX, "a run that ended yesterday is over");
    yes(ev({ date: day(-10), endDate: day(0) }), today, CTX, "its last day still counts");

    // Over by the clock: only on the last day, only when an end time is known. NOW is 3:00 PM.
    no(ev({ time: "10:00 AM–2:00 PM" }), today, CTX, "ended at 2 PM");
    yes(ev({ time: "10:00 AM–4:00 PM" }), today, CTX, "still running at 3 PM");
    yes(ev({ time: "1:00 PM" }), today, CTX, "began already, no known end: still shown");
    yes(ev({ time: "Morning" }), today); yes(ev({ time: "" }), today);
    yes(ev({ time: "10:00 PM–2:00 AM" }), today, { now: new Date("2026-10-04T03:30:00Z") }, "a range that crosses midnight is not cut off early");
    no(ev({ time: "10:00 AM–2:00 PM" }), all, CTX, "an event that is over is over in every forward-looking view");
    no(ev({ time: "10:00 AM–2:00 PM" }), st({ when: "weekend" })); no(ev({ time: "10:00 AM–2:00 PM" }), st({ when: "week" })); no(ev({ time: "10:00 AM–2:00 PM" }), st({ when: { from: day(0), to: day(0) } }));
    yes(ev({ date: day(-1), endDate: day(1), time: "9:00 AM–1:00 PM" }), today, CTX, "a multi-day event is not over just because today's hours have passed — it runs tomorrow");
    no(ev({ date: day(-1), endDate: day(0), time: "9:00 AM–1:00 PM" }), today, CTX, "…but on its last day, it is");
  }
  console.log("PASS: WHEN — current vs over: in-progress events are current; no end date is single-day; over only after the last day's known end");

  {
    const tonight = st({ when: "tonight" });
    yes(ev({ time: "7:30 PM" }), tonight); yes(ev({ time: "5:00 PM" }), tonight); yes(ev({ time: "Evening" }), tonight); yes(ev({ time: "5:30–11:00 PM" }), tonight);
    no(ev({ time: "4:59 PM" }), tonight); no(ev({ time: "2:00 PM" }), tonight); no(ev({ time: "" }), tonight, CTX, "an unknown time is not confidently tonight"); no(ev({ time: "Varies" }), tonight);
    no(ev({ date: day(1), time: "8:00 PM" }), tonight);
    yes(ev({ date: day(-1), endDate: day(1), time: "8:00 PM" }), tonight, CTX, "a multi-day run with evening hours is on tonight");

    const tomorrow = st({ when: "tomorrow" });
    yes(ev({ date: day(1) }), tomorrow); no(ev({ date: day(0) }), tomorrow); no(ev({ date: day(2) }), tomorrow); yes(ev({ date: day(-1), endDate: day(1) }), tomorrow);

    // next7 = today plus six days
    const next7 = st({ when: "next7" });
    yes(ev({ date: day(0) }), next7); yes(ev({ date: day(6) }), next7); no(ev({ date: day(7) }), next7);
    assert.deepStrictEqual(plain(D.window(next7, CTX)), { mode: "next7", from: day(0), to: day(6), empty: false });

    // dates
    const range = st({ when: { from: day(9), to: day(15) } });
    yes(ev({ date: day(9) }), range); yes(ev({ date: day(15) }), range); no(ev({ date: day(8) }), range); no(ev({ date: day(16) }), range);
    yes(ev({ date: day(5), endDate: day(10) }), range, CTX, "a run overlapping the range is in it");
    const pastPick = st({ when: { from: day(-5), to: day(-3) } });
    no(ev({ date: day(-4) }), pastPick, CTX, "a past date pick shows nothing on a forward-looking surface");
    assert.strictEqual(D.window(pastPick, CTX).empty, true, "…and says so, so a surface can respond");
    yes(ev({ date: day(-4) }), pastPick, { now: NOW, includePast: true });

    assert.deepStrictEqual(plain(D.window(st({ when: "all" }), CTX)), { mode: "all", from: TODAY, to: null, empty: false });
    assert.deepStrictEqual(plain(D.window(tomorrow, CTX)), { mode: "tomorrow", from: day(1), to: day(1), empty: false });
  }
  console.log("PASS: WHEN — tonight (5 PM or later, 'Evening', unknown excluded), tomorrow, next 7 days, picked dates and ranges");

  {
    // weekend = Fri–Sun, week = Mon–Sun, evaluated on every day of a week.
    // 2026-09-28 is a Monday.
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    names.forEach((name, i) => {
      const iso = new Date(Date.UTC(2026, 8, 28 + i)).toISOString().slice(0, 10);
      const ctx = { now: new Date(`${iso}T16:00:00Z`) }; // noon in Detroit
      const wk = D.window(st({ when: "weekend" }), ctx), we = D.window(st({ when: "week" }), ctx);
      const nominalFri = "2026-10-02";
      assert.strictEqual(wk.to, "2026-10-04", `${name}: the weekend ends Sunday Oct 4`);
      assert.strictEqual(wk.from, iso > nominalFri ? iso : nominalFri, `${name}: the weekend starts Friday, or today once it is under way`);
      assert.strictEqual(we.to, "2026-10-04", `${name}: the week ends Sunday`);
      assert.strictEqual(we.from, iso, `${name}: what is left of the week starts today`);
      ["2026-10-02", "2026-10-03", "2026-10-04"].forEach((d) => {
        assert.strictEqual(D.matches(ev({ date: d }), st({ when: "weekend" }), ctx), d >= iso, `${name}: weekend event on ${d}`);
      });
      assert.strictEqual(D.matches(ev({ date: "2026-10-05" }), st({ when: "weekend" }), ctx), false, `${name}: Monday is not this weekend`);
      assert.strictEqual(D.matches(ev({ date: "2026-10-05" }), st({ when: "week" }), ctx), false, `${name}: next Monday is not this week`);
      assert.strictEqual(D.window(st({ when: "week" }), Object.assign({ includePast: true }, ctx)).from, "2026-09-28", `${name}: with history on, the week is the whole Mon–Sun week`);
    });
  }
  console.log("PASS: WHEN — weekend (Fri–Sun) and week (Mon–Sun) resolve correctly on every day of the week");

  {
    // Surface defaults: the one thing allowed to differ by surface.
    const none = D.defaults();
    const later = ev({ date: day(3) }), nowish = ev({ date: day(0) });
    yes(later, none, CTX, "with no surface default given, null means all upcoming");
    assert.strictEqual(D.window(none, CTX).mode, "all");
    const home = { now: NOW, defaultWhen: "today" };
    no(later, none, home); yes(nowish, none, home);
    assert.strictEqual(D.window(none, home).mode, "today");
    yes(later, st({ when: "all" }), home, "an explicit WHEN always overrides the surface default");
    assert.strictEqual(D.window(none, { now: NOW, defaultWhen: "sometime" }).mode, "all", "an invalid default is ignored");
    assert.strictEqual(D.window(none, { now: NOW, defaultWhen: "dates" }).mode, "all", "'dates' cannot be a default");
    assert.strictEqual(D.toQuery(none), "", "a surface default is never written into the URL");

    // Calendar history.
    const hist = { now: NOW, includePast: true };
    yes(ev({ date: day(-200) }), none, hist); yes(ev({ time: "10:00 AM–2:00 PM" }), none, hist, "with history on, an ended event still matches");
    assert.deepStrictEqual(plain(D.window(none, hist)), { mode: "all", from: null, to: null, empty: false });
    no(ev({ date: day(-200) }), st({ when: "today" }), hist, "an explicit WHEN is still relative to today");
    no(ev({ date: day(-1) }), none, CTX, "without history, the past never matches");
  }
  console.log("PASS: surface defaults (ctx.defaultWhen) and Calendar history (ctx.includePast) — the only per-surface differences");

  // =================================================================
  // H. Across dimensions, blocked names, robustness
  // =================================================================
  {
    const s = D.change(st({ when: "weekend", what: { only: "music" }, q: "jazz" }), { where: { place: "Ann Arbor", radius: 10 }, free: true });
    const hit = { date: day(1), cat: "music", title: "Jazz Night", city: "Ypsilanti", free: true };
    yes(ev(hit), s);
    no(ev(Object.assign({}, hit, { date: day(5) })), s, CTX, "wrong WHEN");
    no(ev(Object.assign({}, hit, { city: "Flint" })), s, CTX, "wrong WHERE");
    no(ev(Object.assign({}, hit, { cat: "film" })), s, CTX, "wrong WHAT");
    no(ev(Object.assign({}, hit, { title: "Blues Night" })), s, CTX, "wrong SEARCH");
    no(ev(Object.assign({}, hit, { free: false })), s, CTX, "not free");

    no(ev({ title: "An evening with AUGUSTUS WILLIAMS" }), D.defaults(), CTX, "blocked by title");
    no(ev({ note: "feat. Augustus Williams" }), D.defaults(), CTX, "blocked by note");
    no(ev({ title: "Augustus Williams" }), D.defaults(), { now: NOW, includePast: true }, "blocked even with history on");
    assert.strictEqual(D.count([ev({ title: "Augustus Williams" }), ev({})], D.defaults(), CTX), 1);

    no(null, D.defaults()); no(undefined, D.defaults()); no({ title: "no date" }, D.defaults(), CTX, "an event with no date never matches");
    yes(ev({}), { when: { mode: "all" } }, CTX, "matches() accepts a non-canonical state and normalizes it");
    yes(ev({}), null, CTX);
  }
  console.log("PASS: dimensions are AND'd; blocked names are suppressed everywhere; bad input never throws");

  // =================================================================
  // I. Counting
  // =================================================================
  {
    const run = ev({ date: day(0), endDate: day(29), cat: "visual", neighborhood: "Downtown" });
    // A surface that hands over one entry per day of a 30-day run:
    const perDay = Array.from({ length: 30 }, () => run);
    assert.strictEqual(D.count(perDay, D.defaults(), CTX), 1, "a 30-day run is ONE event, not 30");
    assert.strictEqual(D.facets(perDay, D.defaults(), CTX, "neighborhood").get("Downtown"), 1);
    assert.strictEqual(D.count([], D.defaults(), CTX), 0); assert.strictEqual(D.count(null, D.defaults(), CTX), 0);
    assert.strictEqual(D.count([{ date: TODAY, title: "a" }, { date: TODAY, title: "b" }], D.defaults(), CTX), 2, "events without an id are each counted");

    const events = [
      ev({ cat: "music", neighborhood: "Corktown", free: true, ticketUrl: "t" }),
      ev({ cat: "music", neighborhood: "Corktown", city: undefined }),
      ev({ cat: "music", city: "Ann Arbor", imageUrl: "i" }),
      ev({ cat: "film", neighborhood: "Midtown" }),
      ev({ cat: "film", city: "Richmond" }),
      ev({ cat: "sports", city: "Canton", date: day(-3) }), // over
      ev({ cat: "unlisted" }),
    ];
    const cat = D.facets(events, D.defaults(), CTX, "category");
    assert.deepStrictEqual(Array.from(cat.keys()), D.categories.map((c) => c.key), "every category is listed, in display order, zeros included");
    assert.strictEqual(cat.get("music"), 3); assert.strictEqual(cat.get("film"), 2); assert.strictEqual(cat.get("sports"), 0, "an over event is not counted"); assert.strictEqual(cat.get("dance"), 0);
    // A facet sets its own dimension aside, and only its own.
    const musicOnly = st({ what: { only: "music" } });
    assert.strictEqual(D.facets(events, musicOnly, CTX, "category").get("film"), 2, "the category facet shows what choosing another category would give");
    assert.strictEqual(D.facets(events, D.change(musicOnly, { free: true }), CTX, "category").get("film"), 0, "…under every OTHER active filter");
    assert.strictEqual(D.facets(events, D.change(musicOnly, { free: true }), CTX, "category").get("music"), 1);
    const nb = D.facets(events, D.defaults(), CTX, "neighborhood");
    assert.deepStrictEqual(Array.from(nb.entries()), [["Corktown", 2], ["Midtown", 1]], "most events first");
    assert.strictEqual(D.facets(events, st({ where: { neighborhood: "Midtown" } }), CTX, "neighborhood").get("Corktown"), 2);
    assert.strictEqual(D.facets(events, musicOnly, CTX, "neighborhood").has("Midtown"), false);
    const city = D.facets(events, D.defaults(), CTX, "city");
    assert.strictEqual(city.get("Detroit"), 4); assert.strictEqual(city.get("Ann Arbor"), 1); assert.strictEqual(city.get("Richmond"), 1, "an unlisted city is still reported by name");
    const placement = D.facets(events, D.defaults(), CTX, "placement");
    assert.deepStrictEqual(Array.from(placement.entries()), [["placed", 5], ["unplaced", 1]]);
    assert.deepStrictEqual(Array.from(D.facets(events, st({ where: { radius: "orbit" } }), CTX, "placement").entries()), [["placed", 5], ["unplaced", 1]], "a surface can always say how many events a distance filter cannot place");
    const feat = D.facets(events, D.defaults(), CTX, "feature");
    assert.deepStrictEqual(Array.from(feat.entries()), [["tickets", 1], ["photo", 1], ["submitted", 0], ["radar", 0], ["clothing_optional", 0]]);
    assert.throws(() => D.facets(events, D.defaults(), CTX, "genre"), /unknown dimension/);
    // A facet total and a count agree.
    assert.strictEqual(Array.from(cat.values()).reduce((a, b) => a + b, 0) + 1, D.count(events, D.defaults(), CTX), "category totals + the one uncategorised event = the count");
  }
  console.log("PASS: count() and facets() count distinct events (never event-days); each facet sets aside only its own dimension");

  // =================================================================
  // J. describe()
  // =================================================================
  {
    assert.deepStrictEqual(D.describe(D.defaults()), []);
    let s = st({ when: "weekend" });
    s = D.change(s, { where: { place: "Ann Arbor", radius: 25, neighborhood: "Corktown" } });
    s = D.change(D.change(s, { what: { only: "music" } }), { what: { add: "visual" } });
    s = D.change(D.change(s, { free: true }), { feature: { add: "radar" } });
    s = D.change(s, { q: "jazz" });
    const d = D.describe(s);
    assert.deepStrictEqual(d.map((x) => `${x.dim}:${x.label}`), [
      "when:This Weekend", "where:25 mi · Ann Arbor", "where:Corktown",
      "what:Music", "what:Visual Arts", "what:Free only", "what:On the Radar", 'search:"jazz"',
    ], "WHEN, WHERE, WHAT, SEARCH — in that order");
    // Every entry's `remove` patch removes exactly that entry.
    d.forEach((entry) => {
      const after = D.describe(D.change(s, entry.remove)).map((x) => `${x.dim}:${x.key}`);
      const expected = d.filter((x) => x !== entry).map((x) => `${x.dim}:${x.key}`);
      assert.deepStrictEqual(after, expected, `removing "${entry.label}" removes only that`);
    });
    assert.strictEqual(D.describe(st({ where: { place: "Flint" } }))[0].label, "Detroit Orbit · Flint");
    assert.strictEqual(D.describe(st({ where: { radius: "orbit" } }))[0].label, "Detroit Orbit");
    assert.strictEqual(D.describe(st({ where: { here: { lat: 42, lng: -83 }, radius: 5 } }))[0].label, "5 mi · Your location");
    assert.strictEqual(D.describe(st({ when: { from: "2026-10-12" } }))[0].label, "Mon, Oct 12");
    assert.strictEqual(D.describe(st({ when: { from: "2026-10-28", to: "2026-11-03" } }))[0].label, "Oct 28–Nov 3");
    D.whens.filter((w) => w.key !== "dates").forEach((w) => assert.strictEqual(D.describe(st({ when: w.key }))[0].label, w.label));
  }
  console.log("PASS: describe() — the active filters in words, in grammar order, each with the patch that removes it");

  // =================================================================
  // K. URL codec
  // =================================================================
  {
    assert.strictEqual(D.toQuery(D.defaults()), "");
    assert.strictEqual(D.toQuery(st({ when: "weekend" })), "when=weekend");
    assert.strictEqual(D.toQuery(st({ when: { from: "2026-10-12" } })), "when=dates&from=2026-10-12");
    assert.strictEqual(D.toQuery(st({ when: { from: "2026-10-12", to: "2026-10-18" } })), "when=dates&from=2026-10-12&to=2026-10-18");
    assert.strictEqual(D.toQuery(D.change(st({ what: { only: "film" } }), { what: { add: "music" } })), "cats=music%2Cfilm");
    assert.strictEqual(D.toQuery(st({ where: { place: "Ann Arbor", radius: 25 } })), "loc=Ann+Arbor&radius=25");
    assert.strictEqual(D.toQuery(st({ where: { place: "Ann Arbor" } })), "loc=Ann+Arbor&radius=all", "the Orbit stays 'all' on the wire, which every page already reads");
    assert.strictEqual(D.toQuery(st({ where: { radius: "orbit" } })), "radius=all");
    assert.strictEqual(D.toQuery(st({ where: { neighborhood: "Mexicantown / Southwest Detroit" } })), "neighborhood=Mexicantown+%2F+Southwest+Detroit");
    assert.strictEqual(D.toQuery(D.change(st({ free: true }), { feature: { add: "clothing_optional" } })), "free=1&features=clothing_optional");
    assert.strictEqual(D.toQuery(st({ q: 'jazz & "blues" 100%' })), "q=jazz+%26+%22blues%22+100%25");
    // Device location never reaches a URL.
    const here = st({ where: { here: { lat: 42.3314, lng: -83.0458 }, radius: 10 } });
    assert.strictEqual(D.toQuery(here), "", "no coordinates, and no radius that would be meaningless without them");
    assert.ok(!/42\.33|83\.04/.test(D.href("map", here, CTX)));
    assert.strictEqual(D.toQuery(st({ where: { here: { lat: 42.3314, lng: -83.0458 } } })), "radius=all");
    // One canonical order, whatever order the state was built in.
    const a = D.change(D.change(st({ q: "x" }), { when: "tonight" }), { what: { only: "music" } });
    const b = D.change(D.change(st({ what: { only: "music" } }), { q: "x" }), { when: "tonight" });
    assert.strictEqual(D.toQuery(a), D.toQuery(b));
    assert.strictEqual(D.toQuery(a), "when=tonight&cats=music&q=x");
  }
  console.log("PASS: toQuery() — canonical order and names; device location is never written");

  {
    const q = (s) => plain(D.fromQuery(s));
    assert.deepStrictEqual(q(""), plain(D.defaults()));
    assert.deepStrictEqual(q("?when=weekend&cats=music"), q("when=weekend&cats=music"));
    assert.deepStrictEqual(q("https://313.events/calendar.html?when=weekend&cats=music#top"), q("when=weekend&cats=music"));
    assert.deepStrictEqual(plain(D.fromQuery(new URLSearchParams("when=weekend&cats=music"))), q("when=weekend&cats=music"));
    assert.deepStrictEqual(q("utm_source=x&fbclid=abc&date=2026-10-03&view=list&cats=music").what.paths, ["music"], "unrelated parameters, and Calendar's own date/view, are ignored");
    assert.deepStrictEqual(q("date=2026-10-12").when, { mode: null, from: null, to: null }, "Calendar's `date` is that page's position, not discovery state");
    assert.deepStrictEqual(q("q=%E0%A4%A&cats=music").what.paths, ["music"], "a malformed escape is skipped, not fatal");
    assert.deepStrictEqual(q("when=someday&cats=nope,alsono&features=zzz&radius=9000&free=yes"), plain(D.defaults()), "unknown values decode to nothing");
    assert.strictEqual(q("q=jazz+trio").q, "jazz trio"); assert.strictEqual(q("q=jazz%20trio").q, "jazz trio");
    assert.strictEqual(q("cats=music&cats=film").what.paths.join(), "music", "a repeated parameter takes its first value");
    assert.deepStrictEqual(q("cats=music.electronic.techno,film").what.paths, ["film"], "a genre path in a URL is dropped: the system cannot accept a genre it has no data for");

    // Round trip: every state survives toQuery -> fromQuery (device location excepted).
    let seed = 0x2f6e2b1; // mulberry32: the same 3,000 states every run
    const rnd = (k) => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) % k;
    };
    const pick = (list) => list[rnd(list.length)];
    const cityNames = D.places.map((p) => p.name);
    for (let i = 0; i < 3000; i++) {
      let s = D.defaults();
      const mode = pick([null, "today", "tonight", "tomorrow", "weekend", "next7", "week", "all", "dates"]);
      if (mode === "dates") { const from = day(rnd(60)); s = D.change(s, { when: { from, to: rnd(2) ? from : day(60 + rnd(30)) } }); }
      else if (mode) s = D.change(s, { when: mode });
      for (let k = rnd(4); k > 0; k--) s = D.change(s, { what: { add: pick(D.categories).key } });
      if (rnd(3) === 0) s = D.change(s, { free: true });
      for (let k = rnd(3); k > 0; k--) s = D.change(s, { feature: { add: pick(D.features).key } });
      if (rnd(3) === 0) s = D.change(s, { q: pick(["jazz", "a & b", "100% free", "día de muertos", "x=y&z", "  spaced  out "]) });
      const w = rnd(5);
      if (w === 1) s = D.change(s, { where: { place: pick(cityNames), radius: pick([5, 10, 25, 50, "orbit"]) } });
      if (w === 2) s = D.change(s, { where: { radius: "orbit" } });
      if (rnd(4) === 0) s = D.change(s, { where: { neighborhood: pick(["Corktown", "Mexicantown / Southwest Detroit", "Fitzgerald-Marygrove", "The District Detroit"]) } });
      const back = D.fromQuery(D.toQuery(s));
      assert.deepStrictEqual(plain(back), plain(s), `round trip failed for ${D.toQuery(s)}`);
      assert.strictEqual(D.toQuery(back), D.toQuery(s));
    }
  }
  console.log("PASS: fromQuery() — tolerant of any input; 3,000 generated states survive toQuery -> fromQuery unchanged");

  // =================================================================
  // L. href()
  // =================================================================
  {
    const s = D.change(st({ when: "weekend" }), { what: { only: "music" } });
    assert.strictEqual(D.href("home", D.defaults(), CTX), "/");
    assert.strictEqual(D.href("home", s, CTX), "/?when=weekend&cats=music");
    assert.strictEqual(D.href("map", s, CTX), "/map.html?when=weekend&cats=music");
    assert.strictEqual(D.href("calendar", s, CTX), "/calendar.html?when=weekend&cats=music");
    assert.throws(() => D.href("radio", s, CTX), /unknown surface/);
    // Calendar adapter: a single day also travels as Calendar's own `date`.
    assert.strictEqual(D.href("calendar", st({ when: "tomorrow" }), CTX), `/calendar.html?when=tomorrow&date=${day(1)}`);
    assert.strictEqual(D.href("calendar", st({ when: "today" }), CTX), `/calendar.html?when=today&date=${TODAY}`);
    assert.strictEqual(D.href("calendar", st({ when: "tonight" }), CTX), `/calendar.html?when=tonight&date=${TODAY}`);
    assert.strictEqual(D.href("calendar", st({ when: { from: "2026-11-14" } }), CTX), "/calendar.html?when=dates&from=2026-11-14&date=2026-11-14");
    assert.strictEqual(D.href("calendar", st({ when: { from: "2026-11-14", to: "2026-11-20" } }), CTX), "/calendar.html?when=dates&from=2026-11-14&to=2026-11-20", "a range has no single day to open");
    assert.strictEqual(D.href("calendar", st({ when: { from: day(-9) } }), CTX), `/calendar.html?when=dates&from=${day(-9)}`, "a past pick opens no day");
    assert.strictEqual(D.href("map", st({ when: "tomorrow" }), CTX), "/map.html?when=tomorrow", "only Calendar has a `date`");
    // The state itself is unchanged by travelling.
    assert.deepStrictEqual(plain(D.fromQuery(D.href("calendar", st({ when: "tomorrow" }), CTX))), plain(st({ when: "tomorrow" })));
  }
  console.log("PASS: href() — one state, three surfaces; a single day also opens that day on the not-yet-migrated Calendar");

  // =================================================================
  // M. Inventory definition
  // =================================================================
  {
    assert.strictEqual(D.inventoryFilter("2026-10-03"), "or=(start_date.gte.2026-10-03,end_date.gte.2026-10-03)");
    assert.strictEqual(D.inventoryFilter(CTX), D.inventoryFilter("2026-10-03"));
    assert.strictEqual(D.inventoryFilter(NOW), D.inventoryFilter("2026-10-03"));
    assert.strictEqual(D.inventoryFilter({ now: new Date("2026-10-04T03:30:00Z") }), D.inventoryFilter("2026-10-03"), "Detroit's date, not UTC's");
    assert.ok(/^or=\(start_date\.gte\.\d{4}-\d{2}-\d{2},end_date\.gte\.\d{4}-\d{2}-\d{2}\)$/.test(D.inventoryFilter()), "with no argument it uses the clock");
    // The database rule and the in-page rule agree, row by row, at the date level.
    const rows = [
      { start: day(0), end: null, current: true }, { start: day(5), end: null, current: true },
      { start: day(-1), end: null, current: false }, { start: day(-1), end: day(0), current: true },
      { start: day(-30), end: day(30), current: true }, { start: day(-30), end: day(-1), current: false },
    ];
    rows.forEach((r) => {
      const sqlSays = r.start >= TODAY || (r.end !== null && r.end >= TODAY);
      assert.strictEqual(sqlSays, r.current);
      assert.strictEqual(D.matches(ev({ date: r.start, endDate: r.end || undefined }), st({ when: "all" }), CTX), r.current, `start ${r.start} end ${r.end}`);
    });
  }
  console.log("PASS: inventoryFilter() — 'current + upcoming' as a database filter, agreeing with matches() about which events are current");

  // =================================================================
  // N. Genre-readiness (proved against a HYPOTHETICAL taxonomy only)
  // =================================================================
  {
    // On the real site: no genre can be expressed anywhere.
    assert.deepStrictEqual(plain(D.fromQuery("cats=music.electronic").what.paths), []);
    assert.deepStrictEqual(plain(D.normalize({ what: { paths: ["music.electronic"] } }).what.paths), []);
    yes(ev({ cat: "music", path: "music.electronic" }), st({ what: { only: "music" } }), CTX, "an event carrying a path the taxonomy does not know is just a music event");
    assert.ok(!SRC.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n").match(/techno|jazz|hip.?hop|electronic/i), "no genre vocabulary exists in the code");

    // With children added, the SAME code handles genre and subgenre.
    const G = _build(Object.assign({}, _defaultConfig, {
      categories: [
        { key: "music", label: "Music", children: [
          { key: "electronic", label: "Electronic", children: [{ key: "techno", label: "Techno", children: [] }, { key: "house", label: "House", children: [] }] },
          { key: "jazz", label: "Jazz", children: [] },
        ] },
        { key: "film", label: "Film", children: [] },
      ],
    }));
    const g = (patch) => G.change(G.defaults(), patch);
    const techno = ev({ cat: "music", path: "music.electronic.techno" }), house = ev({ cat: "music", path: "music.electronic.house" });
    const jazz = ev({ cat: "music", path: "music.jazz" }), plainMusic = ev({ cat: "music" }), film = ev({ cat: "film" });
    const m = (e, s) => G.matches(e, s, CTX);
    assert.deepStrictEqual([techno, house, jazz, plainMusic, film].map((e) => m(e, g({ what: { only: "music" } }))), [true, true, true, true, false], "a category selects everything beneath it");
    assert.deepStrictEqual([techno, house, jazz, plainMusic, film].map((e) => m(e, g({ what: { only: "music.electronic" } }))), [true, true, false, false, false], "a genre selects its subgenres, not its siblings, and not events with no genre");
    assert.deepStrictEqual([techno, house, jazz, plainMusic, film].map((e) => m(e, g({ what: { only: "music.electronic.techno" } }))), [true, false, false, false, false]);
    const mixed = G.change(g({ what: { only: "music.jazz" } }), { what: { add: "film" } });
    assert.deepStrictEqual([techno, jazz, film].map((e) => m(e, mixed)), [false, true, true], "OR across levels");
    assert.strictEqual(m(ev({ cat: "film", path: "music.jazz" }), g({ what: { only: "music" } })), false, "a path that is not under the event's own category is ignored");
    // State shape and URL format are unchanged.
    assert.deepStrictEqual(Object.keys(G.defaults().what), Object.keys(D.defaults().what));
    assert.strictEqual(G.toQuery(mixed), "cats=music.jazz%2Cfilm");
    assert.deepStrictEqual(plain(G.fromQuery(G.toQuery(mixed))), plain(mixed));
    assert.deepStrictEqual(G.describe(g({ what: { only: "music.electronic.techno" } })).map((x) => x.label), ["Techno"]);
    assert.deepStrictEqual(Array.from(G.facets([techno, house, jazz, plainMusic, film], G.defaults(), CTX, "category").entries()), [["music", 4], ["film", 1]], "facets roll up to the top-level category");
    assert.deepStrictEqual(plain(G.normalize({ what: { paths: ["music", "film"] } }).what.paths), [], "all top-level categories is still 'all'");
  }
  console.log("PASS: genre-ready — paths, URL and matching already handle category > genre > subgenre; on the real site no genre can be expressed");

  // =================================================================
  // O. Cost
  // =================================================================
  {
    const many = Array.from({ length: 5000 }, (_, i) => ev({ date: day(i % 120), cat: D.categories[i % 15].key, city: i % 7 ? undefined : "Ann Arbor", title: "Event " + i, time: i % 3 ? "7:00 PM" : "" }));
    const s = D.change(st({ when: "next7", what: { only: "music" }, q: "event" }), { where: { place: "Detroit", radius: 25 } });
    const t0 = process.hrtime.bigint();
    const n = D.count(many, s, CTX);
    D.facets(many, s, CTX, "category"); D.facets(many, s, CTX, "neighborhood");
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(n > 0);
    assert.ok(ms < 1500, `filtering 5,000 events three times took ${ms.toFixed(0)} ms`);
    console.log(`PASS: filters 5,000 events three times in ${ms.toFixed(0)} ms`);
  }

  console.log("\nAll discovery.js tests passed.");
}

try { run(); } catch (err) { console.error("FAIL:", err); process.exitCode = 1; }
