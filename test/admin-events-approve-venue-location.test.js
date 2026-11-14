// test/admin-events-approve-venue-location.test.js — P1 audit EXPORT-2:
// a Venue Submission with no venue link and no city must not be approved
// silently. Run: node test/admin-events-approve-venue-location.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest.js");
const REPO_DIR = process.env.REPO_DIR || process.cwd();

const row = (o) => ({ id: "evt-1", title: "Sunday Social", status: "pending_review", source: "Venue Submission", start_date: "2026-12-01", time_display: "7:00 PM", venue_name_raw: "Some Bar", venue_id: null, venue_city_raw: null, venue_address_raw: null, ...o });

async function approve(r, extra) {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.ADMIN_SECRET = "fixture-admin-secret";
  const tables = { events: [r] };
  const db = makeMockPostgrest(tables);
  global.fetch = async (url, init) => db.fetch(String(url), init);
  delete require.cache[require.resolve(`${REPO_DIR}/api/admin-events.js`)];
  const res = { status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; } };
  await require(`${REPO_DIR}/api/admin-events.js`)({ method: "POST", body: { id: "evt-1", action: "approve", ...extra }, headers: { "x-admin-secret": process.env.ADMIN_SECRET } }, res);
  return { res, stored: tables.events[0] };
}

(async () => {
  let { res, stored } = await approve(row());
  assert.strictEqual(res._s, 409);
  assert.strictEqual(res._b.error, "MISSING_VENUE_LOCATION");
  assert.strictEqual(stored.status, "pending_review", "left untouched");

  ({ res, stored } = await approve(row({ venue_address_raw: "7500 Oakland Ave" })));
  assert.strictEqual(res._s, 409, "an address with no city does not rescue it");

  ({ res, stored } = await approve(row(), { acknowledgeMissingLocation: true }));
  assert.strictEqual(res._s, 200);
  assert.strictEqual(stored.status, "approved");
  assert.strictEqual(stored.venue_city_raw, null, "an acknowledged approval invents nothing");

  ({ res, stored } = await approve(row({ venue_address_raw: "251 W Nine Mile Rd, Ferndale, MI" })));
  assert.strictEqual(res._s, 200, JSON.stringify(res._b));
  assert.strictEqual(stored.status, "approved");
  assert.strictEqual(stored.venue_city_raw, "Ferndale", "the city its own address states is filled in the same approve");

  for (const r of [row({ venue_id: "v1" }), row({ venue_city_raw: "Detroit" }), row({ no_fixed_venue: true }), row({ source: "Resident Advisor", time_display: "9 PM" })]) {
    ({ res, stored } = await approve(r));
    assert.strictEqual(res._s, 200, JSON.stringify(r));
    assert.strictEqual(stored.status, "approved");
  }
  console.log("PASS: Venue Submission with no venue link and no city is refused (409), rescued only by a city its address states, overridable on purpose; linked / city / no-fixed-venue / other sources unaffected");
})().catch((e) => { console.error(e); process.exit(1); });
