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
all[1650].title = "Unique Zebra Gala"; // a tail row: past row 1,000, so a cap-1000 read would miss it
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });

async function run(cap, failOnCall, opts) {
  const unmatched = (opts && opts.unmatched) || [];
  const onlyRetry = !!(opts && opts.onlyRetry); // count/fail only the retry pass read (status=in.(approved,pending_review))
  const eventReads = [];
  const writes = [];
  global.fetch = async (url, opts = {}) => {
    url = String(url);
    const method = opts.method || "GET";
    if (url.startsWith("https://example.supabase.co/")) {
      if (method !== "GET") { writes.push({ url, method, body: String(opts.body || "") }); return { ok: true, status: 201, json: async () => [], text: async () => "[]" }; }
      if (/\/rest\/v1\/editorial_articles\?matched_event_id=is\.null/.test(url)) return { ok: true, status: 200, json: async () => unmatched, text: async () => JSON.stringify(unmatched) };
      if (/\/rest\/v1\/events\?/.test(url)) {
        if (onlyRetry && !(/status=in\.\(approved,pending_review\)/.test(url) && /order=start_date\.asc,id\.asc/.test(url))) return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
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
    const { res, writes } = await run(500, 2);
    assert.deepStrictEqual(writes, [], "no write of any kind after an incomplete candidate read: " + JSON.stringify(writes));
    assert.strictEqual(res._status, 200);
    assert.ok(/Failed to load candidate events: candidate events read incomplete/.test(res._body.error || ""), JSON.stringify(res._body).slice(0, 300));
    assert.strictEqual(res._body.upserted, 0);
  }
  console.log("PASS: a failed later page is reported as an error, not a smaller list");
  // 3. RETRY PASS (retryUnmatchedArticles): one unmatched article, 1,700 candidate events, server cap 500. The feeds are empty, so only this pass
  // reads the wide pool (status=in.(approved,pending_review)). It must page to the end, and a failed later page must be an error with NO write
  // (no article match, no join row, no stale dismissal).
  {
    const article = { id: "art-1", title: "Totally unrelated headline", excerpt: "", url: "https://news.example/a1", published_at: "2020-01-01T00:00:00Z" };
    const ok = await run(500, 0, { unmatched: [article], onlyRetry: true });
    assert.ok(ok.eventReads.length >= 4, "retry pass pages the wide pool at a cap of 500, got " + ok.eventReads.length);
    assert.deepStrictEqual(ok.eventReads.map((u) => Number(u.match(/[?&]offset=(\d+)/)[1])).slice(0, 4), [0, 500, 1000, 1500]);
    assert.ok(ok.eventReads.every((u) => /order=start_date\.asc,id\.asc/.test(u)), "stable start_date,id order on every page");

    const bad = await run(500, 3, { unmatched: [article], onlyRetry: true });
    const rr = bad.res._body && bad.res._body.retroactiveRematch;
    assert.ok(rr && /Failed to load candidate events: candidate events read incomplete/.test(rr.error || ""), "retry pass reports the incomplete read: " + JSON.stringify(rr));
    assert.strictEqual(rr.checked, 1);
    assert.strictEqual(rr.matched, 0);
    assert.deepStrictEqual(bad.writes, [], "no PATCH or POST of any kind after an incomplete read: " + JSON.stringify(bad.writes));

    // (b) tail rows are used: the article matches an event past row 1,000, so a cap-1,000 read would have missed it. The write goes to the fake only.
    const tail = { id: "art-2", title: "Don't miss the Unique Zebra Gala this weekend", excerpt: "", url: "https://news.example/a2", published_at: "2099-01-01T00:00:00Z" };
    const hit = await run(500, 0, { unmatched: [tail], onlyRetry: true });
    const hr = hit.res._body.retroactiveRematch;
    assert.strictEqual(hr.matched, 1, "the retry pass matches an event past row 1,000: " + JSON.stringify(hr));
    const patch = hit.writes.find((w) => w.method === "PATCH" && /editorial_articles\?id=eq\.art-2/.test(w.url));
    assert.ok(patch && /evt-01650/.test(patch.body || ""), "the match write names the tail event: " + JSON.stringify(hit.writes));
  }
  console.log("PASS: the retry pass pages >1,000 candidates and fails closed (no write) on a later-page failure");
})().catch((e) => { console.error(e); process.exit(1); });
