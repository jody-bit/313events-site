// test/venue-lookup-paged.test.js -- the shared venue lookups (name->id map, details map, learned-knowledge canonical list) read EVERY venue,
// not the first 1,000. Supabase caps one request at 1,000 rows with a 200 and no error; the old limit=1000 reads stopped there, so a venue past
// row 1,000 silently failed to resolve. The failure contract is unchanged: a failed read gives the empty map, never a partial one.
// Also pins the new opt-in pager option (stopWhenNoNewRows) and that it is OFF by default. Offline: the capped PostgREST mock only.
// Run: node test/venue-lookup-paged.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest");
const { fetchAllPagedRows } = require("../api/_lib/paged-rows");

const URL_ = "https://fixture.supabase.test";
const pad = (n) => String(n).padStart(5, "0");
const venues = Array.from({ length: 1700 }, (_, i) => ({ id: "ven-" + pad(i), name: "Venue " + i, address: i + " Main St", city: "Detroit", website: null, facebook_url: null }));
const lib = require("../api/_lib/venue-lookup.js");

function install(options) {
  const db = makeMockPostgrest({ venues: venues.slice(), events: [] }, options);
  const reads = [];
  global.fetch = async (url, init) => { url = String(url); if (/\/rest\/v1\/venues\?/.test(url)) reads.push(url); return db.fetch(url, init); };
  return reads;
}

(async () => {
  for (const cap of [1000, 500]) {
    let reads = install({ cap });
    const map = await lib.buildVenueNameToIdMap(URL_, "k");
    assert.strictEqual(map.size, 1700, "name->id map holds every venue at cap " + cap);
    assert.strictEqual(lib.resolveVenueId(map, "Venue 1650"), "ven-01650", "a venue past row 1,000 resolves");
    assert.ok(reads.length >= 2 && reads.every((u) => /order=id\.asc/.test(u) && /offset=\d+/.test(u) && Number((u.match(/[?&]limit=(\d+)/) || [])[1]) <= 1000), "paged with the id tiebreak");
    install({ cap });
    const d = await lib.buildVenueDetailsMap(URL_, "k");
    assert.strictEqual(d.byId.size, 1700, "details map holds every venue at cap " + cap);
    assert.strictEqual(d.byId.get("ven-01650").name, "Venue 1650");
  }
  console.log("PASS: the name map and the details map hold every venue at server caps of 1,000 and 500");

  // failure contract unchanged: a failed later page -> the empty map / empty details, never a partial one
  let n = 0;
  install({ cap: 500, failure: (r) => (/\/venues\?/.test(r.url || "") && ++n === 2 ? 500 : null) });
  assert.strictEqual((await lib.buildVenueNameToIdMap(URL_, "k")).size, 0);
  n = 0;
  install({ cap: 500, failure: (r) => (/\/venues\?/.test(r.url || "") && ++n === 2 ? 500 : null) });
  assert.strictEqual((await lib.buildVenueDetailsMap(URL_, "k")).byId.size, 0);
  console.log("PASS: a failed later page still gives the empty map, never a partial one");

  // the opt-in pager option: a server that answers every offset with the same rows ends the read; off by default it runs to the request ceiling
  const sameRows = async () => ({ ok: true, status: 200, json: async () => venues.slice(0, 3) });
  const u = URL_ + "/rest/v1/venues?select=id&order=id.asc";
  const on = await fetchAllPagedRows(u, {}, { fetch: sameRows, stopWhenNoNewRows: true });
  assert.strictEqual(on.ok, true); assert.strictEqual(on.rows.length, 3); assert.strictEqual(on.pages, 2);
  const off = await fetchAllPagedRows(u, {}, { fetch: sameRows, maxRequests: 5 });
  assert.strictEqual(off.ok, false, "default behavior unchanged: still reading after the request ceiling");
  // rows without ids are never treated as repeats
  const noIds = async () => ({ ok: true, status: 200, json: async () => [{ name: "a" }] });
  const ni = await fetchAllPagedRows(u, {}, { fetch: noIds, stopWhenNoNewRows: true, maxRequests: 4 });
  assert.strictEqual(ni.ok, false, "id-less rows keep reading to the ceiling, never stop early");
  console.log("PASS: stopWhenNoNewRows ends a non-advancing read; it is off by default; id-less rows never stop it");
})().catch((e) => { console.error(e); process.exit(1); });
