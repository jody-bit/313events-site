// test/cron-poppspacking-bug004.test.js — BUG-004 root-cause regression.
//
// Root cause (confirmed via supabase/schema.sql, 2026-09-22): events.start_date
// is `date not null` with no default. cron-poppspacking.js's WP 0.8 fix
// (686bf5a) started `delete`-ing start_date/time_display from every row in
// the "existing" upsert group, intending to leave the stored value alone.
// That doesn't work -- when every object in a merge-duplicates upsert batch
// omits a NOT NULL column with no default, PostgREST's generated
// INSERT ... ON CONFLICT DO UPDATE never mentions that column at all, and
// Postgres rejects the whole batch with a not-null violation. Since
// virtually all of Popps' 20 most-recent posts are already "existing" after
// the connector's first successful run, this 502'd the existing-rows upsert
// on every single run, explaining the 7+ day production freshness incident
// (no row updated) that the 2026-09-22 smoke test caught.
//
// The fix (this same commit): existing rows now send their OWN CURRENT
// start_date/time_display value back (from the status-lookup already
// performed), instead of omitting the key. This test proves:
//   1. the "existing" group's upsert body genuinely CONTAINS a start_date
//      key (the exact thing the old `delete` removed -- this alone would
//      have failed against the old code) ...
//   2. ... set to the EXISTING stored value, never this run's freshly
//      guessed value, so a reviewer's correction still survives (moderator
//      protection is unchanged by this fix).
//   3. a brand-new post (no existing row) is unaffected -- still gets this
//      run's best-guess start_date/time_display, full shape.
//   4. status preservation is unaffected -- an existing row's stored status
//      still wins over DEFAULT_STATUS.
//   5. WP 0.17's fail-closed status-lookup abort is still intact -- a failed
//      lookup still aborts the whole run (zero writes, HTTP 502), not
//      weakened by this fix.
//
// Plain Node assert, no dependencies.
// Run: node test/cron-poppspacking-bug004.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const POSTS_URL = "https://www.poppspacking.org/wp-json/wp/v2/posts?categories=16&per_page=20&orderby=date&order=desc&_embed=1";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-poppspacking.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/status-lookup.js`)];
  return require(`${REPO_DIR}/api/cron-poppspacking.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// A post whose title/excerpt carry a machine-parseable date (this run's
// best-guess would be 2026-11-14).
function newPost({ id = 501, title = "Puppet Workshop Nov. 14, 6-8PM" } = {}) {
  return {
    id,
    date: "2026-09-20T10:00:00",
    title: { rendered: title },
    excerpt: { rendered: "<p>Join us for a puppet-making workshop.</p>" },
    link: `https://www.poppspacking.org/${id}/`,
  };
}

function makeMockFetch(routes) {
  const calls = [];
  const upsertBodies = [];
  const fetchFn = async (url, opts = {}) => {
    const parsedBody = opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null;
    calls.push({ url, opts, body: parsedBody });
    if (url === POSTS_URL) return routes.source();
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) {
      return routes.statusLookup ? routes.statusLookup() : { ok: true, status: 200, json: async () => [] };
    }
    if (url.includes("/rest/v1/events") && opts.method === "POST") {
      upsertBodies.push(parsedBody);
      return routes.upsert ? routes.upsert(parsedBody) : { ok: true, status: 201, text: async () => "" };
    }
    throw new Error("unmocked URL in test: " + url);
  };
  return { fetchFn, calls, upsertBodies };
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 1. THE BUG-004 REPRODUCTION + FIX PROOF: one brand-new post, one
  //     already-existing post (simulating the connector's normal daily
  //     state -- 20 most-recent posts, almost all already seen before).
  //     Under the pre-fix code, the existing-post upsert body would be
  //     missing `start_date` entirely, which is exactly what a real
  //     Postgres NOT NULL violation on that column would reject. ---
  {
    const handler = freshHandler();
    const existingPost = { id: 77, date: "2026-01-05T10:00:00", title: { rendered: "Winter Open Studio Jan 10, 1-4PM" }, excerpt: { rendered: "<p>Open studio.</p>" }, link: "https://www.poppspacking.org/77/" };
    const { fetchFn, upsertBodies } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ([newPost({ id: 501 }), existingPost]) }),
      statusLookup: () => ({
        ok: true,
        status: 200,
        json: async () => ([
          { external_id: "poppspacking-77", status: "approved", start_date: "2026-01-10", time_display: "1:00 PM–4:00 PM" },
        ]),
      }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200, "a healthy run with the fix must return 200, not 502");
    assert.strictEqual(res._body.upserted, 2, "both the new and existing row should be written");
    assert.strictEqual(res._body.newRows, 1);
    assert.strictEqual(res._body.existingRowsPreserved, 1);

    // Find the upsert body that carried the existing post (external_id
    // poppspacking-77) and prove it actually contains start_date/
    // time_display, set to the EXISTING stored value -- not omitted (the
    // bug) and not this run's own fresh guess (which would be 2026-11-14-
    // shaped from "Jan 10" -- i.e. must be exactly "2026-01-10").
    const existingGroupBody = upsertBodies.find((b) => Array.isArray(b) && b.some((r) => r.external_id === "poppspacking-77"));
    assert.ok(existingGroupBody, "an upsert call carrying poppspacking-77 must have been made");
    const existingRow = existingGroupBody.find((r) => r.external_id === "poppspacking-77");
    assert.ok(Object.prototype.hasOwnProperty.call(existingRow, "start_date"), "start_date must be present in the payload -- omitting it violates events.start_date's NOT NULL constraint (schema.sql) for the WHOLE batch, which is BUG-004's root cause");
    assert.strictEqual(existingRow.start_date, "2026-01-10", "start_date must be the EXISTING stored value, not this run's own guess");
    assert.strictEqual(existingRow.time_display, "1:00 PM–4:00 PM", "time_display must be the EXISTING stored value, not this run's own guess");
    assert.strictEqual(existingRow.status, "approved", "an existing row's stored status must still win over DEFAULT_STATUS (moderator protection unchanged)");

    // The brand-new post must still get its own best-effort guess, full shape.
    const newGroupBody = upsertBodies.find((b) => Array.isArray(b) && b.some((r) => r.external_id === "poppspacking-501"));
    assert.ok(newGroupBody, "an upsert call carrying poppspacking-501 must have been made");
    const newRow = newGroupBody.find((r) => r.external_id === "poppspacking-501");
    assert.strictEqual(newRow.status, "pending_review", "a brand-new row must default to pending_review, same as every other row from this source");
    assert.ok(Object.prototype.hasOwnProperty.call(newRow, "start_date"), "a brand-new row must carry its own guessed start_date");
    assert.strictEqual(newRow.start_date, "2026-11-14", "a brand-new row's start_date is this run's own best-effort guess");
  }
  console.log("PASS: existing rows send back their own current start_date/time_display (not omitted, not re-guessed) -- BUG-004 root cause fixed; new rows unaffected");

  // --- 2. WP 0.17 fail-closed protection must remain intact: a failed
  //     status lookup still aborts the WHOLE run (zero writes, HTTP 502),
  //     not weakened by this fix. ---
  {
    const handler = freshHandler();
    const { fetchFn, upsertBodies } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ([newPost({ id: 501 })]) }),
      statusLookup: () => ({ ok: false, status: 500, text: async () => "internal error" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 502, "a failed status lookup must abort the run with 502, protecting existing moderation state");
    assert.strictEqual(res._body.upserted, 0);
    assert.strictEqual(upsertBodies.length, 0, "zero event writes must be attempted when the status lookup fails");
  }
  console.log("PASS: WP 0.17's fail-closed status-lookup abort is unchanged -- a failed lookup still zero-writes and 502s");

  console.log("\nAll cron-poppspacking.js BUG-004 tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
