// test/zero-write-reasons.test.js -- additive session_data.zero_write_reasons
// for fetched>0 / written=0 runs (Cinema Detroit, WDET, Bagley). Draft 2026-11-07.
// Run: node test/zero-write-reasons.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { zeroWriteReasons } = require(`${REPO_DIR}/api/_lib/zero-write-reasons.js`);

{
  const z = zeroWriteReasons(6, { venue_city_not_allowed: 4, category_unmapped: 1, bogus: 9, past_date: 0 }).zero_write_reasons;
  assert.deepStrictEqual(z.reasons, { venue_city_not_allowed: 4, category_unmapped: 1 }, "unknown/zero reasons dropped");
  assert.deepStrictEqual(z.byClass, { filtered: 5 });
  assert.strictEqual(z.unexplained, 1, "what the counts do not account for is stated, not hidden");
  assert.strictEqual(zeroWriteReasons(null, {}).zero_write_reasons.unexplained, null);
}
console.log("PASS: helper counts reasons, classes them, reports unexplained remainder");

async function wdetRun(events) {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  delete process.env.CRON_SECRET;
  const patches = [];
  global.fetch = async (url, opts = {}) => {
    if (url.includes("wdet.org")) return { ok: true, status: 200, json: async () => ({ events }) };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") { patches.push(JSON.parse(opts.body)); return { ok: true, status: 204, json: async () => ({}) }; }
    throw new Error("unmocked: " + url);
  };
  for (const m of ["api/cron-wdet.js", "api/_lib/run-log.js"]) delete require.cache[require.resolve(`${REPO_DIR}/${m}`)];
  const res = { status() { return this; }, json() { return this; } };
  await require(`${REPO_DIR}/api/cron-wdet.js`)({ headers: {} }, res);
  return patches;
}

async function runConnector(modulePath, route) {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  delete process.env.CRON_SECRET;
  const patches = [];
  global.fetch = async (url, opts = {}) => {
    const body = route(url);
    if (body) return { ok: true, status: 200, json: async () => body };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") { patches.push(JSON.parse(opts.body)); return { ok: true, status: 204, json: async () => ({}) }; }
    throw new Error("unmocked: " + url);
  };
  for (const m of [modulePath, "api/_lib/run-log.js"]) delete require.cache[require.resolve(`${REPO_DIR}/${m}`)];
  const res = { status() { return this; }, json() { return this; } };
  await require(`${REPO_DIR}/${modulePath}`)({ headers: {} }, res);
  return patches;
}

(async () => {
  const ev = (id, venue, city, cat) => ({ id, title: "t", start_date: "2026-12-01 20:00:00", end_date: "2026-12-01 22:00:00", venue: venue ? { venue, city } : null, categories: cat ? [{ name: cat }] : [] });
  const patches = await wdetRun([ev(1, null), ev(2, "Hall", "Ann Arbor", "Music"), ev(3, "El Club", "Detroit", "Zzz-not-a-category")]);
  const p = patches[0];
  assert.strictEqual(p.outcome, "success");
  assert.strictEqual(p.records_fetched, 3);
  assert.strictEqual(p.records_written, 0);
  const z = p.session_data.zero_write_reasons;
  assert.strictEqual(z.reasons.venue_city_not_allowed, 2);
  assert.strictEqual(z.reasons.category_unmapped, 1);
  assert.strictEqual(z.unexplained, 0);
  console.log("PASS: WDET zero-write run records why (2 venue/city, 1 category), counts unchanged");

  // Conservation: reasons + unexplained == fetched, for every case here.
  const cons = (z) => Object.values(z.reasons).reduce((a, b) => a + b, 0) + z.unexplained;
  assert.strictEqual(cons(z), p.records_fetched);

  // Normal (rows written) runs carry no zero_write_reasons: no behaviour change.
  const ok = await wdetRun([ev(1, "El Club", "Detroit", "Music")]);
  assert.ok(!ok[0].session_data, "no session_data on a normal run");
  console.log("PASS: a run that writes rows is unchanged");
  // ---- Cinema Detroit: DISTINCT filters (unparsed vs past), not a mirror of WDET ----
  {
    const CINEMA_URL = "https://cinemadetroit.org/wp-json/wp/v2/pages?per_page=100&status=publish";
    const page = (id, body) => ({ id, title: { rendered: "P" + id }, content: { rendered: body }, link: "https://x/" + id });
    const pages = [page(1, "<p>About us, no date</p>"), page(2, "<p>Friday, January 16, 2020 at 7:00 p.m.</p>"), page(3, "<p>Friday, January 17, 2020 | 7:00 p.m.</p>")];
    const patches = await runConnector("api/cron-cinema-detroit.js", (url) => (url === CINEMA_URL ? pages : null));
    const z = patches[0].session_data.zero_write_reasons;
    assert.deepStrictEqual(z.reasons, { unparsed: 1, past_date: 2 });
    assert.deepStrictEqual(z.byClass, { filtered: 3 });
    assert.strictEqual(z.unexplained, 0);
    assert.strictEqual(cons(z), patches[0].records_fetched);
    assert.ok(!("venue_city_not_allowed" in z.reasons), "WDET-only reasons never appear on Cinema Detroit");
    console.log("PASS: Cinema Detroit splits unparsed from past-dated, conserves the count");
  }

  // ---- Bagley: past-dated event post vs a general post that is not an event ----
  {
    const bag = require(`${REPO_DIR}/api/cron-bagleycommunity.js`);
    const listing = [{ id: 10, date: "2020-01-02T00:00:00", title: { rendered: "General Meeting January 2020" }, content: { rendered: "<p>Third Saturday of the month at 10 a.m.</p>" } }];
    const posts = [{ id: 11, date: "2026-11-01T00:00:00", title: { rendered: "Thank you volunteers" }, content: { rendered: "<p>Nothing dated here.</p>" } }];
    const patches = await runConnector("api/cron-bagleycommunity.js", (url) => (url === bag.EVENT_LISTING_URL ? listing : url === bag.POSTS_URL ? posts : null));
    const z = patches[0].session_data.zero_write_reasons;
    assert.strictEqual(patches[0].records_fetched, 2);
    assert.deepStrictEqual(z.reasons, { unparsed: 1, past_date: 1 });
    assert.strictEqual(cons(z), 2);
    console.log("PASS: Bagley splits past-dated event post from a non-event post, conserves the count");
  }

  // ---- unknown vs 0: unreported fetched is null (unknown); 0 is only shown when recorded ----
  {
    const { readZeroWriteReasons } = require(`${REPO_DIR}/api/_lib/zero-write-reasons.js`);
    assert.strictEqual(zeroWriteReasons(undefined, { past_date: 2 }).zero_write_reasons.unexplained, null);
    assert.deepStrictEqual(readZeroWriteReasons(undefined), { known: false, text: null });
    assert.deepStrictEqual(readZeroWriteReasons({}), { known: false, text: null });
    const t = readZeroWriteReasons(zeroWriteReasons(3, { unparsed: 1, past_date: 2 }).zero_write_reasons).text;
    assert.ok(/3 fetched/.test(t) && /1 not an event or no usable date/.test(t) && /2 already past/.test(t), t);
    assert.ok(!/unexplained/.test(t), "no 'unexplained' clause when everything is accounted for");
    const u = readZeroWriteReasons(zeroWriteReasons(5, { past_date: 2 }).zero_write_reasons).text;
    assert.ok(/3 unexplained/.test(u), u);
    const n = readZeroWriteReasons(zeroWriteReasons(null, { past_date: 2 }).zero_write_reasons).text;
    assert.ok(/fetched count not recorded/.test(n) && !/0 fetched/.test(n), n);
    // tower/source-health row: latest finished run's block => text; no block => known:false
    const sh = require(`${REPO_DIR}/api/_lib/source-health.js`);
    const now = Date.now();
    const run = (extra) => ({ source_slug: "wdet", outcome: "success", started_at: new Date(now - 3600000).toISOString(), finished_at: new Date(now - 3500000).toISOString(), records_fetched: 3, records_parsed: 0, records_written: 0, ...extra });
    const withBlock = sh.evaluateSources({ runs: [run({ zero_write_reasons: zeroWriteReasons(3, { venue_city_not_allowed: 3 }).zero_write_reasons })], events: [], now }).sources.find((x) => x.slug === "wdet");
    assert.ok(/3 venue or city outside the covered area/.test(withBlock.zeroWrite.text), withBlock.zeroWrite.text);
    const without = sh.evaluateSources({ runs: [run({})], events: [], now }).sources.find((x) => x.slug === "wdet");
    assert.strictEqual(without.zeroWrite.known, false);
    console.log("PASS: reader: absent = unknown, remainder stated, unreported fetched never shown as 0");
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
