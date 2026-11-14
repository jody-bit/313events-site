// test/address-city.test.js — the city a street address states (P1 audit
// EXPORT-2, kind nocity-missing-city-has-address). Uses the six real rows.
// Run: node test/address-city.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { cityFromAddress } = require(`${REPO_DIR}/api/_lib/address-city.js`);
const ra = require(`${REPO_DIR}/scripts/ra-sync.js`);

const CASES = [
  ["37000 Woodward Ave, Ste 100 Bloomfield Hills, MI 48304", "Bloomfield Hills", "37000 Woodward Ave, Ste 100"],
  ["14900 Beck Road Plymouth MI 48170", "Plymouth", "14900 Beck Road"],
  ["19803 Ralston St Detroit MI 48203", "Detroit", "19803 Ralston St"],
  ["251 W Nine Mile Rd, Ferndale, MI", "Ferndale", "251 W Nine Mile Rd"],
];
const NO_CITY = ["7500 Oakland Ave", "950 West McNichols", "", "Somewhere, Detroit, MI", "Ferndale, MI", "1 Main St, Atlantis, MI 48000", "123 Troy Rd, Troy, OH 45373", null];

(async () => {
  for (const [text, city, street] of CASES) {
    const r = cityFromAddress(text);
    assert.ok(r, text);
    assert.strictEqual(r.city, city, text);
    assert.strictEqual(r.street, street, text);
  }
  for (const t of NO_CITY) assert.strictEqual(cityFromAddress(t), null, String(t));
  console.log("PASS: cityFromAddress -- stated city taken, none guessed (no city in text, unknown city, no house number)");

  for (const [text, city, street] of CASES) {
    const p = ra.parseAddressText(text);
    assert.strictEqual(p.city, city, "ra " + text);
    if (!/,\s*[A-Za-z .]+,\s*MI/.test(text)) assert.strictEqual(p.street, street);
  }
  assert.strictEqual(ra.parseAddressText("950 West McNichols").city, null);
  assert.strictEqual(ra.parseAddressText("950 West McNichols").street, "950 West McNichols");
  console.log("PASS: RA parseAddressText -- comma-less 'Plymouth MI 48170' now yields the city; 'no city in text' stays null");

  // submit path: the form has no city field
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.RESEND_API_KEY;
  async function stored(address) {
    let inserted = null;
    global.fetch = async (url, opts = {}) => {
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (opts.method === "POST" && url.includes("/rest/v1/events")) {
        const parsed = JSON.parse(opts.body);
        inserted = Array.isArray(parsed) ? parsed[0] : parsed;
        return { ok: true, status: 201, json: async () => [{ id: "evt-1" }] };
      }
      throw new Error("unmocked URL: " + url);
    };
    delete require.cache[require.resolve(`${REPO_DIR}/api/submit.js`)];
    const res = { status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; } };
    await require(`${REPO_DIR}/api/submit.js`)({ method: "POST", headers: {}, body: {
      title: "Sunday Social", category: "community", startDate: "2026-11-01", venue: "Example Club",
      address, orgName: "Org", contactEmail: "o@example.com", elapsedMs: 5000 } }, res);
    assert.strictEqual(res._s, 201);
    return inserted;
  }
  const a = await stored("251 W Nine Mile Rd, Ferndale, MI");
  assert.strictEqual(a.venue_city_raw, "Ferndale");
  assert.strictEqual(a.venue_address_raw, "251 W Nine Mile Rd, Ferndale, MI", "address text is stored as typed");
  const b = await stored("7500 Oakland Ave");
  assert.strictEqual(b.venue_city_raw, null);
  const c = await stored("");
  assert.strictEqual(c.venue_city_raw, null);
  console.log("PASS: submit stores the city its address states, null otherwise, address untouched");
})().catch((e) => { console.error(e); process.exit(1); });
