// test/owner-correction-survives-refresh.test.js — the Haunted Trail gap (Oct 17 -> 18): a VisitDetroit refresh
// always carries category and price_from (price is always null: the index has no price signal), so a person's
// correction of either was overwritten by the 06:00Z run. A correction recorded with the OWNER-CORRECTION marker
// (save_correction, #185) must survive: the shared writer sends the stored value back, never the source's.
//
// Run: node test/owner-correction-survives-refresh.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const contract = require(`${REPO_DIR}/api/_lib/event-contract.js`);

// 1. price_from is a correctable field: numeric, 0 is a price, blank/negative/text are refused.
{
  assert.ok(contract.OWNER_EDITABLE_FIELDS.includes("price_from"));
  const cur = { category: "food", price_from: null };
  assert.deepStrictEqual(contract.validateCorrection({ price_from: 10, category: "fest" }, cur).changes,
    [{ field: "price_from", before: null, after: 10 }, { field: "category", before: "food", after: "fest" }]);
  assert.strictEqual(contract.validateCorrection({ price_from: "12.5" }, cur).changes[0].after, 12.5);
  assert.strictEqual(contract.validateCorrection({ price_from: 0 }, cur).changes[0].after, 0);
  for (const bad of ["", "free", -1, null, 1e9]) assert.strictEqual(contract.validateCorrection({ price_from: bad }, cur).errors.length, 1, `refuses ${String(bad)}`);
  assert.strictEqual(contract.validateCorrection({ price_from: 10 }, { price_from: "10.00" }).changes.length, 0, "equal value is a no-op");
}
console.log("PASS: 1. price_from is correctable and validated");

// 2. the real handler end to end
process.env.SUPABASE_URL = "https://example-staging.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
delete process.env.CRON_SECRET; delete process.env.VERCEL_ENV;
const sec = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
const hit = (id, title) => ({
  id, title, content: "d", eventCategories: ["Food & Drink"], uri: `/events/${id}`,
  address: ["Some Farm", "1 Farm Rd", "Royal Oak, Michigan 48067"], startDate: sec(2026, 10, 30, 18, 0), endDate: sec(2026, 10, 30, 22, 0), isAllDay: false,
  _geoloc: { lat: 42.4895, lng: -83.1446 },
});
const HITS = [hit(60000001, "Haunted Trail"), hit(60000002, "Untouched Feast")];
const line = contract.buildOwnerCorrectionLine({ at: "2026-10-17T19:53:00.000Z", editId: "e-test", actor: "admin", changes: [
  { field: "category", before: "food", after: "fest" }, { field: "price_from", before: null, after: 10 }] });
const CORRECTED = { external_id: "vd-60000001", internal_note: line, category: "fest", price_from: 10, title: "Haunted Trail" };
const EXISTING = [
  { external_id: "vd-60000001", status: "approved", venue_city_raw: "Royal Oak", start_date: "2026-10-30" },
  { external_id: "vd-60000002", status: "approved", venue_city_raw: "Royal Oak", start_date: "2026-10-30" },
];
const upserts = [];
const json = (b, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => b, text: async () => JSON.stringify(b) });
global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes("algolia")) return json({ hits: HITS });
  if (url.includes("/rest/v1/venues")) return json([]);
  if (url.includes("source=neq.")) return json([]);
  if (url.includes("internal_note=like.")) return json([CORRECTED]);
  if (url.includes("external_id=in.(")) return json(EXISTING);
  if (opts.method === "POST" && url.includes("/rest/v1/events")) { upserts.push(JSON.parse(opts.body)); return json([]); }
  return json([]);
};
const quiet = console.warn; console.warn = () => {};
const handler = require(`${REPO_DIR}/api/cron-visitdetroit.js`);
(async () => {
  let out;
  const res = { status(c) { this.code = c; return this; }, json(b) { out = b; return this; }, setHeader() {} };
  await handler({ headers: {}, query: {}, method: "GET" }, res);
  console.warn = quiet;
  assert.strictEqual(res.code, 200, JSON.stringify(out));
  const by = Object.fromEntries(upserts.flat().map((r) => [r.external_id, r]));
  assert.deepStrictEqual([by["vd-60000001"].category, by["vd-60000001"].price_from], ["fest", 10], "the correction is sent back, not the source's category and null price");
  assert.notStrictEqual(by["vd-60000002"].category, "fest", "an uncorrected row still follows the source");
  assert.strictEqual(by["vd-60000002"].price_from, null);
  console.log("PASS: 2. a VisitDetroit refresh keeps a corrected category and price, and still refreshes other rows");
})().catch((e) => { console.warn = quiet; console.error(e); process.exit(1); });
