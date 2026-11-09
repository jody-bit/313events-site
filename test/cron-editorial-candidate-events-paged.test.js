// test/cron-editorial-candidate-events-paged.test.js -- api/cron-editorial.js reads its candidate events (the approved events an editorial article
// can match) through the server pager, so a server cap below the number of upcoming events cannot silently shrink the list. A failed later page is
// an error (the existing "Failed to load candidate events" response), never a smaller candidate list. Offline: fake fetch only.
// Run: node test/cron-editorial-candidate-events-paged.test.js
"use strict";
const assert = require("assert");
const REPO = process.cwd();
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
delete process.env.CRON_SECRET;

const EMPTY_RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>`;
const all = Array.from({ length: 1700 }, (_, i) => ({ id: "evt-" + String(i).padStart(5, "0"), title: "E" + i, start_date: "2099-01-01" }));
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });

async function run(cap, failOnCall) {
  const eventReads = [];
  const writes = [];
  global.fetch = async (url, opts = {}) => {
    url = String(url);
    const method = opts.method || "GET";
    if (url.startsWith("https://example.supabase.co/")) {
      if (method !== "GET") { writes.push({ url, method }); return { ok: true, status: 201, json: async () => [], text: async () => "[]" }; }
      if (/\/rest\/v1\/events\?/.test(url)) {
        eventReads.push(url);
        if (failOnCall && eventReads.length === failOnCall) return { ok: false, status: 500, json: async () => ({}), text: async () => "boom" };
        const off = Number((url.match(/[?&]offset=(\d+)/) || [])[1] || 0);
        const lim = Number((url.match(/[?&]limit=(\d+)/) || [])[1] || cap);
        const rows = all.slice(off, off + Math.min(lim, cap));
        return { ok: true, status: 200, json: async () => rows, text: async () => JSON.stringify(rows) };
      }
      return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
    }
    return { ok: true, status: 200, text: async () => EMPTY_RSS };
  };
  delete require.cache[require.resolve(`${REPO}/api/cron-editorial.js`)];
  const res = makeRes();
  await require(`${REPO}/api/cron-editorial.js`)({ headers: {} }, res);
  return { res, eventReads, writes };
}

(async () => {
  // 1. cap 500 < 1700 events: the candidate read is paged to the end, each page ordered with the id tiebreak and limit<=1000 + offset.
  {
    const { eventReads } = await run(500);
    assert.ok(eventReads.length >= 4, "the candidate read pages at a server cap of 500, got " + eventReads.length + " requests");
    for (const u of eventReads) {
      assert.ok(/order=[^&]*id\.asc/.test(u), "page read lacks id tiebreak: " + u);
      assert.ok(/[?&]offset=\d+/.test(u) && Number((u.match(/[?&]limit=(\d+)/) || [])[1]) <= 1000, "page read must be limit<=1000 with an offset: " + u);
    }
    const offsets = eventReads.map((u) => Number(u.match(/[?&]offset=(\d+)/)[1]));
    assert.deepStrictEqual(offsets.slice(0, 4), [0, 500, 1000, 1500], "pages advance by the rows that actually came back");
  }
  console.log("PASS: candidate events are read to the end at a server cap of 500");

  // 2. a failing later page: an error response, no partial candidate list used.
  {
    const { res } = await run(500, 2);
    assert.strictEqual(res._status, 200);
    assert.ok(/Failed to load candidate events: candidate events read incomplete/.test(res._body.error || ""), JSON.stringify(res._body).slice(0, 300));
    assert.strictEqual(res._body.upserted, 0);
  }
  console.log("PASS: a failed later page is reported as an error, not a smaller list");
})().catch((e) => { console.error(e); process.exit(1); });
