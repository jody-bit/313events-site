// test/discovery-compat.test.js — discovery.js against what is live today.
//
// test/discovery.test.js proves each rule in isolation. This file proves
// the shared rules line up with the pages as they are RIGHT NOW, by
// extracting the pages' real code from their HTML and executing it (the
// repo's established no-DOM-harness convention), so that the homepage can
// later be switched to discovery.js knowing exactly what changes:
//
//   1. PARITY — the homepage's real filter code vs Discovery.matches()
//      over a few hundred filter states and events. Every difference must
//      be one of the documented, intended ones; anything else fails.
//   2. OLD LINKS IN — every URL the homepage can write today (its real
//      syncURL()) decodes to the equivalent canonical state, plus the
//      Calendar/Map-only legacy forms.
//   3. NEW LINKS OUT — URLs written by Discovery.href() fed to each page's
//      real, unmodified readStateFromURL(): what carries over today is
//      asserted exactly, and so is what does not (until those pages adopt
//      the shared file).
//   4. DRIFT GUARDS — every remaining copy of the category list, the
//      places table, the boundary, the feature list and the blocked names
//      is compared with the canonical one, so the copies cannot diverge
//      quietly while they still exist.
//
// Run: node test/discovery-compat.test.js
"use strict";
// The pages read the visitor's own clock. Run them as a visitor in Detroit
// so "today" means the same thing on both sides of every comparison.
process.env.TZ = "America/Detroit";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { Discovery: D } = require(`${REPO_DIR}/discovery.js`);
const read = (f) => fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
const plain = (x) => JSON.parse(JSON.stringify(x));

// ---- extraction helpers -------------------------------------------------
function grab(html, pattern, label) {
  const m = html.match(pattern);
  assert.ok(m, `could not extract ${label} — source may have moved/changed shape`);
  return m[0];
}
const fn = (html, name) => grab(html, new RegExp(`function ${name}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`), `function ${name}`);
const oneLineFn = (html, name) => grab(html, new RegExp(`function ${name}\\([^)]*\\)\\{[^\\n]*\\}`), `function ${name}`);
const block = (html, name, close) => grab(html, new RegExp(`const ${name} = [\\s\\S]*?\\n${close}`), `const ${name}`);
const line = (html, name) => grab(html, new RegExp(`^const ${name} = .*$`, "m"), `const ${name}`);

// A Date that always reports the same "now", inside a sandbox.
const FAKE_DATE = (ms) => `
  var __RealDate = Date;
  Date = class extends __RealDate {
    constructor(...a){ if(a.length === 0) super(${ms}); else super(...a); }
    static now(){ return ${ms}; }
  };`;

// Anything the page code touches on `document` resolves to a harmless dummy.
function dummyDocument() {
  const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  const el = new Proxy(function () {}, {
    get: (t, k) => (k === "classList" ? classList : k === "style" ? {} : k === "value" ? "" : k === "dataset" ? {} : el),
    set: () => true,
    apply: () => el,
  });
  return { getElementById: () => el, querySelector: () => el, querySelectorAll: () => [] };
}

const INDEX = read("index.html"), CALENDAR = read("calendar.html"), MAP = read("map.html");

// =====================================================================
// 1. PARITY with the homepage's real filter code
// =====================================================================
function homepageSandbox(nowMs) {
  const sb = { URLSearchParams, console };
  vm.createContext(sb);
  vm.runInContext(FAKE_DATE(nowMs), sb);
  vm.runInContext([
    block(INDEX, "CATS", "\\};"),
    block(INDEX, "LOCATIONS", "\\];"),
    block(INDEX, "CITY_LOOKUP", "\\);"),
    fn(INDEX, "haversineMiles"),
    line(INDEX, "DETROIT_BOUNDARY"), line(INDEX, "DB_LAT0"), line(INDEX, "DB_MILES_PER_DEG_LAT"), line(INDEX, "DB_MILES_PER_DEG_LON"),
    fn(INDEX, "dbToXY"), fn(INDEX, "dbDistPointToSeg"), fn(INDEX, "milesFromDetroitBorder"),
    line(INDEX, "BLOCKED_NAMES"), fn(INDEX, "isBlockedEvent"),
    block(INDEX, "FEATURE_CHIPS", "\\];"),
    oneLineFn(INDEX, "toISO"),
    fn(INDEX, "getTodayISO"), fn(INDEX, "getTomorrowISO"), fn(INDEX, "getWeekendDates"), fn(INDEX, "getCalendarWeekDates"),
    fn(INDEX, "datesInRange"), fn(INDEX, "upcomingDatesWithEvents"),
    line(INDEX, "MAX_EVENT_SPAN_DAYS"), fn(INDEX, "expandDateRange"), fn(INDEX, "addToByDate"),
    fn(INDEX, "parseTimeRange"), fn(INDEX, "isEveningTime"),
    fn(INDEX, "matchesNonDateFilters"), fn(INDEX, "matchesFilters"), fn(INDEX, "currentDateList"),
    fn(INDEX, "syncURL"),
    // page state, exactly the globals the real code reads
    `var activeCats, freeOnly, activeFeatures, query, whenMode, pickedDate, rangeStart, rangeEnd,
         originLocation, radiusMiles, neighborhoodFilter, cachedWeekendDates, editorialByEvent = {},
         EVENTS = [], byDate = {};
     var __url = null;
     var history = { replaceState: function(a, b, u){ __url = u; } };
     var location = { pathname: "/", search: "" };
     function __load(events, coverage){
       EVENTS = events; byDate = {}; editorialByEvent = coverage;
       EVENTS.forEach(function(e){ addToByDate(byDate, e); });
     }
     function __set(s){
       activeCats = new Set(s.cats); freeOnly = s.free; activeFeatures = new Set(s.features); query = s.q;
       whenMode = s.when; pickedDate = s.picked || null; rangeStart = s.rangeStart || null; rangeEnd = s.rangeEnd || null;
       originLocation = s.loc ? LOCATIONS.find(function(l){ return l.name === s.loc; }) : null;
       radiusMiles = s.loc ? s.radius : null;
       neighborhoodFilter = s.neighborhood || null;
       cachedWeekendDates = getWeekendDates();
     }
     function __run(){
       var dates = new Set(currentDateList());
       return EVENTS.map(function(e){
         var nonDate = matchesNonDateFilters(e);
         var visible = matchesFilters(e) && expandDateRange(e.date, e.endDate).some(function(d){ return dates.has(d); });
         var r = parseTimeRange(e.time), now = new Date();
         var ended = !!(r && r.end && r.end.h >= r.start.h && (r.end.h + r.end.m/60) < (now.getHours() + now.getMinutes()/60));
         return { visible: visible, nonDate: nonDate, startInDates: dates.has(e.date), endedByClock: ended };
       });
     }
     function __url_for(){ __url = null; syncURL(); return __url; }`,
  ].join("\n"), sb);
  return sb;
}

// Small deterministic generator (mulberry32) — the same fixture every run.
function rng(seed) {
  return function (k) {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % k;
  };
}

function fixtureEvents(today) {
  const dayISO = (n) => { const [y, m, d] = today.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const cats = D.categories.map((c) => c.key);
  const times = ["", "7:00 PM", "10:00 AM–2:00 PM", "10:00 AM–4:00 PM", "Evening", "5:30–11:00 PM", "10:00 PM–2:00 AM", "Noon–11:00 PM", "1:00 PM", "Varies", "9:00 AM–1:00 PM", "8:00 PM–11:30 PM"];
  const cities = [undefined, undefined, undefined, "Ann Arbor", "Ypsilanti", "Flint", "Lansing", "Richmond", "Windsor", "Toledo", "Hamtramck"];
  const hoods = [null, null, "Corktown", "Midtown", "Downtown"];
  const titles = ["Jazz Night", "Techno at the Warehouse", "Family Day", "Bahamas", "Open Studio", "Farmers Market", "Augustus Williams Live"];
  const sources = ["Manual", "Venue Submission", "Ticketmaster", "Resident Advisor"];
  const spans = [0, 0, 0, 0, 0, 1, 2, 3, 30, 90];
  const events = [];
  const next = rng(7);
  // Hand-placed around "today", so every time-of-day rule is exercised
  // whatever the random part below happens to produce.
  const shapes = [[0, 0], [0, 1], [0, 2], [-1, 0], [-1, 1], [-3, 0], [1, 1], [1, 3], [-40, 40]];
  times.forEach((time, ti) => shapes.forEach(([startOff, endOff], si) => {
    events.push({
      id: `edge-${ti}-${si}`, date: dayISO(startOff), endDate: dayISO(endOff), title: `Edge ${ti}-${si}`, venue: "Edge Venue",
      city: undefined, neighborhood: si % 2 ? "Corktown" : null, cat: cats[(ti + si) % cats.length], time,
      free: si % 3 === 0, source: "Manual", ticketUrl: si % 2 ? "https://tickets.example/e" : undefined,
    });
  }));
  for (let i = 0; i < 700; i++) {
    const start = dayISO(next(60) - 14);
    const span = spans[next(spans.length)];
    const city = cities[next(cities.length)];
    events.push({
      id: "evt-" + i,
      date: start,
      endDate: span ? dayISO(Number((new Date(start + "T12:00:00Z") - new Date(today + "T12:00:00Z")) / 86400000) + span) : start,
      title: titles[next(titles.length)] + " " + i,
      venue: "Venue " + next(40),
      city,
      neighborhood: city ? null : hoods[next(hoods.length)],
      cat: next(40) === 0 ? "unlisted" : cats[next(cats.length)],
      time: times[next(times.length)],
      free: next(3) === 0,
      source: sources[next(sources.length)],
      note: next(9) === 0 ? "Doors at eight" : undefined,
      ticketUrl: next(2) ? "https://tickets.example/" + i : undefined,
      imageUrl: next(4) === 0 ? "https://img.example/" + i : undefined,
    });
  }
  const coverage = {};
  events.forEach((e, i) => { if (i % 11 === 0) coverage[e.id] = [{}]; });
  return { events, coverage, dayISO };
}

function legacyStates(dayISO) {
  const cats = D.categories.map((c) => c.key);
  const whens = [
    { when: null }, { when: "tomorrow" }, { when: "tonight" }, { when: "weekend" }, { when: "thisweek" }, { when: "all" },
    { when: "date", picked: dayISO(0) }, { when: "date", picked: dayISO(4) },
    { when: "range", rangeStart: dayISO(0), rangeEnd: dayISO(6) }, { when: "range", rangeStart: dayISO(9), rangeEnd: dayISO(20) },
  ];
  const catSets = [cats, ["music"], ["music", "film"], cats.filter((c) => c !== "sports"), ["community", "vendor", "training"]];
  const featureSets = [[], [], ["tickets"], ["photo"], ["submitted"], ["radar"], ["tickets", "photo"]];
  const queries = ["", "", "", "jazz", "BAHAMAS", "venue 3", "ann arbor", "music", "corktown", "ticketmaster", "doors at"];
  const locs = [null, null, null, { loc: "Ann Arbor", radius: 10 }, { loc: "Ann Arbor", radius: "all" }, { loc: "Detroit", radius: 25 }, { loc: "Corktown", radius: 5 }, { loc: "Lansing", radius: 50 }, { loc: "Flint", radius: "all" }];
  const hoods = [null, null, null, null, "Corktown", "Downtown"];
  const out = [];
  const next = rng(99);
  whens.forEach((w) => {
    out.push(Object.assign({ cats, free: false, features: [], q: "", loc: null, radius: null, neighborhood: null }, w)); // the plain mode
    for (let i = 0; i < 45; i++) {
      const l = locs[next(locs.length)];
      out.push(Object.assign({
        cats: catSets[next(catSets.length)], free: next(4) === 0, features: featureSets[next(featureSets.length)],
        q: queries[next(queries.length)], loc: l ? l.loc : null, radius: l ? l.radius : null, neighborhood: hoods[next(hoods.length)],
      }, w));
    }
  });
  return out;
}

// The canonical state and surface default equivalent to a homepage state.
function toDiscovery(ls, nowMs, coverage) {
  const when = ls.when === null ? null
    : ls.when === "thisweek" ? "week"
    : ls.when === "date" ? { from: ls.picked, to: ls.picked }
    : ls.when === "range" ? { from: ls.rangeStart, to: ls.rangeEnd }
    : ls.when;
  const state = D.normalize({
    when: when === null ? {} : when,
    where: { place: ls.loc, radius: ls.loc ? (ls.radius === "all" ? "orbit" : ls.radius) : null, neighborhood: ls.neighborhood },
    what: { paths: ls.cats.length === D.categories.length ? [] : ls.cats, free: ls.free, features: ls.features },
    q: ls.q,
  });
  // The homepage's own resting view: today — unless a search or a
  // neighborhood is active, which widen it to everything upcoming.
  const ctx = { now: new Date(nowMs), defaultWhen: (ls.q || ls.neighborhood) ? "all" : "today", coverage };
  return { state, ctx };
}

function parity(label, nowMs) {
  const sb = homepageSandbox(nowMs);
  const today = vm.runInContext("getTodayISO()", sb);
  const { events, coverage, dayISO } = fixtureEvents(today);
  sb.__events = events; sb.__coverage = coverage;
  vm.runInContext("__load(__events, __coverage)", sb);
  const states = legacyStates(dayISO);
  const known = new Set(D.categories.map((c) => c.key));
  const tally = { compared: 0, exact: 0, inProgress: 0, overlapsWindow: 0, firstDayHoursPassed: 0, overHiddenNow: 0, unknownCategory: 0 };
  // Forward-looking shortcuts in which the old code kept listing an event
  // that had already ended today. (A picked date or range is not in this
  // list: there, old and shared code agree — a chosen date shows what
  // happened on it.)
  const LEGACY_SHOWS_ENDED = new Set(["tonight", "weekend", "thisweek"]);

  states.forEach((ls) => {
    sb.__state = ls;
    vm.runInContext("__set(__state)", sb);
    const legacy = vm.runInContext("__run()", sb);
    const { state, ctx } = toDiscovery(ls, nowMs, coverage);
    const histCtx = Object.assign({}, ctx, { includePast: true });
    const whenless = D.change(state, { when: "all" });

    events.forEach((e, i) => {
      const L = legacy[i].visible, N = D.matches(e, state, ctx);
      tally.compared++;
      const where = `[${label}] ${JSON.stringify(ls)} :: ${e.id} ${e.date}→${e.endDate} "${e.time}" ${e.cat}`;

      // (a) Every non-date dimension — WHAT, free, features, SEARCH, WHERE,
      // blocked names — must agree exactly, for every event.
      const nonDateNew = D.matches(e, whenless, histCtx);
      if (!known.has(e.cat)) {
        // The old code hides an event whose category it does not list, even
        // with no category filter. The shared rule: no filter means all.
        assert.strictEqual(L, false, `legacy hides unknown categories ${where}`);
        if (N) tally.unknownCategory++;
        return;
      }
      assert.strictEqual(nonDateNew, legacy[i].nonDate, `non-date filters disagree ${where}`);

      const over = !D.matches(e, whenless, ctx) && nonDateNew; // passes everything except "is it over?"
      const singleDay = e.endDate === e.date;

      if (L === N) { tally.exact++; return; }

      if (singleDay) {
        // The ONLY allowed single-day difference: the event is already
        // over today, and the old code kept showing it in these modes.
        assert.ok(L && !N && over && e.date === today && legacy[i].endedByClock && LEGACY_SHOWS_ENDED.has(ls.when),
          `unexplained single-day difference (legacy ${L}, shared ${N}) ${where}`);
        tally.overHiddenNow++;
        return;
      }
      // Multi-day events.
      if (L && !N) {
        assert.ok(over && e.endDate === today && legacy[i].endedByClock, `unexplained: legacy shows a multi-day event the shared rule hides ${where}`);
        tally.overHiddenNow++;
        return;
      }
      // N && !L — the shared rule shows it, the old code did not. Allowed
      // only because the old code looked at an event's START date alone.
      if (e.date < today) { tally.inProgress++; return; }                 // started before today, still running
      if (!legacy[i].startInDates) { tally.overlapsWindow++; return; }    // runs into the window but starts outside it
      if (e.date === today && legacy[i].endedByClock && (ls.when === null || ls.when === "all")) { tally.firstDayHoursPassed++; return; } // day one's hours passed; it runs again tomorrow
      assert.fail(`unexplained: the shared rule shows a multi-day event the legacy code hides ${where}`);
    });
  });
  return { tally, states: states.length, events: events.length, sb, statesList: states, coverage };
}

function run() {
  // A Saturday afternoon, a weekday evening, and late on a Sunday (the
  // last hours of both the weekend and the Mon–Sun week).
  const clocks = [
    ["Sat 3:00 PM", Date.parse("2026-10-03T19:00:00Z")],
    ["Wed 9:30 PM", Date.parse("2026-10-01T01:30:00Z")],
    ["Sun 9:00 PM", Date.parse("2026-10-05T01:00:00Z")],
  ];
  let last = null;
  clocks.forEach(([label, ms]) => {
    const r = parity(label, ms);
    const t = r.tally;
    assert.ok(t.exact > t.compared * 0.95, "the overwhelming majority of comparisons are identical");
    assert.ok(t.inProgress > 0 && t.overlapsWindow > 0 && t.overHiddenNow > 0, "the fixture exercises each intended difference");
    console.log(`PASS: [${label}] homepage's real filter code vs Discovery.matches — ${r.states} filter states × ${r.events} events = ${t.compared.toLocaleString()} comparisons: ${t.exact.toLocaleString()} identical; intended differences only — in-progress events now shown ${t.inProgress}, multi-day runs overlapping the window ${t.overlapsWindow}, day-one hours passed ${t.firstDayHoursPassed}, already-over events now hidden ${t.overHiddenNow}, uncategorised events now shown ${t.unknownCategory}`);
    last = Object.assign({ ms }, r);
  });

  // =====================================================================
  // 2. OLD LINKS IN
  // =====================================================================
  {
    let checked = 0;
    last.statesList.forEach((ls) => {
      last.sb.__state = ls;
      vm.runInContext("__set(__state)", last.sb);
      const url = vm.runInContext("__url_for()", last.sb);
      const expected = toDiscovery(ls, last.ms, last.coverage).state;
      assert.deepStrictEqual(plain(D.fromQuery(url)), plain(expected), `a URL the homepage writes today must decode to the same filters: ${url}`);
      checked++;
    });
    console.log(`PASS: all ${checked} URLs written by the homepage's real syncURL() decode to the equivalent canonical state`);

    const q = (s) => plain(D.fromQuery(s));
    const when = (s) => q(s).when;
    // Calendar / Map vocabulary
    assert.deepStrictEqual(when("when=now"), { mode: "today", from: null, to: null }, "Calendar/Map 'now' is today");
    assert.deepStrictEqual(when("when=today"), { mode: "today", from: null, to: null });
    assert.deepStrictEqual(when("when=tonight"), { mode: "tonight", from: null, to: null });
    assert.deepStrictEqual(when("date=2026-10-03&view=list&when=weekend"), { mode: "weekend", from: null, to: null });
    // Homepage vocabulary
    assert.deepStrictEqual(when("when=thisweek"), { mode: "week", from: null, to: null });
    assert.deepStrictEqual(when("when=date&picked=2026-10-12"), { mode: "dates", from: "2026-10-12", to: "2026-10-12" });
    assert.deepStrictEqual(when("when=range&rangeStart=2026-10-12&rangeEnd=2026-10-18"), { mode: "dates", from: "2026-10-12", to: "2026-10-18" });
    assert.deepStrictEqual(when("when=date"), { mode: null, from: null, to: null }, "a date mode with no date is nothing");
    assert.deepStrictEqual(when("when=date&picked=2025-06-01"), { mode: "dates", from: "2025-06-01", to: "2025-06-01" }, "an old link to a date now in the past still means that date (the old homepage discarded it and showed today)");
    assert.deepStrictEqual(when("when=range&rangeStart=2025-06-01&rangeEnd=2025-06-07"), { mode: "dates", from: "2025-06-01", to: "2025-06-07" });
    assert.deepStrictEqual(when("when=range&rangeStart=2026-10-12"), { mode: "dates", from: "2026-10-12", to: "2026-10-12" });
    // The old subtractive category model
    const all = D.categories.map((c) => c.key);
    assert.deepStrictEqual(q("cats=" + all.join(",")).what.paths, [], "an old link with every chip on is no filter");
    assert.deepStrictEqual(q("cats=" + all.filter((c) => c !== "sports").join(",")).what.paths, all.filter((c) => c !== "sports"), "an old link with one chip turned off still shows exactly the other fourteen");
    assert.deepStrictEqual(q("cats=").what.paths, [], "a bare cats= means ALL EVENTS (approved change: it used to mean none)");
    assert.deepStrictEqual(q("cats=bogus").what.paths, []);
    // Location
    assert.deepStrictEqual(q("loc=Ann+Arbor&radius=all").where, { place: "Ann Arbor", radius: "orbit", neighborhood: null, here: null });
    assert.deepStrictEqual(q("loc=ann%20arbor&radius=25").where, { place: "Ann Arbor", radius: 25, neighborhood: null, here: null });
    assert.deepStrictEqual(q("loc=Ann+Arbor").where.radius, "orbit", "no radius falls back to the Orbit, as before");
    assert.deepStrictEqual(q("loc=Ann+Arbor&radius=75").where.radius, "orbit", "an unsupported radius falls back to the Orbit, as before");
    assert.deepStrictEqual(q("loc=Elmwood+Park&radius=all").where, plain(D.defaults().where), "a place that no longer resolves is no location filter, as before");
    assert.deepStrictEqual(q("neighborhood=Fitzgerald-Marygrove").where.neighborhood, "Fitzgerald-Marygrove");
    assert.deepStrictEqual(q("free=1&features=tickets,radar&q=bahamas"), plain(D.change(D.change(D.change(D.change(D.defaults(), { free: true }), { feature: { add: "tickets" } }), { feature: { add: "radar" } }), { q: "bahamas" })));
  }
  console.log("PASS: legacy link forms — when=now / thisweek / date+picked / range+rangeStart+rangeEnd, old all-chips-on cats lists, radius=all, renamed places");

  // =====================================================================
  // 3. NEW LINKS OUT — into each page's real, unmodified readStateFromURL()
  // =====================================================================
  {
    const NOW = Date.parse("2026-10-03T19:00:00Z");
    const CTX = { now: new Date(NOW) };
    const PAGES = {
      home: { html: INDEX, understands: new Set(["tomorrow", "tonight", "weekend", "all"]), extra: `var pickedDate = null, rangeStart = null, rangeEnd = null, neighborhoodFilter = null;` },
      calendar: { html: CALENDAR, understands: new Set(["today", "tonight", "weekend"]), extra: `var mode = "month", selectedDate = null, current = new Date(2026, 9, 1), MIN_MONTH = new Date(2025, 9, 1), MAX_MONTH = new Date(2027, 9, 1); function initLeaflet(){}` },
      map: { html: MAP, understands: new Set(["today", "tonight", "weekend"]), extra: `` },
    };
    function readOnPage(surface, url) {
      const page = PAGES[surface];
      const sb = { URLSearchParams, document: dummyDocument(), console };
      vm.createContext(sb);
      vm.runInContext(FAKE_DATE(NOW), sb);
      vm.runInContext([
        block(page.html, "CATS", "\\};"), block(page.html, "LOCATIONS", "\\];"), block(page.html, "FEATURE_CHIPS", "\\];"),
        oneLineFn(page.html, "toISO"), fn(page.html, "getTodayISO"), fn(page.html, "getWeekendDates"),
        `var activeCats = new Set(Object.keys(CATS)), freeOnly = false, activeFeatures = new Set(), query = "", whenMode = null,
             originLocation = null, radiusMiles = null, cachedWeekendDates = [];
         function updateLocationControlUI(){}
         var location = { search: ${JSON.stringify(url.slice(url.indexOf("?") === -1 ? url.length : url.indexOf("?")))}, pathname: "/" };`,
        page.extra,
        fn(page.html, "readStateFromURL"),
        "readStateFromURL();",
      ].join("\n"), sb);
      // plain(): values created inside the sandbox belong to another realm.
      return plain(vm.runInContext(`({ cats: Array.from(activeCats), free: freeOnly, features: Array.from(activeFeatures), q: query, when: whenMode,
        loc: originLocation ? originLocation.name : null, radius: radiusMiles,
        knownPlaces: LOCATIONS.map(function(l){ return l.name; }), knownFeatures: FEATURE_CHIPS.map(function(f){ return f.key; }),
        selectedDate: typeof selectedDate === "undefined" ? undefined : selectedDate,
        neighborhood: typeof neighborhoodFilter === "undefined" ? undefined : neighborhoodFilter,
        picked: typeof pickedDate === "undefined" ? undefined : pickedDate })`, sb));
    }

    const allCats = D.categories.map((c) => c.key);
    const mk = (...patches) => patches.reduce((s, p) => D.change(s, p), D.defaults());
    const states = [
      mk(), mk({ what: { only: "music" } }), mk({ what: { only: "music" } }, { what: { add: "film" } }), mk({ free: true }),
      mk({ feature: { add: "tickets" } }, { feature: { add: "radar" } }, { feature: { add: "clothing_optional" } }),
      mk({ q: "jazz trio" }), mk({ q: 'a & b "c" 100%' }),
      mk({ where: { place: "Ann Arbor", radius: 25 } }), mk({ where: { place: "Ann Arbor" } }), mk({ where: { place: "Lansing", radius: 50 } }),
      mk({ where: { place: "Corktown", radius: 5 } }), mk({ where: { radius: "orbit" } }), mk({ where: { neighborhood: "Corktown" } }),
      mk({ when: "today" }), mk({ when: "tonight" }), mk({ when: "tomorrow" }), mk({ when: "weekend" }), mk({ when: "next7" }), mk({ when: "week" }), mk({ when: "all" }),
      mk({ when: { from: "2026-11-14" } }), mk({ when: { from: "2026-11-14", to: "2026-11-20" } }),
      mk({ when: "weekend" }, { what: { only: "music" } }, { where: { place: "Flint", radius: 10 } }, { free: true }, { q: "show" }),
    ];
    const carried = { home: new Set(), calendar: new Set(), map: new Set() }, dropped = { home: new Set(), calendar: new Set(), map: new Set() };
    Object.keys(PAGES).forEach((surface) => {
      states.forEach((s) => {
        const url = D.href(surface, s, CTX);
        let got;
        assert.doesNotThrow(() => { got = readOnPage(surface, url); }, `${surface} must read ${url} without error`);
        // WHAT, free, search: always carried, on every page.
        assert.deepStrictEqual(got.cats.slice().sort(), (s.what.paths.length ? s.what.paths : allCats).slice().sort(), `${surface}: categories ${url}`);
        assert.strictEqual(got.free, s.what.free, `${surface}: free ${url}`);
        assert.strictEqual(got.q, s.q, `${surface}: search text ${url}`);
        // Features: the ones that page knows.
        assert.deepStrictEqual(got.features, s.what.features.filter((f) => got.knownFeatures.includes(f)), `${surface}: features ${url}`);
        s.what.features.forEach((f) => (got.knownFeatures.includes(f) ? carried : dropped)[surface].add("feature:" + f));
        // Place + radius: when that page's own table has the place.
        if (s.where.place && got.knownPlaces.includes(s.where.place)) {
          assert.strictEqual(got.loc, s.where.place, `${surface}: place ${url}`);
          assert.strictEqual(got.radius, s.where.radius === "orbit" ? "all" : s.where.radius, `${surface}: radius ${url}`);
          carried[surface].add("place+radius");
        } else {
          assert.strictEqual(got.loc, null);
          if (s.where.place) dropped[surface].add("place:" + s.where.place);
          if (!s.where.place && s.where.radius) dropped[surface].add("orbit with no place");
        }
        // WHEN: only the modes that page already knows.
        const mode = s.when.mode;
        if (mode && PAGES[surface].understands.has(mode)) { assert.strictEqual(got.when, mode, `${surface}: when ${url}`); carried[surface].add("when:" + mode); }
        else { assert.strictEqual(got.when, null, `${surface}: an unknown when is ignored, not misread ${url}`); if (mode) dropped[surface].add("when:" + mode); }
        // Calendar opens the day for any single-day state.
        if (surface === "calendar") {
          const w = D.window(s, CTX);
          const single = ["today", "tonight", "tomorrow"].includes(mode) || (mode === "dates" && s.when.from === s.when.to);
          if (single) { assert.strictEqual(got.selectedDate, w.from, `calendar opens ${w.from} for ${url}`); carried.calendar.add("opens the day:" + mode); }
          else if (mode !== "weekend") assert.strictEqual(got.selectedDate, null, `calendar opens no particular day for ${url}`);
        }
        // Neighborhood: the homepage only.
        if (surface === "home") { assert.strictEqual(got.neighborhood, s.where.neighborhood, `home: neighborhood ${url}`); if (s.where.neighborhood) carried.home.add("neighborhood"); }
        else if (s.where.neighborhood) dropped[surface].add("neighborhood");
      });
    });
    // What the approved plan said would and would not travel before Calendar and Map adopt the shared file.
    for (const surface of ["calendar", "map"]) {
      for (const must of ["place+radius", "when:tonight", "when:weekend", "when:today", "feature:tickets"]) assert.ok(carried[surface].has(must), `${surface} should carry ${must}`);
      for (const gap of ["when:tomorrow", "when:next7", "when:week", "when:all", "when:dates", "neighborhood", "feature:radar", "feature:clothing_optional", "place:Lansing", "orbit with no place"]) assert.ok(dropped[surface].has(gap), `${surface} is expected not to carry ${gap} yet`);
    }
    for (const must of ["opens the day:today", "opens the day:tonight", "opens the day:tomorrow", "opens the day:dates"]) assert.ok(carried.calendar.has(must), `calendar ${must}`);
    console.log(`PASS: ${states.length} states sent through Discovery.href() into each page's real readStateFromURL() — categories, free, search, known features, place + radius, tonight / weekend / today carry to Calendar and Map now; Calendar opens the right day for single-day states`);
    console.log(`      not carried until Calendar and Map adopt the shared file: ${Array.from(dropped.calendar).sort().join(", ")}`);
  }

  // =====================================================================
  // 4. DRIFT GUARDS
  // =====================================================================
  {
    const canonical = D.categories.map((c) => [c.key, c.label]);
    const evalIn = (src, expr) => { const sb = {}; vm.createContext(sb); vm.runInContext(src, sb); return vm.runInContext(expr, sb); };
    // Six pages keep CATS as an object, submit.html as a list.
    ["index.html", "calendar.html", "map.html", "event-template.html", "radar.html", "venue-template.html"].forEach((f) => {
      const cats = evalIn(block(read(f), "CATS", "\\};"), "Object.keys(CATS).map(function(k){ return [k, CATS[k].label]; })");
      assert.deepStrictEqual(plain(cats), canonical, `${f}: CATS keys, labels and order match discovery.js`);
    });
    assert.deepStrictEqual(plain(evalIn(block(read("submit.html"), "CATS", "\\];"), "CATS.map(function(c){ return [c.key, c.label]; })")), canonical, "submit.html: CATS matches discovery.js");
    // admin.html's editorial form lists [key, label] pairs. Same keys, same
    // order. ONE label already differs there today — 'fest' reads
    // "Festivals" in the admin form and "Festivals & Parades" everywhere
    // public. That pre-existing difference is recorded here rather than
    // silently tolerated: any OTHER difference fails.
    const adminBlock = grab(read("admin.html"), /const EDITORIAL_CATEGORIES = \[[\s\S]*?\n\];/, "admin.html EDITORIAL_CATEGORIES");
    const adminPairs = [...adminBlock.matchAll(/\['([a-z]+)',\s*'([^']+)'\]/g)].map((m) => [m[1], m[2]]);
    const KNOWN_ADMIN_LABEL_DIFFERENCES = { fest: "Festivals" };
    assert.deepStrictEqual(adminPairs, canonical.map(([k, label]) => [k, KNOWN_ADMIN_LABEL_DIFFERENCES[k] || label]), "admin.html: category keys, order and labels match discovery.js (except the one recorded label)");
    // Server-side whitelists: same set of keys.
    ["api/submit.js", "api/submit-feed.js", "api/admin-editorial.js"].forEach((f) => {
      const body = grab(read(f), /const VALID_CATEGORIES = new Set\(\[[\s\S]*?\]\)/, `${f} VALID_CATEGORIES`).replace(/\/\/[^\n]*/g, "");
      const keys = [...body.matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();
      assert.deepStrictEqual(keys, canonical.map(([k]) => k).sort(), `${f}: accepted categories match discovery.js`);
    });
    console.log("PASS: (drift guard) the category list in 7 pages, admin.html and 3 API whitelists matches discovery.js");

    // Places: the homepage's table is the one discovery.js was built from.
    const sb = {}; vm.createContext(sb);
    vm.runInContext([block(INDEX, "LOCATIONS", "\\];"), line(INDEX, "DETROIT_BOUNDARY"), line(INDEX, "DB_LAT0"), line(INDEX, "DB_MILES_PER_DEG_LAT"), line(INDEX, "DB_MILES_PER_DEG_LON"), fn(INDEX, "dbToXY"), fn(INDEX, "dbDistPointToSeg"), fn(INDEX, "milesFromDetroitBorder"), line(INDEX, "BLOCKED_NAMES"), block(INDEX, "FEATURE_CHIPS", "\\];")].join("\n"), sb);
    assert.deepStrictEqual(plain(D.places), plain(vm.runInContext("LOCATIONS", sb)), "places match index.html's LOCATIONS exactly");
    const server = require(`${REPO_DIR}/api/_lib/detroit-boundary.js`);
    assert.deepStrictEqual(plain(vm.runInContext("DETROIT_BOUNDARY", sb)), plain(server.DETROIT_BOUNDARY), "the homepage and server boundary copies agree with each other");
    // The Orbit decision for every city agrees with the homepage's and the server's own maths.
    const orbit = D.change(D.defaults(), { where: { radius: "orbit" } });
    D.places.filter((p) => p.type === "city").forEach((p) => {
      sb.__p = p;
      const pageMiles = vm.runInContext("milesFromDetroitBorder(__p.lat, __p.lng)", sb);
      const inOrbit = D.matches({ id: p.name, date: "2026-10-03", cat: "music", city: p.name === "Detroit" ? undefined : p.name }, orbit, { now: new Date("2026-10-03T19:00:00Z") });
      assert.strictEqual(inOrbit, pageMiles <= 75, `${p.name}: Orbit membership matches the homepage (${pageMiles.toFixed(1)} mi from the border)`);
      assert.ok(Math.abs(server.milesFromDetroitBorder(p.lat, p.lng) - pageMiles) < 1e-9, `${p.name}: server and homepage distances agree`);
    });
    // A point just inside and just outside the line, to pin the boundary data itself.
    const probe = _probeOrbit();
    assert.strictEqual(probe.inside, true); assert.strictEqual(probe.outside, false);
    // Derived features and blocked names.
    const chips = plain(vm.runInContext("FEATURE_CHIPS", sb));
    assert.deepStrictEqual(D.features.filter((f) => f.kind === "derived").map((f) => ({ key: f.key, label: f.label })), chips, "derived features match the homepage's FEATURE_CHIPS");
    const blocked = plain(vm.runInContext("BLOCKED_NAMES", sb));
    blocked.forEach((name) => assert.strictEqual(D.matches({ id: "b", date: "2026-10-03", cat: "music", title: name }, D.defaults(), { now: new Date("2026-10-03T19:00:00Z") }), false, `${name} is blocked`));
    ["calendar.html", "map.html"].forEach((f) => assert.deepStrictEqual(plain(evalIn(line(read(f), "BLOCKED_NAMES"), "BLOCKED_NAMES")), blocked, `${f} blocked names match`));
    console.log("PASS: (drift guard) places, Orbit membership of every city, derived features and blocked names match the live copies");
  }

  console.log("\nAll discovery compatibility tests passed.");
}

// Saginaw is the documented near-miss just outside the Orbit (75.4 mi from
// the border, SERVICE_AREA.md); Lansing is the documented case just inside
// (67.5 mi). Built with a private places table so the real one is untouched.
function _probeOrbit() {
  const { _build, _defaultConfig } = require(`${REPO_DIR}/discovery.js`);
  const P = _build(Object.assign({}, _defaultConfig, { places: _defaultConfig.places.concat([["Saginaw", "city", "Michigan", 43.4195, -83.9508]]) }));
  const orbit = P.change(P.defaults(), { where: { radius: "orbit" } });
  const ctx = { now: new Date("2026-10-03T19:00:00Z") };
  return {
    inside: P.matches({ id: 1, date: "2026-10-03", cat: "music", city: "Lansing" }, orbit, ctx),
    outside: P.matches({ id: 2, date: "2026-10-03", cat: "music", city: "Saginaw" }, orbit, ctx),
  };
}

try { run(); } catch (err) { console.error("FAIL:", err); process.exitCode = 1; }
