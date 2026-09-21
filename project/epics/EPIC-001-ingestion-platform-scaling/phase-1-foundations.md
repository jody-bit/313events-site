# EPIC-001 / Phase 1 — Foundations

**Architecture Gate:** **Required before implementation begins.** Per the Product Owner's model-routing directive: "Opus 5 architecture review before implementation. Sonnet 5 implementation. Opus 5 conformance review after completion." This gate has **not yet been conducted** — every WP in this phase is therefore `BACKLOG`, not `READY`, regardless of its individual dependency state, until that review happens.
**Recommended Model:** Sonnet 5 for implementation, after the Opus 5 pre-phase review clears it. Opus 5 again for the conformance review once all Phase 1 WPs are done.
**Milestone:** None of Phase 1's WPs is itself a named milestone (M0–M5), but Phase 1 is the dependency root for nearly everything after it — the critical path (`INGESTION_BACKLOG.md` Phase map) runs 1.1 → 1.2 → 1.3 → 2.1 → …
**Product Owner Decision relevant to this phase:** A7 (raw snapshot retention) is listed by Appendix A as blocking "Phase 1," though the actual retention-prune implementation is cited in WP 2.6 (Phase 2). Noted as-is from the source documents, not resolved here. No other Appendix A decision blocks Phase 1 — per the routing instruction, a decision that blocks a later phase (A2/A3/A4/A6/A9/A10/A11/A12) must not be treated as blocking this one.
**Status of this phase:** Prepared for grooming. Nothing implemented. Nothing in `IN PROGRESS`.

Full technical detail: `INGESTION_PLATFORM_ARCHITECTURE.md` §2.3–§2.5 (shared library, adapter contract, `SourceEvent` schema), §4.2–§4.5 (geography), §3.2 (registry extension).

---

## Technical specification (verbatim from INGESTION_BACKLOG.md — authoritative)

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 1.1 | `package.json` + dependency policy | S | — | Minimal `package.json`: `cheerio` plus the built-in `node:test`. Lockfile committed. Confirm Vercel builds the functions unchanged. | Deploy preview passes, and all existing endpoints respond identically (the healthcheck passes on the preview URL). |
| 1.2 | CI test runner + fixture layout | S | 1.1 | `test/` tree and a GitHub Actions workflow running `node --test` on push. | A deliberately failing test fails CI, and a passing one passes. |
| 1.3 | Shared lib: auth, http, text, time | M | 1.2, 0.2, 0.3, 0.12 | `lib/ingest/{auth,http,text,time}.js` with unit tests. `fetchWithPolicy` without the robots/policy gate yet: timeout, retries with jitter, conditional GET, size cap, honest UA constant. | Unit tests: retry on 503, no retry on 404, timeout, ETag round trip, entity decoding parity with the existing `decodeEntities`. |
| 1.4 | Shared lib: Supabase REST helpers | S | 1.3 | Paginated select, quoted and chunked `in()` lists, bulk upsert **only for uniformly-shaped rows** (it throws if rows have different key sets), RPC call. | Unit tests with a mocked fetch: pagination follows `Content-Range`; an ID containing `,` or `)` is quoted; a mixed-key batch throws before sending. |
| 1.5 | Migration: event timestamps | M | — | `events.start_at timestamptz, end_at timestamptz, timezone text default 'America/Detroit'`, plus a backfill from `start_date` + `time_display` via a SQL parse function (`null` where unparseable), plus an index. `start_date` and `time_display` stay. | The backfill report lists the count parsed vs null. A spot check of 50 rows matches the displayed time. |
| 1.6 | Migration: `source_records` | M | 1.5 | The table from §2.7, with a unique `(source_id, source_key)` and indexes on `event_id` and `last_seen_at`. | Insert/upsert round trip via an RPC. The unique constraint rejects a duplicate key. |
| 1.7 | Migration: extend `sources` registry | M | — | The columns from §3.2 (identity, adapter, policy, trust, schedule, lifecycle, health, provenance), plus a `platforms` table and `source_state_log`. `feed_sources` is untouched for now. | The migration applies cleanly on a Supabase branch or copy. The existing (empty) `sources` table survives. |
| 1.8 | Seed `sources` rows for the 20 live connectors + manual lanes | S | 1.7 | A data file inserting one row per connector (slug, display name equal to today's `events.source` string, adapter `legacy/<name>`, trust tier, state `active`), plus `ra-manual`, `ig-*`, `editorial-desk`, `manual`, `venue-submission`. Also a mapping table `legacy_source_labels(label → source slug)` for the long tail of labels: one label per feed venue name (→ its feed source), and 'Manual', 'Resident Advisor', '19hz.info', 'Dice' and similar (→ manual sources). | Every distinct `events.source` value maps to a slug through the connector rows or `legacy_source_labels`. The mapping query returns 0 unmapped labels, and the label list is reviewed by Jody once. |
| 1.9 | `places` import (TIGER + StatCan) | L | — | A script plus migration creating `places` (§4.4), loaded with MI/OH places + county subdivisions and ON CSDs whose polygons intersect the Orbit. Aliases are seeded from the 56 city entries in `index.html`'s `LOCATIONS`. The 40 neighborhood entries map to the existing `neighborhoods` table instead. May need to run on Jody's machine, since census.gov was unreachable from the cloud workspace. | All 56 LOCATIONS cities resolve to a place, and all 40 neighborhood entries resolve to `neighborhoods` rows. Totals per county are reported. Appendix C is replaced with the computed list. |
| 1.10 | Migration: PostGIS + `geo_regions` | S | — | Enable `postgis`. Load the full 1,090-vertex Detroit boundary from the City GIS layer. Add `in_orbit(lat,lng)` and `miles_from_border(lat,lng)` SQL functions, spheroidal (`use_spheroid = true`, §4.2). | Re-derive SERVICE_AREA.md's two tables under the new measure. Report every difference > 0.2 mi, and **every in/out flip** (watch Saginaw 75.4, Clinton County 75.4, Hillsdale 75.5) to Jody before any later WP relies on the function. SERVICE_AREA.md is updated with the new figures. |
| 1.11 | Venue geo columns + trigger | S | 1.10 | `venues.geo_precision, geo_source, distance_from_border_mi, in_orbit, place_id, country, region`, plus a trigger computing distance and `in_orbit` on lat/lng change. | Updating a venue's lat/lng recomputes its distance. A NULL lat/lng gives `in_orbit` NULL. |
| 1.12 | Boundary JS generated from DB + parity test | S | 1.10 | A script that exports the simplified ring into `_lib/detroit-boundary.js` and `index.html`'s copy, plus a parity test over 200 random points. | The test passes (max delta ≤ 0.2 mi). CI fails if the two copies drift. |
| 1.13 | Migration: `ingestion_issues` | S | — | The unified inbox table (§2.9). | Insert/resolve round trip. Indexes on `(status, kind, severity)`. |
| 1.14 | Migration: `category_mappings` | S | — | `(adapter or source_id, raw_value) → category slug`, seeded from the inline maps in the Ticketmaster, WDET, Visit Detroit and Playground connectors. | Every inline mapping in those 4 files has an equivalent row (a script diffs the two). |
| 1.15 | Migration: honest-gap constraints | S | — | `events.category` becomes nullable, rendered as "Other" and flagged for follow-up. `events.is_free` becomes nullable (unknown). Additive: existing rows are unchanged. Page code handles null for both. | Insert a row with null category and null `is_free`. It renders on the calendar and event page, and appears in the follow-up queue. |

## Project-management tracking

| WP | Status | Priority | Recommended Model | Architecture Gate | Product Owner Decision | Blocked By |
|---|---|---|---|---|---|---|
| 1.1 | BACKLOG | High (critical path: 1.1→1.2→1.3→2.1…) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate |
| 1.2 | BACKLOG | High (critical path) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate; WP 1.1 |
| 1.3 | BACKLOG | High (critical path) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate; WP 1.2, 0.2, 0.3, 0.12 |
| 1.4 | BACKLOG | High (critical path) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate; WP 1.3 |
| 1.5 | BACKLOG | High (critical path; adds `start_at`/`end_at`/`timezone`) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate |
| 1.6 | BACKLOG | High (critical path; the `source_records` ledger) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate; WP 1.5 |
| 1.7 | BACKLOG | High (registry extension — everything downstream in Phase 2+ reads it) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate |
| 1.8 | BACKLOG | High (needed before any legacy connector can be represented in the registry) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate; WP 1.7 |
| 1.9 | BACKLOG | High (minimum path; large effort — flagged risk: may need to run outside the cloud sandbox) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate |
| 1.10 | BACKLOG | High (minimum path; replaces the duplicated boundary polygon with a computed PostGIS function) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate |
| 1.11 | BACKLOG | High (minimum path) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate; WP 1.10 |
| 1.12 | BACKLOG | Medium (not on the "minimum path to scale without fragility" list; G4 is S4-severity — ergonomics, not a defect) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate; WP 1.10 |
| 1.13 | BACKLOG | High (minimum path; unified review inbox foundation) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate |
| 1.14 | BACKLOG | High (minimum path) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate |
| 1.15 | BACKLOG | High (minimum path; removes the forced-guess constraints behind several honest-gap violations) | Sonnet 5 (post-gate) | Phase 1 Opus 5 review (pending) | — | Phase 1 gate |
