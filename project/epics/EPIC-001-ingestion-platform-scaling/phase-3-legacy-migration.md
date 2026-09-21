# EPIC-001 / Phase 3 — Legacy Migration (strangler)

**Architecture Gate:** No blanket pre-phase gate. Per the routing directive: "Sonnet 5 implementation. Opus only for unresolved parity problems, repeated implementation failures, or architecture exceptions." Opus 5 involvement here is reactive, WP-by-WP, not a default assignment.
**Recommended Model:** Sonnet 5 for every WP by default.
**Milestone:** **M2 — "Phase 3 complete,"** meaning "no bespoke cron lines left." Reached only when every WP in this phase (3.0–3.21) is done — **not** the same bar as the backlog's own "minimum path to scale without fragility," which includes only 3.1–3.6 plus feeds (already covered by WP 2.13). The other 15 legacy migrations (Lager House, Old Miami, HALO, Dossin, Redford, Trinosophes, Cinema Detroit, Detroit Training, Popps Packing, Metro Times, plus the editorial-feed and cleanup WPs) are real, valuable work but are not required to reach "scales without getting more fragile" — worth knowing when sequencing against other priorities.
**Standard recipe for every WP in this phase** (from the source backlog, preserved verbatim): (1) wrap the connector's parse logic unchanged as `adapters/legacy/<name>.js`, or map it onto a generic adapter where noted; (2) register it in the source registry; (3) key-map old `external_id` → new `source_key` if they differ, and re-key the 2.10 backfill records before cutover; (4) shadow-run ≥ 3 runs; (5) produce a parity diff report; (6) fix intended differences; (7) cut over, delete the cron line, move the old file to `api/_legacy/` for one release, then delete it. **Every WP's test:** a parity report with 0 unexplained differences, then 7 days healthy after cutover.
**Status of this phase:** Prepared for grooming. Nothing implemented. Nothing in `IN PROGRESS`. The whole phase is blocked on WP 2.13 (M1) — the pipeline has to exist before any connector can be migrated onto it.

Full technical detail: `INGESTION_PLATFORM_ARCHITECTURE.md` Appendix B (per-connector inventory — current state, defects, target adapter for every one of these).

---

## Technical specification (verbatim from INGESTION_BACKLOG.md — authoritative)

| WP | Connector | Size | Dep | Target | Notes / intended fixes during migration |
|---|---|---|---|---|---|
| 3.0 | *(prerequisite, not a connector)* `html-recipe` engine | M | 1.1, 2.4 | `html-recipe` | The declarative engine from §7.5 (cheerio): item selectors, field transforms, date hints, inherit-from-heading, required set, declared defaults with `time_approximate`, and page fingerprint. No LLM. **Test:** three HTML fixture pages (a date-grouped list, a card grid, a table) parse to the expected `SourceEvent`s, and a missing required field rejects the row, not the page. |
| 3.1 | Outer Limits Lounge | S | 2.13 | `squarespace-json` (new generic) | Clean. It's the first generic-adapter proof. |
| 3.2 | Ticketmaster | L | 2.13, 4.1 | `ticketmaster` (tiled, §4.6) | Adaptive tiling, `geoPoint`, venue external IDs retained, add-on detection hook, affiliate URL kept for display. Fixes G5, G6 and D1. |
| 3.3 | Visit Detroit | M | 2.13 | `algolia-visitdetroit` | **Keep** its private one-way dedupe as a pre-merge filter until WP 4.10 turns on live matching; remove it in 4.10. Add paging. Mapping moves into `category_mappings`. |
| 3.4 | WDET | S | 3.5 | `tribe-rest` | Remove the city allowlist (G1). Real pagination. No free guess. |
| 3.5 | Belle Isle Nature Center | S | 2.13 | `tribe-rest` (new generic) | First Tribe proof. `end_date` handled. |
| 3.6 | MotorCity Wine | S | 2.13 | `ics` | Replaces the private RRULE code. Fixes the cancelled series. The title-hash ID is replaced by UID + RECURRENCE-ID. |
| 3.7 | Planet Ant (CrowdWork) | S | 2.13 | `crowdwork` | Detroit-local window. Record the block status. |
| 3.8 | Detroit Month of Design | M | 2.13 | `sitemap-detail` + `jsonld` (new generic) | Real JSON-LD parsing. Detail pages become child jobs (removes the 180 s requirement). |
| 3.9 | Playground Detroit | M | 3.8 | `wp-mec` + child jobs | Crawl delay through per-host politeness instead of `sleep`. |
| 3.10 | Lager House | M | 2.13, 3.0 | `html-recipe` or `legacy` | Venue split (Lager House vs After Hours @ Brooklyn) through venue resolution. |
| 3.11 | Old Miami (rockindetroit) | S | 2.13 | `legacy` | Consistent price nulls. |
| 3.12 | HALO | S | 2.13, 2.18 | `legacy` + continuity keys | Title-based ID replaced (§5.2). |
| 3.13 | Dossin | S | 2.13, 2.18 | `legacy` + continuity keys | Same. |
| 3.14 | Redford Theatre | M | 2.13, 2.18 | `legacy` + continuity | Category mapping by keywords instead of all "film". Null titles handled by validation. |
| 3.15 | Trinosophes | M | 2.13, 3.0 | `html-recipe` (strict) | Date-grouped recipe; null time instead of 7 PM; no junk lines. If the recipe can't reach parity with correct output, pause the source. |
| 3.16 | Cinema Detroit | M | 2.13, 3.0 | `jsonld`/`html-recipe` | Scope limited to film pages. Pending until the audit passes. |
| 3.17 | Detroit Training | S | 2.13, 3.0 | `html-recipe` | Rollover fix through the normalizer. Cap after dedupe. |
| 3.18 | Popps Packing | S | 2.13 | `legacy` with `start_precision` | Future filter. Reviewer dates protected by locks (2.12). |
| 3.19 | Metro Times | S | 0.13 | registry row `blocked` | No migration of fetch code. Registry row plus outreach task only (§7.7). |
| 3.20 | Editorial feeds onto shared lib | M | 1.3, 1.4 | `cron-editorial` uses the shared http/text libs and paginated queries, and stops nulling `matched_event_id` on non-match (the :628 churn). The feed list moves to a table. | The match-churn test: a retry-matched article keeps its match after the next nightly run. |
| 3.21 | Remove legacy boilerplate | S | 3.1–3.18 | Delete `api/_legacy/*`. `vercel.json` ingestion crons are gone except the dispatcher and worker. | `grep -l timingSafeStringEqual api/` shows only `lib/ingest/auth.js` consumers. `vercel.json` cron count drops by 20. |

## Project-management tracking

| WP | Status | Priority | Recommended Model | Architecture Gate | Product Owner Decision | Blocked By |
|---|---|---|---|---|---|---|
| 3.0 | BACKLOG | Medium (prerequisite for several M-size migrations, but not itself on the minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 1.1, 2.4; WP 2.13 (M1) |
| 3.1 | BACKLOG | High (minimum path; first generic-adapter proof) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1) |
| 3.2 | BACKLOG | High (minimum path; Ticketmaster was 81% of upcoming approved events — the single highest-value migration in the phase) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1); WP 4.1 |
| 3.3 | BACKLOG | High (minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1) |
| 3.4 | BACKLOG | High (minimum path; fixes G1 — WDET's narrower-than-Orbit allowlist) | Sonnet 5 | None (Opus reactive only) | — | WP 3.5 |
| 3.5 | BACKLOG | High (minimum path; first Tribe adapter proof) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1) |
| 3.6 | BACKLOG | High (minimum path; fixes the cancelled-recurring-series defect) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1) |
| 3.7 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1) |
| 3.8 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1) |
| 3.9 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 3.8 |
| 3.10 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1), 3.0 |
| 3.11 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1) |
| 3.12 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1), 2.18 |
| 3.13 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1), 2.18 |
| 3.14 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1), 2.18 |
| 3.15 | BACKLOG | Medium (not on minimum path; real product-quality upside — fixes the "every line becomes an event" junk-data defect) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1), 3.0 |
| 3.16 | BACKLOG | Medium (not on minimum path; explicitly "pending until the audit passes") | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1), 3.0 |
| 3.17 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1), 3.0 |
| 3.18 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 2.13 (M1) |
| 3.19 | BACKLOG | Low (no code migration — a registry-row-only, outreach-only item; source is currently blocked/WAF-403'd) | Sonnet 5 | None (Opus reactive only) | — | WP 0.13 |
| 3.20 | BACKLOG | Medium (not on minimum path; editorial matching is a separate concern from event ingestion) | Sonnet 5 | None (Opus reactive only) | — | WP 1.3, 1.4 |
| 3.21 | BACKLOG | Medium (required for Milestone M2, "no bespoke cron lines left" — but M2 itself is not on the minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 3.1–3.18 |
