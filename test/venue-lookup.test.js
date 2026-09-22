// test/venue-lookup.test.js — core name -> venue_id matching layer
// (api/_lib/venue-lookup.js: normalizeVenueName / buildVenueNameToIdMap /
// resolveVenueId).
//
// Added 2026-09-22 while investigating the Product Owner's report that ~9
// production Trinosophes events -- venue "Trinosophes", source
// "Trinosophes", a venue that already has its own canonical `venues` row --
// were flagged VENUE ADDRESS/CITY in Needs Follow-up despite that. This
// exact shared-layer matching path (the one every single-venue cron,
// Trinosophes included, is supposed to rely on) had NO dedicated unit
// coverage at all before this file: every connector's own runlog test
// mocks /rest/v1/venues to return `[]` (see e.g.
// test/cron-lagerhouse-runlog.test.js, test/cron-outerlimitslounge-
// runlog.test.js, and test/cron-trinosophes-runlog.test.js before this
// change), so the "a real canonical row actually exists and should match"
// path was never exercised anywhere -- only the "no match" path was.
//
// This file closes that gap directly. Conclusion of the investigation
// (see the commit message / PO report for the full writeup): this exact
// matching code -- trim + lowercase + whitespace-collapse, exact string
// equality only, no fuzzy matching -- is correct and matches "Trinosophes"
// to a canonical "Trinosophes" row with zero issues, as every test below
// proves. No defect was found here; this file exists to make that
// provable and to guard the invariant going forward for every source that
// uses this shared layer, not just Trinosophes.
//
// Plain Node assert, no dependencies, matching this repo's existing style.
// Run: node test/venue-lookup.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "test-key";

function freshLib() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/_lib/venue-lookup.js`);
}

function mockVenuesFetch(rows) {
  return async (url) => {
    if (url.includes("/rest/v1/venues")) {
      return { ok: true, status: 200, json: async () => rows };
    }
    throw new Error("unmocked URL in test: " + url);
  };
}

async function run() {
  const { normalizeVenueName, buildVenueNameToIdMap, resolveVenueId } = freshLib();

  // --- 1. Trinosophes resolves to its canonical venue_id: an exact,
  //     already-clean name match, the same shape cron-trinosophes.js
  //     actually supplies (VENUE_NAME = "Trinosophes", no surrounding
  //     whitespace, no case difference). This is the core claim under
  //     investigation -- proves the matching layer itself has no defect
  //     against the simplest possible case. ---
  {
    global.fetch = mockVenuesFetch([
      { id: "venue-trinosophes", name: "Trinosophes" },
      { id: "venue-outer-limits", name: "Outer Limits Lounge" },
    ]);
    const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_KEY);
    const venueId = resolveVenueId(venueMap, "Trinosophes");
    assert.strictEqual(venueId, "venue-trinosophes", "an exact-name Trinosophes row must resolve to its own id");
  }
  console.log("PASS: Trinosophes resolves to its canonical venue_id on an exact name match");

  // --- 2. Case/whitespace variance in either the canonical name or the
  //     supplied name still matches -- proves normalizeVenueName's
  //     trim+lowercase+whitespace-collapse is doing real, safe work, not
  //     just a no-op that happens to pass on already-clean strings. This
  //     is the "safe deterministic normalization" the PO asked about --
  //     it is present, correct, and benefits every source that calls
  //     resolveVenueId(), not just Trinosophes. ---
  {
    global.fetch = mockVenuesFetch([{ id: "venue-trinosophes", name: "  Trinosophes  " }]);
    const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_KEY);
    assert.strictEqual(resolveVenueId(venueMap, "TRINOSOPHES"), "venue-trinosophes", "all-caps supplied name must still match");
    assert.strictEqual(resolveVenueId(venueMap, "trinosophes"), "venue-trinosophes", "all-lowercase supplied name must still match");
    assert.strictEqual(resolveVenueId(venueMap, "  Trinosophes "), "venue-trinosophes", "extra surrounding whitespace on the supplied name must still match");
    assert.strictEqual(resolveVenueId(venueMap, "Trinosophes\t"), "venue-trinosophes", "a trailing tab must still match (a real WordPress/scrape artifact class, not a contrived case)");
  }
  console.log("PASS: case and whitespace variance (on either side) does not prevent a real match");

  // --- 3. Existing valid venue matching is not broken by anything here --
  //     a second, distinct, already-known-good venue (Outer Limits Lounge,
  //     the project's own worked fixed-venue-address example) resolves
  //     correctly and independently, unaffected by Trinosophes also being
  //     present in the same venue map. ---
  {
    global.fetch = mockVenuesFetch([
      { id: "venue-trinosophes", name: "Trinosophes" },
      { id: "venue-outer-limits", name: "Outer Limits Lounge" },
      { id: "venue-lager-house", name: "The Lager House" },
    ]);
    const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_KEY);
    assert.strictEqual(resolveVenueId(venueMap, "Outer Limits Lounge"), "venue-outer-limits");
    assert.strictEqual(resolveVenueId(venueMap, "The Lager House"), "venue-lager-house");
    assert.strictEqual(resolveVenueId(venueMap, "Trinosophes"), "venue-trinosophes", "Trinosophes itself still resolves correctly alongside other venues");
  }
  console.log("PASS: existing valid venue matching (Outer Limits Lounge, The Lager House) is unaffected");

  // --- 4. Ambiguous/nonmatching venues are not falsely linked -- a
  //     near-miss (typo, extra word, different venue entirely) must
  //     resolve to null, never to the wrong id. No fuzzy matching. ---
  {
    global.fetch = mockVenuesFetch([{ id: "venue-trinosophes", name: "Trinosophes" }]);
    const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_KEY);
    assert.strictEqual(resolveVenueId(venueMap, "Trinosophez"), null, "a one-character typo must not falsely link");
    assert.strictEqual(resolveVenueId(venueMap, "Trinosophes Detroit"), null, "an extra word must not falsely link");
    assert.strictEqual(resolveVenueId(venueMap, "The Trinosophes"), null, "a leading article must not falsely link");
    assert.strictEqual(resolveVenueId(venueMap, "El Club"), null, "an entirely different venue name must not falsely link");
    assert.strictEqual(resolveVenueId(venueMap, ""), null, "an empty venue_name_raw must not falsely link");
    assert.strictEqual(resolveVenueId(venueMap, null), null, "a null venue_name_raw must not falsely link");
  }
  console.log("PASS: near-miss and nonmatching venue names resolve to null, never a false link");

  // --- 5. No canonical venues row at all for this name (the "Trinosophes
  //     genuinely isn't in the table yet" alternative hypothesis) also
  //     resolves to null, not a crash and not a guess -- distinguishes
  //     "no row exists" from "row exists but name differs" at the unit
  //     level, both of which stay unresolved by design (no fuzzy
  //     matching, no invention). ---
  {
    global.fetch = mockVenuesFetch([{ id: "venue-outer-limits", name: "Outer Limits Lounge" }]);
    const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_KEY);
    assert.strictEqual(resolveVenueId(venueMap, "Trinosophes"), null, "no canonical row for this name at all must resolve to null, not guess");
  }
  console.log("PASS: a name with no canonical row at all resolves to null (distinguishable from a near-miss only by inspecting the venues table itself)");

  // --- 6. normalizeVenueName itself: spot-check the exact transform. ---
  {
    assert.strictEqual(normalizeVenueName("Trinosophes"), "trinosophes");
    assert.strictEqual(normalizeVenueName("  Trinosophes  "), "trinosophes");
    assert.strictEqual(normalizeVenueName("Trino  sophes"), "trino sophes", "internal double-spaces collapse to one, but words are not otherwise altered");
    assert.strictEqual(normalizeVenueName(null), "");
    assert.strictEqual(normalizeVenueName(undefined), "");
  }
  console.log("PASS: normalizeVenueName's transform is exactly trim + lowercase + internal-whitespace-collapse");

  // --- 7. Structural guard: api/admin-events.js's Needs Follow-up query
  //     (incomplete=1) must keep embedding the linked venue's own
  //     address/city (`venues(address,city)`) alongside venue_id -- this
  //     is the join that lets a resolved venue_id actually clear
  //     admin.html's "venue address/city" check (see getMissingFields()'s
  //     hasLinkedVenueAddress). Without this embed present in the select
  //     string, a correctly-resolved venue_id would still leave the event
  //     flagged, no matter how correct the matching layer above is --
  //     this guards that the two halves of the invariant (resolve venue_id
  //     -> read canonical metadata) stay wired together. ---
  {
    const fs = require("fs");
    const path = require("path");
    const adminEventsSrc = fs.readFileSync(path.join(REPO_DIR, "api/admin-events.js"), "utf8");
    assert.ok(
      /incomplete[\s\S]{0,400}?venues\(address,city\)/.test(adminEventsSrc),
      "api/admin-events.js's incomplete=1 query must embed venues(address,city)"
    );
  }
  console.log("PASS: api/admin-events.js's Needs Follow-up query still embeds the linked venue's address/city");

  console.log("\nAll venue-lookup.js core matching tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
