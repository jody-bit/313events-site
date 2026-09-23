// test/generic-metadata-enrichment.test.js — scripts/generic-metadata-
// enrichment.js's repairGenericMetadata(): the single, generic (not
// source-specific) enrichment pass that runs after every authoritative
// per-source step, proving the "enrich before hiding" behavior end to end
// against a mocked Supabase layer (same convention as
// test/sh1-repair-existing-events.test.js).
//
// Extended 2026-09-23 ("CORRECTION TO ENRICHMENT PRODUCT BEHAVIOR") to
// cover the five acceptance tests the Product Owner specified verbatim:
//   A. an RA event missing only description gets generic description
//      enrichment (the blanket Resident Advisor exclusion is gone).
//   B. an unknown-but-unambiguous venue progresses through verified
//      external discovery -> persisted knowledge -> repaired event.
//   C. a useful authoritative external description outranks a generated
//      template.
//   D. a second event at the same venue reuses persisted knowledge without
//      a second external lookup (both within one run and across runs).
//   E. an event's remaining gap is reached only after both deterministic
//      AND permitted external enrichment were actually exhausted, not
//      silently skipped.
// Every test that is NOT specifically exercising the external-discovery
// path passes isExternalDiscoveryConfiguredFn: () => false explicitly, so
// these tests are deterministic regardless of whether a real
// TAVILY_API_KEY happens to be set in whatever environment runs them.
//
// Plain Node assert, no dependencies.
// Run: node test/generic-metadata-enrichment.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "test-key";

function freshLib() {
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/generic-metadata-enrichment.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/description-enrichment.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/external-discovery.js`)];
  return require(`${REPO_DIR}/scripts/generic-metadata-enrichment.js`);
}

const silentLogger = { log() {}, warn() {}, error() {} };
const NOT_CONFIGURED = { isExternalDiscoveryConfiguredFn: () => false };

function makeMockFetch({ venues = [], candidates = [], patchResponses = {} } = {}) {
  const patches = [];
  const fetchFn = async (url, opts = {}) => {
    if (url.includes("/rest/v1/venues") && (!opts.method || opts.method === "GET")) {
      return { ok: true, status: 200, json: async () => venues };
    }
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) {
      return { ok: true, status: 200, json: async () => candidates };
    }
    if (url.includes("/rest/v1/events") && opts.method === "PATCH") {
      const body = JSON.parse(opts.body);
      patches.push({ url, body });
      const idMatch = url.match(/id=eq\.([^&]+)/);
      const id = idMatch ? decodeURIComponent(idMatch[1]) : null;
      if (patchResponses[id] === "skip") {
        return { ok: true, status: 200, json: async () => [] }; // simulates concurrent-change filter miss
      }
      return { ok: true, status: 200, json: async () => [{ id, ...body }] };
    }
    throw new Error("unmocked URL in test: " + url);
  };
  return { fetchFn, patches };
}

async function run() {
  // --- 1. Description generation: an Outer Limits Lounge event with only
  //     a description gap gets a generated description written, marked
  //     description_source='generated'. External discovery unconfigured. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [{ id: "venue-outer-limits", name: "Outer Limits Lounge", address: "5507 Caniff Street", city: "Hamtramck" }],
      candidates: [{
        id: "evt-1", title: "Karaoke with Polish John!", description: null, category: "nightlife",
        start_date: "2026-10-06", time_display: "9:00 PM", is_all_day: false,
        venue_id: "venue-outer-limits", venue_name_raw: "Outer Limits Lounge",
        venue_address_raw: null, venue_city_raw: null, ticket_url: null, event_url: "https://example.com/karaoke",
        source: "Outer Limits Lounge",
      }],
    });
    global.fetch = fetchFn;
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger, ...NOT_CONFIGURED });
    assert.strictEqual(counts.descriptionsGenerated, 1);
    assert.strictEqual(counts.externalDescriptionUnavailable, 1, "the external attempt is recorded as unavailable, not silently skipped");
    assert.strictEqual(counts.written, 1);
    assert.deepStrictEqual(counts.writtenIds, ["evt-1"]);
    const descPatch = patches.find((p) => p.body.description);
    assert.ok(descPatch, "a description PATCH must have been sent");
    assert.strictEqual(descPatch.body.description_source, "generated");
    assert.ok(descPatch.body.description.includes("Karaoke with Polish John!"));
  }
  console.log("PASS: generates and writes a factual description, marked description_source='generated'");

  // --- 2. Reverse venue resolution: Big Time Bingo / Garden Bowl scenario
  //     -- venue name AND venue_id both get resolved from the address, once
  //     a canonical Garden Bowl row exists. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [{ id: "venue-garden-bowl", name: "Garden Bowl", address: "4140 Woodward Ave", city: "Detroit" }],
      candidates: [{
        id: "evt-2", title: "Big Time Bingo", description: "Big Time Bingo is a weekly Monday-night bingo event...",
        start_date: "2026-09-28", time_display: "7:30 PM", is_all_day: false,
        venue_id: null, venue_name_raw: null, venue_address_raw: "4140 Woodward Ave", venue_city_raw: "Detroit",
        ticket_url: null, event_url: null, source: "Big Time Bingo",
      }],
    });
    global.fetch = fetchFn;
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger, ...NOT_CONFIGURED });
    assert.strictEqual(counts.venueNamesResolvedFromAddress, 1);
    const venuePatch = patches.find((p) => p.body.venue_name_raw);
    assert.ok(venuePatch);
    assert.strictEqual(venuePatch.body.venue_name_raw, "Garden Bowl");
    assert.strictEqual(venuePatch.body.venue_id, "venue-garden-bowl");
  }
  console.log("PASS: resolves venue name + venue_id from address (Big Time Bingo / Garden Bowl, once the canonical row exists)");

  // --- 3. Big Time Bingo with NO canonical Garden Bowl row and external
  //     discovery unconfigured -- stays unresolved, no patch attempted,
  //     never a guess. (This is what production looked like before a real
  //     TAVILY_API_KEY is added -- see Acceptance Test B below for the
  //     configured case.) ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [],
      candidates: [{
        id: "evt-3", title: "Big Time Bingo", description: "already has one",
        start_date: "2026-09-28", time_display: "7:30 PM", is_all_day: false,
        venue_id: null, venue_name_raw: "Garden Bowl", venue_address_raw: null, venue_city_raw: null,
        ticket_url: "https://instagram.com/bigtimebingo", event_url: null, source: "Big Time Bingo",
      }],
    });
    global.fetch = fetchFn;
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger, ...NOT_CONFIGURED });
    assert.strictEqual(counts.venueNamesResolvedFromAddress, 0);
    assert.strictEqual(counts.externalVenueDiscoveryUnavailable, 1, "an external attempt was warranted but no credential is configured");
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(patches.length, 0, "no PATCH at all should be attempted when nothing is resolvable and no external discovery is configured");
  }
  console.log("PASS: with no canonical venue row and no external discovery configured, the gap is correctly left unresolved, no guess attempted");

  // --- 4. Digital-home link recovery: Trinosophes-shaped event, venue has
  //     a website on file -- event_url gets set, ticket_url is left alone
  //     (never invented as a purchase link). ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [{ id: "venue-trino", name: "Trinosophes", address: "1464 Gratiot Ave", city: "Detroit", website: "https://trinosophes.com" }],
      candidates: [{
        id: "evt-4", title: "Sick Gazelle", description: "already generated or authoritative",
        start_date: "2026-10-12", time_display: "8:00 PM", is_all_day: false,
        venue_id: "venue-trino", venue_name_raw: "Trinosophes", venue_address_raw: "1464 Gratiot Ave", venue_city_raw: "Detroit",
        ticket_url: null, event_url: null, source: "Trinosophes",
      }],
    });
    global.fetch = fetchFn;
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger, ...NOT_CONFIGURED });
    assert.strictEqual(counts.digitalHomeLinksRecovered, 1);
    const linkPatch = patches.find((p) => p.body.event_url);
    assert.ok(linkPatch);
    assert.strictEqual(linkPatch.body.event_url, "https://trinosophes.com");
    assert.ok(!("ticket_url" in linkPatch.body), "must never write a ticket_url from a generic venue website — that is not a purchase link");
  }
  console.log("PASS: recovers a last-resort event_url from the venue's own website, never fabricates a ticket_url");

  // --- 5. Trinosophes with no website/facebook_url on file and external
  //     discovery unconfigured -- link gap stays unresolved, description
  //     still gets generated independently. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [{ id: "venue-trino", name: "Trinosophes", address: "1464 Gratiot Ave", city: "Detroit", website: null, facebook_url: null }],
      candidates: [{
        id: "evt-5", title: "Sick Gazelle", description: null,
        start_date: "2026-10-12", time_display: "8:00 PM", is_all_day: false,
        venue_id: "venue-trino", venue_name_raw: "Trinosophes", venue_address_raw: "1464 Gratiot Ave", venue_city_raw: "Detroit",
        ticket_url: null, event_url: null, source: "Trinosophes",
      }],
    });
    global.fetch = fetchFn;
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger, ...NOT_CONFIGURED });
    assert.strictEqual(counts.digitalHomeLinksRecovered, 0, "no digital-home link exists yet for Trinosophes in this scenario");
    assert.strictEqual(counts.descriptionsGenerated, 1, "description generation is independent of the link gap and still succeeds");
    assert.strictEqual(patches.filter((p) => p.body.event_url).length, 0);
  }
  console.log("PASS: with no venue digital home on file, the link stays unresolved, independent of description generation");

  // --- 6. Acceptance Test A -- a Resident Advisor event missing only
  //     description now receives generic safe description enrichment. The
  //     blanket source exclusion that used to skip RA entirely is gone. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [],
      candidates: [{
        id: "evt-ra", title: "The House of Tarot", description: null,
        start_date: "2026-10-15", time_display: "11:00 PM", is_all_day: false,
        venue_id: null, venue_name_raw: "MAD Arts", venue_address_raw: null, venue_city_raw: null,
        ticket_url: "https://ra.co/events/x", event_url: null, source: "Resident Advisor",
      }],
    });
    global.fetch = fetchFn;
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger, ...NOT_CONFIGURED });
    assert.strictEqual(counts.descriptionsGenerated, 1, "Acceptance Test A: an RA event missing only description receives generic safe description enrichment");
    assert.strictEqual(counts.written, 1);
    assert.deepStrictEqual(counts.writtenIds, ["evt-ra"]);
    const descPatch = patches.find((p) => p.body.description);
    assert.ok(descPatch);
    assert.strictEqual(descPatch.body.description_source, "generated");
    assert.ok(descPatch.body.description.includes("The House of Tarot"));
    assert.ok(descPatch.body.description.includes("MAD Arts"));
  }
  console.log("PASS: Acceptance Test A — a Resident Advisor event missing only description now receives generic safe description enrichment (blanket exclusion removed)");

  // --- 7. Acceptance Test B -- an unknown-but-unambiguous real venue
  //     (Garden Bowl) progresses from venue-name-only, through verified
  //     external discovery, to a persisted canonical row, to a repaired
  //     event, all in one pass. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [], // no canonical Garden Bowl row yet
      candidates: [{
        id: "evt-gb", title: "Big Time Bingo", description: "Big Time Bingo is a weekly event...",
        start_date: "2026-09-28", time_display: "7:30 PM", is_all_day: false,
        venue_id: null, venue_name_raw: "Garden Bowl", venue_address_raw: null, venue_city_raw: null,
        ticket_url: "https://instagram.com/bigtimebingo", event_url: null, source: "Big Time Bingo",
      }],
    });
    global.fetch = fetchFn;

    let discoverCalls = 0;
    const discoverVenueKnowledgeFn = async ({ venueName }) => {
      discoverCalls++;
      assert.strictEqual(venueName, "Garden Bowl");
      return { name: "Garden Bowl", website: "https://majesticdetroit.com/garden-bowl", address: "4140 Woodward Ave", city: "Detroit", sourceUrl: "https://majesticdetroit.com/garden-bowl" };
    };
    let upsertCalls = 0;
    const upsertVenueKnowledgeFn = async (_url, _key, discovery) => {
      upsertCalls++;
      return { id: "venue-garden-bowl-new", name: discovery.name, address: discovery.address, city: discovery.city, website: discovery.website, facebook_url: null };
    };

    const counts = await repairGenericMetadata({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger,
      isExternalDiscoveryConfiguredFn: () => true,
      discoverVenueKnowledgeFn,
      upsertVenueKnowledgeFn,
    });

    assert.strictEqual(discoverCalls, 1, "exactly one bounded external lookup for this venue");
    assert.strictEqual(upsertCalls, 1, "the verified discovery is persisted exactly once");
    assert.strictEqual(counts.externalVenueDiscoveryResolved, 1);
    const venuePatch = patches.find((p) => p.body.venue_id === "venue-garden-bowl-new");
    assert.ok(venuePatch, "Acceptance Test B: the event is repaired with the newly persisted venue");
    assert.strictEqual(venuePatch.body.venue_address_raw, "4140 Woodward Ave");
    assert.strictEqual(venuePatch.body.venue_city_raw, "Detroit");
  }
  console.log("PASS: Acceptance Test B — an unknown-but-unambiguous venue progresses through verified external discovery -> persisted canonical knowledge -> repaired event");

  // --- 8. Acceptance Test C -- a useful authoritative external event
  //     description outranks a generated template: Level 1 is tried first
  //     and, when found, Level 2 never fires for the same event. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [{ id: "venue-mad-arts", name: "MAD Arts", address: "1 Example Way", city: "Ann Arbor" }],
      candidates: [{
        id: "evt-authoritative", title: "The House of Tarot", description: null,
        start_date: "2026-10-15", time_display: "11:00 PM", is_all_day: false,
        venue_id: "venue-mad-arts", venue_name_raw: "MAD Arts", venue_address_raw: "1 Example Way", venue_city_raw: "Ann Arbor",
        ticket_url: "https://ra.co/events/x", event_url: null, source: "Resident Advisor",
      }],
    });
    global.fetch = fetchFn;

    const discoverAuthoritativeDescriptionFn = async ({ event }) => {
      assert.strictEqual(event.id, "evt-authoritative");
      return { text: "The House of Tarot is a monthly tarot-reading and vendor night at MAD Arts.", sourceUrl: "https://madarts.example.com/events/house-of-tarot" };
    };

    const counts = await repairGenericMetadata({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger,
      isExternalDiscoveryConfiguredFn: () => true,
      discoverAuthoritativeDescriptionFn,
    });

    assert.strictEqual(counts.externalDescriptionsRecovered, 1);
    assert.strictEqual(counts.descriptionsGenerated, 0, "Acceptance Test C: authoritative prose must outrank a generated template — Level 2 must not also fire");
    const descPatch = patches.find((p) => p.body.description);
    assert.ok(descPatch);
    assert.strictEqual(descPatch.body.description_source, "authoritative");
    assert.ok(descPatch.body.description.includes("monthly tarot-reading"));
  }
  console.log("PASS: Acceptance Test C — a useful authoritative event description found externally outranks a generated template");

  // --- 9. Acceptance Test D (within one run) -- a second event at the same
  //     unresolved venue reuses the first event's persisted discovery;
  //     the external provider is called exactly once for the whole run. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [],
      candidates: [
        { id: "evt-gb-1", title: "Big Time Bingo (Week 1)", description: "desc 1", start_date: "2026-09-28", time_display: "7:30 PM", is_all_day: false, venue_id: null, venue_name_raw: "Garden Bowl", venue_address_raw: null, venue_city_raw: null, ticket_url: "https://instagram.com/bigtimebingo", event_url: null, source: "Big Time Bingo" },
        { id: "evt-gb-2", title: "Big Time Bingo (Week 2)", description: "desc 2", start_date: "2026-10-05", time_display: "7:30 PM", is_all_day: false, venue_id: null, venue_name_raw: "Garden Bowl", venue_address_raw: null, venue_city_raw: null, ticket_url: "https://instagram.com/bigtimebingo", event_url: null, source: "Big Time Bingo" },
      ],
    });
    global.fetch = fetchFn;

    let discoverCalls = 0;
    const discoverVenueKnowledgeFn = async () => {
      discoverCalls++;
      return { name: "Garden Bowl", website: "https://majesticdetroit.com/garden-bowl", address: "4140 Woodward Ave", city: "Detroit", sourceUrl: "https://majesticdetroit.com/garden-bowl" };
    };
    const upsertVenueKnowledgeFn = async (_u, _k, discovery) => ({ id: "venue-garden-bowl-new", name: discovery.name, address: discovery.address, city: discovery.city, website: discovery.website, facebook_url: null });

    const counts = await repairGenericMetadata({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger,
      isExternalDiscoveryConfiguredFn: () => true,
      discoverVenueKnowledgeFn,
      upsertVenueKnowledgeFn,
    });

    assert.strictEqual(discoverCalls, 1, "Acceptance Test D: a second event at the same venue must reuse the persisted knowledge without another external lookup");
    assert.strictEqual(counts.externalVenueDiscoveryResolved, 1);
    const venuePatches = patches.filter((p) => p.body.venue_id === "venue-garden-bowl-new");
    assert.strictEqual(venuePatches.length, 2, "both events must be repaired using the compounded knowledge");
  }
  console.log("PASS: Acceptance Test D (same run) — a second event at the same venue reuses learned venue knowledge without another external lookup");

  // --- 10. Acceptance Test D (across runs) -- a LATER run, with the venue
  //     now already persisted (as if by a previous run), resolves purely
  //     deterministically and never calls external discovery at all. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [{ id: "venue-garden-bowl-existing", name: "Garden Bowl", address: "4140 Woodward Ave", city: "Detroit", website: "https://majesticdetroit.com/garden-bowl" }],
      candidates: [{
        id: "evt-gb-3", title: "Big Time Bingo (Week 3)", description: "desc 3", start_date: "2026-10-12", time_display: "7:30 PM", is_all_day: false,
        venue_id: null, venue_name_raw: "Garden Bowl", venue_address_raw: null, venue_city_raw: null,
        ticket_url: "https://instagram.com/bigtimebingo", event_url: null, source: "Big Time Bingo",
      }],
    });
    global.fetch = fetchFn;
    const discoverVenueKnowledgeFn = async () => { throw new Error("must never be called once venue knowledge is already persisted"); };

    const counts = await repairGenericMetadata({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger,
      isExternalDiscoveryConfiguredFn: () => true,
      discoverVenueKnowledgeFn,
    });
    assert.strictEqual(counts.externalVenueDiscoveryAttempted, 0);
    const venuePatch = patches.find((p) => p.body.venue_id === "venue-garden-bowl-existing");
    assert.ok(venuePatch, "the event is repaired purely from already-persisted venue knowledge");
  }
  console.log("PASS: Acceptance Test D (cross-run) — a future run with venue knowledge already persisted resolves deterministically, never re-attempting external discovery");

  // --- 11. Acceptance Test E -- an event's remaining gap is only left for
  //     a human after external enrichment was genuinely attempted and
  //     found nothing (not silently skipped), and deterministic Level-2
  //     generation still gets its own independent chance. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [],
      candidates: [{
        id: "evt-elmwood", title: "Elmwood Alight", description: null,
        start_date: "2026-10-01", time_display: null, is_all_day: false,
        venue_id: null, venue_name_raw: null, venue_address_raw: null, venue_city_raw: null,
        ticket_url: null, event_url: null, source: "VisitDetroit",
      }],
    });
    global.fetch = fetchFn;
    const discoverAuthoritativeDescriptionFn = async () => null; // genuinely nothing verifiable found

    const counts = await repairGenericMetadata({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger,
      isExternalDiscoveryConfiguredFn: () => true,
      discoverAuthoritativeDescriptionFn,
    });

    assert.strictEqual(counts.externalDescriptionNoResult, 1, "the external attempt was made and genuinely found nothing");
    assert.strictEqual(counts.descriptionsGenerated, 1, "falls through to Level 2 only after Level 1 was actually attempted and failed");
  }
  console.log("PASS: Acceptance Test E — the remaining gap is reached only after both deterministic and permitted external enrichment were exhausted, never a skipped/assumed attempt");

  // --- 12. Race safety: a concurrent write (another PATCH already filled
  //     the field) is reported as skipped, never double-written or
  //     treated as an error. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn } = makeMockFetch({
      venues: [],
      candidates: [{
        id: "evt-6", title: "Some Show", description: null,
        start_date: "2026-10-20", time_display: null, is_all_day: false,
        venue_id: null, venue_name_raw: "Some Venue", venue_address_raw: null, venue_city_raw: null,
        ticket_url: null, event_url: null, source: "Some Source",
      }],
      patchResponses: { "evt-6": "skip" },
    });
    global.fetch = fetchFn;
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger, ...NOT_CONFIGURED });
    assert.strictEqual(counts.skippedConcurrentChange, 1);
    assert.strictEqual(counts.written, 0);
  }
  console.log("PASS: a concurrent-change PATCH miss is counted as skipped, never as a silent overwrite or an error");

  // --- 13. Dry run never writes anything, including external-discovery
  //     persistence. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [{ id: "venue-outer-limits", name: "Outer Limits Lounge", address: "5507 Caniff Street", city: "Hamtramck" }],
      candidates: [{
        id: "evt-7", title: "Karaoke with Polish John!", description: null,
        start_date: "2026-10-06", time_display: "9:00 PM", is_all_day: false,
        venue_id: "venue-outer-limits", venue_name_raw: "Outer Limits Lounge",
        venue_address_raw: null, venue_city_raw: null, ticket_url: null, event_url: "https://example.com/karaoke",
        source: "Outer Limits Lounge",
      }],
    });
    global.fetch = fetchFn;
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger, dryRun: true, ...NOT_CONFIGURED });
    assert.strictEqual(patches.length, 0, "a dry run must never issue a PATCH");
    assert.strictEqual(counts.written, 0);
  }
  console.log("PASS: --dry-run reports would-be repairs without writing anything");

  console.log("\nAll generic-metadata-enrichment.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
