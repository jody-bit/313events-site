# EPIC-001 / Phase 5 — Registry, Discovery & Onboarding

**Architecture Gate:** No blanket pre-phase gate. Per the routing directive: "Primarily Sonnet 5. Opus review for consequential platform primitives if required." Flagged below for WP 5.1 (policy gate — governs what the whole platform is and isn't allowed to fetch), 5.5 (probe/fingerprint engine — a genuinely new subsystem), and 5.8 (merging `feed_sources` into `sources` — touches a live, working table).
**Recommended Model:** Sonnet 5 by default; Opus 5 review recommended (not mandatory) for 5.1, 5.5, 5.8 specifically.
**Milestone:** **M4 — WP 5.8**, "Zero-code onboarding live."
**Product Owner Decision relevant to this phase:** **A11** (outreach ownership) is listed by Appendix A as blocking "Phase 5," though its explicit WP citations appear in Phase 6 (WP 6.7, 6.13). Noted as-is from the source documents. No other Appendix A decision blocks Phase 5.
**Status of this phase:** Prepared for grooming. Nothing implemented. Nothing in `IN PROGRESS`.

Full technical detail: `INGESTION_PLATFORM_ARCHITECTURE.md` §3 (source discovery and registry — vocabulary, schema, lifecycle, discovery channels DC1–DC7, probing, admin console).

---

## Technical specification (verbatim from INGESTION_BACKLOG.md — authoritative)

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 5.1 | Policy gate in `fetchWithPolicy` | M | 1.3, 1.7 | `robots.js` (cache, UA and `*`, AI-crawler detection), the permission-basis check, and `policy_denied` issues. The honest UA and a public `/bot` page. | Fixtures: a disallowed path is refused, an AI-crawler-block source is refused, an allowed path passes. The `/bot` page is live. |
| 5.2 | Block-page classifier | S | 1.3 | Signatures for Cloudflare, DataDome, Akamai, Imperva, PerimeterX and generic 403 → `block_type`. On a block, the source is quarantined and reconcile is suppressed. | Stored challenge-page fixtures are classified correctly. A clean 403 JSON error is not called a challenge. |
| 5.3 | `admin-sources.js` API | M | 1.7, 1.13 | List/filter, detail, config edit (schema-validated), pause/resume/retire, run now. | Auth tests (401), a config validation error returns 400, pause stops dispatch (no new runs for 24 h). |
| 5.4 | Source console UI | L | 5.3 | An `admin.html` "Sources" tab: registry list, per-source page, the last 30 runs, records, and unique-contribution count. | A moderator can find a failing source, see its error sample and pause it without SQL. |
| 5.5 | Probe / fingerprint engine | L | 5.1, 2.4 | `probe(url)` (§3.5), plus a `probe` method for the ICS, Tribe, Squarespace, JSON-LD, Localist, LibCal, CivicPlus and LibraryCalendar adapters. | A fixture suite of 20 saved home pages (known platforms), with correct adapter suggestions for ≥ 18. |
| 5.6 | Dry-run preview | M | 2.5, 4.4, 4.8 | `trigger = dryrun` runs: parse, resolve, match, but never merge. The preview shows events, the geo verdict, duplicate candidates and quality flags. | A dry run of a registered fixture source writes no `events` or `source_records` rows and returns a preview payload. |
| 5.7 | Admin "register a URL / feed" | S | 5.5, 5.6 | Paste URL → probe → pick a suggestion → dry run → approve → `active`. Generalizes PHASE0 §5. | End to end: a real public ICS URL goes from paste to active in under 5 minutes of moderator time. |
| 5.8 | Merge `feed_sources` into `sources` (**M4**) | M | 2.13, 5.7 | `submit-feed.js` writes `sources` (`state = candidate`, `origin = organizer_submitted`). A compatibility view keeps the `admin-feeds` endpoint working. Organizer submissions get the dry-run preview before approval. | The public submit flow still works. A submission appears in the console with a preview. The healthcheck `submit-feed validation` still passes. |
| 5.9 | Research import (PHASE0 §7) | M | 1.7 | A script importing the 213-row draft, SOURCE MASTER and PRODUCTION REGISTRY, in that order, with the Planet Ant special case and `imported_from` provenance, then re-verification against the live registry rows. | Row counts reconcile (imported = 213 + 20 + 52 − documented overlaps). No imported row overrides a live connector's state. |
| 5.10 | Discovery: venue-driven reverse discovery (DC3) | S | 4.4 | A nightly job: venues with ≥ 3 upcoming aggregator-only events and no first-party source become `source_candidate` issues, ranked. | Produces a ranked list. The top 10 are spot-checked for sanity. |
| 5.11 | Discovery: outbound-link mining (DC4) | S | 1.6 | Domains in record URLs that aren't in the registry are grouped and ranked, then turned into candidates. | Candidates include known organizer domains seen in Ticketmaster and RA records. |
| 5.12 | Priority scoring (start simple) | S | 5.6, 7.9 | v1 sorts the triage queue by dry-run unique events per month × a geo-gap flag (place has no active source). The full §6.2 formula is adopted only if v1's ordering proves inadequate. | The queue sorts by the v1 score. A candidate in an empty place outranks an equal-volume one in a covered place. |
| 5.13 | Generated `sources.html` | M | 5.4 | The public page is rendered from the registry (display fields only). The hand-maintained tables are removed. | Page parity check: every source currently on the page appears (or is intentionally retired), and none of the policy notes leak. |

## Project-management tracking

| WP | Status | Priority | Recommended Model | Architecture Gate | Product Owner Decision | Blocked By |
|---|---|---|---|---|---|---|
| 5.1 | BACKLOG | High (minimum path; governs fetch policy platform-wide) | Sonnet 5 | Opus 5 review recommended (consequential primitive) | — | WP 1.3, 1.7 |
| 5.2 | BACKLOG | High (minimum path) | Sonnet 5 | None flagged | — | WP 1.3 |
| 5.3 | BACKLOG | High (minimum path) | Sonnet 5 | None flagged | — | WP 1.7, 1.13 |
| 5.4 | BACKLOG | High (minimum path) | Sonnet 5 | None flagged | — | WP 5.3 |
| 5.5 | BACKLOG | High (minimum path; a genuinely new subsystem) | Sonnet 5 | Opus 5 review recommended (consequential primitive) | — | WP 5.1, 2.4 |
| 5.6 | BACKLOG | High (minimum path) | Sonnet 5 | None flagged | — | WP 2.5, 4.4, 4.8 |
| 5.7 | BACKLOG | High (minimum path) | Sonnet 5 | None flagged | — | WP 5.5, 5.6 |
| 5.8 | BACKLOG | **High — Milestone M4** ("Zero-code onboarding live") | Sonnet 5 | Opus 5 review recommended (touches the live `feed_sources` table) | — | WP 2.13 (M1); WP 5.7 |
| 5.9 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None flagged | — | WP 1.7 |
| 5.10 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None flagged | — | WP 4.4 |
| 5.11 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None flagged | — | WP 1.6 |
| 5.12 | BACKLOG | Medium (v1 only — full §6.2 formula explicitly deferred unless v1 proves inadequate) | Sonnet 5 | None flagged | — | WP 5.6, 7.9 |
| 5.13 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None flagged | — | WP 5.4 |
