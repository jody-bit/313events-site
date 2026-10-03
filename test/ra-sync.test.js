// test/ra-sync.test.js — scripts/ra-sync.js + api/cron-ra.js + api/admin-ra.js
//
// RA architecture simplification (2026-09-25). Plain Node assert, no
// dependencies, matching this repo's existing style (see
// test/press-coverage-linking.test.js, test/known-ra-ids.test.js).
// Run: node test/ra-sync.test.js
//
// Part 1: pure field-derivation helpers, including a production-regression
//   check against REAL historical RA data (supabase/update_2026-09-22_ra-
//   sync-1.sql's actual "RIOT: The Machine World Tour" and "100% Live
//   Techno" rows).
// Part 2: findConservativeDuplicate (the cross-source dedupe safety net).
// Part 3: startRaSyncSession, with injected I/O.
// Part 4: completeRaSyncSession, with injected I/O -- session validation,
//   the id-must-be-in-this-session guard, cancelled/duplicate/error
//   handling, and the write-failure path.
// Part 5: today's REAL 140-id candidate listing walk (test/fixtures/ra-
//   candidates-2026-09-25.json, collected live during today's RA
//   reconciliation, per the Product Owner's explicit instruction to reuse
//   it rather than re-crawl) run through startRaSyncSession end to end.
// Part 6: api/admin-ra.js's summarizeRun -- proves an incomplete
//   (outcome='started') session reads back as incomplete, never as a
//   successful sync.
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshRaSync() {
  for (const mod of [
    "scripts/ra-sync.js",
    "api/_lib/status-lookup.js",
    "api/_lib/run-log.js",
    "api/_lib/source-slugs.js",
    "api/_lib/venue-lookup.js",
    "api/_lib/ra-known-ids.js",
  ]) {
    delete require.cache[require.resolve(`${REPO_DIR}/${mod}`)];
  }
  return require(`${REPO_DIR}/scripts/ra-sync.js`);
}

function freshAdminRa() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/admin-ra.js`)];
  return require(`${REPO_DIR}/api/admin-ra.js`);
}

const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

async function run() {
  const lib = freshRaSync();

  // ============================================================
  // Part 1: pure field-derivation helpers
  // ============================================================
  {
    const { endDate, timeDisplay } = lib.deriveTimeDisplayAndEndDate(
      "2026-12-12T21:00:00-05:00",
      "2026-12-13T02:00:00-05:00"
    );
    assert.strictEqual(endDate, "2026-12-13");
    assert.strictEqual(timeDisplay, "9:00 PM–2:00 AM");
  }
  {
    // no endDate at all -- never invent one, and never invent a range
    const { endDate, timeDisplay } = lib.deriveTimeDisplayAndEndDate("2026-11-14T21:00:00-05:00", null);
    assert.strictEqual(endDate, null);
    assert.strictEqual(timeDisplay, "9:00 PM");
  }
  {
    // endDate on the SAME calendar date as start -- end_date stays null
    const { endDate } = lib.deriveTimeDisplayAndEndDate("2026-11-14T21:00:00-05:00", "2026-11-14T23:00:00-05:00");
    assert.strictEqual(endDate, null);
  }
  console.log("PASS: deriveTimeDisplayAndEndDate -- real overnight-club-night shape, same-day shape, never-invented end date");

  {
    const { street, city } = lib.parseAddressText("15 South Saginaw Street, Pontiac, MI 48342");
    assert.strictEqual(street, "15 South Saginaw Street");
    assert.strictEqual(city, "Pontiac");
  }
  {
    const { street, city } = lib.parseAddressText("2515 Caniff St, Hamtramck, MI 48212");
    assert.strictEqual(street, "2515 Caniff St");
    assert.strictEqual(city, "Hamtramck");
  }
  {
    // no ", MI" suffix at all -- kept whole, city never guessed
    const { street, city } = lib.parseAddressText("Somewhere downtown");
    assert.strictEqual(street, "Somewhere downtown");
    assert.strictEqual(city, null);
  }
  {
    const { street, city } = lib.parseAddressText("");
    assert.strictEqual(street, null);
    assert.strictEqual(city, null);
  }
  console.log("PASS: parseAddressText -- real addresses, and no city guessed when RA's text doesn't state one");

  {
    assert.deepStrictEqual(lib.deriveOffer(0), { priceFrom: null, isFree: true });
    assert.deepStrictEqual(lib.deriveOffer(25), { priceFrom: 25, isFree: false });
    assert.deepStrictEqual(lib.deriveOffer("$15.50"), { priceFrom: 15.5, isFree: false });
    assert.deepStrictEqual(lib.deriveOffer(null), { priceFrom: null, isFree: false });
    assert.deepStrictEqual(lib.deriveOffer(undefined), { priceFrom: null, isFree: false });
  }
  console.log("PASS: deriveOffer -- price=0 is explicit free, missing price is unknown (never assumed free)");

  {
    assert.strictEqual(lib.deriveTicketUrl("2461133", null), "https://ra.co/events/2461133");
    assert.strictEqual(lib.deriveTicketUrl("2461133", "https://ra.co/events/2461133"), "https://ra.co/events/2461133");
    assert.strictEqual(lib.deriveTicketUrl("2461133", "not-a-url"), "https://ra.co/events/2461133");
  }
  console.log("PASS: deriveTicketUrl");

  {
    assert.strictEqual(lib.deriveImageUrl("https://images.ra.co/abc.png"), "https://images.ra.co/abc.png");
    assert.strictEqual(lib.deriveImageUrl(["https://images.ra.co/abc.png", "https://images.ra.co/def.png"]), "https://images.ra.co/abc.png");
    assert.strictEqual(lib.deriveImageUrl(null), null);
    assert.strictEqual(lib.deriveImageUrl("not-a-url"), null);
  }
  console.log("PASS: deriveImageUrl");

  {
    const stripped = lib.deriveDescription("<p>RIOT plays <b>Elektricity</b>.</p>  Doors 9pm.");
    assert.strictEqual(stripped, "RIOT plays Elektricity . Doors 9pm.");
    assert.strictEqual(lib.deriveDescription(""), null);
    assert.strictEqual(lib.deriveDescription(null), null);
    const long = "x".repeat(600);
    assert.strictEqual(lib.deriveDescription(long).length, 501); // 500 chars + the ellipsis char
  }
  console.log("PASS: deriveDescription -- HTML stripped, whitespace collapsed, length capped");

  {
    assert.ok(lib.isCancelledTitle("[CANCELLED] Some Show"));
    assert.ok(lib.isCancelledTitle("[cancelled] lowercase too"));
    assert.ok(!lib.isCancelledTitle("Not Cancelled"));
    assert.ok(!lib.isCancelledTitle(""));
  }
  console.log("PASS: isCancelledTitle");

  {
    assert.strictEqual(lib.deriveCategory("Drag Brunch Extravaganza", ""), "theatre");
    assert.strictEqual(lib.deriveCategory("Friday Night Burlesque", ""), "theatre");
    assert.strictEqual(lib.deriveCategory("Free Film Screening", ""), "film");
    assert.strictEqual(lib.deriveCategory("Fall Craft Fair", ""), "community");
    assert.strictEqual(lib.deriveCategory("New Gallery Opening", ""), "visual");
    assert.strictEqual(lib.deriveCategory("Live Band Night", ""), "music");
    // RA's dominant, unmarked content -- a plain DJ/club night -- defaults
    // to nightlife, matching every historical RA insert in
    // supabase/update_2026-09-*_ra-*.sql.
    assert.strictEqual(lib.deriveCategory("RIOT: The Machine World Tour", "RIOT plays Elektricity in Pontiac."), "nightlife");
  }
  console.log("PASS: deriveCategory -- translated keyword rules, nightlife default matches 100% of real historical RA rows");

  // --- deriveEventRow: PRODUCTION-REGRESSION -- the two real rows from
  // supabase/update_2026-09-22_ra-sync-1.sql, reconstructed as the
  // MusicEvent-JSON-LD-shaped input the device would submit, asserted
  // against the REAL row that file actually inserted. ---
  {
    const venueMap = new Map(); // no canonical venues row for Elektricity in this test -- venue_id null is correct
    const raw = {
      id: "ra-2461133",
      title: "RIOT: The Machine World Tour",
      description: "RIOT: The Machine World Tour plays Elektricity in Pontiac. Doors at 9pm, 18+.",
      startDate: "2026-12-12T21:00:00-05:00",
      endDate: "2026-12-13T02:00:00-05:00",
      venueName: "Elektricity",
      address: "15 South Saginaw Street, Pontiac, MI 48342",
      image: "https://images.ra.co/4dc17dd530ddabe44b827c729b0bac137d06890f.png",
      offersPrice: null,
      url: null,
    };
    const { row, errors } = lib.deriveEventRow(raw, venueMap);
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(row.external_id, "ra-2461133");
    assert.strictEqual(row.title, "RIOT: The Machine World Tour");
    assert.strictEqual(row.category, "nightlife");
    assert.strictEqual(row.venue_name_raw, "Elektricity");
    assert.strictEqual(row.venue_address_raw, "15 South Saginaw Street");
    assert.strictEqual(row.venue_city_raw, "Pontiac");
    assert.strictEqual(row.start_date, "2026-12-12");
    assert.strictEqual(row.end_date, "2026-12-13");
    assert.strictEqual(row.time_display, "9:00 PM–2:00 AM");
    assert.strictEqual(row.is_free, false);
    assert.strictEqual(row.price_from, null);
    assert.strictEqual(row.ticket_url, "https://ra.co/events/2461133");
    assert.strictEqual(row.image_url, "https://images.ra.co/4dc17dd530ddabe44b827c729b0bac137d06890f.png");
    assert.strictEqual(row.source, "Resident Advisor");
    assert.strictEqual(row.note, null);
  }
  console.log("PASS: deriveEventRow -- exact production-regression match against the real ra-2461133 row");

  {
    // ra-2466647 -- the real venue-TBA case: no address anywhere.
    const raw = {
      id: "ra-2466647",
      title: "100% Live Techno – All Hardware Sets / Movement Opening Party",
      description: "Detroit's Movement Festival Weekend opening party.",
      startDate: "2027-05-28T21:00:00-04:00",
      endDate: "2027-05-29T06:00:00-04:00",
      venueName: null,
      address: null,
      image: "https://images.ra.co/7a40b29fedd962c58ebc86bf5363c7db440aebf0.jpg",
      offersPrice: null,
      url: null,
    };
    const { row, errors } = lib.deriveEventRow(raw, new Map());
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(row.venue_name_raw, "Location TBA");
    assert.strictEqual(row.venue_address_raw, null);
    assert.strictEqual(row.venue_city_raw, null);
    assert.strictEqual(row.note, "Venue location not yet announced by the event.");
    assert.strictEqual(row.end_date, "2027-05-29");
  }
  console.log("PASS: deriveEventRow -- real venue-TBA case (ra-2466647), no address anywhere -> honest caveat, never guessed");

  {
    // missing title / missing startDate -- never silently defaulted
    assert.deepStrictEqual(lib.deriveEventRow({ id: "ra-1", startDate: "2026-01-01T20:00:00-05:00" }, new Map()).errors, ["MISSING_TITLE"]);
    assert.deepStrictEqual(lib.deriveEventRow({ id: "ra-1", title: "Something" }, new Map()).errors, ["MISSING_OR_INVALID_START_DATE"]);
  }
  console.log("PASS: deriveEventRow -- missing required fields reported, never defaulted");

  // ============================================================
  // Part 2: findConservativeDuplicate
  // ============================================================
  {
    // A real non-RA duplicate (null external_id) IS found and reported.
    const fetchFn = async (url) => {
      assert.ok(url.includes("start_date=gte."));
      assert.ok(!url.includes("status="), "the dedupe check must not filter by status -- a rejected legacy row still counts");
      return { ok: true, json: async () => [{ id: "evt-1", title: "A Dub Supreme", venue_name_raw: "MotorCity Wine", external_id: null, start_date: "2026-09-27" }] };
    };
    const match = await lib.findConservativeDuplicate(
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      { title: "A Dub Supreme", venue_name_raw: "MotorCity Wine", start_date: "2026-09-27" },
      fetchFn
    );
    assert.ok(match);
    assert.strictEqual(match.id, "evt-1");
  }
  console.log("PASS: findConservativeDuplicate -- catches the real 'A Dub Supreme'-style legacy-import duplicate");

  {
    // An existing row that IS itself an RA row (ra-<id> external_id) must
    // never be reported as a "duplicate" of a new RA candidate -- that's
    // the primary external_id diff's job, not this check's.
    const fetchFn = async () => ({
      ok: true,
      json: async () => [{ id: "evt-2", title: "Some RA Event", venue_name_raw: "Elektricity", external_id: "ra-999", start_date: "2026-10-01" }],
    });
    const match = await lib.findConservativeDuplicate(
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      { title: "Some RA Event", venue_name_raw: "Elektricity", start_date: "2026-10-01" },
      fetchFn
    );
    assert.strictEqual(match, null, "an existing ra-<id> row must never be reported as a cross-source duplicate of itself");
  }
  console.log("PASS: findConservativeDuplicate -- never matches against another RA row (that's the external_id diff's job)");

  {
    // fails SOFT on a lookup error -- never blocks ingestion of a
    // genuinely new event over a transient network hiccup.
    const fetchFn = async () => {
      throw new Error("network down");
    };
    const match = await lib.findConservativeDuplicate(
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      { title: "Whatever Happens Here", venue_name_raw: "Somewhere", start_date: "2026-10-01" },
      fetchFn
    );
    assert.strictEqual(match, null);
  }
  console.log("PASS: findConservativeDuplicate -- fails soft (no match) on a lookup error, never blocks ingestion");

  // ------------------------------------------------------------
  // Part 2b: title identity check (2026-10-01 production dry-run
  // correction). Regression cohort is the REAL 8-match output of a real
  // 90-candidate production dry run, not invented fixtures -- see
  // scripts/ra-sync.js's own header comment on titleIdentityCompatible for
  // the full incident. Three real pairs that must stay duplicates, four
  // real pairs that must NOT auto-match merely because venue/date were
  // close, one real pair that must stay unresolved/ambiguous rather than
  // either wrongly merged or wrongly rejected outright.
  // ------------------------------------------------------------
  const REAL_DUPLICATE_REGRESSION_CASES = [
    // [titleA, titleB, expectCompatible, label]
    ["Jazz is Dead presents Cortex with Adrian Younge and J.Rocc", "Jazz Is Dead presents Cortex with Adrian Younge and J.Rocc", true, "near-identical title (case only) -- a real legacy duplicate"],
    ["Grave Rave", "Grave Rave", true, "exact title match -- a real cross-source (VisitDetroit) duplicate"],
    ["Amplify Grand Opening", "Amplify Grand Opening", true, "exact title match -- a real cross-source duplicate"],
    ["Ø[Phase] - Holden Federico - Jėck - Lincoln Factory", "Valentino Khan", false, "two different real shows, same venue, consecutive nights -- venue proximity alone must never match"],
    ["DENNETT", "Sam Alfred — USA Tour", false, "two different real shows, same venue, consecutive nights"],
    ["Siren: Venus In Furs", "Industry Mondays", false, "a one-off show vs. a different recurring weekly series at the same venue"],
    ["House Your Life - DJ Minx Birthday Edition", "Jazz Is Dead presents Cortex with Adrian Younge and J.Rocc", false, "the SAME existing row that correctly matches a different RA candidate above must NOT also match this unrelated one"],
    ["Devil's Night", "Devil's Night Film Festival", false, "a generic phrase that is a true substring of a longer, structurally different event name -- must stay unresolved, not auto-merged"],
  ];

  for (const [titleA, titleB, expected, label] of REAL_DUPLICATE_REGRESSION_CASES) {
    const got = lib.titleIdentityCompatible(titleA, titleB);
    assert.strictEqual(got, expected, `titleIdentityCompatible(${JSON.stringify(titleA)}, ${JSON.stringify(titleB)}) -- ${label}`);
  }
  console.log("PASS: titleIdentityCompatible -- all 8 real production dry-run regression cases classified correctly");

  // Symmetry is the actual mechanism (not a lookup table) -- order must
  // never matter, and a title must always be compatible with itself.
  for (const [titleA, titleB] of REAL_DUPLICATE_REGRESSION_CASES) {
    assert.strictEqual(lib.titleIdentityCompatible(titleA, titleB), lib.titleIdentityCompatible(titleB, titleA), "the check must be symmetric regardless of argument order");
  }
  assert.strictEqual(lib.titleIdentityCompatible("Grave Rave", "Grave Rave"), true);
  assert.strictEqual(lib.titleIdentityCompatible("", "Grave Rave"), false, "a blank title must never vacuously match");
  assert.strictEqual(lib.titleIdentityCompatible(null, undefined), false, "non-string input must never throw or vacuously match");
  console.log("PASS: titleIdentityCompatible -- symmetric, never vacuously true on blank/missing input");

  {
    // End-to-end: findConservativeDuplicate itself must reject a
    // venue-only/date-only match even though the broad SQL fetch legitimately
    // surfaces the row (recall is unchanged -- only the final accept
    // decision is stricter now).
    const fetchFn = async (url) => {
      assert.ok(url.includes("venue_name_raw.ilike"), "the broad recall fetch must still search by venue -- that part is unchanged");
      return {
        ok: true,
        json: async () => [{ id: "evt-sam-alfred", title: "Sam Alfred — USA Tour", venue_name_raw: "Magic Stick", external_id: null, start_date: "2026-10-02" }],
      };
    };
    const match = await lib.findConservativeDuplicate(
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      { title: "DENNETT", venue_name_raw: "Magic Stick", start_date: "2026-10-03" },
      fetchFn
    );
    assert.strictEqual(match, null, "a venue-only match within the date window must never be accepted as a duplicate on its own");
  }
  console.log("PASS: findConservativeDuplicate -- end to end, a real venue-only near-match (DENNETT/Sam Alfred, Magic Stick) is correctly rejected");

  {
    // End-to-end: a genuine near-identical title (the Jazz Is Dead case)
    // still gets caught as a duplicate -- the fix must not have made this
    // over-conservative to the point of losing real catches.
    const fetchFn = async () => ({
      ok: true,
      json: async () => [{ id: "evt-jazz-is-dead", title: "Jazz Is Dead presents Cortex with Adrian Younge and J.Rocc", venue_name_raw: "Lincoln Factory", external_id: null, start_date: "2026-10-11" }],
    });
    const match = await lib.findConservativeDuplicate(
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      { title: "Jazz is Dead presents Cortex with Adrian Younge and J.Rocc", venue_name_raw: "Lincoln Factory", start_date: "2026-10-11" },
      fetchFn
    );
    assert.ok(match, "a genuine near-identical-title duplicate must still be caught after the fix");
    assert.strictEqual(match.id, "evt-jazz-is-dead");
  }
  console.log("PASS: findConservativeDuplicate -- end to end, a genuine near-identical-title duplicate (Jazz Is Dead) is still correctly caught");

  // ============================================================
  // Part 3: startRaSyncSession
  // ============================================================
  {
    let patchedSessionData = null;
    const fetchFn = async (url, opts) => {
      assert.ok(url.includes("/source_runs?id=eq.run-123"));
      assert.strictEqual(opts.method, "PATCH");
      patchedSessionData = JSON.parse(opts.body).session_data;
      return { ok: true, text: async () => "" };
    };
    const lookupExistingRowsFn = async (url, key, ids) => {
      // ra-100 and ra-200 already exist; everything else is new
      const map = new Map();
      for (const id of ids) if (id === "ra-100" || id === "ra-200") map.set(id, { external_id: id });
      return map;
    };
    const startRunFn = async (slug) => {
      assert.strictEqual(slug, "resident-advisor");
      return { runId: "run-123", startedAtMs: Date.now() };
    };

    const result = await lib.startRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      candidateIds: ["ra-100", "ra-200", "ra-2485347", "ra-300", "ra-301", "ra-100"], // ra-100 duplicated on purpose
      fetchFn, lookupExistingRowsFn, startRunFn,
    });

    assert.strictEqual(result.runId, "run-123");
    assert.strictEqual(result.candidateCount, 5); // deduped
    assert.strictEqual(result.knownCount, 3); // ra-100, ra-200, ra-2485347 (legacy exclusion)
    assert.deepStrictEqual(result.ids.sort(), ["ra-300", "ra-301"]);
    assert.strictEqual(result.newCount, 2);
    assert.strictEqual(result.allNewCount, 2);
    assert.ok(patchedSessionData, "session_data must be persisted before start() returns");
    assert.deepStrictEqual(patchedSessionData.newIds.sort(), ["ra-300", "ra-301"]);
    assert.strictEqual(patchedSessionData.phase, "started");
  }
  console.log("PASS: startRaSyncSession -- dedupe, known/new diff, legacy exclusion, session_data persisted, cap-ready shape");

  {
    // identity-widening: a candidate with no row under its own
    // external_id, but a prior conservative dedupe match recorded in
    // event_source_identities, must be classified "known", not "new" --
    // this is the fix for the ra-2547930/ra-2512641/ra-2524562/
    // ra-2513540 pattern (2026-10-03 coverage review): without this, a
    // genuinely-represented event keeps reappearing as new forever.
    const fetchFn = async () => ({ ok: true, text: async () => "" });
    const lookupExistingRowsFn = async () => new Map(); // nothing known via external_id directly
    const lookupKnownSourceIdsFn = async (url, key, source, bareIds) => {
      assert.strictEqual(source, "ra");
      assert.deepStrictEqual(bareIds.sort(), ["400", "401"]);
      return new Set(["400"]); // ra-400 has a recorded identity match; ra-401 does not
    };
    const startRunFn = async () => ({ runId: "run-identity", startedAtMs: Date.now() });

    const result = await lib.startRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      candidateIds: ["ra-400", "ra-401"],
      fetchFn, lookupExistingRowsFn, lookupKnownSourceIdsFn, startRunFn,
    });

    assert.strictEqual(result.candidateCount, 2);
    assert.strictEqual(result.knownCount, 1, "ra-400 is known via event_source_identities even with no external_id row");
    assert.deepStrictEqual(result.ids, ["ra-401"]);
  }
  console.log("PASS: startRaSyncSession -- a candidate known only via event_source_identities (no external_id row) is classified known, not new");

  {
    // the identity-widening lookup itself fails soft -- a lookup error
    // must fall back to exactly pre-existing behavior (classified by
    // external_id alone), never abort the run.
    const fetchFn = async () => ({ ok: true, text: async () => "" });
    const lookupExistingRowsFn = async () => new Map();
    const lookupKnownSourceIdsFn = async () => { throw new Error("identities table unreachable"); };
    const startRunFn = async () => ({ runId: "run-identity-fail", startedAtMs: Date.now() });

    await assert.rejects(
      () => lib.startRaSyncSession({
        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, candidateIds: ["ra-500"],
        fetchFn, lookupExistingRowsFn, lookupKnownSourceIdsFn, startRunFn,
      })
    );
    // NOTE: the real lookupKnownSourceIds implementation never throws (it
    // fails soft internally -- see test/event-source-identities.test.js).
    // This test's throwing mock exists only to document that
    // startRaSyncSession itself adds no new fail-closed behavior here;
    // the production default is what actually guarantees soft failure.
  }
  console.log("PASS: startRaSyncSession -- identity widening uses the injected function as-is (soft-failure is event-source-identities.js's own contract, not re-implemented here)");

  {
    // maxNewPerRun cap, same as the old ~30/run limit
    const fetchFn = async () => ({ ok: true, text: async () => "" });
    const lookupExistingRowsFn = async () => new Map();
    const startRunFn = async () => ({ runId: "run-cap", startedAtMs: Date.now() });
    const candidateIds = Array.from({ length: 50 }, (_, i) => `ra-${9000 + i}`);
    const result = await lib.startRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, candidateIds, maxNewPerRun: 30,
      fetchFn, lookupExistingRowsFn, startRunFn,
    });
    assert.strictEqual(result.allNewCount, 50);
    assert.strictEqual(result.newCount, 30);
    assert.strictEqual(result.ids.length, 30);
  }
  console.log("PASS: startRaSyncSession -- caps ids-requiring-detail-fetch at maxNewPerRun, allNewCount still reports the true total");

  {
    // run-log logging itself failing (startRun -> null) must NOT silently
    // hand back a sessionless diff -- see the deliberate deviation from
    // run-log.js's normal fire-and-forget contract, documented in
    // scripts/ra-sync.js.
    const lookupExistingRowsFn = async () => new Map();
    const startRunFn = async () => null;
    await assert.rejects(
      () => lib.startRaSyncSession({
        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, candidateIds: ["ra-1"],
        fetchFn: async () => ({ ok: true, text: async () => "" }),
        lookupExistingRowsFn, startRunFn,
      }),
      lib.RaSyncSessionError
    );
  }
  console.log("PASS: startRaSyncSession -- refuses to proceed with no session id when source_runs logging itself fails");

  {
    // malformed candidateIds propagates the reused validation error
    await assert.rejects(
      () => lib.startRaSyncSession({
        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, candidateIds: ["not-an-ra-id"],
        fetchFn: async () => ({ ok: true, text: async () => "" }),
        lookupExistingRowsFn: async () => new Map(),
        startRunFn: async () => ({ runId: "x", startedAtMs: Date.now() }),
      }),
      (err) => err.name === "RaKnownIdsValidationError"
    );
  }
  console.log("PASS: startRaSyncSession -- malformed candidateIds rejected via the reused validator");

  {
    // listingMetadata: persisted for every submitted candidate id (not just
    // this run's capped detail-fetch batch), foreign ids and non-whitelisted/
    // malformed fields dropped rather than invented or silently coerced, and
    // allNewIds comes back uncapped even though `ids` stays capped -- this is
    // the actual repair for "listing acquisition must persist all newly
    // discovered ids and their listing-card evidence, not only the capped
    // detail batch" (2026-09-29 incident: RA blocked detail pages after a
    // successful listing walk and the run closed with zero durable evidence).
    let patchedSessionData = null;
    const fetchFn = async (url, opts) => {
      patchedSessionData = JSON.parse(opts.body).session_data;
      return { ok: true, text: async () => "" };
    };
    const candidateIds = Array.from({ length: 5 }, (_, i) => `ra-${5000 + i}`);
    const result = await lib.startRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, candidateIds, maxNewPerRun: 2,
      listingMetadata: {
        "ra-5000": { title: "Real Event Title", date: "2026-10-15", venueName: "TV Lounge", city: "Detroit", url: "https://ra.co/events/5000", extraJunkField: "dropped" },
        "ra-5001": { title: "  Trimmed Title  ", displayedTime: 12345 }, // non-string field dropped, string trimmed
        "ra-9999999": { title: "id not in this session's candidateIds -- must be dropped entirely" },
        "ra-5002": {},
      },
      fetchFn,
      lookupExistingRowsFn: async () => new Map(),
      startRunFn: async () => ({ runId: "run-meta", startedAtMs: Date.now() }),
    });

    assert.strictEqual(result.allNewCount, 5);
    assert.strictEqual(result.newCount, 2); // still capped
    assert.deepStrictEqual(result.allNewIds.sort(), candidateIds.slice().sort()); // uncapped backlog
    assert.strictEqual(result.listingMetadataCount, 2); // ra-5002 had no usable fields, ra-9999999 was foreign
    assert.ok(patchedSessionData.listingMetadata, "listingMetadata must be persisted in session_data");
    assert.deepStrictEqual(patchedSessionData.listingMetadata["ra-5000"], {
      title: "Real Event Title", date: "2026-10-15", venueName: "TV Lounge", city: "Detroit", url: "https://ra.co/events/5000",
    });
    assert.strictEqual(patchedSessionData.listingMetadata["ra-5001"].title, "Trimmed Title");
    assert.strictEqual(patchedSessionData.listingMetadata["ra-5001"].displayedTime, undefined);
    assert.strictEqual(patchedSessionData.listingMetadata["ra-9999999"], undefined);
    assert.strictEqual(patchedSessionData.listingMetadata["ra-5002"], undefined);
    assert.deepStrictEqual(patchedSessionData.allNewIds.sort(), candidateIds.slice().sort());
  }
  console.log("PASS: startRaSyncSession -- listingMetadata persisted per-id (foreign ids/fields dropped, never invented), allNewIds returned uncapped");

  {
    // no listingMetadata at all -- must not throw, must behave exactly as
    // before this repair (backward compatible for any caller that doesn't
    // send it yet).
    const result = await lib.startRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, candidateIds: ["ra-6000"],
      fetchFn: async () => ({ ok: true, text: async () => "" }),
      lookupExistingRowsFn: async () => new Map(),
      startRunFn: async () => ({ runId: "run-nometa", startedAtMs: Date.now() }),
    });
    assert.strictEqual(result.listingMetadataCount, 0);
    assert.deepStrictEqual(result.allNewIds, ["ra-6000"]);
  }
  console.log("PASS: startRaSyncSession -- omitted listingMetadata is backward compatible (empty, never throws)");

  // ============================================================
  // Part 4: completeRaSyncSession
  // ============================================================
  function makeCompleteFetch({ run, dupeMatch, mergePatchOk = true } = {}) {
    const calls = [];
    const fetchFn = async (url, opts) => {
      const method = (opts && opts.method) || "GET";
      let body = null;
      if (opts && opts.body) {
        try { body = JSON.parse(opts.body); } catch { body = opts.body; }
      }
      calls.push({ url, method, body });
      if (url.includes("/source_runs?id=eq.")) {
        if (opts && opts.method === "PATCH") return { ok: true, text: async () => "" };
        return { ok: true, json: async () => (run ? [run] : []) };
      }
      if (url.includes("/rest/v1/events?start_date=gte.")) {
        return { ok: true, json: async () => (dupeMatch ? [dupeMatch] : []) };
      }
      if (url.includes("/rest/v1/events?on_conflict=external_id")) {
        return { ok: true, text: async () => "" };
      }
      // Per-row blank-fields-only merge PATCH (2026-10-01, "protect
      // enriched data") -- targets an EXISTING row by external_id, never
      // the bulk on_conflict=external_id insert path above.
      if (url.includes("/rest/v1/events?external_id=eq.") && method === "PATCH") {
        if (!mergePatchOk) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, json: async () => [body] };
      }
      throw new Error("unexpected fetch: " + url);
    };
    return { fetchFn, calls };
  }

  const baseRun = {
    id: "run-1",
    source_slug: "resident-advisor",
    outcome: "started",
    started_at: new Date().toISOString(),
    session_data: { phase: "started", newIds: ["ra-300", "ra-301"], candidateCount: 5, knownCount: 3, allNewCount: 2 },
  };

  {
    const { fetchFn, calls } = makeCompleteFetch({ run: baseRun });
    let finished = null;
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1",
      events: [
        { id: "ra-300", title: "RIOT: The Machine World Tour", description: "desc", startDate: "2026-12-12T21:00:00-05:00", endDate: "2026-12-13T02:00:00-05:00", venueName: "Elektricity", address: "15 South Saginaw Street, Pontiac, MI 48342" },
      ],
      fetchFn,
      finishRunFn: async (handle, fields) => { finished = { handle, fields }; },
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map(),
    });
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.duplicates, 0);
    assert.strictEqual(result.errors, 0);
    assert.ok(calls.some((c) => c.url.includes("on_conflict=external_id") && c.method === "POST"));
    assert.strictEqual(finished.fields.outcome, "success");
    assert.strictEqual(finished.fields.records_written, 1);
  }
  console.log("PASS: completeRaSyncSession -- happy path imports a real new event and finishes the run as success");

  {
    // an id the session never promised -- rejected, never silently upserted
    const { fetchFn } = makeCompleteFetch({ run: baseRun });
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1",
      events: [{ id: "ra-999", title: "Uninvited Event", startDate: "2026-12-12T21:00:00-05:00" }],
      fetchFn,
      finishRunFn: async () => {},
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map(),
    });
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.errors, 1);
    assert.strictEqual(result.errorDetail[0].reason, "UNEXPECTED_ID_NOT_IN_SESSION");
  }
  console.log("PASS: completeRaSyncSession -- an id outside this session's own diff is rejected, never upserted");

  {
    // cancelled title -- skipped, never inserted
    const { fetchFn } = makeCompleteFetch({ run: baseRun });
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1",
      events: [{ id: "ra-300", title: "[CANCELLED] RIOT: The Machine World Tour", startDate: "2026-12-12T21:00:00-05:00" }],
      fetchFn,
      finishRunFn: async () => {},
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map(),
    });
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.skipped, 1);
  }
  console.log("PASS: completeRaSyncSession -- [CANCELLED]-prefixed titles are skipped, never inserted");

  {
    // conservative dedupe -- a real cross-source match blocks insertion
    // without touching the matched row
    const { fetchFn, calls } = makeCompleteFetch({
      run: baseRun,
      dupeMatch: { id: "evt-legacy", title: "RIOT: The Machine World Tour", venue_name_raw: "Elektricity", external_id: null, start_date: "2026-12-12" },
    });
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1",
      events: [{ id: "ra-300", title: "RIOT: The Machine World Tour", startDate: "2026-12-12T21:00:00-05:00", venueName: "Elektricity" }],
      fetchFn,
      finishRunFn: async () => {},
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map(),
    });
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.duplicates, 1);
    assert.strictEqual(result.duplicateDetail[0].matchedEventId, "evt-legacy");
    assert.ok(!calls.some((c) => c.method === "PATCH" && c.url.includes("events")), "a conservative-dedupe match must never write to the matched event");
  }
  console.log("PASS: completeRaSyncSession -- a conservative cross-source match blocks the new row and never touches the existing one");

  {
    // event_source_identities persistence (2026-10-03) -- the same
    // conservative cross-source match above must also persist the RA
    // identity against the matched event, via the injected
    // recordSourceIdentityFn, with the exact eventId/source/sourceId the
    // match found -- and duplicateDetail must reflect that the write
    // actually succeeded.
    const { fetchFn } = makeCompleteFetch({
      run: baseRun,
      dupeMatch: { id: "evt-legacy-2", title: "RIOT: The Machine World Tour", venue_name_raw: "Elektricity", external_id: null, start_date: "2026-12-12" },
    });
    const recorded = [];
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1",
      events: [{ id: "ra-300", title: "RIOT: The Machine World Tour", startDate: "2026-12-12T21:00:00-05:00", venueName: "Elektricity" }],
      fetchFn,
      finishRunFn: async () => {},
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map(),
      recordSourceIdentityFn: async (url, key, identity) => {
        recorded.push(identity);
        assert.strictEqual(url, SUPABASE_URL);
        assert.strictEqual(key, SUPABASE_SERVICE_ROLE_KEY);
        return true;
      },
    });
    assert.strictEqual(result.duplicates, 1);
    assert.strictEqual(recorded.length, 1, "a duplicate match must have its identity recorded exactly once");
    assert.deepStrictEqual(recorded[0], { eventId: "evt-legacy-2", source: "ra", sourceId: "300" });
    assert.strictEqual(result.duplicateDetail[0].identityRecorded, true, "duplicateDetail must reflect that the identity write actually succeeded");
  }
  console.log("PASS: completeRaSyncSession -- a conservative cross-source match persists the RA identity via recordSourceIdentityFn with the correct eventId/source/sourceId");

  {
    // no session at all
    const { fetchFn } = makeCompleteFetch({ run: null });
    await assert.rejects(
      () => lib.completeRaSyncSession({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "does-not-exist", events: [], fetchFn }),
      lib.RaSyncSessionError
    );
  }
  console.log("PASS: completeRaSyncSession -- refuses to complete a session that doesn't exist");

  {
    // already-finished session -- refuses double-completion
    const finishedRun = { ...baseRun, outcome: "success" };
    const { fetchFn } = makeCompleteFetch({ run: finishedRun });
    await assert.rejects(
      () => lib.completeRaSyncSession({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1", events: [], fetchFn }),
      lib.RaSyncSessionError
    );
  }
  console.log("PASS: completeRaSyncSession -- refuses to complete an already-finished session (no double-completion)");

  {
    // wrong source_slug -- refuses to complete a run from another connector
    const wrongRun = { ...baseRun, source_slug: "trinosophes" };
    const { fetchFn } = makeCompleteFetch({ run: wrongRun });
    await assert.rejects(
      () => lib.completeRaSyncSession({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1", events: [], fetchFn }),
      lib.RaSyncSessionError
    );
  }
  console.log("PASS: completeRaSyncSession -- refuses to complete a run that belongs to a different source");

  {
    // write failure -- outcome 'failed', nothing reported imported
    const fetchFn = async (url, opts) => {
      if (url.includes("/source_runs?id=eq.")) {
        if (opts && opts.method === "PATCH") return { ok: true, text: async () => "" };
        return { ok: true, json: async () => [baseRun] };
      }
      if (url.includes("/rest/v1/events?start_date=gte.")) return { ok: true, json: async () => [] };
      if (url.includes("on_conflict=external_id")) return { ok: false, text: async () => "db exploded" };
      throw new Error("unexpected fetch: " + url);
    };
    let finished = null;
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1",
      events: [{ id: "ra-300", title: "RIOT: The Machine World Tour", startDate: "2026-12-12T21:00:00-05:00" }],
      fetchFn,
      finishRunFn: async (handle, fields) => { finished = fields; },
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map(),
    });
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.errors, 1);
    assert.strictEqual(result.errorDetail[0].reason, "WRITE_FAILED");
    assert.strictEqual(finished.outcome, "failed");
  }
  console.log("PASS: completeRaSyncSession -- a real database write failure reports outcome='failed', zero imported, never a false success");

  {
    // 2026-09-29 incident, reproduced directly: a session expected new ids
    // (newIds non-empty) but RA blocked detail-page acquisition entirely, so
    // the device submitted events: [] per the existing fail-closed contract
    // ("stop, commit whatever completed, even zero is fine"). That must read
    // back as a run that did NOT actually finish its work -- outcome
    // 'partial', not a quiet 'success' with imported=0 indistinguishable from
    // a genuinely empty diff.
    const blockedRun = {
      id: "run-blocked",
      source_slug: "resident-advisor",
      outcome: "started",
      started_at: new Date().toISOString(),
      session_data: { phase: "started", newIds: ["ra-300", "ra-301"], candidateCount: 5, knownCount: 3, allNewCount: 2 },
    };
    const { fetchFn } = makeCompleteFetch({ run: blockedRun });
    let finished = null;
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-blocked",
      events: [],
      fetchFn,
      finishRunFn: async (handle, fields) => { finished = fields; },
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map(),
    });
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.errors, 0); // not an error -- a legitimate, expected fail-closed stop
    assert.strictEqual(finished.outcome, "partial");
  }
  console.log("PASS: completeRaSyncSession -- expected new ids but zero addressed (RA blocked mid-run) closes as outcome='partial', never a false 'success'");

  {
    // Contrast case: a session that genuinely had nothing new to fetch
    // (newIds: []) completing with events: [] is a real, honest success --
    // must NOT be misclassified as partial just because addressedCount is 0.
    const emptyDiffRun = {
      id: "run-empty-diff",
      source_slug: "resident-advisor",
      outcome: "started",
      started_at: new Date().toISOString(),
      session_data: { phase: "started", newIds: [], candidateCount: 5, knownCount: 5, allNewCount: 0 },
    };
    const { fetchFn } = makeCompleteFetch({ run: emptyDiffRun });
    let finished = null;
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-empty-diff",
      events: [],
      fetchFn,
      finishRunFn: async (handle, fields) => { finished = fields; },
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map(),
    });
    assert.strictEqual(finished.outcome, "success");
  }
  console.log("PASS: completeRaSyncSession -- a genuinely empty diff (nothing new found) still closes as outcome='success', not misclassified as partial");

  {
    // "Protect enriched data" (2026-10-01): an existing row for this
    // external_id already has venue_id/description independently
    // resolved (e.g. by scripts/ra-candidate-promotion.js + the generic
    // enrichment pass, since RA re-blocked on this id for days). A LATER
    // successful RA detail fetch for the SAME id must never clobber
    // those already-resolved fields -- only still-blank fields may be
    // filled, and status must still be preserved exactly as before.
    const { fetchFn, calls } = makeCompleteFetch({ run: baseRun });
    let finished = null;
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1",
      events: [
        { id: "ra-300", title: "RIOT: The Machine World Tour", description: "RA's own generic description", startDate: "2026-12-12T21:00:00-05:00", venueName: "Elektricity", address: "15 South Saginaw Street, Pontiac, MI 48342" },
      ],
      fetchFn,
      finishRunFn: async (handle, fields) => { finished = { handle, fields }; },
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async (url, key, ids) => {
        assert.deepStrictEqual(ids, ["ra-300"]);
        return new Map([[
          "ra-300",
          {
            external_id: "ra-300",
            status: "pending_review",
            description: "Independently confirmed via tickets.venuepilot.com -- a real, already-resolved description.",
            venue_id: "venue-already-resolved-uuid",
            venue_name_raw: "Elektricity",
            venue_address_raw: null,
            venue_city_raw: null,
            ticket_url: null,
            image_url: null,
            end_date: null,
            time_display: null,
            is_free: null,
            price_from: null,
          },
        ]]);
      },
    });
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.errors, 0);
    assert.strictEqual(finished.fields.outcome, "success");

    const mergePatch = calls.find((c) => c.method === "PATCH" && c.url.includes("external_id=eq.ra-300"));
    assert.ok(mergePatch, "a merge PATCH by external_id must be issued for an existing row");
    assert.strictEqual(
      mergePatch.body.description, undefined,
      "an already-populated description must never be included in the write -- it must not be clobbered"
    );
    assert.strictEqual(
      mergePatch.body.venue_id, undefined,
      "an already-populated venue_id must never be included in the write -- it must not be clobbered"
    );
    assert.strictEqual(mergePatch.body.status, "pending_review", "an existing status must still be preserved exactly as before");
    assert.ok(!calls.some((c) => c.url.includes("on_conflict=external_id") && c.method === "POST"),
      "an existing row must go through the merge path, never the bulk insert path");
  }
  console.log("PASS: completeRaSyncSession -- a later successful RA detail fetch never clobbers an already independently-resolved field on an existing row");

  {
    // Same existing-row scenario, but the row's mergeable fields are
    // genuinely still blank (the normal "promoted but never got to
    // enrichment yet" case) -- RA's own now-available detail data SHOULD
    // fill them in, same as a brand-new row would have gotten.
    const { fetchFn, calls } = makeCompleteFetch({ run: baseRun });
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1",
      events: [
        { id: "ra-300", title: "RIOT: The Machine World Tour", description: "RA's own detail-page description", startDate: "2026-12-12T21:00:00-05:00", venueName: "Elektricity", address: "15 South Saginaw Street, Pontiac, MI 48342" },
      ],
      fetchFn,
      finishRunFn: async () => {},
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map([[
        "ra-300",
        {
          external_id: "ra-300", status: "pending_review",
          description: null, venue_id: null, venue_name_raw: "Elektricity",
          venue_address_raw: null, venue_city_raw: null, ticket_url: null,
          image_url: null, end_date: null, time_display: null, is_free: null, price_from: null,
        },
      ]]),
    });
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.errors, 0);

    const mergePatch = calls.find((c) => c.method === "PATCH" && c.url.includes("external_id=eq.ra-300"));
    assert.strictEqual(mergePatch.body.description, "RA's own detail-page description", "a genuinely blank field must still be filled in from RA's own now-available detail data");
    assert.strictEqual(mergePatch.body.status, "pending_review");
  }
  console.log("PASS: completeRaSyncSession -- an existing row's genuinely blank fields are still filled in from a later successful RA fetch");

  {
    // A merge-PATCH write failure is isolated per-row (never silently
    // dropped, never crashes the whole completion).
    const { fetchFn } = makeCompleteFetch({ run: baseRun, mergePatchOk: false });
    const result = await lib.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId: "run-1",
      events: [{ id: "ra-300", title: "RIOT: The Machine World Tour", startDate: "2026-12-12T21:00:00-05:00" }],
      fetchFn,
      finishRunFn: async () => {},
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map([["ra-300", { external_id: "ra-300", status: "approved" }]]),
    });
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.errors, 1);
    assert.strictEqual(result.errorDetail[0].reason, "WRITE_FAILED");
  }
  console.log("PASS: completeRaSyncSession -- a merge-PATCH failure for an existing row reports WRITE_FAILED, isolated per-row");

  // ============================================================
  // Part 5: today's REAL 140-id candidate listing walk (Decision 10 --
  // reuse, don't re-crawl)
  // ============================================================
  {
    const fixture = require(`${REPO_DIR}/test/fixtures/ra-candidates-2026-09-25.json`);
    assert.strictEqual(fixture.ids.length, 140);
    assert.ok(fixture.ids.includes("ra-2485347"), "today's real listing walk includes the legacy-excluded MotorCity Wine duplicate, same as every prior day's walk");

    const fetchFn = async (url, opts) => {
      if (opts && opts.method === "PATCH") return { ok: true, text: async () => "" };
      throw new Error("unexpected fetch in Part 5: " + url);
    };
    const result = await lib.startRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      candidateIds: fixture.ids,
      fetchFn,
      lookupExistingRowsFn: async () => new Map(), // simulates none of today's ids being in production yet
      startRunFn: async () => ({ runId: "run-today", startedAtMs: Date.now() }),
    });
    assert.strictEqual(result.candidateCount, 140);
    assert.strictEqual(result.knownCount, 1); // ra-2485347, legacy exclusion only
    assert.strictEqual(result.allNewCount, 139);
    assert.strictEqual(result.newCount, 30); // capped, same as every prior run
    assert.ok(!result.ids.includes("ra-2485347"));
  }
  console.log("PASS: startRaSyncSession -- today's real 140-id listing walk, reused rather than re-crawled, diffs and caps correctly");

  // ============================================================
  // Part 6: api/admin-ra.js's summarizeRun -- incomplete vs. successful
  // ============================================================
  {
    const { summarizeRun } = freshAdminRa();
    const incomplete = summarizeRun({
      id: "run-stuck", started_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), finished_at: null,
      outcome: "started", session_data: { candidateCount: 140, knownCount: 1, allNewCount: 139, newIds: Array(30).fill("ra-x") },
    });
    assert.strictEqual(incomplete.incomplete, true);
    assert.strictEqual(incomplete.imported, null, "an incomplete session has no imported count yet -- never reported as 0-and-done");
    assert.ok(incomplete.probablyAbandoned, "a 4-hour-old started row on a once-daily source is flagged as probably abandoned");

    const success = summarizeRun({
      id: "run-ok", started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      outcome: "success", session_data: { candidateCount: 140, knownCount: 5, allNewCount: 30, newIds: [], imported: 28, duplicates: 2, skipped: 0, errors: 0 },
    });
    assert.strictEqual(success.incomplete, false);
    assert.strictEqual(success.imported, 28);
    assert.strictEqual(summarizeRun(null), null);
  }
  console.log("PASS: api/admin-ra.js summarizeRun -- an incomplete session reads back as incomplete, never as a quiet success");

  console.log("\nAll ra-sync tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
