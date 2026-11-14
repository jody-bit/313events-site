// test/admin-venues-paged.test.js -- api/admin-venues.js reads EVERY row of the venues table, not the first 1,000 (admin.html venue autofill).
// Supabase caps one request at 1,000 rows with a 200 and no error; the old limit=1000 read stopped there. Offline: the capped PostgREST mock.
// The second source (recent events with an address) stays a deliberate "most recent 500" read and is asserted unchanged.
// Run: node test/admin-venues-paged.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest");

process.env.SUPABASE_URL = "https://fixture.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-fixture";
process.env.ADMIN_SECRET = "admin-fixture";
const pad = (n) => String(n).padStart(5, "0");
const venues = Array.from({ length: 1250 }, (_, i) => ({ id: "ven-" + pad(i), name: "Venue " + pad(i), address: i + " Main St", city: "Detroit" }));
const events = [{ id: "e1", venue_name_raw: "Event Only Hall", venue_address_raw: "9 Side St", venue_city_raw: "Hamtramck", updated_at: "2026-11-01T00:00:00Z" }];

function install(options) {
  const db = makeMockPostgrest({ venues: venues.slice(), events: events.slice() }, options);
  const seen = [];
  global.fetch = async (url, init) => { seen.push(String(url)); return db.fetch(String(url), init); };
  return seen;
}
async function call() {
  delete require.cache[require.resolve("../api/admin-venues.js")];
  const res = { statusCode: 0, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
  await require("../api/admin-venues.js")({ method: "GET", headers: { "x-admin-secret": "admin-fixture" } }, res);
  return res;
}

(async () => {
  // 1. every venue comes back, at the production cap and at a smaller one
  for (const cap of [1000, 500]) {
    const seen = install({ cap });
    const res = await call();
    assert.strictEqual(res.statusCode, 200);
    const names = res.body.venues.map((v) => v.name);
    assert.strictEqual(names.filter((n) => /^Venue /.test(n)).length, 1250, "all 1,250 venues at cap " + cap);
    assert.ok(names.includes("Event Only Hall"), "an event-sourced address still fills a name the venues table lacks");
    const vReads = seen.filter((u) => /\/rest\/v1\/venues\?/.test(u));
    assert.ok(vReads.length >= 2, "venues read in pages");
    for (const u of vReads) assert.ok(/order=[^&]*id\.asc/.test(u) && /[?&]offset=\d+/.test(u) && Number((u.match(/[?&]limit=(\d+)/) || [])[1]) <= 1000, "bad page url " + u);
  }
  console.log("PASS: all 1,250 venues are listed at server caps of 1,000 and 500");

  // 2. the events source is unchanged: one request, limit=500, most recent first
  {
    const seen = install({});
    await call();
    const e = seen.filter((u) => /\/rest\/v1\/events\?/.test(u));
    assert.strictEqual(e.length, 1);
    assert.ok(/order=updated_at\.desc&limit=500/.test(e[0]), e[0]);
  }
  console.log("PASS: the recent-events source is unchanged (one read, most recent 500)");

  // 3. fail-soft: a failed later venues page keeps what was read, answers 200, and warns
  {
    let n = 0;
    install({ cap: 500, failure: (r) => (/\/venues\?/.test(r.url || "") && ++n === 2 ? 500 : null) });
    const warns = []; const w = console.warn; console.warn = (...a) => warns.push(a.join(" "));
    let res;
    try { res = await call(); } finally { console.warn = w; }
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.venues.filter((v) => /^Venue /.test(v.name)).length >= 500, "rows read before the failure are kept");
    assert.ok(warns.some((m) => /\[admin-venues\] venues read incomplete/.test(m)), "partial read is never silent");
  }
  console.log("PASS: a failed later page stays 200, keeps the rows read, and warns");
})().catch((e) => { console.error(e); process.exit(1); });
