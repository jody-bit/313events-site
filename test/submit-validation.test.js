// test/submit-validation.test.js — api/submit.js (the single-event
// "Submit your event" form) had NO automated test coverage before
// 2026-10-03 (Jody: "we must add automated testing to all of the submit
// functionality"). Covers its server-side validation, price parsing,
// endDate-before-startDate guard (migration_017's regression), spam
// protection, and venue_id resolution.
//
// Run: node test/submit-validation.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/submit.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/submit.js`);
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

function withVenueLookupMock(extraFetch) {
  return async (url, opts = {}) => {
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    return extraFetch(url, opts);
  };
}

const VALID_BASE = {
  title: "Fleatroit Junk City",
  category: "vendor",
  startDate: "2026-11-01",
  venue: "Eastern Market",
  orgName: "Fleatroit",
  contactEmail: "organizer@fleatroit.example",
  elapsedMs: 5000,
};

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.RESEND_API_KEY;

  // --- 1. A fully valid submission succeeds and lands pending_review. ---
  {
    global.fetch = withVenueLookupMock(async (url, opts) => {
      if (opts.method === "POST" && url.includes("/rest/v1/events")) {
        return { ok: true, status: 201, json: async () => [{ id: "evt-1" }] };
      }
      throw new Error("unmocked URL: " + url);
    });
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._body.status, "pending_review");
  }
  console.log("PASS: a fully valid single-event submission is accepted and lands pending_review");

  // --- 2. Every real category, including 'gaming' (migration_036/037),
  //     is accepted — this file's whitelist already had it; this pins
  //     that down as a regression test rather than leaving it unverified. ---
  for (const category of ["music", "theatre", "dance", "visual", "museum", "family", "fest", "food", "film", "nightlife", "sports", "community", "vendor", "training", "gaming"]) {
    global.fetch = withVenueLookupMock(async (url, opts) => {
      if (opts.method === "POST" && url.includes("/rest/v1/events")) {
        return { ok: true, status: 201, json: async () => [{ id: `evt-${category}` }] };
      }
      throw new Error("unmocked URL: " + url);
    });
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, category }), res);
    assert.strictEqual(res._status, 201, `category '${category}' must be accepted`);
  }
  console.log("PASS: all 15 real event_category values (including 'gaming') are accepted");

  // --- 3. endDate before startDate is rejected (migration_017's
  //     regression — the real "Fleatroit Junk City" bug this project
  //     already hit in production). ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, endDate: "2026-10-31" }), res); // before startDate 2026-11-01
    assert.strictEqual(res._status, 400);
    assert.ok(/endDate can't be before startDate/.test(res._body.error));
  }
  console.log("PASS: endDate before startDate is rejected (regression test for the Fleatroit Junk City bug)");

  // --- 4. Free-text price parsing pulls the first numeric amount out of a
  //     range/currency string rather than silently discarding it
  //     (2026-09-02 audit fix). ---
  {
    let capturedRow;
    global.fetch = withVenueLookupMock(async (url, opts) => {
      if (opts.method === "POST" && url.includes("/rest/v1/events")) {
        capturedRow = JSON.parse(opts.body);
        return { ok: true, status: 201, json: async () => [{ id: "evt-price" }] };
      }
      throw new Error("unmocked URL: " + url);
    });
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, admission: "paid", price: "$15–25" }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(capturedRow.price_from, 15, "a '$15–25' range must parse to price_from: 15, not null");
    assert.strictEqual(capturedRow.is_free, false);
  }
  console.log("PASS: a free-text price range like '$15–25' parses to price_from: 15, not silently null");

  // --- 5. Genuinely unparseable price text (e.g. 'TBD') falls through to
  //     null rather than guessing. ---
  {
    let capturedRow;
    global.fetch = withVenueLookupMock(async (url, opts) => {
      if (opts.method === "POST" && url.includes("/rest/v1/events")) {
        capturedRow = JSON.parse(opts.body);
        return { ok: true, status: 201, json: async () => [{ id: "evt-tbd" }] };
      }
      throw new Error("unmocked URL: " + url);
    });
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, admission: "paid", price: "TBD" }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(capturedRow.price_from, null, "unparseable price text must stay null, never a guessed number");
  }
  console.log("PASS: unparseable price text ('TBD') stays null rather than being guessed at");

  // --- 6. Missing required fields are all reported together. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ category: "music", elapsedMs: 5000 }), res);
    assert.strictEqual(res._status, 400);
    assert.ok(/title/.test(res._body.error));
    assert.ok(/startDate/.test(res._body.error));
    assert.ok(/venue/.test(res._body.error));
    assert.ok(/orgName/.test(res._body.error));
    assert.ok(/contactEmail/.test(res._body.error));
  }
  console.log("PASS: missing required fields are all reported together in one 400");

  // --- 7. Honeypot silently fakes success, never reaches the database. ---
  {
    let dbCalled = false;
    global.fetch = async () => { dbCalled = true; throw new Error("must not be called"); };
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, companyWebsite: "http://spam.example" }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.id, null);
    assert.strictEqual(dbCalled, false);
  }
  console.log("PASS: a filled-in honeypot field fakes success and never touches the database");

  // --- 8. Submitted too fast gets a genuine retryable error. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, elapsedMs: 100 }), res);
    assert.strictEqual(res._status, 400);
    assert.ok(/too fast/i.test(res._body.error));
  }
  console.log("PASS: a too-fast submission gets a genuine retryable 400");

  // --- 9. A non-http(s) ticketUrl/eventUrl/imageUrl is rejected. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler(makeReq({ ...VALID_BASE, ticketUrl: "javascript:alert(1)" }), res);
    assert.strictEqual(res._status, 400);
    assert.ok(/ticketUrl/.test(res._body.error));
  }
  console.log("PASS: a non-http(s) ticketUrl is rejected");

  // --- 10. Only POST is allowed. ---
  {
    const handler = freshHandler();
    const res = makeRes();
    await handler({ method: "GET", headers: {} }, res);
    assert.strictEqual(res._status, 405);
  }
  console.log("PASS: non-POST requests are rejected with 405");

  console.log("\nAll api/submit.js validation tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
