// test/submit-feed-validation.test.js — api/submit-feed.js had NO automated
// test coverage before 2026-10-03 (Jody: "we gotta fix all of that make
// sure it works... we must add automated testing to all of the submit
// functionality"). This covers its server-side validation, the
// gaming-category gap found and fixed the same day, the new 'manual'
// feed_format (migration_044), and the existing spam-protection checks.
//
// Run: node test/submit-feed-validation.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/submit-feed.js`)];
  return require(`${REPO_DIR}/api/submit-feed.js`);
}

function makeReq(body) {
  return { method: "POST", body, headers: {} };
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

const VALID_BASE = {
  venueName: "Marble Bar",
  contactEmail: "owner@marblebar.example",
  feedUrl: "https://marblebar.example/events.ics",
  feedFormat: "ics",
  defaultCategory: "nightlife",
  elapsedMs: 5000,
};

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.RESEND_API_KEY;

  // --- 1. A fully valid ICS submission succeeds and lands pending_review. ---
  {
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "POST" && url.includes("/rest/v1/feed_sources")) {
        return { ok: true, status: 201, json: async () => [{ id: "new-id-1" }] };
      }
      throw new Error("unmocked URL: " + url);
    };
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._body.ok, true);
    assert.strictEqual(res._body.status, "pending_review");
  }
  console.log("PASS: a fully valid ICS feed submission is accepted and lands pending_review");

  // --- 2. 'rss' and 'manual' are both now valid feedFormat values
  //     (migration_044) — previously only 'ics' was accepted by the UI,
  //     but the backend already accepted 'rss'; 'manual' is brand new. ---
  for (const feedFormat of ["rss", "manual"]) {
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "POST" && url.includes("/rest/v1/feed_sources")) {
        return { ok: true, status: 201, json: async () => [{ id: `new-id-${feedFormat}` }] };
      }
      throw new Error("unmocked URL: " + url);
    };
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, feedFormat }), res);
    assert.strictEqual(res._status, 201, `feedFormat '${feedFormat}' must be accepted`);
  }
  console.log("PASS: feedFormat 'rss' and 'manual' are both accepted (migration_044)");

  // --- 3. An unrecognized feedFormat is still rejected. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, feedFormat: "atom" }), res);
    assert.strictEqual(res._status, 400);
    assert.ok(/feedFormat/.test(res._body.error));
  }
  console.log("PASS: an unrecognized feedFormat (e.g. 'atom') is still rejected");

  // --- 4. 'gaming' is now a valid defaultCategory — found missing from
  //     this file's VALID_CATEGORIES on 2026-10-03 (present in
  //     api/submit.js's whitelist and the real 15-value DB enum, but
  //     never mirrored here). Regression test for that exact gap. ---
  {
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "POST" && url.includes("/rest/v1/feed_sources")) {
        return { ok: true, status: 201, json: async () => [{ id: "new-id-gaming" }] };
      }
      throw new Error("unmocked URL: " + url);
    };
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, defaultCategory: "gaming" }), res);
    assert.strictEqual(res._status, 201, "'gaming' must be accepted as defaultCategory — this is the exact bug fixed 2026-10-03");
  }
  console.log("PASS: 'gaming' is accepted as a valid defaultCategory (regression test for the 2026-10-03 fix)");

  // --- 5. Missing required fields are rejected with a clear error,
  //     never silently accepted or silently dropped. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ feedFormat: "ics", defaultCategory: "music", elapsedMs: 5000 }), res);
    assert.strictEqual(res._status, 400);
    assert.ok(/venueName/.test(res._body.error));
    assert.ok(/contactEmail/.test(res._body.error));
    assert.ok(/feedUrl/.test(res._body.error));
  }
  console.log("PASS: missing required fields (venueName/contactEmail/feedUrl) are all reported in one 400");

  // --- 6. A non-http(s) feedUrl is rejected before ever reaching the
  //     database (defense in depth against e.g. javascript: URLs). ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, feedUrl: "javascript:alert(1)" }), res);
    assert.strictEqual(res._status, 400);
    assert.ok(/feedUrl/.test(res._body.error));
  }
  console.log("PASS: a non-http(s) feedUrl is rejected");

  // --- 7. Honeypot (companyWebsite filled in) silently fakes success —
  //     never reaches the database, never tells the bot what tripped it. ---
  {
    let dbCalled = false;
    global.fetch = async () => { dbCalled = true; throw new Error("must not be called"); };
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, companyWebsite: "http://spam.example" }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.ok, true);
    assert.strictEqual(res._body.id, null);
    assert.strictEqual(dbCalled, false, "a honeypot-tripped submission must never reach the database");
  }
  console.log("PASS: a filled-in honeypot field fakes success and never touches the database");

  // --- 8. Submitted too fast (elapsedMs < 1200) gets a real, retryable
  //     error — distinct from the honeypot's silent fake-success. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, elapsedMs: 200 }), res);
    assert.strictEqual(res._status, 400);
    assert.ok(/too fast/i.test(res._body.error));
  }
  console.log("PASS: a too-fast submission (elapsedMs < 1200) gets a genuine retryable 400, not a silent fake-success");

  // --- 9. A duplicate feed_url (unique index violation) surfaces a plain
  //     409, not a raw Postgres constraint-violation string. ---
  {
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "POST" && url.includes("/rest/v1/feed_sources")) {
        return { ok: false, status: 409, text: async () => "duplicate key value violates unique constraint \"feed_sources_url_key\"" };
      }
      throw new Error("unmocked URL: " + url);
    };
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE }), res);
    assert.strictEqual(res._status, 409);
    assert.ok(/already been submitted/i.test(res._body.error));
  }
  console.log("PASS: a duplicate feed_url surfaces a plain, honest 409 instead of a raw Postgres error");

  // --- 10. Only POST is allowed. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler({ method: "GET", headers: {} }, res);
    assert.strictEqual(res._status, 405);
  }
  console.log("PASS: non-POST requests are rejected with 405");

  console.log("\nAll api/submit-feed.js validation tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
