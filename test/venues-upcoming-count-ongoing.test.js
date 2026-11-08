// venues.html "N upcoming" count must use the same rule as the venue page (#365): start >= today OR continuous and not ended.
"use strict";
const assert = require("assert"), fs = require("fs");
const dir = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${dir}/venues.html`, "utf8");
const t = [...html.matchAll(/fetchAllRows\(`([^`]+)`/g)].map((m) => m[1]).find((x) => /\/events\?/.test(x));
assert.ok(t, "events count query not found");
const url = t.split("${SUPABASE_URL}").join("https://x.test").split("${getTodayISO()}").join("2026-11-08");
assert.ok(url.includes("status=eq.approved"), "approved only");
assert.ok(url.includes("or=(start_date.gte.2026-11-08,and(date_semantics.eq.continuous,end_date.gte.2026-11-08))"), "ongoing continuous rows counted");
assert.ok(url.includes("venue_id=not.is.null") && url.includes("select=id,venue_id") && /order=id\.asc$/.test(url), "paging order and select unchanged");
assert.ok(!/date_semantics\.eq\.(recurring|single)/.test(url), "recurring and unverified past rows not counted");
const vt = fs.readFileSync(`${dir}/venue-template.html`, "utf8");
assert.ok(vt.includes("or=(start_date.gte.${todayISO},and(date_semantics.eq.continuous,end_date.gte.${todayISO}))"), "same rule as the venue page");
// mock: and() inside or= is evaluated
const { makeMockPostgrest } = require(`${dir}/test/fixtures/mock-postgrest.js`);
const { fetchAllRows } = require(`${dir}/paged-fetch.js`);
const T = "2026-11-08";
const rows = [
  { id: 1, status: "approved", venue_id: 10, start_date: "2026-11-20", end_date: "2026-11-20", date_semantics: "single" },
  { id: 2, status: "approved", venue_id: 11, start_date: "2026-10-01", end_date: "2027-01-10", date_semantics: "continuous" },   // ongoing: counted
  { id: 3, status: "approved", venue_id: 11, start_date: "2026-10-01", end_date: T, date_semantics: "continuous" },              // last day: counted
  { id: 4, status: "approved", venue_id: 12, start_date: "2026-10-01", end_date: "2026-11-06", date_semantics: "continuous" },  // ended
  { id: 5, status: "approved", venue_id: 12, start_date: "2026-11-01", end_date: "2026-11-30", date_semantics: null },          // unverified past start
  { id: 6, status: "approved", venue_id: 12, start_date: "2026-10-01", end_date: "2026-12-01", date_semantics: "recurring" },   // recurring past start
  { id: 7, status: "pending_review", venue_id: 13, start_date: "2026-10-01", end_date: "2027-01-10", date_semantics: "continuous" }, // not approved
  { id: 8, status: "approved", venue_id: null, start_date: "2026-10-01", end_date: "2027-01-10", date_semantics: "continuous" },   // no venue
];
(async () => {
  const api = makeMockPostgrest({ events: rows }, { cap: 1000 });
  const got = (await fetchAllRows(url.replace("https://x.test", "https://example.supabase.co"), { apikey: "anon" }, { fetchImpl: api.fetch })).rows.map((r) => r.id).sort();
  assert.deepStrictEqual(got, [1, 2, 3], "future + ongoing counted; ended, unverified, recurring, unapproved and venue-less rows are not");
  console.log("venues-upcoming-count-ongoing ok");
})().catch((e) => { console.error(e); process.exit(1); });
