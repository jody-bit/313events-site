// test/preview-link-validate-paged.test.js -- scripts/preview-link-validate.js reads every upcoming approved event for the Preview stamp.
// It used limit=2000, but one request returns at most 1,000 rows with a 200, so the sample, staleness and link counts covered only the first 1,000.
// Offline: fake fetch only. Run: node test/preview-link-validate-paged.test.js
"use strict";
const assert = require("assert");
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon-fixture";
const lib = require("../scripts/preview-link-validate.js");
const all = Array.from({ length: 1700 }, (_, i) => ({ id: "evt-" + String(i).padStart(5, "0"), title: "E" + i }));

function install(cap, failOn) {
  const reads = [], writes = [];
  global.fetch = async (url, init = {}) => {
    url = String(url);
    if ((init.method || "GET") !== "GET") { writes.push({ url }); return { ok: true, status: 201, json: async () => [] }; }
    reads.push(url);
    if (failOn && reads.length === failOn) return { ok: false, status: 500, json: async () => ({}) };
    const off = Number((url.match(/[?&]offset=(\d+)/) || [])[1] || 0);
    const lim = Number((url.match(/[?&]limit=(\d+)/) || [])[1] || cap);
    const rows = all.slice(off, off + Math.min(lim, cap));
    return { ok: true, status: 200, json: async () => rows };
  };
  return { reads, writes };
}

(async () => {
  let io = install(500);
  const rows = await lib.fetchSupabaseRows();
  assert.strictEqual(rows.length, 1700, "every upcoming event is returned at a server cap of 500");
  assert.ok(rows.some((r) => r.id === "evt-01650"), "a tail row past 1,000 is included");
  assert.deepStrictEqual(io.reads.map((u) => Number(u.match(/[?&]offset=(\d+)/)[1])).slice(0, 4), [0, 500, 1000, 1500]);
  assert.ok(io.reads.every((u) => /order=start_date\.asc,id\.asc/.test(u) && Number(u.match(/[?&]limit=(\d+)/)[1]) <= 1000), "stable order, limit<=1000");
  console.log("PASS: the validator reads every upcoming event at a server cap of 500");

  io = install(500, 3);
  await assert.rejects(() => lib.fetchSupabaseRows(), /events query incomplete/);
  assert.deepStrictEqual(io.writes, [], "a read-only tool: no write of any kind");
  console.log("PASS: a failed later page throws instead of returning a smaller set");
})().catch((e) => { console.error(e); process.exit(1); });
