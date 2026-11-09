// test/owner-correction-second-edit.test.js — a SECOND correction on the same row. The audit trail is one line per edit
// in internal_note, so after two edits the note is multi-line; the connector's marker read
// (internal_note=like.*OWNER-CORRECTION*) must still match it, as real Postgres LIKE does (% matches newlines).
// Before the fake database's like honoured that, a twice-corrected row looked uncorrected and the next refresh
// overwrote both fixes without any test noticing.
//
// Run: node test/owner-correction-second-edit.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest.js");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
process.env.SUPABASE_URL = "https://example-staging.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";
delete process.env.CRON_SECRET; delete process.env.VERCEL_ENV;

const V1 = "2026-10-18T05:00:00+00:00";
const tables = { events: [{
  id: "evt-1", external_id: "vd-62000001", source: "VisitDetroit", status: "pending_review", title: "Haunted Trail", category: "food",
  start_date: "2027-11-20", time_display: "6:00 PM", venue_name_raw: "Some Farm", venue_id: null, venue_address_raw: "1 Farm Rd",
  venue_city_raw: "Royal Oak", description: "Old.", price_from: null, ticket_url: null, event_url: null, internal_note: null, updated_at: V1,
}], feed_sources: [], source_runs: [], venues: [] };
const db = makeMockPostgrest(tables);
global.fetch = async (url, init) => db.fetch(String(url), init);
const fresh = (p) => { delete require.cache[require.resolve(`${REPO_DIR}/${p}`)]; return require(`${REPO_DIR}/${p}`); };
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });
const save = async (fields) => {
  const res = makeRes();
  await fresh("api/admin-events.js")({ method: "POST", body: { id: "evt-1", action: "save_correction", row_version: tables.events[0].updated_at, fields }, headers: { "x-admin-secret": process.env.ADMIN_SECRET } }, res);
  assert.strictEqual(res._status, 200, JSON.stringify(res._body));
};

(async () => {
  await save({ category: "fest" });
  await new Promise((r) => setTimeout(r, 5)); // distinct row_version
  await save({ price_from: 10 });
  const note = tables.events[0].internal_note;
  assert.strictEqual(note.split("\n").length, 2, "two edits -> two audit lines");

  // the marker read itself matches the multi-line note
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/events?select=external_id,internal_note&internal_note=like.*OWNER-CORRECTION*&external_id=not.is.null&limit=1000`);
  assert.deepStrictEqual((await r.json()).map((x) => x.external_id), ["vd-62000001"], "a multi-line note is still found");

  // and a refresh through the one shared writer keeps both corrections
  const { upsertEventRows } = fresh("api/_lib/event-upsert.js");
  const resp = await upsertEventRows(process.env.SUPABASE_URL, "k", [{
    external_id: "vd-62000001", title: "Haunted Trail", category: "food", price_from: null, start_date: "2027-11-20", description: "Source description.", status: "pending_review",
  }]);
  assert.strictEqual(resp.ok, true, await resp.text());
  const e = tables.events[0];
  assert.deepStrictEqual([e.category, e.price_from], ["fest", 10], "both corrections survive the refresh");
  assert.strictEqual(e.description, "Source description.", "an uncorrected field still follows the source");
  assert.strictEqual(e.internal_note.split("\n").length, 2, "and both audit lines are intact");
  console.log("PASS: a twice-corrected row keeps both corrections and both audit lines through a refresh");
})().catch((e) => { console.error(e); process.exit(1); });
