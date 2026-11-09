// Guard: no public page may send a PostgREST query that sits on or above Supabase's 1,000-row response cap, and the venue
// lat/lng loaders in calendar.html and map.html must page (a >1,000-venue fixture proves it).
"use strict";
const assert = require("assert"), fs = require("fs"), vm = require("vm");
const dir = process.env.REPO_DIR || process.cwd();
const { makeMockPostgrest } = require(`${dir}/test/fixtures/mock-postgrest.js`);
const { fetchAllRows } = require(`${dir}/paged-fetch.js`);

// Known, reviewed exception: radar.html reads editorial_articles (a small press-coverage table, nowhere near 1,000 rows) with limit=2000.
// Paging it needs `order=...,id.asc`, and whether anon may order by editorial_articles.id is not verified here, so it is left as is
// and flagged to Platform. The entry must keep matching, so it cannot go stale or be widened.
const ALLOWED = { "radar.html": /editorial_articles\?[^`]*limit=2000/ };
// 1. No new capped queries: any rest/v1 URL with limit=N where N >= 1000 (limit above the cap never lifts it).
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
  const src = fs.readFileSync(`${dir}/${f}`, "utf8");
  if (ALLOWED[f]) assert.ok(ALLOWED[f].test(src), `${f}: allow-list entry is stale, remove it`);
  for (const m of src.matchAll(/rest\/v1\/[^`"'\s]*[?&]limit=(\d+)/g)) {
    if (ALLOWED[f] && ALLOWED[f].test(m[0])) continue;
    assert.ok(Number(m[1]) < 1000, `${f}: query with limit=${m[1]} sits on/above the 1,000-row cap; use fetchAllRows (${m[0].slice(0, 80)})`);
  }
}

// 2. The venue lat/lng loaders page, and handle > 1,000 venues.
(async () => {
  const venues = [];
  for (let i = 1; i <= 1300; i++) venues.push({ id: i, name: "Venue " + i, lat: 42 + i / 10000, lng: -83 - i / 10000 });
  venues.push({ id: 2000, name: "No coords", lat: null, lng: null });
  venues.sort((a, b) => ((a.id * 7919) % 1021) - ((b.id * 7919) % 1021)); // not in id order
  for (const f of ["calendar.html", "map.html"]) {
    const html = fs.readFileSync(`${dir}/${f}`, "utf8");
    const m = html.match(/async function loadVenueLatLng\(\)\{[\s\S]*?\n\}\n/);
    assert.ok(m, `${f}: loadVenueLatLng not found`);
    assert.ok(/fetchAllRows\(url,/.test(m[0]) && !/limit=/.test(m[0].replace(/\/\/.*$/gm, "")), `${f}: venue lat/lng query is paged and has no limit=`);
    assert.ok(/order=id\.asc/.test(m[0]), `${f}: unique tiebreak order`);
    const api = makeMockPostgrest({ venues }, { cap: 1000 });
    const sb = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon", VENUE_LATLNG_MAP: new Map(), fetchAllRows: (u, h) => fetchAllRows(u, h, { fetchImpl: api.fetch }), console };
    vm.createContext(sb);
    vm.runInContext(`${m[0]}; loadVenueLatLng().then(() => { this.done = true; });`, sb);
    for (let i = 0; i < 200 && !sb.done; i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(sb.done, `${f}: loader finished`);
    assert.strictEqual(sb.VENUE_LATLNG_MAP.size, 1300, `${f}: all 1,300 venues with coordinates are mapped (capped query would give 1,000)`);
    assert.ok(sb.VENUE_LATLNG_MAP.has("venue 1300") && !sb.VENUE_LATLNG_MAP.has("no coords"), `${f}: last venue mapped, venue without coords skipped`);
    assert.ok(api.log.length > 2, `${f}: more than one page requested`);
  }
  console.log("no-capped-queries ok");
})().catch((e) => { console.error(e); process.exit(1); });
