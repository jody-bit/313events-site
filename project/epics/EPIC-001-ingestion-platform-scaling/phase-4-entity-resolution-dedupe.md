# EPIC-001 / Phase 4 — Entity Resolution & Dedupe

**Architecture Gate:** **Required before implementation begins.** Per the routing directive: "Opus 5 architecture gate before implementation. Sonnet 5 implementation. Opus reviews entity-resolution/matching strategy and calibration before live matching." Not yet conducted — every WP in this phase is `BACKLOG` until it is. The calibration review specifically gates WP 4.8 (matcher in shadow mode) and WP 4.10 (enable live matching) even after the general phase gate clears, since those two are explicitly the "before live matching" checkpoint.
**Recommended Model:** Sonnet 5 implements approved WPs after the gate. Opus 5 specifically reviews the matcher/entity-resolution strategy and calibration (WP 4.6–4.8) before WP 4.10 goes live.
**Milestone:** **M3 — WP 4.10**, "Automatic cross-source dedupe live."
**Product Owner Decisions relevant to this phase:** **A2** (may the pipeline create unverified venues? — explicitly cited in WP 4.4) and **A6** (Canadian geocoding provider — explicitly cited in WP 4.2) both block this phase per Appendix A. Neither is decided yet. Per the routing instruction, decisions blocking other phases (A1/A3/A4/A5/A9/A10/A11/A12) do not apply here.
**Status of this phase:** Prepared for grooming. Nothing implemented. Nothing in `IN PROGRESS`.

Full technical detail: `INGESTION_PLATFORM_ARCHITECTURE.md` §5 (identity layers, record continuity, blocking/scoring, decision rules, venue/organizer resolution, merge mechanics, review UX, gold-set evaluation, backfill).

**Note on DEC-005 / WP 4.13 tension:** this phase's WP 4.13 ("Organizations from sources") reads as populating one organization *per source*, which is a different, narrower notion than this project's existing `DEC-005` ("source ≠ organizer" — organizers are hand-curated, never auto-derived from `source`). This has been raised as a new discovery item (`DISCOVERY-009` in `BACKLOG.md`) rather than silently resolved here — see that item before WP 4.13 is scheduled.

---

## Technical specification (verbatim from INGESTION_BACKLOG.md — authoritative)

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 4.1 | `venue_aliases` + `venue_external_ids` | S | 1.11 | Migration (PHASE0 §4, extended with external IDs). Seeded from distinct `venue_name_raw` values that exactly match existing venues. | Every current exact-name match is reproduced through the alias path. |
| 4.2 | Geocoder client + cache (A6) | M | 1.11 | `resolve/geocode.js`: Census (US) and the chosen Canadian provider, a permanent `geocode_cache`, and rate limiting. | Fixture addresses (US and ON) geocode. The second call is a cache hit. The rate limit is respected under load. |
| 4.3 | Venue coordinate backfill | M | 4.2 | Geocode every venue lacking lat/lng; precision recorded; `geo_unresolved` issues for failures. | ≥ 90% of venues have street precision or better. The remainder are in the inbox. |
| 4.4 | Venue resolver (full cascade) | L | 4.1, 4.2, 1.9 | §5.5 cascade: alias → external ID → candidates → score → link / review / create-unverified (A2). | The gold venue set (≥ 60 pairs, including DIA variants, Majestic/Magic Stick rooms, "Theatre/Theater") is resolved with precision ≥ 0.98. |
| 4.5 | Title normalizer + add-on classifier | M | 2.2 | `match/normalize.js` and `listing_kind` detection (Ticketmaster packages, parking, suites). | Fixtures from `dedupe-batch3-tm-package-variants`: all variants become `add_on`, and the main events stay `event`. |
| 4.6 | Blocking + features | M | 4.5, 4.4 | `match/block.js`, `match/features.js` (§5.3). | Unit tests per feature. Blocking recall on the gold set is 100% (every true pair shares a block). |
| 4.7 | Gold set assembly | M | 2.10 | `test/gold/event_pairs.json`, built from the archive dedupe files (positives; hard-deleted pairs from their SQL comments), the hard negatives (§5.8), **and random non-duplicate pairs drawn from the same blocks**. | ≥ 150 positive and ≥ 300 negative labelled pairs, each with the source of its label cited. |
| 4.8 | Matcher in shadow mode | M | 4.6, 4.7 | Scoring and decisions (§5.4) run over all records. Proposals are written to `match_candidates`, with no links changed. | Precision/recall report on the gold set. Weights and thresholds are calibrated until precision ≥ 0.98 at auto-link. |
| 4.9 | Merge/unmerge RPCs | M | 2.7 | `merge_events(survivor, loser)` and `unmerge(record_ids)`. The `'merged'` status (standalone enum migration), `merged_into_event_id`, `editorial_article_events` re-pointing, and the `event.html` redirect for merged ids. | Merge then unmerge restores the original state (a snapshot diff is empty). An editorial link follows the merge. |
| 4.10 | Enable live matching (**M3**) | S | 4.8, 4.9, 4.11 | Auto-link at the calibrated threshold and deterministic rule. The review band opens `match_review` issues. Visit Detroit's private dedupe is removed (see 3.3). | One week live: ≥ 150 sampled auto-links, all correct, which gives a 95% lower bound of ≈ 0.98 on precision. No hard-constraint violations in the logs. |
| 4.11 | Match review UI | M | 1.13, 4.9 | An `admin.html` inbox panel: side-by-side diff, signals, and Same / Different / Add-on / Series actions. Negative pairs are stored. | A moderator can resolve 10 queued items. A "Different" pair is never re-proposed. |
| 4.12 | Historical duplicate reconstruction | S | 4.9, 2.10 | Duplicates that archive files **rejected** (they still exist) are re-linked to their survivors as `manual` records (§5.9 step 2). Hard-deleted duplicates are out of scope, since only their SQL comments remain. | Every row still present and rejected by a dedupe file is `merged` into its survivor, with its provenance visible. |
| 4.13 | Organizations from sources | S | 1.7 | Rename or extend `organizers` into organizations. Populate one per source. `organizer_match` feature enabled. | Every source has an organization. Feature tests pass. |

## Project-management tracking

| WP | Status | Priority | Recommended Model | Architecture Gate | Product Owner Decision | Blocked By |
|---|---|---|---|---|---|---|
| 4.1 | BACKLOG | High (minimum path) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate (pending) | — | Phase 4 gate; WP 1.11 |
| 4.2 | BACKLOG | High (minimum path) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate (pending) | **A6 (Canadian geocoding provider) — explicitly cited in this WP's own text** | Phase 4 gate; WP 1.11; Product Owner Decision A6 |
| 4.3 | BACKLOG | Medium (not on the stated minimum path, unlike 4.1/4.2/4.4) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate (pending) | — | Phase 4 gate; WP 4.2 |
| 4.4 | BACKLOG | High (minimum path) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate (pending) | **A2 (may the pipeline create unverified venues?) — explicitly cited in this WP's own text** | Phase 4 gate; WP 4.1, 4.2, 1.9; Product Owner Decision A2 |
| 4.5 | BACKLOG | High (minimum path) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate (pending) | — | Phase 4 gate; WP 2.2 |
| 4.6 | BACKLOG | High (minimum path) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate + Opus matcher-strategy review (pending) | — | Phase 4 gate; WP 4.5, 4.4 |
| 4.7 | BACKLOG | High (minimum path) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate (pending) | — | Phase 4 gate; WP 2.10 |
| 4.8 | BACKLOG | High (minimum path; Milestone M3 dependency) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate + **Opus calibration review required before this WP is considered complete** (pending) | — | Phase 4 gate; WP 4.6, 4.7 |
| 4.9 | BACKLOG | High (minimum path) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate (pending) | — | Phase 4 gate; WP 2.7 |
| 4.10 | BACKLOG | **High — Milestone M3** ("Automatic cross-source dedupe live") | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate + **Opus calibration sign-off explicitly required before enabling live matching** (pending) | — | Phase 4 gate; WP 4.8, 4.9, 4.11; Opus calibration sign-off |
| 4.11 | BACKLOG | High (minimum path) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate (pending) | — | Phase 4 gate; WP 1.13, 4.9 |
| 4.12 | BACKLOG | Medium (not on minimum path) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate (pending) | — | Phase 4 gate; WP 4.9, 2.10 |
| 4.13 | BACKLOG | Medium (not on minimum path) | Sonnet 5 (post-gate) | Phase 4 Opus 5 gate (pending) | — | Phase 4 gate; WP 1.7; **also see the DEC-005/DISCOVERY-009 tension noted above — flag for Product Owner review before scheduling, independent of the architecture gate** |
