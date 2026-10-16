#!/usr/bin/env node
// scripts/scope-guard.js — CI scope guard for the seasonal release line.
//
// Fails if this branch changes protected paths (the homepage, the admin page, the API, the guide artwork, Supabase
// migrations) other than the files named in ALLOWED below. The comparison base is deterministic: origin/main, or the
// ref/sha in SCOPE_GUARD_BASE. The guard NEVER passes on missing evidence: an unavailable or unresolvable base, no
// common ancestor, or an empty diff is a hard failure (exit 1 / thrown error), not a skip. Do not weaken this to make
// a merge pass: if a file is genuinely approved, add its exact path to ALLOWED in the same reviewed change.
//   node scripts/scope-guard.js                       compare HEAD with origin/main
//   SCOPE_GUARD_BASE=<sha-or-ref> node scripts/scope-guard.js
"use strict";
const { execFileSync } = require("child_process");
const path = require("path");

const DEFAULT_BASE = "origin/main";
const PROTECTED = /^(index\.html|admin\.html|api\/|assets\/guides\/|supabase\/migrations\/)/;

// Exact paths, not prefixes or patterns. Each group says why it is approved.
const ALLOWED = [
  // Homepage V2 as approved on claude/homepage-v2 (915a2bc), carried into the release candidate.
  "index.html",
  "assets/guides/README.md",
  "assets/guides/fall-color-guide-1600.webp", "assets/guides/fall-color-guide-800.webp",
  "assets/guides/fall-guide-1600.webp", "assets/guides/fall-guide-800.webp",
  "assets/guides/halloween-guide-1600.webp", "assets/guides/halloween-guide-800.webp",
  // RA link and start-time fix (PR #74): the RA link helper and the missing-time approval guard.
  "api/_lib/ra-links.js", "api/admin-events.js",
  // The QA route and the private seasonal editorial data (fail-closed outside preview/development).
  "api/seasonal-qa.js",
  // Description enrichment per-record outcomes (issue #100, approved by the owner 2026-10-13): the enrichment cron passes them to the run log.
  "api/cron-enrichment.js",
  // Link usability classification (issue #99, approved by the owner 2026-10-13): extends the existing link-health helper.
  "api/_lib/link-health.js",
  // Admin queue Stage 2 (owner decision 2026-10-16): read-side class for pending rows (Dearborn grouping).
  "api/_lib/pending-classifier.js",
  // Admin submissions queue date filter (owner decision 2026-10-14): ended pending events leave the default queue (read-side only).
  "api/_lib/pending-queue.js", "admin.html", "api/_lib/cron-run.js", "api/_lib/cron-auth.js",
  // Package 1B: every cron handler uses the shared fail-closed auth check.
  "api/cron-antonartcenter.js", "api/cron-bagleycommunity.js", "api/cron-belle-isle-nature-center.js", "api/cron-bigtimebingo.js", "api/cron-cinema-detroit.js", "api/cron-detroitmonthofdesign.js", "api/cron-detroittraining.js", "api/cron-dossin.js", "api/cron-editorial.js", "api/cron-enrichment.js", "api/cron-eventbrite.js", "api/cron-feeds.js", "api/cron-gottagacha.js", "api/cron-halo.js", "api/cron-healthcheck.js", "api/cron-lagerhouse.js", "api/cron-localist.js", "api/cron-metrotimes.js", "api/cron-motorcitywine.js", "api/cron-oldmiami.js", "api/cron-outerlimitslounge.js", "api/cron-planetanttheatre.js", "api/cron-playgrounddetroit.js", "api/cron-poppspacking.js", "api/cron-post-to-facebook.js", "api/cron-ra.js", "api/cron-redford-theatre.js", "api/cron-ticketmaster.js", "api/cron-trinosophes.js", "api/cron-visitdetroit.js", "api/cron-wdet.js",
  // Package 1: these handlers export through withRunLog (truthful source_runs rows).
  "api/cron-detroitmonthofdesign.js", "api/cron-detroittraining.js", "api/cron-metrotimes.js", "api/cron-oldmiami.js", "api/cron-playgrounddetroit.js", "api/cron-poppspacking.js", "api/cron-visitdetroit.js",
  // Description self-healing: shared strength rule + GottaGacha adopting it.
  "api/_lib/description-strength.js", "api/cron-gottagacha.js",
  "api/_lib/seasonal-editorial/APPROVAL_BATCH_1.md",
  "api/_lib/seasonal-editorial/HALLOWEEN_RECONCILIATION.md",
  "api/_lib/seasonal-editorial/LAUNCH_PROPOSAL_1.md",
  "api/_lib/seasonal-editorial/COVERAGE.md",
  "api/_lib/seasonal-editorial/EDITORIAL_HANDOFF.md",
  "api/_lib/seasonal-editorial/MIGRATION_REVIEW.md",
  "api/_lib/seasonal-editorial/RELEASE_BATCH_1.json",
  "api/_lib/seasonal-editorial/RELEASE_BATCH_1.md",
  "api/_lib/seasonal-editorial/RELEASE_BATCH_HALLOWEEN_1.json",
  "api/_lib/seasonal-editorial/candidate-images.json",
  "api/_lib/seasonal-editorial/candidates.json",
  "api/_lib/seasonal-editorial/defaults.json",
  "api/_lib/seasonal-editorial/discovered-destinations.json",
  "api/_lib/seasonal-editorial/editorial.js",
  "api/_lib/seasonal-editorial/entries.json",
  "api/_lib/seasonal-editorial/fall-color-qa.json",
  "api/_lib/seasonal-editorial/fall-qa.json",
  "api/_lib/seasonal-editorial/halloween-qa.json",
  "api/_lib/seasonal-editorial/halloween-release-1.json",
  "api/_lib/seasonal-editorial/launch-1.json",
  "api/_lib/seasonal-editorial/launch-expansion.json",
  "api/_lib/seasonal-editorial/launch-verification.json",
  "api/_lib/seasonal-editorial/linked-images.json",
  "api/_lib/seasonal-editorial/photo-library.json",
  "api/_lib/seasonal-editorial/qa-client.js",
  "api/_lib/seasonal-editorial/verification-2026-10-11.json",
  // City of Dearborn feed publication policy (Event Intelligence, draft PR #77): inert until a feed_sources row exists. cron-feeds.js: one-line change passing the policy to classify().
  "api/_lib/feed-publication.js",
  "api/_lib/dearborn-enrichment.js",
  "api/cron-feeds.js",
  // Shared ingestion eligibility rule (owner decision 2026-10-14): feed rows that are definitively over are not inserted.
  "api/_lib/ingest-eligibility.js",
  // GEO-003 step 2 (owner order 2026-10-16): VisitDetroit stores the feed city only when it agrees with ZIP and _geoloc.
  "api/_lib/feed-city.js",
  "api/_lib/orbit-zip-table.json",
  "api/_lib/orbit-zip-cdp-names.json",
  "api/_lib/orbit-zip-tiers.json",
  "api/cron-visitdetroit.js",
  // DQ-004 verified-only editorial associations (owner approval 2026-10-16, staging implementation): the shared verification rule,
  // the admin decisions API, and the additive verification columns + verified-only public read policy.
  "api/_lib/editorial-verification.js",
  "api/admin-editorial.js",
  "supabase/migrations/20261016000000_dq004_editorial_link_verification.sql",
  "supabase/migrations/20261016000001_dq004_editorial_public_read_verified_only.sql"
];

class ScopeGuardError extends Error {}

function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }

// Returns { base, mergeBase, changed, violations }; throws ScopeGuardError when it cannot establish the diff.
function check(opts) {
  opts = opts || {};
  const cwd = opts.cwd || path.join(__dirname, "..");
  const base = opts.base || process.env.SCOPE_GUARD_BASE || DEFAULT_BASE;
  const allowed = opts.allowed || ALLOWED;
  let baseSha, mergeBase, names;
  try { baseSha = git(cwd, ["rev-parse", "--verify", "--quiet", base + "^{commit}"]).trim(); } catch (e) { baseSha = ""; }
  if (!baseSha) throw new ScopeGuardError("scope guard cannot run: base '" + base + "' is not available in this checkout. In CI use fetch-depth: 0; locally run: git fetch origin main");
  try { mergeBase = git(cwd, ["merge-base", baseSha, "HEAD"]).trim(); } catch (e) { mergeBase = ""; }
  if (!mergeBase) throw new ScopeGuardError("scope guard cannot run: '" + base + "' and HEAD share no history (shallow checkout?). Fetch full history: git fetch --unshallow origin main");
  names = git(cwd, ["diff", "--name-only", mergeBase, "HEAD"]).split("\n").filter(Boolean);
  if (!names.length) throw new ScopeGuardError("scope guard saw an empty diff against '" + base + "'; refusing to pass on no evidence");
  const violations = names.filter((f) => PROTECTED.test(f) && !allowed.includes(f));
  return { base, baseSha, mergeBase, changed: names, violations };
}

module.exports = { check, ALLOWED, PROTECTED, DEFAULT_BASE, ScopeGuardError };

if (require.main === module) {
  try {
    const r = check();
    if (r.violations.length) {
      console.error("scope guard FAILED: protected files changed outside the allow-list (scripts/scope-guard.js):\n  " + r.violations.join("\n  "));
      process.exit(1);
    }
    console.log("scope guard ok: " + r.changed.length + " files changed against " + r.base + " (" + r.baseSha.slice(0, 7) + "), none outside the allow-list");
  } catch (e) {
    if (!(e instanceof ScopeGuardError)) throw e;
    console.error("scope guard FAILED: " + e.message);
    process.exit(1);
  }
}
