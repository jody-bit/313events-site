// test/visitdetroit-dead-link-repair.test.js — scripts/visitdetroit-dead-
// link-repair.js's repairVisitDetroitDeadLinks() (2026-09-28, Needs
// Follow-up self-healing pass 2). Injected fetchFn/healFn/applyPatchFn,
// same DI convention as every other repair script in this project (e.g.
// scripts/dossin-metadata-repair.js).
//
// Run: node test/visitdetroit-dead-link-repair.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function fresh() {
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/visitdetroit-dead-link-repair.js`)];
  return require(`${REPO_DIR}/scripts/visitdetroit-dead-link-repair.js`);
}

async function run() {
  const { repairVisitDetroitDeadLinks } = fresh();
  const SUPABASE_URL = "https://example.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = "test-key";

  // ============================================================
  // 1. A dead link that gets confidently repaired -> ticket_url updated,
  //    link_check_status='ok'
  // ============================================================
  {
    const patches = [];
    const candidates = [
      { id: "evt-1", external_id: "vd-1", title: "Christmas Cookie Coach Tour", ticket_url: "https://visitdetroit.com/christmas-cookie-coach-tour/", link_check_status: null },
    ];
    const healFn = async ({ url }) => {
      assert.strictEqual(url, "https://visitdetroit.com/christmas-cookie-coach-tour/");
      return { checked: true, classification: "dead", repaired: true, newUrl: "https://visitdetroit.com/events/christmas-cookie-coach-tour/" };
    };
    const applyPatchFn = async (SUPABASE_URL, sbHeaders, eventId, originalUrl, patchBody) => {
      patches.push({ eventId, originalUrl, patchBody });
      return true;
    };
    const counts = await repairVisitDetroitDeadLinks({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      healFn, applyPatchFn,
    });
    assert.strictEqual(counts.repaired, 1);
    assert.strictEqual(counts.written, 1);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].originalUrl, "https://visitdetroit.com/christmas-cookie-coach-tour/", "PATCH re-asserts the exact original value it read, for the race-safe filter");
    assert.strictEqual(patches[0].patchBody.ticket_url, "https://visitdetroit.com/events/christmas-cookie-coach-tour/");
    assert.strictEqual(patches[0].patchBody.link_check_status, "ok");
    assert.ok(patches[0].patchBody.link_checked_at);
  }
  console.log("PASS: a confidently-repaired dead link updates ticket_url and sets link_check_status='ok'");

  // ============================================================
  // 2. A dead link that CANNOT be repaired -> link_check_status='dead',
  //    ticket_url left untouched (this is what surfaces the new
  //    "dead event/ticket link" Needs Follow-up reason)
  // ============================================================
  {
    const patches = [];
    const candidates = [
      { id: "evt-2", external_id: "vd-2", title: "Some Unrecoverable Tour", ticket_url: "https://visitdetroit.com/some-unrecoverable-tour/", link_check_status: null },
    ];
    const healFn = async () => ({ checked: true, classification: "dead", repaired: false, newUrl: null });
    const applyPatchFn = async (SUPABASE_URL, sbHeaders, eventId, originalUrl, patchBody) => {
      patches.push({ eventId, patchBody });
      return true;
    };
    const counts = await repairVisitDetroitDeadLinks({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      healFn, applyPatchFn,
    });
    assert.strictEqual(counts.stillDead, 1);
    assert.strictEqual(counts.written, 1);
    assert.strictEqual(patches[0].patchBody.link_check_status, "dead");
    assert.strictEqual(patches[0].patchBody.ticket_url, undefined, "ticket_url itself is never touched when unrepaired");
  }
  console.log("PASS: an unrecoverable dead link sets link_check_status='dead', never touches ticket_url itself");

  // ============================================================
  // 3. Inconclusive check (timeout/403/429/5xx) -> NO write at all
  // ============================================================
  {
    let applyPatchCalled = false;
    const candidates = [
      { id: "evt-3", external_id: "vd-3", title: "Some Event", ticket_url: "https://visitdetroit.com/some-event/", link_check_status: null },
    ];
    const healFn = async () => ({ checked: true, classification: "inconclusive", repaired: false, newUrl: null });
    const applyPatchFn = async () => { applyPatchCalled = true; return true; };
    const counts = await repairVisitDetroitDeadLinks({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      healFn, applyPatchFn,
    });
    assert.strictEqual(counts.inconclusive, 1);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(applyPatchCalled, false, "an inconclusive check must never write anything");
  }
  console.log("PASS: an inconclusive check writes nothing at all, never overwrites a prior status");

  // ============================================================
  // 4. Already ok AND already recorded as ok -> no redundant write
  // ============================================================
  {
    let applyPatchCalled = false;
    const candidates = [
      { id: "evt-4", external_id: "vd-4", title: "Healthy Event", ticket_url: "https://visitdetroit.com/events/healthy-event/", link_check_status: "ok" },
    ];
    const healFn = async () => ({ checked: true, classification: "ok", repaired: false, newUrl: null });
    const applyPatchFn = async () => { applyPatchCalled = true; return true; };
    const counts = await repairVisitDetroitDeadLinks({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      healFn, applyPatchFn,
    });
    assert.strictEqual(counts.ok, 1);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(applyPatchCalled, false, "nothing changed -- no need to re-write the same status");
  }
  console.log("PASS: an already-ok link that was already recorded as ok produces no redundant write");

  // ============================================================
  // 5. Concurrent-change safety: applyPatchFn returning false (filter no
  //    longer matched) is reported, not silently treated as success
  // ============================================================
  {
    const candidates = [
      { id: "evt-5", external_id: "vd-5", title: "Race Condition Tour", ticket_url: "https://visitdetroit.com/race-condition-tour/", link_check_status: null },
    ];
    const healFn = async () => ({ checked: true, classification: "dead", repaired: false, newUrl: null });
    const applyPatchFn = async () => false; // simulates a moderator having changed the row first
    const counts = await repairVisitDetroitDeadLinks({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      healFn, applyPatchFn,
    });
    assert.strictEqual(counts.skippedConcurrentChange, 1);
    assert.strictEqual(counts.written, 0);
  }
  console.log("PASS: a concurrent-change PATCH rejection is reported honestly, not counted as written");

  // ============================================================
  // 6. Missing Supabase config -> no-op, no throw
  // ============================================================
  {
    const counts = await repairVisitDetroitDeadLinks({ SUPABASE_URL: null, SUPABASE_SERVICE_ROLE_KEY: null, logger: { error() {}, log() {}, warn() {} } });
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(counts.totalConsidered, 0);
  }
  console.log("PASS: missing Supabase config no-ops cleanly");

  // ============================================================
  // 7. Outcome-code tally (2026-09-29): every event whose ORIGINAL url
  //    comes back confirmed dead is tallied into counts.byOutcome under
  //    exactly one of Jody's 5 codes, whether or not this run also
  //    issued a write for it.
  // ============================================================
  {
    const candidates = [
      { id: "evt-6", external_id: "vd-6", title: "Repaired Tour", ticket_url: "https://visitdetroit.com/repaired-tour/", link_check_status: null },
      { id: "evt-7", external_id: "vd-7", title: "Unrepaired Tour", ticket_url: "https://visitdetroit.com/unrepaired-tour/", link_check_status: null },
      { id: "evt-8", external_id: "vd-8", title: "Already Known Dead Tour", ticket_url: "https://visitdetroit.com/already-dead-tour/", link_check_status: "dead" },
    ];
    const healFn = async ({ url }) => {
      if (url === "https://visitdetroit.com/repaired-tour/") {
        return { checked: true, classification: "dead", repaired: true, newUrl: "https://visitdetroit.com/events/repaired-tour/" };
      }
      return { checked: true, classification: "dead", repaired: false, newUrl: null };
    };
    const applyPatchFn = async () => true;
    const counts = await repairVisitDetroitDeadLinks({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      healFn, applyPatchFn,
    });
    assert.strictEqual(counts.byOutcome.LINK_DEAD_REPLACED, 1);
    assert.strictEqual(counts.byOutcome.RECOVERY_UNCERTAIN, 2, "tallied for both the fresh unrepaired dead link AND the already-recorded-dead one -- every dead link this run reasoned about, not just the ones it wrote");
    assert.strictEqual(counts.byOutcome.LINK_DEAD_REMOVED, 0);
    assert.strictEqual(counts.byOutcome.EVENT_CONFIRMED_CANCELLED, 0);
    assert.strictEqual(counts.byOutcome.EVENT_SOURCE_GONE, 0);
  }
  console.log("PASS: counts.byOutcome tallies every confirmed-dead link into exactly one of Jody's 5 outcome codes");

  console.log("\nvisitdetroit-dead-link-repair.test.js: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
