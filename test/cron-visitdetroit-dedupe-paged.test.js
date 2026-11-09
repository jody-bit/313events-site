// test/cron-visitdetroit-dedupe-paged.test.js -- the VisitDetroit cron's cross-source duplicate lookup reads EVERY other-source event in the
// batch's date window, not the first 1,000. A plain read stopped at Supabase's 1,000-row cap with a 200, so a duplicate whose key sat past row
// 1,000 was missed and inserted again. Offline: the capped PostgREST mock and a fake Algolia. Writes go to the mock; nothing leaves the process.
// Run: node test/cron-visitdetroit-dedupe-paged.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest");

process.env.SUPABASE_URL = "https://fixture.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-fixture";
process.env.CRON_SECRET = "cron-fixture";

// VisitDetroit encodes Detroit LOCAL wall-clock time as epoch seconds read as UTC: 2099-06-15 19:00 -> this value.
const START = Date.UTC(2099, 5, 15, 19, 0, 0) / 1000;
const hit = (id, title) => ({ id, title, startDate: START, endDate: START + 7200, isAllDay: false, eventCategories: ["Music & Concerts"], address: ["Fixture Hall", "1 Main St", "Detroit, Michigan 48226"], url: "/events/" + id + "/", _geoloc: { lat: 42.3314, lng: -83.0458 } });
const hits = [hit("1", "Already On The Calendar"), hit("2", "Brand New Show")];
const pad = (n) => String(n).padStart(5, "0");
// 1,700 other-source rows on that date; the duplicate of hit 1 is row 1,650, i.e. past the 1,000-row cap.
const others = Array.from({ length: 1700 }, (_, i) => ({ id: "oth-" + pad(i), status: "approved", source: "Other", title: i === 1650 ? "Already On The Calendar" : "Filler " + i, start_date: "2099-06-15" }));

async function run(options) {
  const db = makeMockPostgrest({ events: others.map((e) => ({ ...e })), venues: [] }, options);
  const reads = [];
  global.fetch = async (url, init) => {
    url = String(url);
    if (/algolia/i.test(url)) return { ok: true, status: 200, json: async () => ({ hits }), text: async () => "{}" };
    if (/\/rest\/v1\/events\?/.test(url) && !(init && init.method && init.method !== "GET")) reads.push(url);
    return db.fetch(url, init);
  };
  delete require.cache[require.resolve("../api/cron-visitdetroit.js")];
  const res = { statusCode: 0, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; }, setHeader() {} };
  const warns = []; const w = console.warn; console.warn = (...a) => warns.push(a.join(" "));
  try { await require("../api/cron-visitdetroit.js")({ method: "GET", headers: { authorization: "Bearer cron-fixture" }, query: {} }, res); } finally { console.warn = w; }
  return { res, reads, warns };
}

(async () => {
  // 1. at the production cap and a smaller one, the duplicate past row 1,000 is found
  for (const cap of [1000, 500]) {
    const { res, reads } = await run({ cap });
    assert.ok(res.body && !res.body.error, "cron errored at cap " + cap + ": " + JSON.stringify(res.body).slice(0, 300));
    assert.strictEqual(res.body.skippedAsDuplicate, 1, "the duplicate past row 1,000 is skipped at cap " + cap + " (got " + res.body.skippedAsDuplicate + ")");
    const lookups = reads.filter((u) => /source=neq\./.test(u));
    assert.ok(lookups.length >= 2, "the lookup is paged");
    for (const u of lookups) assert.ok(/order=[^&]*id\.asc/.test(u) && /[?&]offset=\d+/.test(u) && Number((u.match(/[?&]limit=(\d+)/) || [])[1]) <= 1000, "bad page url " + u);
  }
  console.log("PASS: the cross-source duplicate lookup reads past 1,000 rows (caps 1,000 and 500)");

  // 2. fail-open is kept: a failed later page does not stop the run, and the partial read is reported
  let n = 0;
  const { res, warns } = await run({ cap: 500, failure: (r) => (/source=neq\./.test(r.url || "") && ++n === 3 ? 500 : null) });
  assert.ok(res.body && !res.body.error, "a failed lookup page must not fail the run");
  assert.ok(warns.some((m) => /duplicate lookup incomplete/.test(m)), "a partial lookup is never silent");
  console.log("PASS: a failed lookup page keeps the run going and warns");
})().catch((e) => { console.error(e); process.exit(1); });
