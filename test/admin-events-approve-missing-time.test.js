// test/admin-events-approve-missing-time.test.js — api/admin-events.js's
// "approve" action (2026-10-12, RA Start-Time Defect fix). Before this
// fix, approve was a bare status flip with no check at all: a Resident
// Advisor row that scripts/ra-candidate-promotion.js deliberately
// published with no time_display (listing-only, no detail page) went
// fully live, forever time-less, the moment a moderator approved it.
// This proves the new guard: approve is refused for an RA row with a
// null time_display unless acknowledgeMissingTime is explicitly sent,
// the row is left untouched (still pending_review) on refusal, and every
// OTHER action/source/case is unaffected.
//
// Run: node test/admin-events-approve-missing-time.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/admin-events.js`)];
  return require(`${REPO_DIR}/api/admin-events.js`);
}

function makeRes() {
  return { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
}

function raRow(overrides) {
  return {
    id: "evt-ra-1",
    external_id: "ra-2542617",
    title: "Dilemmas B Day Bash",
    status: "pending_review",
    source: "Resident Advisor",
    start_date: "2026-10-23",
    time_display: null,
    ...overrides,
  };
}

async function callApprove(tables, bodyExtra) {
  const db = makeMockPostgrest(tables);
  global.fetch = async (url, init) => db.fetch(String(url), init);
  const res = makeRes();
  await freshHandler()(
    { method: "POST", body: { id: "evt-ra-1", action: "approve", ...bodyExtra }, headers: { "x-admin-secret": process.env.ADMIN_SECRET } },
    res
  );
  return { res, tables };
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.ADMIN_SECRET = "fixture-admin-secret";

  // ============================================================
  // 1. The actual real-world bug this fix exists to stop: approving a
  //    Resident Advisor row with no time_display is refused, the row
  //    stays pending_review, untouched.
  // ============================================================
  {
    const { res, tables } = await callApprove({ events: [raRow()] });
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._body.error, "MISSING_START_TIME");
    assert.strictEqual(res._body.id, "evt-ra-1");
    const stored = tables.events.find((e) => e.id === "evt-ra-1");
    assert.strictEqual(stored.status, "pending_review", "the row is left exactly as it was -- never silently published incomplete");
    assert.strictEqual(stored.time_display, null);
  }
  console.log("PASS: approving an RA event with no start time is refused (409 MISSING_START_TIME); the row stays pending_review");

  // ============================================================
  // 2. An explicit human override (acknowledgeMissingTime:true) still
  //    lets the moderator approve it -- this only blocks the SILENT
  //    case, never a conscious decision.
  // ============================================================
  {
    const { res, tables } = await callApprove({ events: [raRow()] }, { acknowledgeMissingTime: true });
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    assert.strictEqual(res._body.ok, true);
    const stored = tables.events.find((e) => e.id === "evt-ra-1");
    assert.strictEqual(stored.status, "approved");
  }
  console.log("PASS: acknowledgeMissingTime:true still allows approval -- a conscious override, not a silent publish");

  // ============================================================
  // 3. Once the row genuinely has a time (e.g. after the backfill
  //    script ran), ordinary approve works exactly as before -- no
  //    override needed.
  // ============================================================
  {
    const { res, tables } = await callApprove({ events: [raRow({ time_display: "9:00 PM" })] });
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const stored = tables.events.find((e) => e.id === "evt-ra-1");
    assert.strictEqual(stored.status, "approved");
  }
  console.log("PASS: an RA event that already has a start time approves normally, no override needed");

  // ============================================================
  // 4. Scoped to Resident Advisor only ("do not modify unrelated
  //    ingestion sources") -- a different source's event with no
  //    time_display approves exactly as it always has.
  // ============================================================
  {
    const { res, tables } = await callApprove({ events: [raRow({ source: "Submitted", time_display: null })] });
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const stored = tables.events.find((e) => e.id === "evt-ra-1");
    assert.strictEqual(stored.status, "approved", "the guard is RA-only -- an unrelated source's missing time is not this fix's problem to solve");
  }
  console.log("PASS: a non-RA event with no start time is unaffected -- the guard is scoped to Resident Advisor only");

  // ============================================================
  // 5. "restore" (un-hide / un-reject an event that was already live
  //    before) is NOT gated -- it only ever reverses a hide/reject of a
  //    row that passed this exact check the first time it was approved.
  // ============================================================
  {
    const tables = { events: [raRow({ status: "rejected", time_display: null })] };
    const db = makeMockPostgrest(tables);
    global.fetch = async (url, init) => db.fetch(String(url), init);
    const res = makeRes();
    await freshHandler()(
      { method: "POST", body: { id: "evt-ra-1", action: "restore" }, headers: { "x-admin-secret": process.env.ADMIN_SECRET } },
      res
    );
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const stored = tables.events.find((e) => e.id === "evt-ra-1");
    assert.strictEqual(stored.status, "approved");
  }
  console.log("PASS: restore is never gated -- it only reverses a hide/reject, not a fresh publish");

  // ============================================================
  // 6. "reject" is unaffected (never went through the approve branch at
  //    all).
  // ============================================================
  {
    const tables = { events: [raRow()] };
    const db = makeMockPostgrest(tables);
    global.fetch = async (url, init) => db.fetch(String(url), init);
    const res = makeRes();
    await freshHandler()(
      { method: "POST", body: { id: "evt-ra-1", action: "reject" }, headers: { "x-admin-secret": process.env.ADMIN_SECRET } },
      res
    );
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const stored = tables.events.find((e) => e.id === "evt-ra-1");
    assert.strictEqual(stored.status, "rejected");
  }
  console.log("PASS: reject is unaffected by the new guard");

  console.log("\nadmin-events-approve-missing-time.test.js: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
