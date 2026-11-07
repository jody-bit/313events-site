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

  // Normal (rows written) runs carry no zero_write_reasons: no behaviour change.
  const ok = await wdetRun([ev(1, "El Club", "Detroit", "Music")]);
  assert.ok(!ok[0].session_data, "no session_data on a normal run");
  console.log("PASS: a run that writes rows is unchanged");
})().catch((e) => { console.error(e); process.exitCode = 1; });
