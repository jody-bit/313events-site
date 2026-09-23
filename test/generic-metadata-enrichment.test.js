// test/generic-metadata-enrichment.test.js — scripts/generic-metadata-
// enrichment.js's repairGenericMetadata(): the single, generic (not
// source-specific) enrichment pass that runs after every authoritative
// per-source step, proving the "enrich before hiding" behavior end to end
// against a mocked Supabase layer (same convention as
// test/sh1-repair-existing-events.test.js).
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
  return require(`${REPO_DIR}/scripts/generic-metadata-enrichment.js`);
}

const silentLogger = { log() {}, warn() {}, error() {} };

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
  //     description_source='generated'. ---
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
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger });
    assert.strictEqual(counts.descriptionsGenerated, 1);
    assert.strictEqual(counts.written, 1);
    assert.deepStrictEqual(counts.writtenIds, ["evt-1"]);
    const descPatch = patches.find((p) => p.body.description);
    assert.ok(descPatch, "a description PATCH must have been sent");
    assert.strictEqual(descPatch.body.description_source, "generated");
    assert.ok(descPatch.body.description.includes("Karaoke with Polish John!"));
  }
  console.log("PASS: generates and writes a factual description, marked description_source='generated'");

  // --- 2. Reverse venue resolution: Big Time Bingo / Garden Bowl scenario
  //     — venue name AND venue_id both get resolved from the address, once
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
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger });
    assert.strictEqual(counts.venueNamesResolvedFromAddress, 1);
    const venuePatch = patches.find((p) => p.body.venue_name_raw);
    assert.ok(venuePatch);
    assert.strictEqual(venuePatch.body.venue_name_raw, "Garden Bowl");
    assert.strictEqual(venuePatch.body.venue_id, "venue-garden-bowl");
  }
  console.log("PASS: resolves venue name + venue_id from address (Big Time Bingo / Garden Bowl, once the canonical row exists)");

  // --- 3. Big Time Bingo TODAY (no canonical Garden Bowl row in
  //     production, confirmed live 2026-09-23) — stays unresolved, no
  //     patch attempted, never a guess. ---
  {
    const { repairGenericMetadata } = freshLib();
    const { fetchFn, patches } = makeMockFetch({
      venues: [], // matches today's real production state
      candidates: [{
        id: "evt-3", title: "Big Time Bingo", description: "already has one",
        start_date: "2026-09-28", time_display: "7:30 PM", is_all_day: false,
        venue_id: null, venue_name_raw: "Garden Bowl", venue_address_raw: null, venue_city_raw: null,
        ticket_url: "https://instagram.com/bigtimebingo", event_url: null, source: "Big Time Bingo",
      }],
    });
    global.fetch = fetchFn;
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger });
    assert.strictEqual(counts.venueNamesResolvedFromAddress, 0);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(patches.length, 0, "no PATCH at all should be attempted when nothing is resolvable");
  }
  console.log("PASS: Big Time Bingo's real current production gap (no canonical Garden Bowl row) is correctly left unresolved, no guess attempted");

  // --- 4. Digital-home link recovery: Trinosophes-shaped event, venue has
  //     a website on file — event_url gets set, ticket_url is left alone
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
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger });
    assert.strictEqual(counts.digitalHomeLinksRecovered, 1);
    const linkPatch = patches.find((p) => p.body.event_url);
    assert.ok(linkPatch);
    assert.strictEqual(linkPatch.body.event_url, "https://trinosophes.com");
    assert.ok(!("ticket_url" in linkPatch.body), "must never write a ticket_url from a generic venue website — that is not a purchase link");
  }
  console.log("PASS: recovers a last-resort event_url from the venue's own website, never fabricates a ticket_url");

  // --- 5. Trinosophes TODAY (no website/facebook_url on file, confirmed
  //     live 2026-09-23) — link gap stays unresolved, description still
  //     gets generated independently. ---
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
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger });
    assert.strictEqual(counts.digitalHomeLinksRecovered, 0, "no digital-home link exists yet for Trinosophes in real production data");
    assert.strictEqual(counts.descriptionsGenerated, 1, "description generation is independent of the link gap and still succeeds");
    assert.strictEqual(patches.filter((p) => p.body.event_url).length, 0);
  }
  console.log("PASS: Trinosophes' real current production gap (no venue digital home on file) leaves the link unresolved, independent of description generation");

  // --- 6. Resident Advisor is never touched by this script, even if it
  //     would otherwise match the candidate query — enforced inside the
  //     script itself, not just by caller discipline. ---
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
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger });
    assert.strictEqual(counts.skippedResidentAdvisor, 1);
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(patches.length, 0, "no PATCH of any kind must ever be attempted for a Resident Advisor event");
  }
  console.log("PASS: Resident Advisor events are never touched by this script, enforced internally");

  // --- 7. Race safety: a concurrent write (another PATCH already filled
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
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger });
    assert.strictEqual(counts.skippedConcurrentChange, 1);
    assert.strictEqual(counts.written, 0);
  }
  console.log("PASS: a concurrent-change PATCH miss is counted as skipped, never as a silent overwrite or an error");

  // --- 8. Dry run never writes anything. ---
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
    const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger, dryRun: true });
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
