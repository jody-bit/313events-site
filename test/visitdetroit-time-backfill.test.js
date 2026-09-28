// test/visitdetroit-time-backfill.test.js — scripts/visitdetroit-time-
// backfill.js's repairVisitDetroitTimes() (2026-09-28, Needs Follow-up
// self-healing pass 2, one-time historical repair). Uses the REAL raw
// Algolia epoch values for the Christmas Cookie Coach Tour (same values
// as test/cron-visitdetroit-time-parsing.test.js) so this exercises the
// actual bug this script exists to fix, not a synthetic stand-in.
// Injected fetchCandidates/fetchAlgoliaData/applyPatchFn, same DI
// convention as every other repair script in this project.
//
// Run: node test/visitdetroit-time-backfill.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function fresh() {
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/visitdetroit-time-backfill.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-visitdetroit.js`)];
  return require(`${REPO_DIR}/scripts/visitdetroit-time-backfill.js`);
}

// Real raw epochs, fetched live 2026-09-28 (same as
// test/cron-visitdetroit-time-parsing.test.js) — Christmas Cookie Coach
// Tour's authoritative time is 1:30 PM – 5:30 PM on 2026-12-05.
const COOKIE_COACH_START = 1796477400;
const COOKIE_COACH_END = 1796491800;

async function run() {
  const { repairVisitDetroitTimes, titlesLooselyMatch } = fresh();
  const SUPABASE_URL = "https://example.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = "test-key";

  // ============================================================
  // 1. A row stuck with the old, wrong 5-hour-shifted values gets
  //    corrected to the authoritative start_date/end_date/time_display —
  //    this is the actual real-world bug this script exists to fix.
  // ============================================================
  {
    const patches = [];
    const candidates = [
      {
        id: "evt-1",
        external_id: "vd-cookie-coach",
        title: "Christmas Cookie Coach Tour",
        start_date: "2026-12-05", // date happened to land right; only the TIME was wrong
        end_date: null,
        time_display: "8:30 AM – 12:30 PM", // the old, wrong, 5-hour-shifted value
      },
    ];
    const algoliaMap = new Map([
      [
        "vd-cookie-coach",
        {
          title: "Christmas Cookie Coach Tour",
          dt: {
            startDate: "2026-12-05",
            endDate: null,
            timeDisplay: "1:30 PM – 5:30 PM", // authoritative, from real epochs
          },
        },
      ],
    ]);
    const applyPatchFn = async (SUPABASE_URL, sbHeaders, event, patchBody) => {
      patches.push({ event, patchBody });
      return true;
    };
    const counts = await repairVisitDetroitTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchAlgoliaData: async () => algoliaMap,
      applyPatchFn,
    });
    assert.strictEqual(counts.repaired, 1);
    assert.strictEqual(counts.written, 1);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].event.id, "evt-1");
    assert.strictEqual(patches[0].event.time_display, "8:30 AM – 12:30 PM", "applyPatchFn receives the ORIGINAL row, for a race-safe re-assert filter");
    assert.strictEqual(patches[0].patchBody.time_display, "1:30 PM – 5:30 PM");
    assert.strictEqual(patches[0].patchBody.start_date, "2026-12-05");
    assert.strictEqual(patches[0].patchBody.end_date, null);
  }
  console.log("PASS: a row stuck with the old 5-hour-shifted time is corrected to the authoritative 1:30 PM – 5:30 PM");

  // ============================================================
  // 2. A row that's already correct -> alreadyCorrect, no write
  // ============================================================
  {
    let applyPatchCalled = false;
    const candidates = [
      { id: "evt-2", external_id: "vd-2", title: "Some Healthy Event", start_date: "2026-11-01", end_date: null, time_display: "7:00 PM" },
    ];
    const algoliaMap = new Map([
      ["vd-2", { title: "Some Healthy Event", dt: { startDate: "2026-11-01", endDate: null, timeDisplay: "7:00 PM" } }],
    ]);
    const counts = await repairVisitDetroitTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchAlgoliaData: async () => algoliaMap,
      applyPatchFn: async () => { applyPatchCalled = true; return true; },
    });
    assert.strictEqual(counts.alreadyCorrect, 1);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(applyPatchCalled, false, "an already-correct row must never be written");
  }
  console.log("PASS: an already-correct row is left alone, no redundant write");

  // ============================================================
  // 3. A DB row whose external_id no longer appears in fresh Algolia data
  //    -> unmatchedNoLongerInSource, left completely alone (never
  //    guessed, never deleted)
  // ============================================================
  {
    let applyPatchCalled = false;
    const candidates = [
      { id: "evt-3", external_id: "vd-gone", title: "Expired Listing", start_date: "2026-10-01", end_date: null, time_display: "6:00 PM" },
    ];
    const counts = await repairVisitDetroitTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchAlgoliaData: async () => new Map(), // empty -- nothing currently in the source
      applyPatchFn: async () => { applyPatchCalled = true; return true; },
    });
    assert.strictEqual(counts.unmatchedNoLongerInSource, 1);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(applyPatchCalled, false);
  }
  console.log("PASS: a row no longer present in VisitDetroit's own index is left alone, never guessed or deleted");

  // ============================================================
  // 4. Identity-verification guard: external_id matches but the titles
  //    are unrelated -> titleMismatchSkipped, no write (refuses to trust
  //    a bare ID match alone)
  // ============================================================
  {
    let applyPatchCalled = false;
    const candidates = [
      { id: "evt-4", external_id: "vd-4", title: "Totally Different Event Name", start_date: "2026-10-10", end_date: null, time_display: "5:00 PM" },
    ];
    const algoliaMap = new Map([
      ["vd-4", { title: "Christmas Cookie Coach Tour", dt: { startDate: "2026-12-05", endDate: null, timeDisplay: "1:30 PM – 5:30 PM" } }],
    ]);
    const warnings = [];
    const counts = await repairVisitDetroitTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchAlgoliaData: async () => algoliaMap,
      applyPatchFn: async () => { applyPatchCalled = true; return true; },
      logger: { log() {}, error() {}, warn: (msg) => warnings.push(msg) },
    });
    assert.strictEqual(counts.titleMismatchSkipped, 1);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(applyPatchCalled, false);
    assert.ok(warnings.some((w) => w.includes("does not match source title")));
  }
  console.log("PASS: an external_id match with an unrelated title is refused, never trusted blindly");

  // ============================================================
  // 5. Concurrent-change safety: applyPatchFn returning false (row
  //    changed since the fetch) is reported, not silently treated as
  //    success
  // ============================================================
  {
    const candidates = [
      { id: "evt-5", external_id: "vd-5", title: "Race Condition Event", start_date: "2026-11-15", end_date: null, time_display: "8:00 PM" },
    ];
    const algoliaMap = new Map([
      ["vd-5", { title: "Race Condition Event", dt: { startDate: "2026-11-15", endDate: null, timeDisplay: "9:00 PM" } }],
    ]);
    const counts = await repairVisitDetroitTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchAlgoliaData: async () => algoliaMap,
      applyPatchFn: async () => false, // simulates a moderator hand-editing the row first
    });
    assert.strictEqual(counts.skippedConcurrentChange, 1);
    assert.strictEqual(counts.written, 0);
  }
  console.log("PASS: a concurrent-change PATCH rejection is reported honestly, not counted as written");

  // ============================================================
  // 6. Missing Supabase config -> no-op, no throw
  // ============================================================
  {
    const counts = await repairVisitDetroitTimes({ SUPABASE_URL: null, SUPABASE_SERVICE_ROLE_KEY: null, logger: { error() {}, log() {}, warn() {} } });
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(counts.totalConsidered, 0);
  }
  console.log("PASS: missing Supabase config no-ops cleanly");

  // ============================================================
  // 7. titlesLooselyMatch itself: sanity checks on the identity-guard helper
  // ============================================================
  {
    assert.strictEqual(titlesLooselyMatch("Christmas Cookie Coach Tour", "christmas cookie coach tour"), true);
    assert.strictEqual(titlesLooselyMatch("Christmas Cookie Coach Tour", "Christmas Cookie Coach Tour (Detroit)"), true, "substring match in either direction is allowed");
    assert.strictEqual(titlesLooselyMatch("Christmas Cookie Coach Tour", "HOT ASH Cigar & Pipe Social"), false);
    assert.strictEqual(titlesLooselyMatch("", "Something"), false);
    assert.strictEqual(titlesLooselyMatch(null, "Something"), false);
  }
  console.log("PASS: titlesLooselyMatch accepts near-identical titles, rejects unrelated ones");

  // ============================================================
  // 8. End-to-end wiring against the REAL Algolia-shaped hit for Cookie
  //    Coach Tour, via the actual fetchAlgoliaDerivedByExternalId ->
  //    deriveDateTimeFields path (not just a hand-built map), proving the
  //    real epochs really do resolve to the authoritative time through
  //    this script's own default wiring.
  // ============================================================
  {
    const { fetchAlgoliaDerivedByExternalId } = fresh();
    const fakeHits = {
      hits: [
        {
          id: "cookie-coach",
          title: "Christmas Cookie Coach Tour",
          startDate: COOKIE_COACH_START,
          endDate: COOKIE_COACH_END,
          isAllDay: false,
        },
      ],
    };
    const fetchFn = async () => ({ ok: true, json: async () => fakeHits });
    const map = await fetchAlgoliaDerivedByExternalId(fetchFn);
    const entry = map.get("vd-cookie-coach");
    assert.ok(entry, "external_id vd-<algolia id> is the join key");
    assert.strictEqual(entry.dt.startDate, "2026-12-05");
    assert.strictEqual(entry.dt.timeDisplay, "1:30 PM – 5:30 PM");
  }
  console.log("PASS: fetchAlgoliaDerivedByExternalId resolves the real Cookie Coach Tour epochs to the authoritative time via deriveDateTimeFields");

  console.log("\nvisitdetroit-time-backfill.test.js: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
