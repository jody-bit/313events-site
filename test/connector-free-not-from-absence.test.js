// test/connector-free-not-from-absence.test.js
//
// WDET, Belle Isle Nature Center and Bagley Community (Tier 2) used to mark an event FREE because the source gave no
// cost / price signal. "Not stated" is not "free": a wrong FREE badge is worse than none. Now FREE is sent only when the
// source says so; otherwise the key is omitted (event-upsert: an omitted key leaves a stored value, a new row gets the
// column default false). Bagley General Meetings (explicitly public meetings) are unchanged.
//
// Run: node test/connector-free-not-from-absence.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2026-10-08T15:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");
const REPO_DIR = process.env.REPO_DIR || process.cwd();

function load(file) {
  for (const f of [file, "api/_lib/run-log.js", "api/_lib/venue-lookup.js", "api/_lib/source-slugs.js"]) delete require.cache[require.resolve(`${REPO_DIR}/${f}`)];
  return require(`${REPO_DIR}/${file}`);
}
async function written(file, apiUrl, payload) {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const rows = [];
  global.fetch = async (url, opts = {}) => {
    if (url === apiUrl) return { ok: true, status: 200, json: async () => payload };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs")) return { ok: true, status: opts.method === "POST" ? 201 : 204, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && opts.method === "POST") { rows.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
    throw new Error("unmocked URL: " + url);
  };
  const res = { status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; } };
  await load(file)({ headers: {} }, res);
  assert.strictEqual(res._s, 200);
  return rows;
}
const tribe = (id, cost) => ({ id, title: `Event ${id}`, description: "<p>x</p>", start_date: "2026-12-01 20:00:00", end_date: "2026-12-01 22:00:00", cost, url: "https://example.org/e", image: false, venue: { venue: "El Club", city: "Detroit" }, categories: [{ name: "Music" }] });

(async () => {
  for (const [file, url] of [["api/cron-wdet.js", "https://wdet.org/wp-json/tribe/events/v1/events?per_page=50"], ["api/cron-belle-isle-nature-center.js", "https://belleislenaturecenter.org/wp-json/tribe/events/v1/events?per_page=50"]]) {
    const rows = await written(file, url, { events: [tribe(1, ""), tribe(2, "Free"), tribe(3, "$10")] });
    const by = (n) => rows.find((r) => String(r.external_id).endsWith("-" + n));
    assert.ok(!("is_free" in by(1)), `${file}: missing cost must not send is_free`);
    assert.strictEqual(by(2).is_free, true, `${file}: cost "Free" is FREE`);
    assert.ok(!("is_free" in by(3)), `${file}: a stated price is not FREE (key omitted, not asserted)`);
  }

  const { parseTier2Post, parseGeneralMeetingPost } = load("api/cron-bagleycommunity.js");
  const post = (id, content) => ({ id, title: { rendered: "Bagley Community Council Annual Trunk or Treat – October 31st at 6 p.m." }, content: { rendered: content }, date: "2026-10-20T08:00:00", link: `https://bagleycommunity.org/${id}/` });
  assert.ok(!("is_free" in parseTier2Post(post(1, "<p>annual Trunk or Treat on October 31st at Bagley Elementary school, activities begin at 6 p.m.</p>"))), "Tier 2 with no price signal omits is_free");
  assert.strictEqual(parseTier2Post(post(2, "<p>Trunk or Treat on October 31st at Bagley Elementary school. Free admission for all families.</p>")).is_free, true, "Tier 2 that says free admission is FREE");
  assert.ok(!("is_free" in parseTier2Post(post(3, "<p>Trunk or Treat on October 31st at Bagley Elementary school. Free parking behind the school.</p>"))), "free parking is not free admission");
  assert.strictEqual(typeof parseGeneralMeetingPost, "function");
  console.log("PASS: WDET, Belle Isle and Bagley Tier 2 no longer infer FREE from a missing price");
})().catch((e) => { console.error(e); process.exit(1); });
