// test/admin-185-integrated-acceptance.test.js — Jody's #185 increment 1 integration acceptance (14:34Z Oct 18), nine
// steps, run as ONE story against one shared fake database: the real admin handler (save_correction, #210), the real
// VisitDetroit connector and shared writer (#210 + #212). The review-queue UI (#209) is covered by
// test/admin-review-queue-edit.test.js against this same API contract. This is the offline half of the evidence;
// the staging/Preview run is R&Q's.
//
// Run: node test/admin-185-integrated-acceptance.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest.js");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
process.env.SUPABASE_URL = "https://example-staging.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
delete process.env.CRON_SECRET; delete process.env.VERCEL_ENV;

const V1 = "2026-10-18T05:00:00+00:00";
const sec = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
const hit = (id, title, content) => ({
  id, title, content, eventCategories: ["Food & Drink"], uri: `/events/${id}`,
  address: ["Some Farm", "1 Farm Rd", "Royal Oak, Michigan 48067"], startDate: sec(2027, 11, 20, 18, 0), endDate: sec(2027, 11, 20, 22, 0),
  isAllDay: false, _geoloc: { lat: 42.4895, lng: -83.1446 },
});
const stored = (extra) => ({
  id: "evt-1", external_id: "vd-61000001", source: "VisitDetroit", status: "pending_review", title: "Haunted Trail", category: "food",
  start_date: "2027-11-20", time_display: "6:00 PM", venue_name_raw: "Some Farm", venue_id: null, venue_address_raw: "1 Farm Rd",
  venue_city_raw: "Royal Oak", description: "Old source description.", price_from: null, ticket_url: null, event_url: null, internal_note: null,
  updated_at: V1, ...extra,
});
const tables = { events: [stored(), stored({ id: "evt-2", external_id: "vd-61000002", title: "Sister Event", venue_city_raw: "Detroit, MI", description: "Second." })], feed_sources: [], source_runs: [], venues: [] };
const db = makeMockPostgrest(tables);
let hits = [];
global.fetch = async (url, init) => (String(url).includes("algolia") ? { ok: true, status: 200, json: async () => ({ hits }), text: async () => JSON.stringify({ hits }) } : db.fetch(String(url), init));
const fresh = (p) => { delete require.cache[require.resolve(`${REPO_DIR}/${p}`)]; return require(`${REPO_DIR}/${p}`); };
const makeRes = () => ({ _status: null, _body: null, code: null, status(c) { this._status = c; this.code = c; return this; }, json(b) { this._body = b; return this; }, setHeader() {} });
const admin = async (method, body) => { const res = makeRes(); await fresh("api/admin-events.js")({ method, query: {}, body, headers: { "x-admin-secret": process.env.ADMIN_SECRET } }, res); return res; };
const row = (id) => tables.events.find((e) => e.id === id);

(async () => {
  // 1-2. owner edits a pending event; the save does not approve it
  const s = await admin("POST", { id: "evt-1", action: "save_correction", row_version: V1, fields: { category: "fest", price_from: 10 } });
  assert.strictEqual(s._status, 200, JSON.stringify(s._body));
  assert.strictEqual(row("evt-1").status, "pending_review", "2. saved without approving");
  assert.deepStrictEqual([row("evt-1").category, row("evt-1").price_from], ["fest", 10]);
  assert.deepStrictEqual([s._body.status_before, s._body.status_after, s._body.approve.done], ["pending_review", "pending_review", false]);
  console.log("PASS: 1-2. owner edit saves, status unchanged");

  // 3. audit history records the correction (before and after), and the queue shows it
  const q = await admin("GET");
  const e1 = q._body.events.find((x) => x.id === "evt-1");
  assert.deepStrictEqual(e1.owner_corrected.sort(), ["category", "price_from"]);
  assert.deepStrictEqual(e1.edits.map((x) => [x.field, x.before, x.after]).sort(), [["category", "food", "fest"], ["price_from", null, 10]]);
  console.log("PASS: 3. audit records before/after and the queue exposes it");

  // 4. a connector refresh runs (real VisitDetroit handler, source still says food and no price)
  hits = [hit(61000001, "Haunted Trail", "New source description."), hit(61000002, "Sister Event", "Second.")];
  const quiet = console.warn; console.warn = () => {};
  const vd = makeRes();
  await fresh("api/cron-visitdetroit.js")({ headers: {}, query: {}, method: "GET" }, vd);
  console.warn = quiet;
  assert.strictEqual(vd.code, 200, JSON.stringify(vd._body));

  // 5-6. corrected fields unchanged; uncorrected fields still refresh
  assert.deepStrictEqual([row("evt-1").category, row("evt-1").price_from], ["fest", 10], "5. corrected fields unchanged");
  assert.strictEqual(row("evt-1").description, "New source description.", "6. uncorrected field still refreshes");
  assert.match(row("evt-1").internal_note, /^OWNER-CORRECTION /, "audit line survives the refresh");
  assert.strictEqual(row("evt-1").status, "pending_review", "the refresh publishes nothing");
  console.log("PASS: 4-6. refresh keeps corrected category and price; description refreshes");

  // 7-8. Save and approve is separately gated and names the failing gate
  row("evt-2").venue_city_raw = "Detroit, MI"; // data the publication gate refuses (a region in the city field)
  const held = await admin("POST", { id: "evt-2", action: "save_correction", row_version: row("evt-2").updated_at, fields: { description: "Corrected words here." }, approve: true });
  assert.strictEqual(held._status, 200);
  assert.strictEqual(held._body.approve.done, false);
  assert.strictEqual(held._body.approve.blocked.failed_gate, "publication_gate");
  assert.ok(held._body.approve.blocked.codes.includes("CITY_HAS_REGION"));
  assert.strictEqual(row("evt-2").description, "Corrected words here.", "the correction is kept when approval is refused");
  console.log("PASS: 7-8. approve refused with the failing gate named; correction kept");

  // 9. nothing unauthorized was published
  assert.deepStrictEqual(tables.events.filter((e) => e.status === "approved").map((e) => e.id), [], "9. no row became approved without a passing, explicit approve");
  // and the explicit approve of the clean row works, from pending_review only
  const ok = await admin("POST", { id: "evt-1", action: "save_correction", row_version: row("evt-1").updated_at, fields: { description: "Final description." }, approve: true });
  assert.strictEqual(ok._body.approve.done, true, JSON.stringify(ok._body.approve));
  assert.strictEqual(row("evt-1").status, "approved");
  console.log("PASS: 9. nothing published unprompted; explicit approve of the clean row succeeds");
})().catch((e) => { console.error(e); process.exit(1); });
