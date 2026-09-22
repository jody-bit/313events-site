// test/wp017-connector-coverage.test.js — WP 0.17 criterion 15: every
// applicable event-ingestion connector uses the safe (fail-closed, shared-
// helper) status-lookup path, and none still contains the old fail-soft
// inline pattern this WP replaced.
//
// Structural/static check (reads source as text), not a runtime test --
// deliberately so, since exercising all 21 connectors' actual scrape logic
// end-to-end is out of WP 0.17's scope (see its own "do not broaden this
// WP" instruction). Connector-level runtime proof of the write-safety
// invariant itself (failed lookup -> zero writes -> 502) lives in
// test/cron-redford-theatre-runlog.test.js's WP 0.17 section.
//
// Plain Node assert, no dependencies. Run: node test/wp017-connector-coverage.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const API_DIR = path.join(REPO_DIR, "api");

// The full, current (2026-09-22) event-ingestion connector inventory --
// every cron-*.js whose write path upserts into `events` via
// `rest/v1/events?on_conflict=external_id`. Recounted for WP 0.17: 22, not
// the historical WP's stale "20" -- cron-gottagacha.js was the 21st, and
// cron-bigtimebingo.js is the 22nd, both added 2026-09-22.
// cron-editorial.js, cron-healthcheck.js, and cron-post-to-facebook.js are
// deliberately excluded -- confirmed not event-ingestion connectors (no
// `on_conflict=external_id` events upsert).
const EXPECTED_CONNECTORS = [
  "cron-belle-isle-nature-center.js",
  "cron-bigtimebingo.js",
  "cron-cinema-detroit.js",
  "cron-detroitmonthofdesign.js",
  "cron-detroittraining.js",
  "cron-dossin.js",
  "cron-feeds.js",
  "cron-gottagacha.js",
  "cron-halo.js",
  "cron-lagerhouse.js",
  "cron-metrotimes.js",
  "cron-motorcitywine.js",
  "cron-oldmiami.js",
  "cron-outerlimitslounge.js",
  "cron-planetanttheatre.js",
  "cron-playgrounddetroit.js",
  "cron-poppspacking.js",
  "cron-redford-theatre.js",
  "cron-ticketmaster.js",
  "cron-trinosophes.js",
  "cron-visitdetroit.js",
  "cron-wdet.js",
];

function run() {
  // --- 0. the inventory itself is accurate: exactly these connectors
  //     actually perform the events upsert, and no other cron-*.js does. ---
  const allCronFiles = fs
    .readdirSync(API_DIR)
    .filter((f) => f.startsWith("cron-") && f.endsWith(".js"));
  const actualIngestionConnectors = allCronFiles.filter((f) => {
    const content = fs.readFileSync(path.join(API_DIR, f), "utf8");
    return content.includes('rest/v1/events?on_conflict=external_id');
  });
  assert.deepStrictEqual(
    actualIngestionConnectors.slice().sort(),
    EXPECTED_CONNECTORS.slice().sort(),
    "the event-ingestion connector inventory must exactly match what actually upserts into events"
  );
  console.log(`PASS: connector inventory is accurate -- ${actualIngestionConnectors.length} event-ingestion connectors found`);

  // --- 1. every applicable connector requires the shared helper and calls
  //     one of its exported lookup functions. ---
  for (const file of EXPECTED_CONNECTORS) {
    const content = fs.readFileSync(path.join(API_DIR, file), "utf8");
    assert.ok(
      content.includes('require("./_lib/status-lookup")'),
      `${file} must require api/_lib/status-lookup.js`
    );
    assert.ok(
      content.includes("lookupExistingStatuses(") || content.includes("lookupExistingRows("),
      `${file} must call lookupExistingStatuses() or lookupExistingRows()`
    );
  }
  console.log(`PASS: all ${EXPECTED_CONNECTORS.length} connectors require status-lookup.js and call its exported lookup function`);

  // --- 2. none still contains the old fail-soft inline pattern (a status
  //     map built as `new Map()` right at the top of the lookup, later
  //     populated only `if (lookupResp.ok)` with no throw on failure). ---
  const FAIL_SOFT_MARKERS = [
    "existingStatusByExternalId = new Map()",
    "existingByExternalId = new Map()",
  ];
  for (const file of EXPECTED_CONNECTORS) {
    const content = fs.readFileSync(path.join(API_DIR, file), "utf8");
    for (const marker of FAIL_SOFT_MARKERS) {
      assert.ok(
        !content.includes(marker),
        `${file} must not still contain the old fail-soft pattern (${marker})`
      );
    }
  }
  console.log("PASS: no connector still contains the old fail-soft inline status-lookup pattern");

  // --- 3. every connector's lookup call site is wrapped in a try/catch
  //     that returns HTTP 502 with zero event writes on failure (structural
  //     proxy for the write-safety invariant; the invariant's actual
  //     runtime behavior is proven end-to-end in the redford-theatre
  //     connector-level test). ---
  for (const file of EXPECTED_CONNECTORS) {
    const content = fs.readFileSync(path.join(API_DIR, file), "utf8");
    assert.ok(
      /catch \(lookupErr\) \{[\s\S]{0,400}?res\.status\(502\)\.json\(\{ upserted: 0,/.test(content),
      `${file} must catch a lookup failure and respond 502 with upserted: 0`
    );
  }
  console.log("PASS: all 22 connectors' lookup failure paths respond 502 with zero upserted rows");

  console.log("\nAll wp017-connector-coverage.test.js checks passed.");
}

try {
  run();
} catch (err) {
  console.error("FAIL:", err);
  process.exitCode = 1;
}
