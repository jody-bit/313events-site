// test/paged-loading-pages.test.js — proves each affected PAGE actually
// receives every event through the 1,000-row API cap, not just that a
// pagination helper exists.
//
// Context (2026-10-03 production defect — see paged-fetch.js's header):
// calendar.html was holding zero events starting today or later, and
// index.html / map.html were holding 686 of 1,901 upcoming events, because
// each made one un-paged request and Supabase silently returned only the
// first 1,000 rows.
//
// Same established convention as test/dynamic-explore-neighborhoods.test.js:
// this project has no DOM harness, so each page's REAL loadSupabaseEvents()
// is extracted verbatim from its HTML and EXECUTED — against a mock API that
// enforces the same 1,000-row cap (test/fixtures/mock-postgrest.js) and a
// production-shaped data set (2,954 rows; the real number of events
// starting on each October 2026 day). Only the page's DOM-touching
// collaborators (render(), buildFilterBar(), mapSupabaseRow()…) are stubbed.
// The real paged-fetch.js is loaded into the same sandbox the page code
// runs in, the same way the browser loads it.
//
// Run: node test/paged-loading-pages.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const {
  makeMockPostgrest,
  productionShapedEvents,
  OCTOBER_2026_STARTS,
  ROWS_BEFORE_OCTOBER,
  ROWS_AFTER_OCTOBER,
  isoPlusDays,
} = require(`${REPO_DIR}/test/fixtures/mock-postgrest.js`);

const TODAY = "2026-10-03";
const PAGED_FETCH_SRC = fs.readFileSync(`${REPO_DIR}/paged-fetch.js`, "utf8");
const read = (file) => fs.readFileSync(`${REPO_DIR}/${file}`, "utf8");

const ALL_ROWS = productionShapedEvents();
const APPROVED = ALL_ROWS.filter((r) => r.status === "approved");
const OCTOBER_TOTAL = OCTOBER_2026_STARTS.reduce((a, b) => a + b, 0);
const octoberDay = (i) => isoPlusDays("2026-10-01", i);

function tables() {
  return {
    events: ALL_ROWS,
    // The real events_public is a view over approved rows only, with no
    // `status` column of its own (migration_025).
    events_public: APPROVED.map(({ status, ...rest }) => rest),
    venues: Array.from({ length: 130 }, (_, i) => ({ id: `venue-${i}`, name: `Venue ${String(i).padStart(3, "0")}`, lat: null, lng: null })),
  };
}

function extract(html, pattern, label) {
  const m = html.match(pattern);
  assert.ok(m, `could not extract ${label} — source may have moved/changed shape`);
  return m[0];
}

// Runs one page's real loadSupabaseEvents() in a sandbox and returns what
// it left in EVENTS.
async function runPageLoader(file, floorDaysBack) {
  const html = read(file);
  const loader = extract(html, /async function loadSupabaseEvents\(\) \{[\s\S]*?\n\}\n/, `${file} loadSupabaseEvents`);
  const api = makeMockPostgrest(tables(), { cap: 1000 });
  const calls = { render: 0, buildFilterBar: 0, renderNeighborhoodsRail: 0 };
  const sandbox = {
    fetch: api.fetch,
    console,
    calls,
    TODAY,
    FLOOR: floorDaysBack == null ? null : isoPlusDays(TODAY, -floorDaysBack),
  };
  vm.createContext(sandbox);
  vm.runInContext(PAGED_FETCH_SRC, sandbox); // defines fetchAllRows, as the <script src> does in the browser
  vm.runInContext(
    `
    var SUPABASE_URL = "https://example.supabase.co";
    var SUPABASE_ANON_KEY = "anon";
    var EVENTS = [{ id: "fallback", date: "2000-01-01" }];
    var byDate = {};
    function getTodayISO(){ return TODAY; }
    function loadFloorISO(){ return FLOOR; }
    async function loadVenueLatLng(){}
    function mapSupabaseRow(row){ return { id: row.id, date: row.start_date, endDate: row.end_date || row.start_date, time: "" }; }
    function addToByDate(target, e){ (target[e.date] = target[e.date] || []).push(e); }
    function timeSortMinutes(){ return 0; }
    function buildFilterBar(){ calls.buildFilterBar++; }
    function render(){ calls.render++; }
    function renderNeighborhoodsRail(){ calls.renderNeighborhoodsRail++; }
    ${loader}
    `,
    sandbox
  );
  await vm.runInContext("loadSupabaseEvents()", sandbox);
  return {
    events: vm.runInContext("EVENTS", sandbox),
    byDate: vm.runInContext("byDate", sandbox),
    calls,
    requests: api.log,
  };
}

async function run() {
  // --- The fixture really reproduces production's failure ---
  {
    const api = makeMockPostgrest(tables(), { cap: 1000 });
    const resp = await api.fetch("https://example.supabase.co/rest/v1/events?status=eq.approved&select=id&order=start_date.asc&limit=5000", { headers: {} });
    const got = await resp.json();
    assert.strictEqual(got.length, 1000);
    assert.ok(got.every((r) => r.start_date < TODAY), "every one of the 1,000 rows returned started before today");
    assert.strictEqual(got[got.length - 1].start_date, "2026-10-02", "the capped set ends on 2026-10-02, exactly as measured in production");
  }
  console.log("PASS: (defect reproduced) calendar.html's old single request returns 1,000 rows ending 2026-10-02 — zero events from today forward");

  // --- CALENDAR: all approved events, complete October ---
  {
    const { events, byDate, calls, requests } = await runPageLoader("calendar.html", null);
    assert.strictEqual(events.length, APPROVED.length, "Calendar holds every approved event");
    assert.strictEqual(APPROVED.length, ROWS_BEFORE_OCTOBER + OCTOBER_TOTAL + ROWS_AFTER_OCTOBER);
    const upcoming = events.filter((e) => e.date >= TODAY).length;
    assert.strictEqual(upcoming, APPROVED.filter((r) => r.start_date >= TODAY).length, "including every event starting today or later (was 0)");
    OCTOBER_2026_STARTS.forEach((expected, i) => {
      const day = octoberDay(i);
      assert.strictEqual((byDate[day] || []).length, expected, `Calendar ${day}: ${expected} events`);
    });
    assert.strictEqual(new Set(events.map((e) => e.id)).size, events.length, "no event loaded twice");
    assert.ok(!events.some((e) => e.id === "fallback"), "fallback data was replaced");
    assert.ok(calls.render >= 1 && calls.buildFilterBar >= 1, "the page re-rendered with the loaded data");
    assert.ok(requests.filter((r) => r.table === "events").every((r) => /status=eq\.approved/.test(r.url)), "every page of the query is restricted to approved events");
    console.log(`PASS: calendar.html holds all ${events.length} approved events (${upcoming} from today forward) and every October day matches (${OCTOBER_TOTAL} events across 31 days)`);
  }

  // --- HOMEPAGE: everything from the 8-day back-buffer forward ---
  {
    const { events, calls } = await runPageLoader("index.html", 8);
    const floor = isoPlusDays(TODAY, -8);
    const expected = APPROVED.filter((r) => r.start_date >= floor);
    assert.ok(expected.length > 2000, "the fixture needs more than two full pages here to be a real test");
    assert.strictEqual(events.length, expected.length, "Homepage holds every event from its load floor forward");
    const upcoming = events.filter((e) => e.date >= TODAY).length;
    assert.strictEqual(upcoming, APPROVED.filter((r) => r.start_date >= TODAY).length);
    const lastDate = events.map((e) => e.date).sort().pop();
    assert.strictEqual(lastDate, APPROVED.map((r) => r.start_date).sort().pop(), "the furthest-future event is loaded (previously nothing after the 1,000th row)");
    assert.ok(events.every((e) => e.date >= floor), "nothing older than the load floor");
    assert.ok(calls.renderNeighborhoodsRail >= 1, "neighborhood rail re-rendered from the complete set");
    console.log(`PASS: index.html holds all ${events.length} events from its load floor forward (${upcoming} upcoming, through ${lastDate})`);
  }

  // --- MAP: same window as the homepage ---
  {
    const { events } = await runPageLoader("map.html", 8);
    const floor = isoPlusDays(TODAY, -8);
    const expected = APPROVED.filter((r) => r.start_date >= floor);
    assert.strictEqual(events.length, expected.length, "Map holds every event from its load floor forward");
    const upcoming = events.filter((e) => e.date >= TODAY).length;
    assert.strictEqual(upcoming, APPROVED.filter((r) => r.start_date >= TODAY).length);
    console.log(`PASS: map.html holds all ${events.length} events from its load floor forward (${upcoming} upcoming)`);
  }

  // --- VENUES: per-venue upcoming counts come from every row ---
  {
    const html = read("venues.html");
    const templates = [...html.matchAll(/fetchAllRows\(`([^`]+)`/g)].map((m) => m[1]);
    assert.strictEqual(templates.length, 2, "venues.html pages both its venues list and its event rows");
    const fill = (t) => t.replace("${SUPABASE_URL}", "https://example.supabase.co").replace("${getTodayISO()}", TODAY);
    const eventsUrl = fill(templates.find((t) => /\/events\?/.test(t)));
    const venuesUrl = fill(templates.find((t) => /\/venues\?/.test(t)));
    const { fetchAllRows } = require(`${REPO_DIR}/paged-fetch.js`);
    const api = makeMockPostgrest(tables(), { cap: 1000 });
    const eventRows = (await fetchAllRows(eventsUrl, { apikey: "anon" }, { fetchImpl: api.fetch })).rows;
    const expected = APPROVED.filter((r) => r.start_date >= TODAY && r.venue_id != null);
    assert.ok(expected.length > 0);
    assert.strictEqual(eventRows.length, expected.length, "every upcoming venue-linked event row is counted");
    const venueRows = (await fetchAllRows(venuesUrl, { apikey: "anon" }, { fetchImpl: api.fetch })).rows;
    assert.strictEqual(venueRows.length, 130);
    console.log(`PASS: venues.html counts from all ${eventRows.length} upcoming venue-linked event rows and all ${venueRows.length} venues`);
  }

  // --- Structural guards: the fix can't be quietly undone ---
  for (const file of ["index.html", "calendar.html", "map.html", "venues.html"]) {
    const html = read(file);
    const tagAt = html.indexOf('<script src="/paged-fetch.js"></script>');
    assert.ok(tagAt !== -1, `${file} loads /paged-fetch.js`);
    const firstUse = html.indexOf("fetchAllRows(");
    assert.ok(firstUse !== -1 && tagAt < firstUse, `${file} loads /paged-fetch.js before using it`);
    assert.ok(html.indexOf("</head>") > tagAt, `${file} loads it from <head>, before any page script runs`);
    const urls = [...html.matchAll(/fetchAllRows\(\s*(?:`([^`]+)`|url)/g)];
    assert.ok(urls.length >= 1, `${file} calls fetchAllRows`);
    // Every paged query must have a unique tiebreak in its order, and no
    // event query may go back to a single capped request.
    const eventQueries = [...html.matchAll(/`\$\{SUPABASE_URL\}\/rest\/v1\/(events|events_public)\?[^`]*`/g)]
      .map((m) => m[0])
      // Count-only and single-row queries are not row loads.
      .filter((q) => /select=id,title|select=id,venue_id/.test(q));
    assert.ok(eventQueries.length >= 1, `${file} has an event row query to check`);
    eventQueries.forEach((q) => {
      assert.ok(!/[?&]limit=/.test(q), `${file}: event row query must not carry its own limit= (the API cap ignores it): ${q.slice(0, 90)}…`);
      assert.ok(/order=[^&`]*\bid\.asc/.test(q), `${file}: paged event query needs a unique tiebreak (id.asc) in its order: ${q.slice(0, 90)}…`);
    });
  }
  assert.ok(fs.existsSync(`${REPO_DIR}/paged-fetch.js`), "paged-fetch.js is at the site root, where the pages load it from");
  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(!(vercel.rewrites || []).some((r) => r.source === "/paged-fetch.js"), "no rewrite shadows /paged-fetch.js");
  console.log("PASS: all four pages load /paged-fetch.js from <head>, page their event queries, order them with a unique tiebreak, and carry no stray limit=");

  console.log("\nAll paged-loading page tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
