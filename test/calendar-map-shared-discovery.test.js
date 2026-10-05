// test/calendar-map-shared-discovery.test.js — Calendar and Map on the
// shared Discovery layer.
//
// On 2026-10-05 calendar.html and map.html stopped carrying private copies of
// discovery (the category list, the places table, the date and search rules,
// the blocked names, the URL codec) and adopted /discovery.js, as the
// homepage did on 2026-10-03 (DEC-022). They hold ONE filter state, change
// it only through Discovery.change(), and ask Discovery.matches() what
// belongs. Nothing about their LAYOUT changed — no new Calendar views, no
// Orbit redesign; those wait for the geography work.
//
// This file RUNS the real pages (their real inline scripts, with
// discovery.js, paged-fetch.js and legal-snippets.js exactly as the browser
// loads them) against an in-memory database and a fixed clock — see
// test/fixtures/fake-dom.js — and proves:
//
//   1. the wiring: both pages load the shared file, and none of the old
//      page-local copies of a rule survived;
//   2. Home -> Calendar -> Map -> Calendar carries the same query, for a
//      spread of states, through each page's own links and URL reader;
//   3. every existing Calendar and Map URL form still parses (legacy cats=
//      lists, radius=all, when=now / thisweek, picked dates, Calendar's own
//      date= and view=);
//   4. WHAT is positive and additive on both pages;
//   5. what each page shows is exactly what Discovery.matches() says — and
//      the old page-local differences (two-field search, no Lansing, a
//      today-only "tonight") are gone;
//   6. Calendar's month/day/view and Map's selection are VIEW state: they
//      are never written into the shared query or carried to another page;
//   7. paged event fetching still delivers every row through the API cap;
//   8. the homepage is unchanged: it links /site.css (the shared foundation
//      lifted verbatim from its own inline style), and that file holds only
//      shared rules.
//
// "Today" throughout is Saturday 2026-10-03, 3:00 PM in Detroit.
//
// Run: node test/calendar-map-shared-discovery.test.js
"use strict";
process.env.TZ = "America/Detroit";

const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { Discovery: D } = require(`${REPO_DIR}/discovery.js`);
const { makeMockPostgrest } = require(`${REPO_DIR}/test/fixtures/mock-postgrest.js`);
const { loadPage, inlineScript } = require(`${REPO_DIR}/test/fixtures/fake-dom.js`);
const read = (f) => fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
const plain = (x) => JSON.parse(JSON.stringify(x));

const NOW = "2026-10-03T19:00:00Z"; // Sat 3:00 PM, Detroit
const CTX = { now: new Date(NOW) };
const day = (n) => new Date(Date.UTC(2026, 9, 3 + n)).toISOString().slice(0, 10);

const PAGES = { calendar: read("calendar.html"), map: read("map.html"), home: read("index.html") };
const SCRIPT = { calendar: inlineScript(PAGES.calendar), map: inlineScript(PAGES.map), home: inlineScript(PAGES.home) };
const FILE = { calendar: "/calendar.html", map: "/map.html", home: "/" };

// ---- the database ------------------------------------------------------
function ev(id, title, start, extra) {
  return Object.assign({
    id, title, description: null, image_url: null, start_date: start, end_date: null,
    venue_name_raw: "Hall", venue_city_raw: null, venue_id: null, category: "music", time_display: "",
    is_free: false, source: "Manual", note: null, ticket_url: null, event_url: null, price_from: null,
    ticket_status: null, status: "approved",
  }, extra || {});
}
const ROWS = [
  ev("p1", "Past Gig", day(-2), { time_display: "8:00 PM" }),
  ev("t1", "Jazz Tonight", day(0), { time_display: "8:00 PM", source: "Eventbrite", ticket_url: "https://tickets.example/jazz" }),
  ev("t2", "Free Market", day(0), { time_display: "10:00 AM–2:00 PM", category: "food", is_free: true }), // over by 3 PM
  ev("t3", "Late Film", day(0), { time_display: "9:00 PM", category: "film" }),
  ev("t4", "Augustus Williams Live", day(0), { time_display: "9:00 PM" }), // blocked name
  ev("m1", "Tomorrow Show", day(1), { time_display: "7:00 PM", category: "theatre" }),
  ev("f1", "Ferndale Night", day(1), { time_display: "10:00 PM", category: "nightlife", venue_city_raw: "Ferndale", venue_name_raw: "The Loft" }),
  ev("a1", "Folk Evening", day(2), { time_display: "7:30 PM", venue_city_raw: "Ann Arbor", venue_name_raw: "The Ark" }),
  ev("r1", "Richmond Fair", day(2), { category: "fest", venue_city_raw: "Richmond" }), // a city not in the places table
  ev("l1", "Lansing Game", day(5), { category: "sports", venue_city_raw: "Lansing", time_display: "1:00 PM", note: "Spartans" }),
  ev("n1", "Wednesday Social", day(4), { category: "community", is_free: true, source: "Venue Submission", note: "Bring a towel", time_display: "2:00 PM" }),
];
function database(rows) {
  const approved = rows.filter((r) => r.status === "approved");
  return { events: rows, events_public: approved, venues: [], editorial_article_events: [] };
}

// Elements the pages' scripts find by selector in their static markup.
const SEED = [
  ...["now", "today", "tonight", "weekend", "date", "tomorrow", "all"].map((w) => ({ className: "when-btn", dataset: { when: w } })),
  ...["5", "10", "25", "50", "all"].map((r) => ({ className: "radius-chip" + (r === "all" ? " active" : ""), dataset: { radius: r } })),
  { tag: "a", className: "site-nav-link", dataset: { surface: "calendar" } },
  { tag: "a", className: "site-nav-link", dataset: { surface: "map" } },
];

async function open(surface, url, opts) {
  opts = opts || {};
  const api = makeMockPostgrest(database(opts.rows || ROWS), { cap: 1000 });
  const page = loadPage({
    url: url || FILE[surface], now: opts.now || NOW, seed: SEED, fetch: api.fetch,
    scripts: [read("legal-snippets.js"), read("paged-fetch.js"), read("discovery.js"), SCRIPT[surface]],
    names: ["legal-snippets.js", "paged-fetch.js", "discovery.js", surface + ".html <script>"],
  });
  await page.settle();
  page.requests = api.log;
  page.surface = surface;
  return page;
}
const stateOf = (page) => plain(page.get("state"));
const linkTo = (page, surface) => {
  const a = page.document.querySelectorAll("a[data-surface]").find((x) => x.dataset.surface === surface);
  assert.ok(a, `${page.surface} has a link to ${surface}`);
  return a.getAttribute("href");
};
const shown = (page) => plain(page.run("inView(EVENTS).map(function(e){ return e.id; })")).sort();
// What Discovery itself says, over the same events, with the surface's context.
function expected(page, includePast) {
  const s = page.get("state");
  const ctx = { now: new Date(NOW), defaultWhen: "all", includePast: includePast === undefined ? false : includePast };
  return plain(page.run("EVENTS.map(function(e){ return e; })")).filter((e) => D.matches(e, s, ctx)).map((e) => e.id).sort();
}
const click = (page, el) => page.click(el);
const chips = (page) => page.el("filterBar").children;
const chip = (page, sel) => chips(page).find((c) => (sel.cat ? c.dataset.cat === sel.cat : sel.id ? c.id === sel.id : c.dataset.feature === sel.feature));

// A spread of states, as the shared codec writes them.
const mk = (...patches) => patches.reduce((s, p) => D.change(s, p), D.defaults());
const STATES = {
  "nothing": mk(),
  "one category": mk({ what: { only: "music" } }),
  "two categories (additive)": mk({ what: { only: "music" } }, { what: { add: "film" } }),
  "free": mk({ free: true }),
  "features": mk({ feature: { add: "tickets" } }, { feature: { add: "photo" } }),
  "search": mk({ q: 'jazz & "trio" 100%' }),
  "place + radius": mk({ where: { place: "Ann Arbor", radius: 25 } }),
  "place, orbit": mk({ where: { place: "Ann Arbor" } }),
  "a place only the shared table has": mk({ where: { place: "Lansing", radius: 50 } }),
  "orbit with no place": mk({ where: { radius: "orbit" } }),
  "when today": mk({ when: "today" }),
  "when tonight": mk({ when: "tonight" }),
  "when tomorrow": mk({ when: "tomorrow" }),
  "when weekend": mk({ when: "weekend" }),
  "when next7": mk({ when: "next7" }),
  "when week": mk({ when: "week" }),
  "when all": mk({ when: "all" }),
  "one picked date": mk({ when: { from: "2026-11-14" } }),
  "a picked range": mk({ when: { from: "2026-10-05", to: "2026-10-09" } }),
  "neighborhood": mk({ where: { neighborhood: "Corktown" } }),
  "an unlisted feature (radar)": mk({ feature: { add: "radar" } }),
  "everything at once": mk({ when: "weekend" }, { what: { only: "music" } }, { where: { place: "Flint", radius: 10 } }, { free: true }, { feature: { add: "tickets" } }, { q: "show" }),
};

async function main() {
  // =====================================================================
  // 1. WIRING — the shared file is loaded; no private copy of a rule is left
  // =====================================================================
  {
    for (const surface of ["calendar", "map"]) {
      const html = PAGES[surface];
      assert.ok(/<script src="\/paged-fetch\.js"><\/script>\s*<script src="\/discovery\.js"><\/script>/.test(html), `${surface}: loads /discovery.js right after /paged-fetch.js, in <head>`);
      assert.ok(html.indexOf('src="/discovery.js"') < html.indexOf("<body>"), `${surface}: discovery.js is loaded before the page's own script`);
      const src = SCRIPT[surface];
      // The URL codec and the filter predicate are Discovery's.
      assert.ok(/state = Discovery\.fromQuery\(location\.search\)/.test(src), `${surface}: reads its URL with Discovery.fromQuery`);
      assert.ok(/Discovery\.toQuery\(state\)/.test(src), `${surface}: writes its URL with Discovery.toQuery`);
      assert.ok(/Discovery\.matches\(e, state, ctx\)/.test(src), `${surface}: asks Discovery.matches what belongs`);
      assert.ok(/Discovery\.href\(a\.dataset\.surface, state, ctx\)/.test(src), `${surface}: links to the other surfaces with Discovery.href`);
      assert.ok(/Discovery\.change\(state, patch\)/.test(src), `${surface}: changes state only through Discovery.change`);
      // Page-local copies of a rule, and the globals they used.
      ["BLOCKED_NAMES", "isBlockedEvent", "LOCATIONS", "haversineMiles", "parseHour", "getWeekendDates", "matchesFilters"].forEach((name) => {
        assert.ok(!new RegExp("(const|let|var|function)\\s+" + name + "\\b").test(src), `${surface}: no local ${name}`);
      });
      ["activeCats", "freeOnly", "activeFeatures", "whenMode", "cachedWeekendDates", "radiusMiles"].forEach((name) => {
        assert.ok(!new RegExp("\\b" + name + "\\b").test(src.replace(/\/\/[^\n]*/g, "")), `${surface}: the ${name} global is gone (it is part of the one state)`);
      });
      assert.ok(!/\bquery\s*=/.test(src.replace(/\/\/[^\n]*/g, "")) || !/let query\b/.test(src), `${surface}: no private search-text variable`);
      assert.ok(!/new URLSearchParams\(\)/.test(src), `${surface}: builds no query string of its own for discovery state`);
    }
    // The page-local place data is Discovery's: the pages' old tables were a strict subset of it.
    const placeNames = D.places.map((p) => p.name);
    ["Detroit", "Corktown", "Windsor", "Ann Arbor", "Flint", "Lansing"].forEach((n) => assert.ok(placeNames.includes(n), `Discovery.places has ${n}`));
    console.log("PASS: Calendar and Map load discovery.js and keep no private copy of the categories, places, blocked names, date maths, filter predicate or URL codec");
  }

  // =====================================================================
  // 2. HOME -> CALENDAR -> MAP -> CALENDAR keeps the same query
  // =====================================================================
  {
    let n = 0;
    for (const [name, s] of Object.entries(STATES)) {
      // HOME reads the shared codec itself; hand its state to Calendar the way the homepage does.
      const home = await open("home", D.href("home", s, CTX));
      const homeState = stateOf(home);
      assert.deepStrictEqual(homeState, plain(s), `[${name}] the homepage reads the link as the same state`);
      const toCalendar = D.href("calendar", home.get("state"), CTX);

      const cal = await open("calendar", toCalendar);
      assert.deepStrictEqual(stateOf(cal), plain(s), `[${name}] Calendar reads the homepage's link as the same state (${toCalendar})`);

      const toMap = linkTo(cal, "map");
      const map = await open("map", toMap);
      assert.deepStrictEqual(stateOf(map), plain(s), `[${name}] Map reads Calendar's link as the same state (${toMap})`);

      const back = linkTo(map, "calendar");
      const cal2 = await open("calendar", back);
      assert.deepStrictEqual(stateOf(cal2), plain(s), `[${name}] Calendar reads Map's link as the same state (${back})`);
      assert.strictEqual(D.toQuery(cal2.get("state")), D.toQuery(s), `[${name}] and the query is byte-for-byte the same`);
      // The query each page writes to its own address bar is the same filters, too.
      const bar = (p) => (p.url() || "").split("?")[1] || "";
      const strip = (q) => q.split("&").filter((kv) => !/^(date|view)=/.test(kv)).join("&");
      assert.strictEqual(strip(bar(cal)), D.toQuery(s), `[${name}] Calendar's own address bar carries the same filters`);
      assert.strictEqual(bar(map), D.toQuery(s), `[${name}] Map's own address bar carries the same filters`);
      n++;
    }
    console.log(`PASS: ${n} states went Home -> Calendar -> Map -> Calendar through each page's real reader and links and came back identical (when, from/to, cats, free, features, q, loc, radius, neighborhood)`);
  }

  // =====================================================================
  // 3. EXISTING URLS STILL PARSE
  // =====================================================================
  {
    const empty = plain(D.defaults());
    const cases = [
      // [url suffix, expected canonical state]
      ["?when=now", mk({ when: "today" })],
      ["?when=today", mk({ when: "today" })],
      ["?when=tonight", mk({ when: "tonight" })],
      ["?when=weekend", mk({ when: "weekend" })],
      ["?when=thisweek", mk({ when: "week" })],
      ["?when=date&picked=2026-11-14", mk({ when: { from: "2026-11-14" } })],
      ["?when=range&rangeStart=2026-11-14&rangeEnd=2026-11-20", mk({ when: { from: "2026-11-14", to: "2026-11-20" } })],
      ["?when=nonsense", empty],
      ["?radius=all", mk({ where: { radius: "orbit" } })],
      ["?loc=Ann+Arbor&radius=all", mk({ where: { place: "Ann Arbor", radius: "orbit" } })],
      ["?loc=Ann+Arbor", mk({ where: { place: "Ann Arbor" } })],
      ["?loc=Ann+Arbor&radius=25", mk({ where: { place: "Ann Arbor", radius: 25 } })],
      ["?loc=Ann+Arbor&radius=75", mk({ where: { place: "Ann Arbor" } })],
      ["?loc=Lansing&radius=50", mk({ where: { place: "Lansing", radius: 50 } })],
      ["?loc=Elmwood+Park&radius=10", empty],
      ["?cats=music", mk({ what: { only: "music" } })],
      ["?cats=music,film", mk({ what: { only: "music" } }, { what: { add: "film" } })],
      ["?cats=" + D.categories.map((c) => c.key).join(","), empty],     // the old "all chips on" list
      ["?cats=", empty],                                                 // bare cats= used to mean none; it is all events now
      ["?cats=bogus", empty],
      ["?free=1&features=tickets,photo&q=jazz", mk({ free: true }, { feature: { add: "tickets" } }, { feature: { add: "photo" } }, { q: "jazz" })],
    ];
    for (const surface of ["calendar", "map"]) {
      for (const [suffix, want] of cases) {
        const page = await open(surface, FILE[surface] + suffix);
        assert.deepStrictEqual(stateOf(page), plain(want), `${surface}${suffix}`);
      }
    }
    // Calendar's own position parameters.
    const c1 = await open("calendar", "/calendar.html?date=2026-10-15");
    assert.deepStrictEqual(stateOf(c1), empty, "date= is position, not a filter");
    assert.strictEqual(c1.get("selectedDate"), "2026-10-15", "?date= opens that day");
    assert.strictEqual(c1.get("current.getMonth()"), 9);
    const c2 = await open("calendar", "/calendar.html?view=list&cats=music");
    assert.strictEqual(c2.get("mode"), "list", "?view=list opens the list");
    assert.deepStrictEqual(stateOf(c2), plain(mk({ what: { only: "music" } })));
    const c3 = await open("calendar", "/calendar.html?view=map");
    assert.strictEqual(c3.get("mode"), "map", "?view=map opens the map view");
    const c4 = await open("calendar", "/calendar.html?when=weekend");
    assert.strictEqual(c4.get("mode"), "list", "a weekend link opens Calendar's list, as before");
    const c5 = await open("calendar", "/calendar.html?when=weekend&view=month");
    assert.strictEqual(c5.get("mode"), "month", "unless the link explicitly asks for the month");
    const c6 = await open("calendar", "/calendar.html?when=tonight");
    assert.strictEqual(c6.get("selectedDate"), day(0), "a tonight link opens today's panel, as before");
    const c7 = await open("calendar", "/calendar.html?when=tomorrow");
    assert.strictEqual(c7.get("selectedDate"), day(1), "a tomorrow link (new to Calendar) opens tomorrow");
    const c8 = await open("calendar", "/calendar.html?when=dates&from=2026-11-14");
    assert.strictEqual(c8.get("selectedDate"), "2026-11-14", "a picked date opens that day");
    assert.strictEqual(c8.get("current.getMonth()"), 10, "in its month");
    // A date link written by the homepage's mini-calendar and by Discovery.href.
    const c9 = await open("calendar", D.href("calendar", mk({ when: "tomorrow" }), CTX));
    assert.strictEqual(c9.get("selectedDate"), day(1));
    console.log(`PASS: ${cases.length} existing URL forms parse on Calendar and on Map (when=now / thisweek / date+picked / range, radius=all, legacy cats= lists, loc+radius, free, features, q), plus Calendar's own date= and view=`);
  }

  // =====================================================================
  // 4. WHAT IS POSITIVE AND ADDITIVE
  // =====================================================================
  {
    for (const surface of ["calendar", "map"]) {
      const page = await open(surface);
      assert.deepStrictEqual(stateOf(page).what.paths, [], `${surface}: resting state selects nothing — every event`);
      assert.ok(chip(page, { id: "allTypesChip" }).classList.contains("active"), `${surface}: "All types" is lit at rest`);
      assert.ok(!chip(page, { cat: "music" }).classList.contains("active"), `${surface}: a category chip is NOT lit at rest (it used to be, with everything on)`);
      click(page, chip(page, { cat: "music" }));
      assert.deepStrictEqual(stateOf(page).what.paths, ["music"], `${surface}: a click ADDS the category`);
      assert.ok(chip(page, { cat: "music" }).classList.contains("active") && !chip(page, { id: "allTypesChip" }).classList.contains("active"));
      click(page, chip(page, { cat: "film" }));
      assert.deepStrictEqual(stateOf(page).what.paths, ["music", "film"], `${surface}: a second click adds, it does not replace`);
      assert.deepStrictEqual(shown(page), expected(page, surface === "calendar"), `${surface}: music + film is the union`);
      assert.ok(shown(page).includes("t1") && shown(page).includes("t3") && !shown(page).includes("m1"), `${surface}: Jazz and the film are in, the theatre show is not`);
      click(page, chip(page, { cat: "music" }));
      assert.deepStrictEqual(stateOf(page).what.paths, ["film"], `${surface}: clicking a lit chip removes just that one`);
      click(page, chip(page, { cat: "film" }));
      assert.deepStrictEqual(stateOf(page).what.paths, [], `${surface}: removing the last returns to all events`);
      // selecting every category is the same as none
      D.categories.forEach((c) => click(page, chip(page, { cat: c.key })));
      assert.deepStrictEqual(stateOf(page).what.paths, [], `${surface}: selecting all fifteen reads as all events`);
      assert.ok(chip(page, { id: "allTypesChip" }).classList.contains("active"));
      // "All types" clears a selection; free and features are AND'd on top.
      click(page, chip(page, { cat: "music" }));
      click(page, chip(page, { id: "allTypesChip" }));
      assert.deepStrictEqual(stateOf(page).what.paths, [], `${surface}: All types clears the selection`);
      click(page, chip(page, { id: "freeChip" }));
      click(page, chip(page, { feature: "tickets" }));
      assert.strictEqual(stateOf(page).what.free, true);
      assert.deepStrictEqual(stateOf(page).what.features, ["tickets"]);
      assert.deepStrictEqual(shown(page), expected(page, surface === "calendar"), `${surface}: free AND tickets`);
      assert.deepStrictEqual(shown(page), [], `${surface}: nothing is both free and ticketed`);
      // The Showing: tray names each selection and removes it through Discovery.
      click(page, chip(page, { cat: "music" }));
      const tray = page.el("activeFilters");
      assert.ok(/Music/.test(tray.innerHTML) && /Free only/.test(tray.innerHTML) && /Tickets available/.test(tray.innerHTML), `${surface}: the tray lists Music, Free only and Tickets`);
      const musicChip = tray.children.find((c) => c.children[0] && c.children[0].textContent === "Music");
      click(page, musicChip.children[1]);
      assert.deepStrictEqual(stateOf(page).what.paths, [], `${surface}: the tray's ✕ removes it`);
      // Reset
      click(page, chip(page, { id: "clearChip" }));
      assert.deepStrictEqual(stateOf(page), plain(D.defaults()), `${surface}: Reset filters returns to the defaults`);
    }
    console.log("PASS: WHAT is positive and additive on Calendar and Map — nothing lit is every event, a click adds, the last removal returns to all, all fifteen is none, free and features AND on top");
  }

  // =====================================================================
  // 5. WHAT EACH PAGE SHOWS IS WHAT DISCOVERY SAYS (and no old page-local rule survived)
  // =====================================================================
  {
    for (const surface of ["calendar", "map"]) {
      const history = surface === "calendar";
      for (const [name, s] of Object.entries(STATES)) {
        const page = await open(surface, D.href(surface, s, CTX));
        assert.deepStrictEqual(shown(page), expected(page, history && s.when.mode === null), `${surface} [${name}]: shows exactly what Discovery.matches says`);
        assert.ok(!shown(page).includes("t4"), `${surface} [${name}]: the blocked name never shows`);
      }
      const at = async (suffix) => shown(await open(surface, FILE[surface] + suffix));
      // SEARCH is one haystack of seven fields (the old pages matched title + venue only).
      assert.ok((await at("?q=eventbrite")).includes("t1"), `${surface}: search reaches the source`);
      assert.ok((await at("?q=ferndale")).includes("f1"), `${surface}: search reaches the city`);
      assert.ok((await at("?q=towel")).includes("n1"), `${surface}: search reaches the note`);
      assert.ok((await at("?q=nightlife")).includes("f1"), `${surface}: search reaches the category label`);
      // TONIGHT is today at 5 PM or later; the old pages ran on the visitor's clock and parsed a single hour.
      assert.deepStrictEqual(await at("?when=tonight"), ["t1", "t3"].sort(), `${surface}: tonight`);
      // TODAY is what is still on or still to come: the morning market is over at 3 PM.
      assert.ok(!(await at("?when=today")).includes("t2"), `${surface}: today leaves out what is already over`);
      // TOMORROW, WEEK, NEXT7 — modes these pages never had.
      assert.deepStrictEqual(await at("?when=tomorrow"), ["f1", "m1"], `${surface}: tomorrow`);
      assert.ok((await at("?when=next7")).includes("l1") && !(await at("?when=next7")).includes("p1"), `${surface}: next 7 days`);
      // A place only the shared table has.
      assert.deepStrictEqual((await at("?loc=Lansing&radius=10")).filter((id) => id === "l1"), ["l1"], `${surface}: Lansing is a place`);
      // An unplaceable city is excluded by any radius, kept without one.
      assert.ok(!(await at("?radius=all")).includes("r1"), `${surface}: the Orbit cannot place Richmond`);
      assert.ok((await at("")).includes("r1"), `${surface}: with no radius, Richmond shows`);
      // The Orbit from a place does not narrow; a mile ring does.
      assert.ok((await at("?loc=Detroit&radius=5")).includes("t1") && !(await at("?loc=Detroit&radius=5")).includes("a1"), `${surface}: 5 miles from Detroit keeps Detroit, drops Ann Arbor`);
      assert.ok((await at("?loc=Detroit&radius=all")).includes("a1"), `${surface}: the Orbit from Detroit keeps Ann Arbor`);
      // Picked dates are taken as chosen, past included.
      assert.ok((await at("?when=dates&from=" + day(-2))).includes("p1"), `${surface}: a picked past date shows what happened that day`);
    }
    // Calendar browses history; Map plots what is current or upcoming.
    assert.ok(shown(await open("calendar")).includes("p1"), "Calendar, resting: past events stay browsable");
    assert.ok(!shown(await open("calendar", "/calendar.html?when=all")).includes("p1"), "Calendar with a When: forward-looking, like everywhere else");
    assert.ok(!shown(await open("map")).includes("p1"), "Map: no history on the map");
    // A multi-day run is on every day of its window — but only those: a Tomorrow filter does not paint it onto other days.
    const rows = ROWS.concat([ev("x1", "Long Exhibit", day(-3), { end_date: day(4), category: "museum" })]);
    const cal = await open("calendar", "/calendar.html?when=tomorrow", { rows });
    assert.strictEqual(cal.run("eventsOn('" + day(1) + "').some(function(e){ return e.id === 'x1'; })"), true, "the exhibit is on tomorrow");
    assert.strictEqual(cal.run("eventsOn('" + day(2) + "').length"), 0, "but a Tomorrow view has nothing on the day after");
    console.log("PASS: on both pages what is shown equals Discovery.matches for 22 states; search reads seven fields, tonight / today / tomorrow / next7 follow Discovery, Lansing resolves, the Orbit and mile rings are Discovery's, history is Calendar's alone");
  }

  // =====================================================================
  // 6. VIEW STATE IS NOT DISCOVERY STATE
  // =====================================================================
  {
    const cal = await open("calendar", "/calendar.html?cats=music&q=jazz");
    const before = stateOf(cal);
    const mapLinkBefore = linkTo(cal, "map");
    cal.run("document.getElementById('listViewBtn').onclick()");
    assert.strictEqual(cal.get("mode"), "list");
    assert.ok(/[?&]view=list/.test(cal.url()), "Calendar writes its own view into its own address bar");
    assert.deepStrictEqual(stateOf(cal), before, "switching view does not touch the filter state");
    assert.strictEqual(linkTo(cal, "map"), mapLinkBefore, "and the link to Map does not carry the view");
    assert.ok(!/view=|date=/.test(linkTo(cal, "map")) && !/view=/.test(linkTo(cal, "calendar")), "no view= or date= in a cross-surface link (unless Discovery.href adds date= for a single day)");
    cal.run("current = new Date(2026, 11, 1)");
    cal.run("selectedDate = '2026-12-05'; render();");
    assert.deepStrictEqual(stateOf(cal), before, "browsing to another month or opening a day does not touch the filter state");
    assert.ok(!/12-05|date=/.test(linkTo(cal, "map")), "an open day is not carried to Map");
    const map = await open("map", linkTo(cal, "map"));
    map.run("selectedPlaceKey = 'c:detroit'; render();");
    assert.ok(!/place|select/i.test(map.url() || ""), "Map's selected place is not in its address bar");
    assert.deepStrictEqual(stateOf(map), before, "and it is not filter state");
    // A filter change on Calendar updates the links it gives to the other surfaces.
    click(cal, chip(cal, { id: "freeChip" }));
    assert.ok(/free=1/.test(linkTo(cal, "map")), "toggling Free updates Calendar's link to Map");
    click(map, chip(map, { id: "freeChip" }));
    assert.ok(/free=1/.test(linkTo(map, "calendar")), "toggling Free updates Map's link to Calendar");
    console.log("PASS: Calendar's view / month / open day and Map's selected place are view state — never in the shared query, never carried by a cross-surface link");
  }

  // =====================================================================
  // 7. PAGED EVENT FETCHING IS INTACT
  // =====================================================================
  {
    const many = [];
    for (let i = 0; i < 1500; i++) many.push(ev("g" + i, "Event " + i, day(i % 9), { time_display: "8:00 PM" }));
    for (const surface of ["calendar", "map"]) {
      const page = await open(surface, FILE[surface], { rows: many });
      assert.strictEqual(page.get("EVENTS.length"), 1500, `${surface}: holds all 1,500 rows, not the first 1,000`);
      const eventRequests = page.requests.filter((r) => /\/rest\/v1\/events\?/.test(r.url || r));
      assert.ok(eventRequests.some((r) => /offset=1000/.test(r.url || r)), `${surface}: asked for the second page`);
      assert.ok(eventRequests.every((r) => /order=start_date\.asc,id\.asc/.test(r.url || r)), `${surface}: pages in a total order`);
      assert.ok(read(surface === "calendar" ? "calendar.html" : "map.html").includes("fetchAllRows("), `${surface}: still fetches through fetchAllRows`);
    }
    console.log("PASS: Calendar and Map still page through the API's 1,000-row cap (1,500 rows loaded, second page requested)");
  }

  // =====================================================================
  // 8. THE HOMEPAGE IS UNCHANGED
  // =====================================================================
  {
    const home = PAGES.home;
    assert.ok(/<link rel="stylesheet" href="\/site\.css">\s*<style>/.test(home), "index.html links /site.css immediately before its own <style>");
    const site = read("site.css");
    const inline = home.match(/<style>([\s\S]*?)<\/style>/)[1];
    const strip = (c) => c.replace(/\/\*[\s\S]*?\*\//g, "");
    // The shared foundation is only what is shared: tokens, base, type voices, header + nav, Submit.
    assert.ok(/:root\{/.test(strip(site)) && /--accent:#D7FF00/.test(site) && /header\.site\{/.test(strip(site)) && /\.site-nav\{/.test(strip(site)) && /\.submit-btn\{/.test(strip(site)), "site.css carries the tokens, header, nav and Submit");
    assert.ok(!/:root\{/.test(strip(inline)) && !/header\.site\{/.test(strip(inline)) && !/\.site-nav\{/.test(strip(inline)), "the homepage no longer repeats them inline");
    ["\\.hero\\b", "\\.day-cell", "\\.stream", "\\.chip\\b", "#leafletMap", "\\.city-rail", "\\.evt-row"].forEach((sel) => {
      assert.ok(!new RegExp(sel).test(strip(site)), `site.css holds no page-specific rule (${sel})`);
    });
    // No selector is defined in both places: the cascade is exactly the old single stylesheet, split at a seam.
    const sel = (css) => new Set([...strip(css).matchAll(/(?:^|\})\s*([^{}@]+?)\s*\{/g)].map((m) => m[1].replace(/\s+/g, " ").trim()));
    const dup = [...sel(site)].filter((x) => sel(inline).has(x));
    assert.deepStrictEqual(dup, [], "no rule is defined in both site.css and the homepage's inline style");
    // The homepage's behaviour is the same script it had: it still adopts Discovery and links out with Discovery.href.
    assert.ok(/Discovery\.href\('calendar', state, ctx\)/.test(SCRIPT.home), "the homepage still links to Calendar with Discovery.href");
    // Calendar and Map do not link site.css yet: adopting it restyles them, which is the redesign ticket's job.
    assert.ok(!/site\.css/.test(PAGES.calendar) && !/site\.css/.test(PAGES.map), "Calendar and Map are not restyled by this change");
    console.log("PASS: the homepage links the shared /site.css (its own inline foundation, lifted verbatim, no duplicated rule) and still uses its own Discovery script; Calendar and Map keep their look");
  }

  console.log("\nAll Calendar + Map shared-discovery tests passed.");
}

main().catch((err) => { console.error("FAIL:", err); process.exitCode = 1; });
