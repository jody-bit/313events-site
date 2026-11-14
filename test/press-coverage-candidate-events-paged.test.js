// test/press-coverage-candidate-events-paged.test.js -- scripts/press-coverage-linking.js reads its candidate events (the approved/pending events a
// press article can be linked to) through the server pager. It used limit=2000, but one request returns at most 1,000 rows with a 200, so events past
// row 1,000 were never candidates. A failed later page must throw before anything is linked or created. Offline: fake fetch only; no live call.
// Run: node test/press-coverage-candidate-events-paged.test.js
"use strict";
const assert = require("assert");
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-fixture";
const lib = require("../scripts/press-coverage-linking.js");

const all = Array.from({ length: 1700 }, (_, i) => ({ id: "evt-" + String(i).padStart(5, "0"), title: "Event " + i, start_date: "2099-01-01" }));
function install(cap, failOnCall) {
  const reads = [], writes = [];
  global.fetch = async (url, init = {}) => {
    url = String(url);
    if ((init.method || "GET") !== "GET") { writes.push({ url, method: init.method }); return { ok: true, status: 201, json: async () => [], text: async () => "[]" }; }
    if (!/\/rest\/v1\/events\?/.test(url)) return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
    reads.push(url);
    if (failOnCall && reads.length === failOnCall) return { ok: false, status: 500, json: async () => ({}), text: async () => "boom" };
    const off = Number((url.match(/[?&]offset=(\d+)/) || [])[1] || 0);
    const lim = Number((url.match(/[?&]limit=(\d+)/) || [])[1] || cap);
    const rows = all.slice(off, off + Math.min(lim, cap));
    return { ok: true, status: 200, json: async () => rows, text: async () => JSON.stringify(rows) };
  };
  return { reads, writes };
}
const H = { apikey: "k", Authorization: "Bearer k" };

(async () => {
  // 1. cap 500 < 1700: every row comes back, including the tail past row 1,000, paged with a stable order.
  let io = install(500);
  const rows = await lib.fetchCandidateEventsDefault(process.env.SUPABASE_URL, H);
  assert.strictEqual(rows.length, 1700);
  assert.ok(rows.some((r) => r.id === "evt-01650"), "a tail row past 1,000 is a candidate");
  assert.deepStrictEqual(io.reads.map((u) => Number(u.match(/[?&]offset=(\d+)/)[1])).slice(0, 4), [0, 500, 1000, 1500]);
  assert.ok(io.reads.every((u) => /order=start_date\.asc,id\.asc/.test(u) && Number(u.match(/[?&]limit=(\d+)/)[1]) <= 1000), "stable order, limit<=1000");
  console.log("PASS: candidate events are read to the end at a server cap of 500");

  // 2. a failed later page throws; through the orchestrator nothing is linked, created or written.
  io = install(500, 3);
  await assert.rejects(() => lib.fetchCandidateEventsDefault(process.env.SUPABASE_URL, H), /Failed to fetch candidate events/);
  io = install(500, 3);
  let applied = 0, created = 0;
  const queue = [{ id: "art-1", source: "x", title: "Event 1650 is on", excerpt: "", url: "https://news.example/a", published_at: "2099-01-01T00:00:00Z" }];
  await assert.rejects(() => lib.linkPressCoverageQueue({
    logger: { log() {}, warn() {}, error() {} }, dryRun: false,
    fetchQueue: async () => queue, applyLinkFn: async () => { applied++; return true; }, createEventFn: async () => { created++; return null; },
  }), /Failed to fetch candidate events/);
  assert.strictEqual(applied, 0, "no link applied after an incomplete read");
  assert.strictEqual(created, 0, "no event created after an incomplete read");
  assert.deepStrictEqual(io.writes, [], "no PATCH or POST of any kind after an incomplete read");
  console.log("PASS: a failed later page throws before anything is linked, created or written");
})().catch((e) => { console.error(e); process.exit(1); });
