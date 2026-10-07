// test/ra-candidate-promotion.test.js — scripts/ra-candidate-promotion.js's
// promoteRaCandidates(): RA candidate-recovery MVP "Step 0" (Product Owner
// decisions 1/2/3, 2026-10-01). Proves: identity-sufficiency gating,
// conservative dedupe before any write, status is hard-coded to
// pending_review (never approved), RA provenance note format, dry-run
// never writes, and the latest-session lookup's own fail-soft behavior.
//
// Plain Node assert, no dependencies, same style as test/ra-sync.test.js.
// Run: node test/ra-candidate-promotion.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "test-key";

function freshLib() {
  for (const mod of [
    "scripts/ra-candidate-promotion.js",
    "scripts/ra-sync.js",
    "api/_lib/status-lookup.js",
    "api/_lib/ra-provenance-note.js",
    "api/_lib/source-slugs.js",
  ]) {
    delete require.cache[require.resolve(`${REPO_DIR}/${mod}`)];
  }
  return require(`${REPO_DIR}/scripts/ra-candidate-promotion.js`);
}

async function run() {
  // These tests exercise promoteRaCandidates' own classification/write
  // logic, not the safety gate (that has its own dedicated test,
  // runSafetyGateTests, below) -- explicitly enabled here so "written"
  // reflects real classification, restored by runSafetyGateTests'
  // own save/restore of this same env var either way.
  process.env.RA_CANDIDATE_PROMOTION_ENABLED = "true";
  const lib = freshLib();

  // 1. Not configured -- fails soft, never throws.
  {
    const counts = await lib.promoteRaCandidates({ SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" });
    assert.strictEqual(counts.configured, false);
    assert.strictEqual(counts.sessionFound, false);
  }
  console.log("PASS: missing SUPABASE_URL/KEY fails soft, never throws");

  // 2. No RA session found at all -- fails soft, zero counts, not an error.
  {
    const counts = await lib.promoteRaCandidates({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
      getLatestRaSessionFn: async () => null,
    });
    assert.strictEqual(counts.sessionFound, false);
    assert.strictEqual(counts.examined, 0);
    assert.strictEqual(counts.written, 0);
  }
  console.log("PASS: no RA session found yet is a clean zero-count result, never an error");

  // 3. The full, real decision set against one representative backlog.
  const session = {
    id: "run-42",
    allNewIds: [
      "ra-1000", // clean, promotable
      "ra-1001", // missing date -> insufficient identity
      "ra-1002", // missing title -> insufficient identity
      "ra-1003", // conservative-dedupe match -> skipped, not written
      "ra-1004", // already present in events -> skipped
      "ra-1005", // promotable, no venueName at all (RA itself doesn't have one)
    ],
    listingMetadata: {
      "ra-1000": { title: "Real Show", date: "2026-11-06T00:00:00.000", displayedTime: "2026-11-06T21:00:00.000", venueName: "Russell Industrial Center", city: "Detroit", url: "https://ra.co/events/1000", image: "https://images.ra.co/x.png" },
      "ra-1001": { title: "No Date Show", venueName: "Somewhere" },
      "ra-1002": { date: "2026-11-07T00:00:00.000", venueName: "Somewhere Else" },
      "ra-1003": { title: "Dup Show", date: "2026-11-08T00:00:00.000", venueName: "Marble Bar" },
      "ra-1004": { title: "Already Here", date: "2026-11-09T00:00:00.000", venueName: "Elektricity" },
      "ra-1005": { title: "Secret Location Show", date: "2026-11-10T00:00:00.000" },
    },
  };

  const insertedRows = [];
  const counts = await lib.promoteRaCandidates({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
    getLatestRaSessionFn: async () => session,
    lookupExistingRowsFn: async (url, key, ids) => {
      assert.strictEqual(url, SUPABASE_URL);
      assert.strictEqual(key, SUPABASE_KEY);
      return new Map(ids.filter((id) => id === "ra-1004").map((id) => [id, { external_id: id }]));
    },
    findConservativeDuplicateFn: async (url, key, row) => {
      if (row.external_id === "ra-1003") return { id: "evt-legacy-1", title: "Dup Show (legacy import)", external_id: null };
      return null;
    },
    insertCandidateRowFn: async (url, key, row) => {
      insertedRows.push(row);
      return true;
    },
  });

  assert.strictEqual(counts.sessionFound, true);
  assert.strictEqual(counts.runId, "run-42");
  assert.strictEqual(counts.examined, 6);
  assert.strictEqual(counts.alreadyPresent, 1);
  assert.strictEqual(counts.insufficientIdentity, 2);
  assert.deepStrictEqual(counts.insufficientIdentityIds.sort(), ["ra-1001", "ra-1002"]);
  assert.strictEqual(counts.duplicates, 1);
  assert.strictEqual(counts.duplicateDetail[0].id, "ra-1003");
  assert.strictEqual(counts.duplicateDetail[0].matchedEventId, "evt-legacy-1");
  assert.strictEqual(counts.promotable, 2);
  assert.strictEqual(counts.written, 2);
  assert.deepStrictEqual(counts.writtenIds.sort(), ["ra-1000", "ra-1005"]);
  console.log("PASS: a realistic mixed backlog is classified exactly -- already-present / insufficient-identity / duplicate / promotable all correctly bucketed");

  const row1000 = insertedRows.find((r) => r.external_id === "ra-1000");
  assert.strictEqual(row1000.status, "pending_review", "status must be hard-coded to pending_review, never approved");
  assert.strictEqual(row1000.source, "Resident Advisor");
  assert.strictEqual(row1000.title, "Real Show");
  assert.strictEqual(row1000.start_date, "2026-11-06");
  assert.strictEqual(row1000.venue_name_raw, "Russell Industrial Center");
  assert.strictEqual(row1000.category, "nightlife");
  assert.strictEqual(row1000.note, undefined, "provenance never touches the visitor-facing note (2026-10-04 homepage leak)");
  assert.ok(row1000.internal_note.includes("RA_PROVENANCE"));
  assert.ok(row1000.internal_note.includes("ra_id=ra-1000"));
  assert.ok(row1000.internal_note.includes("ra_url=https://ra.co/events/1000"));
  assert.ok(row1000.internal_note.includes("venueName"), "internal_note must record which listing fields RA actually supplied");
  assert.ok(!row1000.hasOwnProperty("displayedTime") && !Object.values(row1000).includes("2026-11-06T21:00:00.000"),
    "RA's displayedTime must never be written to any authoritative field here -- only an independent source or a human may confirm a start time");
  console.log("PASS: a promoted row is pending_review, carries RA provenance in note, and never writes RA's displayedTime anywhere");

  const row1005 = insertedRows.find((r) => r.external_id === "ra-1005");
  assert.strictEqual(row1005.venue_name_raw, null, "no venueName on the listing card must never be guessed -- stays null");
  console.log("PASS: a candidate with no venue name at all on RA's own listing card is promoted with venue_name_raw left null, never guessed");

  // 4. dryRun -- identical classification, zero writes.
  {
    const dryInserted = [];
    const dryCounts = await lib.promoteRaCandidates({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, dryRun: true,
      getLatestRaSessionFn: async () => session,
      lookupExistingRowsFn: async (url, key, ids) => new Map(ids.filter((id) => id === "ra-1004").map((id) => [id, { external_id: id }])),
      findConservativeDuplicateFn: async (url, key, row) => (row.external_id === "ra-1003" ? { id: "evt-legacy-1", title: "x" } : null),
      insertCandidateRowFn: async (url, key, row) => { dryInserted.push(row); return true; },
    });
    assert.strictEqual(dryCounts.promotable, 2, "dry-run must still report what WOULD be promoted");
    assert.strictEqual(dryCounts.written, 0, "dry-run must never actually write");
    assert.strictEqual(dryInserted.length, 0, "dry-run must never call the insert function at all");
  }
  console.log("PASS: dryRun reports identical classification but writes nothing and never calls insertCandidateRowFn");

  console.log("\nAll ra-candidate-promotion.js tests passed.");
}

// RA_CANDIDATE_PROMOTION_MAX_PER_RUN tests (2026-10-01, V1 experiment cap).
async function runMaxPerRunTests() {
  process.env.RA_CANDIDATE_PROMOTION_ENABLED = "true";
  const lib = freshLib();

  // A backlog with 5 genuinely eligible candidates (after a duplicate and
  // an insufficient-identity one are already filtered out upstream), a
  // cap of 2 -- deterministic: the FIRST 2 eligible ids in allNewIds'
  // own order are promoted, the rest are deferred, untouched.
  const session = {
    id: "run-cap",
    allNewIds: ["ra-3000", "ra-3001", "ra-3002", "ra-3003", "ra-3004", "ra-3005", "ra-3006"],
    listingMetadata: {
      "ra-3000": { title: "Cap Test Show A", date: "2026-12-01T00:00:00.000", venueName: "Venue A" },
      "ra-3001": { title: "No Date Show" }, // insufficient identity -- must never count against the cap
      "ra-3002": { title: "Cap Test Show B", date: "2026-12-02T00:00:00.000", venueName: "Venue B" },
      "ra-3003": { title: "Dup Show", date: "2026-12-03T00:00:00.000", venueName: "Venue C" }, // duplicate -- must never count against the cap
      "ra-3004": { title: "Cap Test Show C", date: "2026-12-04T00:00:00.000", venueName: "Venue D" },
      "ra-3005": { title: "Cap Test Show D", date: "2026-12-05T00:00:00.000", venueName: "Venue E" },
      "ra-3006": { title: "Cap Test Show E", date: "2026-12-06T00:00:00.000", venueName: "Venue F" },
    },
  };

  {
    const inserted = [];
    const counts = await lib.promoteRaCandidates({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
      maxPerRun: 2,
      getLatestRaSessionFn: async () => session,
      lookupExistingRowsFn: async () => new Map(),
      findConservativeDuplicateFn: async (u, k, row) => (row.external_id === "ra-3003" ? { id: "evt-legacy", title: "x" } : null),
      insertCandidateRowFn: async (u, k, row) => { inserted.push(row.external_id); return true; },
    });

    assert.strictEqual(counts.insufficientIdentity, 1);
    assert.strictEqual(counts.duplicates, 1);
    assert.strictEqual(counts.promotable, 5, "promotable must count every eligible candidate, BEFORE the cap is applied");
    assert.strictEqual(counts.promoted, 2, "only maxPerRun candidates may actually be selected");
    assert.strictEqual(counts.deferredByCap, 3, "the rest of the eligible candidates must be explicitly counted as deferred, not silently dropped");
    assert.strictEqual(counts.promoted + counts.deferredByCap, counts.promotable, "promoted + deferredByCap must always equal promotable");
    assert.deepStrictEqual(counts.deferredByCapIds, ["ra-3004", "ra-3005", "ra-3006"], "selection must be deterministic -- the FIRST eligible ids in allNewIds order are promoted, not random");
    assert.deepStrictEqual(inserted, ["ra-3000", "ra-3002"], "exactly the first 2 eligible ids must actually be written");
    assert.strictEqual(counts.written, 2);
    assert.strictEqual(counts.maxPerRun, 2);
  }
  console.log("PASS: RA_CANDIDATE_PROMOTION_MAX_PER_RUN -- cap applies strictly after existing-RA and dedupe checks, deterministic selection, rest deferred and untouched");

  // dryRun must respect and report the identical cap/split, writing nothing.
  {
    const inserted = [];
    const counts = await lib.promoteRaCandidates({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
      dryRun: true,
      maxPerRun: 2,
      getLatestRaSessionFn: async () => session,
      lookupExistingRowsFn: async () => new Map(),
      findConservativeDuplicateFn: async (u, k, row) => (row.external_id === "ra-3003" ? { id: "evt-legacy", title: "x" } : null),
      insertCandidateRowFn: async (u, k, row) => { inserted.push(row.external_id); return true; },
    });
    assert.strictEqual(counts.promoted, 2, "dry-run must report the same selection the real run would make");
    assert.strictEqual(counts.deferredByCap, 3);
    assert.deepStrictEqual(counts.deferredByCapIds, ["ra-3004", "ra-3005", "ra-3006"]);
    assert.strictEqual(counts.written, 0, "dry-run must never actually write");
    assert.strictEqual(inserted.length, 0, "dry-run must never call insertCandidateRowFn at all, even for the ids within the cap");
  }
  console.log("PASS: RA_CANDIDATE_PROMOTION_MAX_PER_RUN -- dry-run reports the identical promoted/deferred split without writing");

  // Default cap is 10 unless overridden -- env-overridable, not hardcoded.
  {
    delete process.env.RA_CANDIDATE_PROMOTION_MAX_PER_RUN;
    delete require.cache[require.resolve(`${REPO_DIR}/scripts/ra-candidate-promotion.js`)];
    const defaultLib = require(`${REPO_DIR}/scripts/ra-candidate-promotion.js`);
    assert.strictEqual(defaultLib.DEFAULT_MAX_PER_RUN, 10, "the shipped V1 default must be 10");

    process.env.RA_CANDIDATE_PROMOTION_MAX_PER_RUN = "3";
    delete require.cache[require.resolve(`${REPO_DIR}/scripts/ra-candidate-promotion.js`)];
    const envLib = require(`${REPO_DIR}/scripts/ra-candidate-promotion.js`);
    assert.strictEqual(envLib.DEFAULT_MAX_PER_RUN, 3, "RA_CANDIDATE_PROMOTION_MAX_PER_RUN must override the default without a code change");
    delete process.env.RA_CANDIDATE_PROMOTION_MAX_PER_RUN;
  }
  console.log("PASS: RA_CANDIDATE_PROMOTION_MAX_PER_RUN -- env-overridable, defaults to 10");

  console.log("\nAll RA_CANDIDATE_PROMOTION_MAX_PER_RUN tests passed.");
}

// 5. Safety gate (added after initial deployment, same day): without
// RA_CANDIDATE_PROMOTION_ENABLED="true" explicitly set, writes are forced
// off even when the caller explicitly asked for dryRun:false -- the daily
// cron must never silently start writing real rows before the Product
// Owner has reviewed a dry-run report and turned this on herself.
async function runSafetyGateTests() {
  const lib = freshLib();
  const session = {
    id: "run-gate",
    allNewIds: ["ra-2000"],
    listingMetadata: { "ra-2000": { title: "Gate Test Show", date: "2026-12-01T00:00:00.000", venueName: "Some Venue" } },
  };

  const prevFlag = process.env.RA_CANDIDATE_PROMOTION_ENABLED;
  try {
    delete process.env.RA_CANDIDATE_PROMOTION_ENABLED;
    let inserted = false;
    const counts = await lib.promoteRaCandidates({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
      dryRun: false, // caller explicitly asked for real writes
      getLatestRaSessionFn: async () => session,
      lookupExistingRowsFn: async () => new Map(),
      findConservativeDuplicateFn: async () => null,
      insertCandidateRowFn: async () => { inserted = true; return true; },
    });
    assert.strictEqual(counts.liveWritesEnabled, false);
    assert.strictEqual(counts.dryRun, true, "must be forced into dry-run when the env flag is unset, regardless of the dryRun argument");
    assert.strictEqual(counts.promotable, 1);
    assert.strictEqual(counts.written, 0, "nothing may be written while the flag is unset");
    assert.strictEqual(inserted, false, "insertCandidateRowFn must never be called at all while the flag is unset");

    process.env.RA_CANDIDATE_PROMOTION_ENABLED = "true";
    delete require.cache[require.resolve(`${REPO_DIR}/scripts/ra-candidate-promotion.js`)];
    const libEnabled = require(`${REPO_DIR}/scripts/ra-candidate-promotion.js`);
    let insertedWhenEnabled = false;
    const countsEnabled = await libEnabled.promoteRaCandidates({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
      dryRun: false,
      getLatestRaSessionFn: async () => session,
      lookupExistingRowsFn: async () => new Map(),
      findConservativeDuplicateFn: async () => null,
      insertCandidateRowFn: async () => { insertedWhenEnabled = true; return true; },
    });
    assert.strictEqual(countsEnabled.liveWritesEnabled, true);
    assert.strictEqual(countsEnabled.written, 1, "once explicitly enabled AND dryRun:false, a real write proceeds");
    assert.strictEqual(insertedWhenEnabled, true);
  } finally {
    if (prevFlag === undefined) delete process.env.RA_CANDIDATE_PROMOTION_ENABLED;
    else process.env.RA_CANDIDATE_PROMOTION_ENABLED = prevFlag;
  }
  console.log("PASS: the RA_CANDIDATE_PROMOTION_ENABLED safety gate forces dry-run until explicitly turned on, overriding any caller-requested dryRun:false");
}

// 6. event_source_identities widening + persistence (2026-10-03): a
// candidate already linked to an existing event via a prior conservative
// dedupe match must be treated as alreadyPresent even with no row of its
// own under external_id (see api/_lib/event-source-identities.js); and a
// genuine new duplicate match found THIS run must have that match
// persisted via recordSourceIdentityFn -- but only when writes are not
// suppressed by dryRun (the same "dry run = zero writes" contract as the
// pending_review insert above).
async function runIdentityWideningTests() {
  process.env.RA_CANDIDATE_PROMOTION_ENABLED = "true";
  const lib = freshLib();

  const session = {
    id: "run-identity",
    allNewIds: [
      "ra-4000", // known only via event_source_identities -- no external_id row
      "ra-4001", // genuine new duplicate match this run -- identity must be recorded
    ],
    listingMetadata: {
      "ra-4000": { title: "Identity-Known Show", date: "2026-12-10T00:00:00.000", venueName: "Venue X" },
      "ra-4001": { title: "Fresh Dup Show", date: "2026-12-11T00:00:00.000", venueName: "Venue Y" },
    },
  };

  // 6a. alreadyPresent widening.
  {
    const lookedUpWith = {};
    const counts = await lib.promoteRaCandidates({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
      getLatestRaSessionFn: async () => session,
      lookupExistingRowsFn: async () => new Map(), // no external_id rows at all
      lookupKnownSourceIdsFn: async (url, key, source, bareIds) => {
        lookedUpWith.url = url; lookedUpWith.key = key; lookedUpWith.source = source; lookedUpWith.bareIds = bareIds;
        return new Set(["4000"]); // only ra-4000's bare id is identity-known
      },
      findConservativeDuplicateFn: async (u, k, row) => (row.external_id === "ra-4001" ? { id: "evt-fresh-1", title: "Fresh Dup Show (existing)", external_id: null } : null),
      insertCandidateRowFn: async () => true,
    });
    assert.strictEqual(lookedUpWith.url, SUPABASE_URL);
    assert.strictEqual(lookedUpWith.key, SUPABASE_KEY);
    assert.strictEqual(lookedUpWith.source, "ra");
    assert.deepStrictEqual(lookedUpWith.bareIds.sort(), ["4000", "4001"], "every candidate's bare id must be checked, not just ones already known via external_id");
    assert.strictEqual(counts.alreadyPresent, 1, "ra-4000 must be counted alreadyPresent via identity widening alone, with no external_id row of its own");
    assert.strictEqual(counts.duplicates, 1, "ra-4001 is a genuinely new duplicate match, not pre-known");
  }
  console.log("PASS: alreadyPresent widens via lookupKnownSourceIdsFn -- a candidate known only through event_source_identities (no external_id row) is skipped, never re-promoted");

  // 6b. identity persistence on a genuine new duplicate match, real run.
  {
    const recorded = [];
    const counts = await lib.promoteRaCandidates({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
      getLatestRaSessionFn: async () => session,
      lookupExistingRowsFn: async () => new Map(),
      lookupKnownSourceIdsFn: async () => new Set(), // nothing pre-known this time
      findConservativeDuplicateFn: async (u, k, row) => (row.external_id === "ra-4001" ? { id: "evt-fresh-1", title: "Fresh Dup Show (existing)", external_id: null } : null),
      insertCandidateRowFn: async () => true,
      recordSourceIdentityFn: async (url, key, identity) => {
        recorded.push(identity);
        assert.strictEqual(url, SUPABASE_URL);
        assert.strictEqual(key, SUPABASE_KEY);
        return true;
      },
    });
    assert.strictEqual(counts.duplicates, 1);
    assert.strictEqual(recorded.length, 1, "a genuine duplicate match must have its identity recorded exactly once");
    assert.deepStrictEqual(recorded[0], { eventId: "evt-fresh-1", source: "ra", sourceId: "4001" });
    assert.strictEqual(counts.duplicateDetail[0].identityRecorded, true, "the duplicate-detail entry must reflect that the identity write actually succeeded");
  }
  console.log("PASS: a genuine new duplicate match (real run) has its RA identity persisted via recordSourceIdentityFn with the correct eventId/source/sourceId");

  // 6c. dry run must never call recordSourceIdentityFn at all -- "dry run"
  // means zero writes of any kind, not "no writes except this one".
  {
    let recordCalled = false;
    const counts = await lib.promoteRaCandidates({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
      dryRun: true,
      getLatestRaSessionFn: async () => session,
      lookupExistingRowsFn: async () => new Map(),
      lookupKnownSourceIdsFn: async () => new Set(),
      findConservativeDuplicateFn: async (u, k, row) => (row.external_id === "ra-4001" ? { id: "evt-fresh-1", title: "x" } : null),
      insertCandidateRowFn: async () => true,
      recordSourceIdentityFn: async () => { recordCalled = true; return true; },
    });
    assert.strictEqual(counts.duplicates, 1, "dry-run must still report the duplicate match itself");
    assert.strictEqual(recordCalled, false, "recordSourceIdentityFn must never be called during a dry run");
    assert.strictEqual(counts.duplicateDetail[0].identityRecorded, false, "identityRecorded must be false when no write was attempted");
  }
  console.log("PASS: dryRun never calls recordSourceIdentityFn -- 'dry run' means zero writes of any kind, not an exception for identity recording");

  console.log("\nAll event_source_identities widening/persistence tests passed.");
}

// 7. DEFECT 1 fix regression (2026-10-07): real RA listing-date format
// ("Thu, 8 Oct", no year) must actually promote -- this is the exact
// production root cause that made every real RA candidate since Oct 1
// silently fail identity validation regardless of RA_CANDIDATE_PROMOTION_
// ENABLED. Also proves the rest of Part 4's "never invent" guarantees
// explicitly against a candidate carrying ONLY what RA's listing card
// itself provides, and that repeated promotion of the same backlog is
// idempotent (no duplicate row, no duplicate write).
async function runRealListingDateTests() {
  process.env.RA_CANDIDATE_PROMOTION_ENABLED = "true";
  const lib = freshLib();
  const REFERENCE_NOW = new Date("2026-10-07T12:00:00.000Z");

  // The two real, named production candidates (ra-2552525, ra-2554901),
  // confirmed directly against today's actual source_runs.session_data --
  // RA's own listing card gives title/date/venueName/url only, nothing
  // else.
  const session = {
    id: "run-real-oct8",
    allNewIds: ["ra-2552525", "ra-2554901", "ra-9999999"],
    listingMetadata: {
      "ra-2552525": {
        title: "E L I X I R  THURSDAY  •  wsg Joshua Tree • DR. Disko Dust aka John Ryan",
        date: "Thu, 8 Oct",
        venueName: "Northern Lights Lounge",
        url: "https://ra.co/events/2552525",
      },
      "ra-2554901": {
        title: "J. Scott",
        date: "Thu, 8 Oct",
        venueName: "Tigris",
        url: "https://ra.co/events/2554901",
      },
      "ra-9999999": {
        title: "Malformed Date Show",
        date: "TBA", // RA sometimes shows this verbatim -- must never be guessed at
        venueName: "Somewhere",
      },
    },
  };

  const inserted = [];
  const counts = await lib.promoteRaCandidates({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
    now: REFERENCE_NOW,
    getLatestRaSessionFn: async () => session,
    lookupExistingRowsFn: async () => new Map(),
    findConservativeDuplicateFn: async () => null,
    insertCandidateRowFn: async (url, key, row) => { inserted.push(row); return true; },
  });

  assert.strictEqual(counts.insufficientIdentity, 1, "TBA is still correctly rejected -- the fix does not loosen validation, only the date SHAPE it accepts");
  assert.deepStrictEqual(counts.insufficientIdentityIds, ["ra-9999999"]);
  assert.strictEqual(counts.promotable, 2);
  assert.strictEqual(counts.written, 2, "both real Oct 8 candidates are promoted once the listing-date format is actually understood");
  assert.deepStrictEqual(inserted.map((r) => r.external_id).sort(), ["ra-2552525", "ra-2554901"]);
  console.log("PASS: real production listing dates ('Thu, 8 Oct') now promote; RA's own 'TBA' string still correctly rejected, not guessed");

  const elixir = inserted.find((r) => r.external_id === "ra-2552525");
  const jscott = inserted.find((r) => r.external_id === "ra-2554901");
  for (const row of [elixir, jscott]) {
    assert.strictEqual(row.start_date, "2026-10-08");
    assert.strictEqual(row.status, "pending_review");
    // Part 4, items 2-5: nothing RA's listing card doesn't state is ever
    // invented. The draft row this file builds has no address/description/
    // price/time keys at all -- confirming that directly (rather than
    // merely checking a null) is the strongest guarantee that no later
    // change could silently start defaulting one of these to a guessed
    // value without a test noticing.
    for (const neverInvented of ["venue_address_raw", "venue_city_raw", "description", "price_from", "is_free", "time_display", "ticket_url"]) {
      assert.ok(!Object.prototype.hasOwnProperty.call(row, neverInvented), `${neverInvented} must not be present at all on a listing-only promoted row -- missing stays missing, never defaulted/guessed`);
    }
  }
  assert.strictEqual(elixir.venue_name_raw, "Northern Lights Lounge");
  assert.strictEqual(jscott.venue_name_raw, "Tigris");
  console.log("PASS: both named Oct 8 candidates promoted with start_date=2026-10-08, status=pending_review, and no invented address/description/price/time/ticket field");

  // Idempotency (Part 4, item 8): re-running promotion against the SAME
  // session, now with the two rows already present (exactly what a real
  // re-run would see via lookupExistingRowsFn against production), must
  // write nothing a second time -- no duplicate row, no duplicate call.
  {
    const alreadyPresentMap = new Map(inserted.map((r) => [r.external_id, { external_id: r.external_id }]));
    const secondRunInserted = [];
    const secondCounts = await lib.promoteRaCandidates({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
      now: REFERENCE_NOW,
      getLatestRaSessionFn: async () => session,
      lookupExistingRowsFn: async () => alreadyPresentMap,
      findConservativeDuplicateFn: async () => null,
      insertCandidateRowFn: async (url, key, row) => { secondRunInserted.push(row); return true; },
    });
    assert.strictEqual(secondCounts.alreadyPresent, 2, "both previously-promoted candidates are now alreadyPresent");
    assert.strictEqual(secondCounts.written, 0, "repeated promotion of the same backlog writes nothing new");
    assert.strictEqual(secondRunInserted.length, 0, "insertCandidateRowFn must not be called again for an already-promoted id");
  }
  console.log("PASS: repeated promotion of the same backlog is idempotent -- no duplicate row, no duplicate write");

  console.log("\nAll real-listing-date / never-invent / idempotency tests passed.");
}

run()
  .then(runSafetyGateTests)
  .then(runMaxPerRunTests)
  .then(runIdentityWideningTests)
  .then(runRealListingDateTests)
  .then(() => console.log("\nAll ra-candidate-promotion.js tests (incl. safety gate + max-per-run cap + identity widening/persistence + real-listing-date fix) passed."))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
