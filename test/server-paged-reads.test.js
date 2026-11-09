// test/server-paged-reads.test.js -- api/sitemap.js and api/cron-link-check.js read EVERY matching row, not the first 1,000.
// Supabase caps each request at 1,000 rows whatever limit= asks for (200, no error). The old limit=5000 reads therefore
// silently dropped everything after row 1,000. The mock caps at 1,000 like production. No network, no database.
// Run: node test/server-paged-reads.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest");
const { fetchAllPagedRows } = require("../api/_lib/paged-rows");

const SUPABASE_URL = "https://fixture.supabase.test";
const pad = (n) => String(n).padStart(5, "0");
// 2,300 approved events; many share a start_date so the id tiebreak matters.
const events = Array.from({ length: 2300 }, (_, i) => ({
  id: "evt-" + pad(i), status: "approved", title: "Event " + i,
  start_date: "2099-11-" + String(10 + (i % 18)).padStart(2, "0"), end_date: null, updated_at: "2026-11-01T00:00:00Z",
  ticket_url: "https://example.com/e/" + i + "-show", event_url: null, link_check_status: null, link_checked_at: null, source: "fixture",
}));
const venues = Array.from({ length: 1250 }, (_, i) => ({ id: "ven-" + pad(i), name: "Venue " + pad(i) }));

function install(tables, options) {
  const db = makeMockPostgrest(tables, options);
  global.fetch = async (url, init) => db.fetch(String(url), init);
  return db;
}
function freshRequire(p) { delete require.cache[require.resolve(p)]; return require(p); }
function makeRes() {
  const res = { headers: {}, setHeader(k, v) { res.headers[k] = v; }, status(c) { res.statusCode = c; return res; }, send(b) { res.body = b; return res; }, json(b) { res.body = b; return res; } };
  return res;
}

async function main() {
  // --- helper ---
  let db = install({ events: events.slice(), venues: venues.slice() });
  const base = `${SUPABASE_URL}/rest/v1/events?select=id&order=start_date.asc,id.asc`;
  const all = await fetchAllPagedRows(base, {});
  assert.strictEqual(all.ok, true);
  assert.strictEqual(all.rows.length, 2300, "all 2,300 rows, not the first 1,000");
  assert.strictEqual(new Set(all.rows.map((r) => r.id)).size, 2300, "no repeats or skips at page boundaries");
  assert.strictEqual(all.pages, 3);
  await assert.rejects(() => fetchAllPagedRows(`${SUPABASE_URL}/rest/v1/events?select=id&order=start_date.asc`, {}), /id\.asc/, "needs the id tiebreak");
  await assert.rejects(() => fetchAllPagedRows(base + "&limit=5000", {}), /limit=/, "refuses a url that already carries limit=");
  console.log("PASS: helper pages past the 1,000-row cap with an id tiebreak (2,300 rows, 3 pages)");

  // a lower server cap (500) is still read completely
  install({ events: events.slice() }, { cap: 500 });
  const capped = await fetchAllPagedRows(base, {});
  assert.strictEqual(capped.rows.length, 2300);
  console.log("PASS: a smaller server cap (500) is read completely");

  // a failing later page is reported, with the rows read so far kept
  let calls = 0;
  install({ events: events.slice() }, { failure: () => (++calls === 3 ? 500 : null) });
  const broke = await fetchAllPagedRows(base, {});
  assert.strictEqual(broke.ok, false);
  assert.strictEqual(broke.rows.length, 2000);
  console.log("PASS: a failed page is reported ok:false and keeps the rows already read");

  // --- sitemap ---
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = "anon-fixture";
  process.env.SITE_URL = "https://fixture.test";
  install({ events: events.slice(), venues: venues.slice() });
  const sitemap = freshRequire("../api/sitemap.js");
  const res = makeRes();
  await sitemap({}, res);
  assert.strictEqual(res.statusCode, 200);
  const evLocs = res.body.match(/event\.html\?id=evt-\d+/g) || [];
  const venLocs = res.body.match(/venue\.html\?id=ven-\d+/g) || [];
  assert.strictEqual(evLocs.length, 2300, "sitemap lists all 2,300 events");
  assert.strictEqual(new Set(evLocs).size, 2300);
  assert.strictEqual(venLocs.length, 1250, "sitemap lists all 1,250 venues");
  console.log("PASS: sitemap lists every event and venue past 1,000 rows");

  // --- link check: reads all rows, selection still capped by LINK_CHECK_LIMIT, writes nothing in dry mode ---
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-fixture";
  process.env.CRON_SECRET = "cron-fixture";
  delete process.env.LINK_CHECK_MODE;
  const tables = { events: events.map((e) => ({ ...e, start_date: "2099-01-01" })) };
  db = install(tables);
  const link = freshRequire("../api/cron-link-check.js");
  const lres = makeRes();
  await link({ method: "GET", headers: { authorization: "Bearer cron-fixture" }, query: {} }, lres);
  if (lres.body && lres.body.error) assert.fail("link check errored: " + lres.body.error);
  assert.strictEqual(lres.body.candidates, 2300, "link check sees all 2,300 candidates, not 1,000");
  assert.strictEqual(lres.body.mode, "dry");
  assert.ok(!db.log.some((l) => /PATCH/i.test(JSON.stringify(l))), "dry mode performs no PATCH");
  console.log("PASS: link check reads all 2,300 candidates; dry mode writes nothing");
}
main().then(() => console.log("server-paged-reads: ok"), (e) => { console.error(e); process.exit(1); });
