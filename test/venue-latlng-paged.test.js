// calendar.html and map.html venue lat/lng loaders must page past Supabase's 1,000-row response cap (they used limit=1000, exactly
// on the cap). The repo-wide "no new capped queries" guard is Discovery's separate test file (test/paged-query-guard.test.js).
"use strict";
const assert = require("assert"), fs = require("fs"), vm = require("vm");
const dir = process.env.REPO_DIR || process.cwd();
const { makeMockPostgrest } = require(`${dir}/test/fixtures/mock-postgrest.js`);
const { fetchAllRows } = require(`${dir}/paged-fetch.js`);

// The venue lat/lng loaders page and handle > 1,000 venues (deterministic 1,300-venue fixture, mock cap 1,000).
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
  console.log("venue-latlng-paged ok");
})().catch((e) => { console.error(e); process.exit(1); });
