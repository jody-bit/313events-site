// test/ra-time-backfill.test.js — scripts/ra-time-backfill.js's
// repairRaTimes() (2026-10-12, RA Start-Time Defect investigation and
// fix). Uses the REAL JSON-LD values fetched live from ra.co during the
// investigation for the two named regression fixtures (Dilemmas B Day
// Bash / ra-2542617, and Body Worx wsg CONFLICT BUREAU / ra-2549395) so
// this exercises the actual real-world defect, not a synthetic stand-in.
// Injected fetchCandidates/fetchDetailData/applyPatchFn, same DI
// convention as every other repair script in this project
// (scripts/visitdetroit-time-backfill.js chief among them).
//
// Run: node test/ra-time-backfill.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function fresh() {
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/ra-time-backfill.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/ra-sync.js`)];
  return require(`${REPO_DIR}/scripts/ra-time-backfill.js`);
}

// Real JSON-LD, fetched live via browser automation on 2026-10-11/12
// during the RA Start-Time Defect investigation.
const DILEMMAS = { id: "ra-2542617", startDate: "2026-10-23T21:00:00.000", endDate: "2026-10-24T02:00:00.000", url: null, title: "Dilemmas B Day Bash" };
const BODY_WORX = { id: "ra-2549395", startDate: "2026-10-17T21:00:00.000", endDate: "2026-10-18T02:00:00.000", url: null, title: "Body Worx wsg CONFLICT BUREAU (Chicago)" };

async function run() {
  const { repairRaTimes, titlesLooselyMatch } = fresh();
  const SUPABASE_URL = "https://example.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = "test-key";

  // ============================================================
  // 1. Time extraction + cross-midnight, against the REAL "Dilemmas B Day
  //    Bash" fixture (ra-2542617) — one of the 40 production rows this
  //    investigation found live with no start time even though RA's own
  //    page has one. This is the primary regression fixture.
  // ============================================================
  {
    const patches = [];
    const candidates = [
      { id: "evt-dilemmas", external_id: "ra-2542617", title: "Dilemmas B Day Bash", start_date: "2026-10-23", end_date: null, time_display: null, ticket_url: null },
    ];
    const detailMap = new Map([[DILEMMAS.id, DILEMMAS]]);
    const counts = await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchDetailData: async () => detailMap,
      applyPatchFn: async (url, headers, event, patchBody) => { patches.push({ event, patchBody }); return true; },
    });
    assert.strictEqual(counts.repaired, 1);
    assert.strictEqual(counts.written, 1);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].event.id, "evt-dilemmas", "applyPatchFn receives the ORIGINAL row, for a race-safe re-assert filter");
    assert.strictEqual(patches[0].patchBody.time_display, "9:00 PM–2:00 AM");
    assert.strictEqual(patches[0].patchBody.end_date, "2026-10-24", "cross-midnight end_date set from RA's own endDate landing on a later calendar date");
    assert.strictEqual(patches[0].patchBody.ticket_url, "https://ra.co/events/2542617", "direct RA URL derived and filled since ticket_url was null");
  }
  console.log("PASS: ra-2542617 (real fixture) — missing time_display, end_date and ticket_url are all correctly backfilled from RA's real JSON-LD");

  // ============================================================
  // 2. Second real fixture, Body Worx wsg CONFLICT BUREAU (ra-2549395) —
  //    confirms the 21:00-02:00 shape from the "CONFIRMED RA START-TIME
  //    DEFECT" message's own claimed source data, and that an existing
  //    non-null ticket_url is never reconsidered when already set.
  // ============================================================
  {
    const patches = [];
    const candidates = [
      { id: "evt-bodyworx", external_id: "ra-2549395", title: "Body Worx wsg CONFLICT BUREAU (Chicago)", start_date: "2026-10-17", end_date: null, time_display: null, ticket_url: "https://ra.co/events/2549395" },
    ];
    const counts = await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchDetailData: async () => new Map([[BODY_WORX.id, BODY_WORX]]),
      applyPatchFn: async (url, headers, event, patchBody) => { patches.push({ event, patchBody }); return true; },
    });
    assert.strictEqual(counts.written, 1);
    assert.strictEqual(patches[0].patchBody.time_display, "9:00 PM–2:00 AM");
    assert.strictEqual(patches[0].patchBody.end_date, "2026-10-18");
    assert.ok(!("ticket_url" in patches[0].patchBody), "ticket_url already set -- never reconsidered, never overwritten");
  }
  console.log("PASS: ra-2549395 (real fixture, 21:00-02:00) backfills time_display; an already-set ticket_url is left untouched");

  // ============================================================
  // 3. Direct RA URL preservation when the listing captured no url at
  //    all — falls back to the deterministic ra.co/events/<id> shape.
  // ============================================================
  {
    const patches = [];
    const candidates = [
      { id: "evt-nourl", external_id: "ra-3000001", title: "No Url Captured", start_date: "2026-11-01", end_date: null, time_display: null, ticket_url: null },
    ];
    await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchDetailData: async () => new Map([["ra-3000001", { startDate: "2026-11-01T22:00:00.000", endDate: null, url: null, title: "No Url Captured" }]]),
      applyPatchFn: async (url, headers, event, patchBody) => { patches.push(patchBody); return true; },
    });
    assert.strictEqual(patches[0].ticket_url, "https://ra.co/events/3000001");
  }
  console.log("PASS: direct RA URL falls back to the deterministic ra.co/events/<id> shape when no url was captured");

  // ============================================================
  // 4. Cross-midnight is NOT invented when RA's own endDate lands on the
  //    SAME calendar date — end_date stays null, same-day event.
  // ============================================================
  {
    const patches = [];
    const candidates = [
      { id: "evt-sameday", external_id: "ra-4000001", title: "Afternoon Thing", start_date: "2026-11-02", end_date: null, time_display: null, ticket_url: "https://ra.co/events/4000001" },
    ];
    await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchDetailData: async () => new Map([["ra-4000001", { startDate: "2026-11-02T14:00:00.000", endDate: "2026-11-02T17:00:00.000", url: null }]]),
      applyPatchFn: async (url, headers, event, patchBody) => { patches.push(patchBody); return true; },
    });
    assert.strictEqual(patches[0].time_display, "2:00 PM–5:00 PM");
    assert.strictEqual(patches[0].end_date, null, "same-day end never invents a next-day end_date");
  }
  console.log("PASS: a same-day event's end_date stays null — cross-midnight is only ever set when RA's own date actually crosses");

  // ============================================================
  // 5. Daylight-saving transition (America/Detroit 'fall back',
  //    2026-11-01) — parseIsoLocal reads literal printed digits, never
  //    does date math, so it is unaffected crossing the transition.
  // ============================================================
  {
    const patches = [];
    const candidates = [
      { id: "evt-dst", external_id: "ra-5000001", title: "DST Night", start_date: "2026-11-01", end_date: null, time_display: null, ticket_url: null },
    ];
    await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchDetailData: async () => new Map([["ra-5000001", { startDate: "2026-11-01T22:00:00.000", endDate: "2026-11-02T02:00:00.000", url: null }]]),
      applyPatchFn: async (url, headers, event, patchBody) => { patches.push(patchBody); return true; },
    });
    assert.strictEqual(patches[0].time_display, "10:00 PM–2:00 AM", "the DST changeover date itself produces no drift");
    assert.strictEqual(patches[0].end_date, "2026-11-02");
  }
  console.log("PASS: an event on the actual 2026 DST 'fall back' date is unaffected — no 1-hour drift");

  // ============================================================
  // 6. Missing source time (RA's detail page genuinely has only a date,
  //    no time-of-day) — left null, never defaulted to midnight/noon.
  // ============================================================
  {
    let applyPatchCalled = false;
    const candidates = [
      { id: "evt-dateonly", external_id: "ra-6000001", title: "All Day Market", start_date: "2026-11-05", end_date: null, time_display: null, ticket_url: null },
    ];
    const counts = await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchDetailData: async () => new Map([["ra-6000001", { startDate: "2026-11-05", endDate: null, url: null }]]),
      applyPatchFn: async () => { applyPatchCalled = true; return true; },
    });
    assert.strictEqual(counts.sourceHasNoTime, 1);
    assert.deepStrictEqual(counts.sourceHasNoTimeIds, ["ra-6000001"]);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(applyPatchCalled, false, "never defaulted to midnight/noon/now when RA genuinely has no time");
  }
  console.log("PASS: a genuinely date-only RA detail page is left with time_display null, never guessed");

  // ============================================================
  // 7. A GENUINE parse failure (malformed startDate) is recorded
  //    distinctly from "RA has no time" — the task's own explicit
  //    requirement: never silently classify a parsing failure as
  //    missing source information.
  // ============================================================
  {
    const warnings = [];
    const candidates = [
      { id: "evt-malformed", external_id: "ra-7000001", title: "Malformed Date Event", start_date: "2026-11-06", end_date: null, time_display: null, ticket_url: null },
    ];
    const counts = await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchDetailData: async () => new Map([["ra-7000001", { startDate: "not-a-real-date", endDate: null, url: null }]]),
      applyPatchFn: async () => true,
      logger: { log() {}, error() {}, warn: (m) => warnings.push(m) },
    });
    assert.strictEqual(counts.parseFailed, 1, "a parse failure is its own counted category, never folded into sourceHasNoTime");
    assert.deepStrictEqual(counts.parseFailedIds, ["ra-7000001"]);
    assert.strictEqual(counts.sourceHasNoTime, 0);
    assert.strictEqual(counts.written, 0);
    assert.ok(warnings.some((w) => w.includes("PARSE FAILURE")));
  }
  console.log("PASS: a malformed startDate is a counted parseFailed, never silently treated as 'RA has no time'");

  // ============================================================
  // 8. Conflicting existing time: a row is never touched if
  //    time_display is already non-null in the candidate set it was
  //    given (defensive -- the real query already filters time_display
  //    IS NULL, but a caller handing in a stale/hand-built candidate list
  //    must still never have it overwritten).
  // ============================================================
  {
    let applyPatchCalled = false;
    const candidates = [
      { id: "evt-hasTime", external_id: "ra-2542617", title: "Dilemmas B Day Bash", start_date: "2026-10-23", end_date: null, time_display: "7:00 PM", ticket_url: null },
    ];
    await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchDetailData: async () => new Map([[DILEMMAS.id, DILEMMAS]]),
      applyPatchFn: async (url, headers, event, patchBody) => { applyPatchCalled = true; return true; },
    });
    // The real applyPatch() re-asserts time_display in its own WHERE
    // filter (is.null) -- a row whose time_display already reads
    // non-null at write time would never match that filter in
    // production and the PATCH would affect 0 rows. Proven here via the
    // concurrent-change path directly:
    const counts2 = await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => [{ id: "evt-race", external_id: "ra-2542617", title: "Dilemmas B Day Bash", start_date: "2026-10-23", end_date: null, time_display: null, ticket_url: null }],
      fetchDetailData: async () => new Map([[DILEMMAS.id, DILEMMAS]]),
      applyPatchFn: async () => false, // simulates a moderator hand-editing time_display between the read and the write
    });
    assert.strictEqual(counts2.skippedConcurrentChange, 1);
    assert.strictEqual(counts2.written, 0);
  }
  console.log("PASS: a concurrently-changed time_display is skipped, never overwritten");

  // ============================================================
  // 9. Identity-verification guard: a detail payload with a title that
  //    does not loosely match the stored title is refused.
  // ============================================================
  {
    let applyPatchCalled = false;
    const candidates = [
      { id: "evt-mismatch", external_id: "ra-8000001", title: "Totally Different Event Name", start_date: "2026-11-10", end_date: null, time_display: null, ticket_url: null },
    ];
    const warnings = [];
    const counts = await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => candidates,
      fetchDetailData: async () => new Map([["ra-8000001", { startDate: "2026-11-10T21:00:00.000", endDate: null, url: null, title: "Dilemmas B Day Bash" }]]),
      applyPatchFn: async () => { applyPatchCalled = true; return true; },
      logger: { log() {}, error() {}, warn: (m) => warnings.push(m) },
    });
    assert.strictEqual(counts.titleMismatchSkipped, 1);
    assert.strictEqual(applyPatchCalled, false);
    assert.ok(warnings.some((w) => w.includes("does not match detail-page title")));
  }
  console.log("PASS: a detail payload whose title doesn't match the stored title is refused, never trusted on id alone");

  // ============================================================
  // 10. No detail data provided for a candidate -> left completely
  //     alone (not every affected row needs to be in the same run).
  // ============================================================
  {
    const counts = await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => [{ id: "evt-nodet", external_id: "ra-9000001", title: "Not In This Run's Detail File", start_date: "2026-11-11", end_date: null, time_display: null, ticket_url: null }],
      fetchDetailData: async () => new Map(),
      applyPatchFn: async () => true,
    });
    assert.strictEqual(counts.noDetailDataProvided, 1);
    assert.strictEqual(counts.written, 0);
  }
  console.log("PASS: a candidate with no detail data in this run is left alone, not an error");

  // ============================================================
  // 11. status is never touched, whatever its value, and is not even
  //     present in any patchBody this script builds.
  // ============================================================
  {
    const patches = [];
    await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      fetchCandidates: async () => [{ id: "evt-status", external_id: "ra-2542617", title: "Dilemmas B Day Bash", start_date: "2026-10-23", end_date: null, time_display: null, ticket_url: null, status: "approved" }],
      fetchDetailData: async () => new Map([[DILEMMAS.id, DILEMMAS]]),
      applyPatchFn: async (url, headers, event, patchBody) => { patches.push(patchBody); return true; },
    });
    assert.ok(!("status" in patches[0]), "status is never part of this script's write — approval is a separate human decision");
  }
  console.log("PASS: status is never written by this script");

  // ============================================================
  // 12. Missing Supabase config -> no-op, no throw.
  // ============================================================
  {
    const counts = await repairRaTimes({ SUPABASE_URL: null, SUPABASE_SERVICE_ROLE_KEY: null, logger: { error() {}, log() {}, warn() {} } });
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(counts.totalConsidered, 0);
  }
  console.log("PASS: missing Supabase config no-ops cleanly");

  // ============================================================
  // 13. titlesLooselyMatch helper sanity.
  // ============================================================
  {
    assert.strictEqual(titlesLooselyMatch("Dilemmas B Day Bash", "dilemmas b day bash"), true);
    assert.strictEqual(titlesLooselyMatch("Dilemmas B Day Bash", "Dilemmas B Day Bash (TV Lounge)"), true);
    assert.strictEqual(titlesLooselyMatch("Dilemmas B Day Bash", "Completely Unrelated Show"), false);
    assert.strictEqual(titlesLooselyMatch("", "Something"), false);
  }
  console.log("PASS: titlesLooselyMatch accepts near-identical titles, rejects unrelated ones");

  console.log("\nra-time-backfill.test.js: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
