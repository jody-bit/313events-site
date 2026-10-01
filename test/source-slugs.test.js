// test/source-slugs.test.js — WP 0.5 canonical source-slug registry.
//
// Plain Node assert, no dependencies, matching this repo's existing style.
// Run: node test/source-slugs.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const {
  SOURCE_SLUGS,
  SLUGS,
  isKnownSourceSlug,
  listSourceSlugs,
  assertNoDuplicateSlugs,
} = require(`${REPO_DIR}/api/_lib/source-slugs.js`);

function run() {
  // --- 1. exactly one canonical slug per expected ingestion source, plus
  // the one named non-ingestion exception ---
  // 20 at WP 0.5's original scope lock (2026-09-21), grown to 21 on
  // 2026-09-22 when cron-gottagacha.js was added, then to 22 later the
  // same day when cron-bigtimebingo.js was added, then to 23 on
  // 2026-09-25 when "resident-advisor" was added (RA architecture
  // simplification -- see scripts/ra-sync.js), then to 24 on 2026-10-01
  // when "enrichment" was added by explicit Product Owner decision closing
  // EPIC-006 SH.5 -- a deliberate, named, one-off scope extension (see
  // source-slugs.js's own SCOPE comment), not a reopening of the
  // ingestion-only rule for scheduled crons in general -- then to 25 later
  // the same day when "bagleycommunity" was added for the new Bagley
  // Community Council connector (api/cron-bagleycommunity.js), a normal
  // ingestion connector, born with source_runs instrumentation from day
  // one per the standing WP 0.5 convention (not another named exception
  // like 'enrichment').
  assert.strictEqual(SOURCE_SLUGS.length, 25, "WP 0.5 scope (20) plus cron-gottagacha.js, cron-bigtimebingo.js, resident-advisor, the SH.5 'enrichment' exception, and cron-bagleycommunity.js = 25 registry entries");
  const slugs = listSourceSlugs();
  assert.strictEqual(new Set(slugs).size, 25, "every slug must be unique");
  assert.ok(slugs.includes("resident-advisor"), "resident-advisor must be registered (scripts/ra-sync.js)");
  assert.ok(slugs.includes("enrichment"), "enrichment must be registered (cron-enrichment.js, EPIC-006 SH.5)");
  assert.ok(slugs.includes("bagleycommunity"), "bagleycommunity must be registered (cron-bagleycommunity.js, Bagley neighborhood + event-source work)");
  console.log("PASS: registry has exactly 25 unique canonical slugs, including resident-advisor, enrichment, and bagleycommunity");

  // --- every entry's file actually exists in api/, and is a real cron file ---
  for (const entry of SOURCE_SLUGS) {
    const filePath = path.join(REPO_DIR, "api", entry.file);
    assert.ok(fs.existsSync(filePath), `registry entry "${entry.slug}" points at a file that doesn't exist: ${entry.file}`);
    assert.ok(entry.file.startsWith("cron-"), `registry entry "${entry.slug}" file should be a cron-*.js handler, got ${entry.file}`);
  }
  console.log("PASS: every registry entry's file exists on disk and is a cron-*.js handler");

  // --- explicit scope exclusions (Product Owner decision, 2026-09-21) ---
  assert.ok(!slugs.includes("editorial"), "cron-editorial.js is explicitly out of scope (writes editorial_articles, not events)");
  assert.ok(!SOURCE_SLUGS.some((s) => s.file === "cron-editorial.js"), "no registry entry should point at cron-editorial.js");
  assert.ok(!SOURCE_SLUGS.some((s) => s.file === "cron-healthcheck.js"), "cron-healthcheck.js is not an ingestion source");
  assert.ok(!SOURCE_SLUGS.some((s) => s.file === "cron-post-to-facebook.js"), "cron-post-to-facebook.js is not an ingestion source");
  console.log("PASS: cron-editorial.js, cron-healthcheck.js, cron-post-to-facebook.js are correctly excluded");

  // --- cron-feeds.js gets exactly one aggregate slug, not one per feed ---
  const feedsEntries = SOURCE_SLUGS.filter((s) => s.file === "cron-feeds.js");
  assert.strictEqual(feedsEntries.length, 1, "cron-feeds.js must have exactly one registry entry");
  assert.strictEqual(feedsEntries[0].slug, "feeds", "cron-feeds.js's slug must be the literal 'feeds', not a dynamic feed-<id> shape");
  assert.ok(!slugs.some((s) => /^feed-/.test(s)), "no dynamic feed-<id> slugs should exist in the registry");
  console.log("PASS: cron-feeds.js has exactly one aggregate 'feeds' slug, no dynamic per-feed slugs");

  // --- isKnownSourceSlug ---
  assert.strictEqual(isKnownSourceSlug("lagerhouse"), true);
  assert.strictEqual(isKnownSourceSlug("feeds"), true);
  assert.strictEqual(isKnownSourceSlug("belle-isle-nature-center"), true);
  assert.strictEqual(isKnownSourceSlug("lager-house"), false, "a plausible-looking typo must be rejected");
  assert.strictEqual(isKnownSourceSlug("editorial"), false);
  assert.strictEqual(isKnownSourceSlug(""), false);
  assert.strictEqual(isKnownSourceSlug(null), false);
  assert.strictEqual(isKnownSourceSlug(undefined), false);
  assert.strictEqual(isKnownSourceSlug(42), false, "a non-string slug must be rejected, not coerced");
  console.log("PASS: isKnownSourceSlug correctly accepts canonical slugs and rejects typos/unknowns/non-strings");

  // --- SLUGS lookup object -- every connector imports from this ---
  assert.strictEqual(SLUGS.lagerhouse, "lagerhouse");
  assert.strictEqual(SLUGS.belleIsleNatureCenter, "belle-isle-nature-center");
  assert.strictEqual(SLUGS.feeds, "feeds");
  assert.strictEqual(SLUGS.detroitmonthofdesign, "detroitmonthofdesign", "a slug with no internal hyphens keys itself unchanged");
  assert.strictEqual(SLUGS.residentAdvisor, "resident-advisor");
  assert.strictEqual(SLUGS.enrichment, "enrichment");
  assert.strictEqual(SLUGS.bagleycommunity, "bagleycommunity", "a slug with no internal hyphens keys itself unchanged");
  assert.strictEqual(Object.keys(SLUGS).length, 25);
  console.log("PASS: SLUGS lookup object exposes every canonical slug under a camelCase key");

  // --- the 'enrichment' entry is the one deliberate, named, non-ingestion
  // exception -- distinct in kind from cron-editorial.js/cron-healthcheck.js/
  // cron-post-to-facebook.js (still correctly excluded above), not a sign
  // the scope rule has quietly loosened ---
  const enrichmentEntry = SOURCE_SLUGS.find((s) => s.slug === "enrichment");
  assert.ok(enrichmentEntry, "an 'enrichment' entry must exist");
  assert.strictEqual(enrichmentEntry.file, "cron-enrichment.js");
  console.log("PASS: 'enrichment' is registered as a deliberate, named, one-off exception to the ingestion-only scope rule");

  // --- duplicate detection -- proven against a deliberately-broken list, not just the real one ---
  assert.doesNotThrow(() => assertNoDuplicateSlugs(SOURCE_SLUGS), "the real registry must not throw");
  const broken = [
    { slug: "lagerhouse", file: "cron-lagerhouse.js" },
    { slug: "lagerhouse", file: "cron-lagerhouse-copy.js" },
  ];
  assert.throws(() => assertNoDuplicateSlugs(broken), /duplicate slug/, "a deliberately duplicated list must throw");
  console.log("PASS: duplicate-slug detection passes on the real registry and correctly throws on a broken one");

  console.log("\nAll source-slugs.js tests passed.");
}

run();
