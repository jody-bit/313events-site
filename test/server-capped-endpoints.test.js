// test/server-capped-endpoints.test.js -- endpoint-level capped-server behaviour for api/sitemap.js and api/cron-link-check.js.
// Complements (does not duplicate) test/server-paged-reads.test.js (full-read at the 1,000 cap, helper, shared upcoming rule)
// and the static api/** ratchet test/paged-query-guard-api.test.js (Image API). This file pins what those do not:
//   * a SMALLER server cap (500) is still read completely by both endpoints, with no duplicates or skips
//   * every page request carries the id tiebreak and only the helper's limit<=1000 + offset pair (so no endpoint can quietly go back to limit=5000)
//   * a failing later page: sitemap stays fail-soft (200, rows read so far, warns); link check refuses to shrink its pool (error, no PATCH)
// Test-only. No network, no database. Run: node test/server-capped-endpoints.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest");

const URL_ = "https://fixture.supabase.test";
const pad = (n) => String(n).padStart(5, "0");
const events = Array.from({ length: 1700 }, (_, i) => ({
  id: "evt-" + pad(i), status: "approved", title: "Event " + i, start_date: "2099-11-" + String(10 + (i % 18)).padStart(2, "0"),
  end_date: null, date_semantics: null, occurrence_dates: null, updated_at: "2026-11-01T00:00:00Z",
  ticket_url: "https://example.com/e/" + i + "-show", event_url: null, link_check_status: null, link_checked_at: null, source: "fixture",
}));
const venues = Array.from({ length: 900 }, (_, i) => ({ id: "ven-" + pad(i), name: "Venue " + pad(i) }));

function install(tables, options) {
  const db = makeMockPostgrest(tables, options);
  const seen = [];
  global.fetch = async (url, init) => { seen.push({ url: String(url), method: (init && init.method) || "GET" }); return db.fetch(String(url), init); };
  db.seen = seen;
  return db;
}
const freshRequire = (p) => { delete require.cache[require.resolve(p)]; return require(p); };
const makeRes = () => { const r = { headers: {}, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.statusCode = c; return r; }, send(b) { r.body = b; return r; }, json(b) { r.body = b; return r; } }; return r; };

async function main() {
  process.env.SUPABASE_URL = URL_;
  process.env.SUPABASE_ANON_KEY = "anon-fixture";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-fixture";
  process.env.CRON_SECRET = "cron-fixture";
  process.env.SITE_URL = "https://fixture.test";
  delete process.env.LINK_CHECK_MODE;

  // 1. cap 500: both endpoints read everything
  let db = install({ events: events.slice(), venues: venues.slice() }, { cap: 500 });
  let res = makeRes();
  await freshRequire("../api/sitemap.js")({}, res);
  const evLocs = res.body.match(/event\.html\?id=evt-\d+/g) || [];
  const venLocs = res.body.match(/venue\.html\?id=ven-\d+/g) || [];
  assert.strictEqual(evLocs.length, 1700);
  assert.strictEqual(new Set(evLocs).size, 1700, "no duplicates at cap-500 page boundaries");
  assert.strictEqual(venLocs.length, 900);
  const sitemapReads = db.seen.filter((c) => /\/rest\/v1\/(events|venues)\?/.test(c.url));
  assert.ok(sitemapReads.length >= 6, "events (4 pages) and venues (2 pages) were paged at cap 500, got " + sitemapReads.length);
  for (const c of sitemapReads.filter((x) => x.method === "GET")) {
    assert.ok(/order=[^&]*id\.asc/.test(c.url), "sitemap page read lacks id tiebreak: " + c.url);
    const lim = c.url.match(/[?&]limit=(\d+)/);
    assert.ok(lim && /[?&]offset=\d+/.test(c.url) && Number(lim[1]) <= 1000, "sitemap page read must be limit<=1000 with an offset: " + c.url);
  }
  console.log("PASS: sitemap reads 1,700 events and 900 venues at a server cap of 500, each page with the id tiebreak and limit<=1000 + offset");

  db = install({ events: events.slice() }, { cap: 500 });
  res = makeRes();
  await freshRequire("../api/cron-link-check.js")({ method: "GET", headers: { authorization: "Bearer cron-fixture" }, query: {} }, res);
  assert.ok(!res.body.error, "link check errored: " + res.body.error);
  assert.strictEqual(res.body.candidates, 1700, "link check sees every candidate at cap 500");
  assert.ok(!db.seen.some((c) => c.method === "PATCH"), "dry mode: no PATCH");
  console.log("PASS: link check reads 1,700 candidates at a server cap of 500");

  // 2. every list read carries the id tiebreak and a helper-issued limit<=1000 with offset
  const reads = db.seen.filter((c) => /\/rest\/v1\/events\?/.test(c.url) && c.method === "GET");
  assert.ok(reads.length >= 4);
  for (const c of reads) {
    assert.ok(/order=[^&]*id\.asc/.test(c.url), "page read lacks id tiebreak: " + c.url);
    const lim = c.url.match(/[?&]limit=(\d+)/);
    assert.ok(lim && /[?&]offset=\d+/.test(c.url) && Number(lim[1]) <= 1000, "page read must be limit<=1000 with an offset (helper-issued), never limit=5000: " + c.url);
  }
  console.log("PASS: every paged read carries the id tiebreak and a helper-issued limit<=1000 with offset");

  // 3. failing later page
  let calls = 0;
  install({ events: events.slice(), venues: venues.slice() }, { cap: 500, failure: (r) => (/\/venues\?/.test(r.url || "") ? null : (++calls === 3 ? 500 : null)) });
  const warns = []; const w = console.warn; console.warn = (...a) => warns.push(a.join(" "));
  res = makeRes();
  try { await freshRequire("../api/sitemap.js")({}, res); } finally { console.warn = w; }
  assert.strictEqual(res.statusCode, 200, "sitemap stays fail-soft");
  assert.ok((res.body.match(/event\.html\?id=/g) || []).length > 0, "rows read before the failure are still listed");
  assert.ok(warns.some((m) => /\[sitemap\] events read incomplete/.test(m)), "a partial read is never silent");
  console.log("PASS: sitemap stays 200 on a failed later page, lists what it read, and warns");

  calls = 0;
  const db3 = install({ events: events.slice() }, { cap: 500, failure: () => (++calls === 3 ? 500 : null) });
  res = makeRes();
  await freshRequire("../api/cron-link-check.js")({ method: "GET", headers: { authorization: "Bearer cron-fixture" }, query: {} }, res);
  assert.ok(res.body && /events read failed after \d+ rows/.test(res.body.error || ""), "link check reports the partial read instead of shrinking its pool");
  assert.ok(!db3.seen.some((c) => c.method === "PATCH"), "no writes after a partial read");
  console.log("PASS: link check reports a partial read and writes nothing");
}
main().catch((e) => { console.error(e); process.exit(1); });
