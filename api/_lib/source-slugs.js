// api/_lib/source-slugs.js — canonical registry of WP 0.5 source_runs slugs.
//
// Every event-ingestion connector's own source_slug must come from this
// list, not be typed independently at each call site. That's the whole
// point: a typo'd slug in one connector would otherwise silently start its
// own disconnected source_runs history that never joins the real one, and
// nothing would catch it. api/_lib/run-log.js's startRun() checks every
// slug against this registry before writing anything, and skips logging
// (never throws) on an unknown one.
//
// SCOPE (Product Owner decision, 2026-09-21): exactly the 20 event-
// ingestion handlers WP 0.5 covers, GROWN TO 21 on 2026-09-22 when
// cron-gottagacha.js was added -- every new event-ingestion connector is
// born with source_runs instrumentation from day one (explicit Product
// Owner instruction: "This new connector MUST be born with source_runs
// instrumentation... Do not create another connector that immediately
// becomes observability debt"), so the registry is expected to keep
// growing by exactly one entry per new connector, not re-locked at 20.
//   - cron-editorial.js is explicitly OUT OF SCOPE: it writes
//     editorial_articles/editorial_article_events, never events.
//     source_runs represents event-source ingestion runs, not editorial
//     processing — it is not forced in just to cover every scheduled cron.
//   - cron-healthcheck.js and cron-post-to-facebook.js are not ingestion
//     sources at all and were never in scope.
//   - cron-feeds.js gets exactly ONE slug ('feeds') for the whole
//     invocation, not one per registered feed_sources row. Aggregate
//     invocation-level counts across whatever feeds were polled where
//     that's reliable; feed_sources.last_polled_at/last_poll_result stays
//     the per-feed observability mechanism, unchanged by WP 0.5.
//
// Each slug matches its connector's own cron endpoint name (vercel.json's
// `/api/cron-<slug>` path, minus the `cron-` prefix) exactly, so a slug is
// always traceable back to a real file/endpoint with no separate mapping
// to memorize or keep in sync by hand.
//
// Deliberately NOT a database-level foreign key or enum — see
// migration_035_source_runs.sql's own header for why a lightweight
// application-side registry was chosen instead over a heavier DB-schema
// approach. This stays plain JS, matching this project's existing
// "constants over ceremony" style (e.g. CATEGORY_MAP in cron-wdet.js).

const SOURCE_SLUGS = Object.freeze([
  { slug: "lagerhouse", file: "cron-lagerhouse.js", label: "Lager House" },
  { slug: "belle-isle-nature-center", file: "cron-belle-isle-nature-center.js", label: "Belle Isle Nature Center" },
  { slug: "wdet", file: "cron-wdet.js", label: "WDET" },
  { slug: "cinema-detroit", file: "cron-cinema-detroit.js", label: "Cinema Detroit" },
  { slug: "outerlimitslounge", file: "cron-outerlimitslounge.js", label: "Outer Limits Lounge" },
  { slug: "dossin", file: "cron-dossin.js", label: "Detroit Historical Society (Dossin)" },
  { slug: "halo", file: "cron-halo.js", label: "HALO Detroit" },
  { slug: "redford-theatre", file: "cron-redford-theatre.js", label: "Redford Theatre" },
  { slug: "trinosophes", file: "cron-trinosophes.js", label: "Trinosophes" },
  { slug: "motorcitywine", file: "cron-motorcitywine.js", label: "MotorCity Wine" },
  { slug: "visitdetroit", file: "cron-visitdetroit.js", label: "VisitDetroit" },
  { slug: "planetanttheatre", file: "cron-planetanttheatre.js", label: "Planet Ant Theatre" },
  { slug: "poppspacking", file: "cron-poppspacking.js", label: "Popps Packing" },
  { slug: "oldmiami", file: "cron-oldmiami.js", label: "The Old Miami" },
  { slug: "detroittraining", file: "cron-detroittraining.js", label: "Detroit Training Center" },
  { slug: "gottagacha", file: "cron-gottagacha.js", label: "GottaGacha" },
  { slug: "metrotimes", file: "cron-metrotimes.js", label: "Metro Times" },
  { slug: "detroitmonthofdesign", file: "cron-detroitmonthofdesign.js", label: "Detroit Month of Design" },
  { slug: "playgrounddetroit", file: "cron-playgrounddetroit.js", label: "PLAYGROUND DETROIT" },
  { slug: "ticketmaster", file: "cron-ticketmaster.js", label: "Ticketmaster" },
  { slug: "feeds", file: "cron-feeds.js", label: "Approved/registered feeds (aggregate — one row per invocation across every approved feed_sources row)" },
]);

// Throws at load time (not silently, since this is a static list a human
// edits — a caught-at-runtime failure would be the wrong signal here) if
// two entries share a slug. Exported so a test can also exercise it
// directly against a deliberately-broken list, without waiting for a real
// typo to happen to prove the check works.
function assertNoDuplicateSlugs(list) {
  const seen = new Set();
  const dupes = new Set();
  for (const entry of list) {
    if (seen.has(entry.slug)) dupes.add(entry.slug);
    seen.add(entry.slug);
  }
  if (dupes.size) {
    throw new Error(`source-slugs.js: duplicate slug(s) found: ${[...dupes].join(", ")}`);
  }
}
assertNoDuplicateSlugs(SOURCE_SLUGS);

function isKnownSourceSlug(slug) {
  return typeof slug === "string" && SOURCE_SLUGS.some((s) => s.slug === slug);
}

function listSourceSlugs() {
  return SOURCE_SLUGS.map((s) => s.slug);
}

// camelCase key derived from each slug (e.g. "belle-isle-nature-center" ->
// "belleIsleNatureCenter") so a connector can write
// `const { SLUGS } = require("./_lib/source-slugs"); const SOURCE_SLUG = SLUGS.lagerhouse;`
// instead of typing its own slug string literal — the whole point of this
// registry. An unrecognized property access (a typo'd key) is `undefined`,
// which startRun()'s isKnownSourceSlug() check then safely rejects at
// runtime rather than silently logging under the wrong/blank slug.
function toCamelKey(slug) {
  return slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

const SLUGS = Object.freeze(
  Object.fromEntries(SOURCE_SLUGS.map((s) => [toCamelKey(s.slug), s.slug]))
);

module.exports = { SOURCE_SLUGS, SLUGS, isKnownSourceSlug, listSourceSlugs, assertNoDuplicateSlugs };
