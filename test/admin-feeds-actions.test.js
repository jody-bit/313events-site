// test/admin-feeds-actions.test.js — api/admin-feeds.js had NO automated
// test coverage before 2026-10-03. Covers auth gating, the
// approve/reject/pause/resume action map, and that a 'manual'
// (migration_044, no-feed-at-all) feed_source flows through this same
// endpoint exactly like an ics/rss one — approving it is a human decision
// ("yes, follow up on this") that api/cron-feeds.js's own manual-skip
// branch (see test/cron-feeds-manual-skip.test.js) then still never polls
// automatically.
//
// Run: node test/admin-feeds-actions.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const ADMIN_SECRET = "test-admin-secret";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/admin-feeds.js`)];
  return require(`${REPO_DIR}/api/admin-feeds.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  // --- 1. GET without the admin secret is rejected. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler({ method: "GET", headers: {} }, res);
    assert.strictEqual(res._status, 401);
  }
  console.log("PASS: GET without x-admin-secret is rejected with 401");

  // --- 2. GET with the right secret returns every feed_source, including
  //     a 'manual' one — admin.html groups by status, not format, so a
  //     manual row must round-trip through this endpoint exactly like any
  //     other format. ---
  {
    const rows = [
      { id: "f1", feed_format: "ics", status: "approved", venue_name: "Trinosophes" },
      { id: "f2", feed_format: "manual", status: "pending_review", venue_name: "Detroit History Tours" },
    ];
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => rows };
      throw new Error("unmocked URL: " + url);
    };
    const handler = freshHandler();
    const res = makeRes();
    await handler({ method: "GET", headers: { "x-admin-secret": ADMIN_SECRET } }, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.feeds.length, 2);
    assert.ok(res._body.feeds.some((f) => f.feed_format === "manual"), "a 'manual' feed_source must round-trip through GET exactly like any other format");
  }
  console.log("PASS: GET returns every feed_source regardless of feed_format, including 'manual'");

  // --- 3. POST approve/reject/pause/resume map to the right statuses. ---
  const ACTION_EXPECTATIONS = [
    ["approve", "approved"],
    ["reject", "rejected"],
    ["pause", "paused"],
    ["resume", "approved"],
  ];
  for (const [action, expectedStatus] of ACTION_EXPECTATIONS) {
    let patchedStatus;
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "PATCH" && url.includes("/rest/v1/feed_sources?id=eq.")) {
        patchedStatus = JSON.parse(opts.body).status;
        return { ok: true, status: 200, json: async () => [{ id: "f1", status: patchedStatus }] };
      }
      throw new Error("unmocked URL: " + url);
    };
    const handler = freshHandler();
    const res = makeRes();
    await handler({ method: "POST", headers: { "x-admin-secret": ADMIN_SECRET }, body: { id: "f1", action } }, res);
    assert.strictEqual(res._status, 200, `action '${action}' must succeed`);
    assert.strictEqual(patchedStatus, expectedStatus, `action '${action}' must set status to '${expectedStatus}'`);
  }
  console.log("PASS: approve/reject/pause/resume each map to the correct status (approved/rejected/paused/approved)");

  // --- 4. Approving a 'manual' (no-feed) feed_source works exactly the
  //     same way as any other format — this is the "queue it for human
  //     follow-up" review action, not a trigger for automated polling
  //     (that distinction lives entirely in api/cron-feeds.js, not here). ---
  {
    let patchedStatus;
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "PATCH" && url.includes("/rest/v1/feed_sources?id=eq.")) {
        patchedStatus = JSON.parse(opts.body).status;
        return { ok: true, status: 200, json: async () => [{ id: "f2", status: patchedStatus, feed_format: "manual" }] };
      }
      throw new Error("unmocked URL: " + url);
    };
    const handler = freshHandler();
    const res = makeRes();
    await handler({ method: "POST", headers: { "x-admin-secret": ADMIN_SECRET }, body: { id: "f2", action: "approve" } }, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(patchedStatus, "approved");
  }
  console.log("PASS: approving a 'manual' feed_source works identically to approving an ics/rss one");

  // --- 5. An invalid action is rejected with 400, never silently no-op'd. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler({ method: "POST", headers: { "x-admin-secret": ADMIN_SECRET }, body: { id: "f1", action: "delete" } }, res);
    assert.strictEqual(res._status, 400);
  }
  console.log("PASS: an unrecognized action is rejected with 400");

  // --- 6. Unsupported HTTP methods are rejected. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler({ method: "DELETE", headers: { "x-admin-secret": ADMIN_SECRET } }, res);
    assert.strictEqual(res._status, 405);
  }
  console.log("PASS: unsupported HTTP methods are rejected with 405");

  console.log("\nAll api/admin-feeds.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
