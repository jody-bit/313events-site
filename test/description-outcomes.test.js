// test/description-outcomes.test.js — issue #100: the existing enrichment run
// records one description outcome per record (enriched / overwritten / kept /
// skipped / failed), without changing any enrichment decision.
// Run: node test/description-outcomes.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const KEY = "test-key";
const silent = { log() {}, warn() {}, error() {} };

function lib() {
  for (const m of ["scripts/generic-metadata-enrichment.js", "api/_lib/venue-lookup.js", "api/_lib/description-enrichment.js", "api/_lib/external-discovery.js"]) {
    delete require.cache[require.resolve(`${REPO_DIR}/${m}`)];
  }
  return require(`${REPO_DIR}/scripts/generic-metadata-enrichment.js`);
}

function mockFetch(candidates, { skipIds = [] } = {}) {
  const patches = [];
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || "GET";
    if (url.includes("/rest/v1/venues") && method === "GET") return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && method === "GET") return { ok: true, status: 200, json: async () => candidates };
    if (url.includes("/rest/v1/events") && method === "PATCH") {
      const id = decodeURIComponent((url.match(/id=eq\.([^&]+)/) || [])[1] || "");
      patches.push({ id, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => (skipIds.includes(id) ? [] : [{ id }]) };
    }
    throw new Error("unmocked URL: " + url);
  };
  return patches;
}

const base = { category: "nightlife", start_date: "2026-10-20", time_display: "9:00 PM", is_all_day: false, venue_id: null,
  venue_name_raw: "Some Venue", venue_address_raw: null, venue_city_raw: null, ticket_url: null, event_url: "https://example.com/e", source: "Manual" };
const opts = { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, logger: silent, isExternalDiscoveryConfiguredFn: () => false };

(async () => {
  // enriched (generated), kept (manual), overwritten (poor GottaGacha bare URL), failed (concurrent change)
  {
    const { repairGenericMetadata } = lib();
    const patches = mockFetch([
      { ...base, id: "blank-1", title: "Blank Night", description: null },
      { ...base, id: "kept-1", title: "Curated Night", description: "A long, curated description written by the venue that tells visitors exactly what to expect, in detail.", description_source: "manual" },
      { ...base, id: "poor-1", title: "Poor Night", description: "https://example.com/x", source: "GottaGacha" },
      { ...base, id: "race-1", title: "Race Night", description: null },
    ], { skipIds: ["race-1"] });
    const c = await repairGenericMetadata(opts);
    assert.strictEqual(c.descriptionOutcomes["enriched:generated"], 1, JSON.stringify(c.descriptionOutcomes));
    assert.strictEqual(c.descriptionOutcomes["kept_existing:manual"], 1);
    assert.strictEqual(c.descriptionOutcomes["overwritten:bare_url"], 1);
    assert.strictEqual(c.descriptionOutcomes["failed:concurrent_change"], 1);
    const samples = c.descriptionOutcomeSamples;
    assert.ok(samples.some((s) => s.id === "blank-1" && s.outcome === "enriched"));
    assert.ok(samples.some((s) => s.id === "poor-1" && s.outcome === "overwritten"));
    assert.ok(samples.some((s) => s.id === "race-1" && s.outcome === "failed"));
    assert.ok(!samples.some((s) => s.id === "kept-1"), "untouched records are counted, not sampled");
    assert.ok(!patches.some((p) => p.id === "kept-1"), "a curated description is never overwritten");
    // The existing counters still agree with the new outcomes.
    assert.strictEqual(c.descriptionsGenerated, 1);
    assert.strictEqual(c.poorDescriptionsRepaired, 1);
    assert.strictEqual(c.skippedConcurrentChange, 1);
  }

  // blank with nothing to generate from: a skip with a reason, not silence
  {
    const { repairGenericMetadata } = lib();
    mockFetch([{ ...base, id: "nofacts-1", title: "", description: null, start_date: null, time_display: null, venue_name_raw: null }]);
    const c = await repairGenericMetadata(opts);
    const keys = Object.keys(c.descriptionOutcomes);
    assert.ok(keys.every((k) => !k.startsWith("enriched")), JSON.stringify(c.descriptionOutcomes));
    assert.ok(keys.some((k) => k.startsWith("skipped:")), JSON.stringify(c.descriptionOutcomes));
  }

  // dry run: outcomes are recorded and flagged, nothing is written
  {
    const { repairGenericMetadata } = lib();
    const patches = mockFetch([{ ...base, id: "dry-1", title: "Dry Night", description: null }]);
    const c = await repairGenericMetadata({ ...opts, dryRun: true });
    assert.strictEqual(c.dryRun, true);
    assert.strictEqual(c.descriptionOutcomes["enriched:generated"], 1);
    assert.strictEqual(patches.length, 0);
  }

  // samples are capped
  {
    const { repairGenericMetadata } = lib();
    mockFetch(Array.from({ length: 260 }, (_, i) => ({ ...base, id: `b-${i}`, title: `Night ${i}`, description: null })));
    const c = await repairGenericMetadata({ ...opts, dryRun: true });
    assert.strictEqual(c.descriptionOutcomes["enriched:generated"], 260);
    assert.strictEqual(c.descriptionOutcomeSamples.length, 200);
  }

  console.log("PASS: description outcomes — enriched / overwritten / kept / skipped / failed, samples capped, dry-run flagged");
})().catch((e) => { console.error(e); process.exit(1); });
