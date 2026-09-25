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

  // ============================================================
  // Part 4: completeRaSyncSession
  // ============================================================
  function makeCompleteFetch({ run, dupeMatch } = {}) {
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, method: (opts && opts.method) || "GET" });
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
      lookupExistingStatusesFn: async () => new Map(),
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
      lookupExistingStatusesFn: async () => new Map(),
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
      lookupExistingStatusesFn: async () => new Map(),
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
      lookupExistingStatusesFn: async () => new Map(),
    });
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.duplicates, 1);
    assert.strictEqual(result.duplicateDetail[0].matchedEventId, "evt-legacy");
    assert.ok(!calls.some((c) => c.method === "PATCH" && c.url.includes("events")), "a conservative-dedupe match must never write to the matched event");
  }
  console.log("PASS: completeRaSyncSession -- a conservative cross-source match blocks the new row and never touches the existing one");

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
      lookupExistingStatusesFn: async () => new Map(),
    });
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.errors, 1);
    assert.strictEqual(result.errorDetail[0].reason, "WRITE_FAILED");
    assert.strictEqual(finished.outcome, "failed");
  }
  console.log("PASS: completeRaSyncSession -- a real database write failure reports outcome='failed', zero imported, never a false success");

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
