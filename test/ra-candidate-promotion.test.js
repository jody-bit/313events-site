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
  assert.ok(row1000.note.includes("RA_PROVENANCE"));
  assert.ok(row1000.note.includes("ra_id=ra-1000"));
  assert.ok(row1000.note.includes("ra_url=https://ra.co/events/1000"));
  assert.ok(row1000.note.includes("venueName"), "note must record which listing fields RA actually supplied");
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

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
