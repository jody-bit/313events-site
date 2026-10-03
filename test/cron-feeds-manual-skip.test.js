// test/cron-feeds-manual-skip.test.js — a feed_source with
// feed_format='manual' (migration_044, 2026-10-03: the no-feed-at-all
// intake for the MBMC / Detroit History Tours pattern) must NEVER be
// fetched, scraped, or upserted from automatically. It exists purely to
// surface in admin.html's queue for a human to follow up on by hand.
//
// Run: node test/cron-feeds-manual-skip.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ics-location.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/status-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/press-coverage-linking.js`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

const MANUAL_FEED = {
  id: "fs-manual-1",
  venue_name: "Detroit History Tours",
  default_category: "museum",
  // Not a feed at all — just a link to where their events are listed, per
  // migration_044's header. If this URL were ever fetched, that would
  // itself be the bug this test exists to catch.
  feed_url: "https://detroithistorytours.com/new-page",
  feed_format: "manual",
  status: "approved",
};

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  let fetchCalledWithManualUrl = false;
  global.fetch = async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => [MANUAL_FEED] };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
    if (url === MANUAL_FEED.feed_url) {
      // This project's whole point for 'manual' rows is that this URL is
      // NEVER fetched automatically — flag it loudly rather than quietly
      // returning something that would mask the bug.
      fetchCalledWithManualUrl = true;
      return { ok: true, status: 200, text: async () => "<html></html>" };
    }
    if (url.includes("/rest/v1/events") && opts.method === "PATCH") {
      run._capturedPatchBody = JSON.parse(opts.body);
      return { ok: true, status: 200, text: async () => "" };
    }
    if (url.includes("/rest/v1/feed_sources?id=eq.")) {
      run._capturedPatchBody = JSON.parse(opts.body);
      return { ok: true, status: 200, text: async () => "" };
    }
    throw new Error("unmocked URL: " + url);
  };

  const handler = freshHandler();
  const res = makeRes();
  await handler({ headers: {} }, res);

  assert.strictEqual(res._status, 200, "handler must still return 200 for a run that only has manual-format sources");
  assert.strictEqual(fetchCalledWithManualUrl, false, "a 'manual' feed_source's feed_url must never be fetched");
  assert.strictEqual(res._body.upserted, 0, "a 'manual' source must never produce any upserted events");
  assert.strictEqual(res._body.results[0].id, MANUAL_FEED.id);
  assert.ok(/not polled automatically/i.test(res._body.results[0].result), "the reported result must honestly say this wasn't polled, not silently report success");
  assert.ok(/manual follow-up|awaiting manual/i.test(res._body.results[0].result), "the reported result must point toward the manual follow-up it actually needs");

  console.log("PASS: a feed_source with feed_format='manual' is never fetched, scraped, or upserted — reported honestly as awaiting manual follow-up");
  console.log("\nAll cron-feeds.js manual (no-feed) skip tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
