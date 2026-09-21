# EPIC-001 / Phase 9 — Public-Site Integration & Cleanup

**Architecture Gate:** Per the routing directive: "Sonnet 5 implementation. Opus 5 final decommissioning/conformance review before legacy infrastructure is removed." No pre-phase gate; the conformance review applies at the point legacy fields/infrastructure are actually retired — most directly WP 9.8, and worth applying as a final check across the whole phase before calling the migration complete.
**Recommended Model:** Sonnet 5 for all implementation. Opus 5 for the final conformance/decommissioning review, specifically before WP 9.8 (retiring legacy fields) is executed.
**Milestone:** None of this phase's WPs is a named milestone (M0–M5), but this is the phase where the public site actually starts reading the new data model — the payoff phase for everything before it.
**Product Owner Decision relevant to this phase:** None of A1–A12 blocks Phase 9 per Appendix A's "Blocks" column.
**Status of this phase:** Prepared for grooming. Nothing implemented. Nothing in `IN PROGRESS`.

Full technical detail: `INGESTION_PLATFORM_ARCHITECTURE.md` §2.5 (the new `start_at`/`end_at`/`timezone`/`occurrence_status` columns this phase's pages read), §4 (geography — `in_orbit`, `places`).

---

## Technical specification (verbatim from INGESTION_BACKLOG.md — authoritative)

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 9.1 | `events_public` v2 | S | 1.5, 1.11, 2.7 | The view adds `start_at, end_at, timezone, occurrence_status, venue_lat, venue_lng, in_orbit, distance_from_border_mi, country, currency, place_name`, **appended at the end of the column list** (the lesson from migration_034). It excludes `merged` and `listing_visibility = hidden`. | Existing pages are unaffected (healthcheck). The new columns are populated. |
| 9.2 | `index.html` Orbit filter uses `in_orbit` / coordinates | M | 9.1, 1.9 | The Orbit view and hero count use `in_orbit`. Radius filters use venue coordinates. The location picker comes from generated `places` JSON. The hard-coded `LOCATIONS` is removed. | An event in a city not in the old list (e.g. Chelsea) now appears in the Orbit view. Hero count parity is explained. |
| 9.3 | Time display from `start_at` | M | 9.1 | Tonight, now and sorting all use `start_at`. `time_display` is rendered from timestamps where present. | "Tonight" matches a direct SQL query for the next 24 h in America/Detroit. |
| 9.4 | Cancelled / postponed display | S | 9.1, 2.11 | A badge on cards and event pages. Cancelled events drop off listings after 7 days. | A seeded cancelled event shows the badge and is hidden after 7 days. |
| 9.5 | CAD price display | S | 9.1 | "CA$" for CAD prices. | An Ontario event shows CA$. |
| 9.6 | Add-on / series display | S | 4.5, 2.16 | Add-ons appear as "more ticket options" on the parent. Series show "also on…". | A Ticketmaster event with packages shows one card and the options on its event page. |
| 9.7 | README + docs refresh | S | 3.21 | The README describes the pipeline. `SOURCE_REGISTRY_ARCHITECTURE.md` and `FEED_SUBMISSIONS.md` are marked superseded, with pointers. `SERVICE_AREA.md` references `geo_regions`. | Docs review checklist complete. |
| 9.8 | Retire legacy fields (optional, later) | S | 9.2, 9.3 | Decide whether `start_date`/`time_display`/`venue_city_raw` stay as derived columns or are dropped. | A decision recorded. If dropped, all readers are migrated first (grep = 0). |

## Project-management tracking

| WP | Status | Priority | Recommended Model | Architecture Gate | Product Owner Decision | Blocked By |
|---|---|---|---|---|---|---|
| 9.1 | BACKLOG | Medium (not on minimum path; but the natural first step once the pipeline is real) | Sonnet 5 | None flagged | — | WP 1.5, 1.11, 2.7 |
| 9.2 | BACKLOG | Medium (closes G2 — the client-side city-string gap that currently hides valid Orbit events) | Sonnet 5 | None flagged | — | WP 9.1, 1.9 |
| 9.3 | BACKLOG | Medium | Sonnet 5 | None flagged | — | WP 9.1 |
| 9.4 | BACKLOG | Medium | Sonnet 5 | None flagged | — | WP 9.1, 2.11 |
| 9.5 | BACKLOG | Low-Medium | Sonnet 5 | None flagged | — | WP 9.1 |
| 9.6 | BACKLOG | Low-Medium | Sonnet 5 | None flagged | — | WP 4.5, 2.16 |
| 9.7 | BACKLOG | Medium (real consolidation value — this is where `README.md`, `SOURCE_REGISTRY_ARCHITECTURE.md` and `FEED_SUBMISSIONS.md` staleness gets formally closed out; overlaps with `TASK-001`/`TASK-002` already in `BACKLOG.md` — see cross-reference there) | Sonnet 5 | None flagged | — | WP 3.21 (M2) |
| 9.8 | BACKLOG | **Low — explicitly optional/"later"** | Sonnet 5 | **Opus 5 final conformance/decommissioning review required before dropping any legacy column** | — | WP 9.2, 9.3 |
