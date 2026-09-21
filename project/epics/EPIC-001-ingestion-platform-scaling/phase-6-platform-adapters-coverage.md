# EPIC-001 / Phase 6 — Platform Adapters & Coverage Expansion

**Architecture Gate:** No blanket pre-phase gate. Per the routing directive: "Primarily Sonnet 5. Opus only for architecture exceptions." Opus 5 involvement is reactive, only if a specific adapter/platform integration surfaces a genuine architectural exception.
**Recommended Model:** Sonnet 5 for every WP by default.
**Milestone:** **M5 — WP 6.16**, "Every ring has first-party sources" (the note is not embedded inline in the WP's own title in the source backlog, but the Milestones table names WP 6.16 explicitly).
**Hard sequencing rule from the architecture (preserved verbatim):** "Don't start Phase 6 batches before 4.10 (live matching). Every multiplier adapter adds sources that overlap Ticketmaster and Visit Detroit, and without matching they multiply duplicates. That's the exact failure the 11 manual dedupe batches were cleaning up." This makes **all of Phase 6 dependent on Milestone M3 (WP 4.10)**, in addition to each WP's own listed dependency.
**Product Owner Decision relevant to this phase:** **A11** (outreach ownership) is explicitly cited in WP 6.7 and WP 6.13's own text (though Appendix A's "Blocks" column lists A11 against Phase 5). **A12** (LLM-assisted extraction budget) is explicitly cited in WP 6.14's own text (though Appendix A's "Blocks" column lists A12 against Phase 8). Both are noted here exactly as the source documents state them, without resolving the cross-reference myself.
**Status of this phase:** Prepared for grooming. Nothing implemented. Nothing in `IN PROGRESS`.

Full technical detail: `INGESTION_PLATFORM_ARCHITECTURE.md` §7 (handling by source class) and Appendix C (indicative Orbit county list — the basis for the ring sweeps in 6.15/6.16).

---

## Technical specification (verbatim from INGESTION_BACKLOG.md — authoritative)

Each adapter WP delivers four things: the adapter, a fixture suite, `probe` support, and one pilot source taken through dry run to active. It is not done until the pilot has 7 healthy days. Each batch WP is registry work only: probe, dry run and approve N tenants. No new code.

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 6.1 | `localist` adapter | M | 5.6 | The Localist API v2 adapter, paginated, with the place → venue mapping. Pilot: University of Michigan. | Pilot active. Venue resolution ≥ 90% linked. |
| 6.2 | Batch: Localist tenants | S | 6.1 | Probe and onboard BGSU, then confirm and onboard Wayne State, Macomb CC, MSU and UToledo if they're Localist tenants. | Each tenant is active or documented as not Localist. |
| 6.3 | `jsonld` generic adapter hardening | M | 3.8 | Listing-page discovery, `EventSeries`, and `eventStatus` mapping. Pilot: one first-party venue found by probing. | The fixture suite covers 5 real-world JSON-LD variants. |
| 6.4 | Batch: Tribe tenants | S | 3.5 | TWEPI (first Ontario source), Capitol Theatre Windsor, Michigan Science Center, EPIC Wine Country, plus any found by probing. | ≥ 3 active, and Ontario events visible with `country = CA`. |
| 6.5 | `libcal` adapter | M | 5.6 | The public calendar ICS/RSS or the API (keyed). Pilot: Wood County District Public Library. | Pilot active, with library branches resolved as venues. |
| 6.6 | `librarycalendar` adapter | M | 5.6 | Pilot: Novi, Orion Township or Plymouth District Library. | Pilot active. |
| 6.7 | `communico` adapter (keyed or public) | M | 5.6, A11 | Pilot: Essex County Library, Toledo-Lucas County Public Library or Clinton-Macomb Public Library, once access is confirmed. | Pilot active, or a documented partnership ask. |
| 6.8 | `civicplus` adapter | M | 5.6 | The CivicEngage calendar RSS/iCal. Pilot: Royal Oak or Ferndale. | Pilot active. |
| 6.9 | Batch: municipal CivicPlus tenants | S | 6.8 | Wyandotte, Taylor, Plymouth DDA, Dearborn Heights, and those found by the DC2 sweep. | ≥ 4 active. |
| 6.10 | Parks: Huron-Clinton Metroparks + Metroparks Toledo | M | 5.6 | Adapter chosen by probe (likely Tribe/JSON-LD for HCMA; WebTrac for Toledo, which is a recipe or needs a partnership). | ≥ 1 active, and its many venues resolved. |
| 6.11 | `fever` adapter | M | 5.6 | The self-serve API (OAuth2). Pilot: Michigan Central. | Pilot active. Uniqueness vs Ticketmaster reported. |
| 6.12 | `humanitix` + `eventbrite-org` adapters | M | 5.6 | Organizer-authorized keys only. Pilot: any regional organizer who grants access. | Adapter fixture tests pass. Pilot active, or it waits on an organizer. |
| 6.13 | `growthzone` adapter | M | 5.6, A11 | Keyed per chamber or vendor. Pilot: one chamber that provides a key. | Pilot active, or a documented pending key. |
| 6.14 | Recipe suggester (LLM-assisted, **deferrable**) | M | 3.0, 5.6 | An admin "suggest recipe" action that proposes selectors from a sample page (A12). The result is always a draft; a human approves the dry-run output before activation. | A suggested recipe for a fixture page parses correctly after approval. An unapproved suggestion can't activate. |
| 6.15 | Batch: jurisdiction sweep, ring R3 first | M | 5.9, 7.9, 1.9 | Run the DC2 checklist for every R3 place (Lansing/East Lansing, Jackson, Flint, Port Huron, Sarnia, Chatham, Toledo, Sandusky OH, Port Clinton, Adrian, Owosso, Bowling Green). Candidates probed. | The coverage matrix shows every R3 place with ≥ 1 active or candidate source per checklist item, or "none exists" recorded. |
| 6.16 | Batch: jurisdiction sweep, R2 then R1 | L | 6.15 | Same for R2 and R1 places. | The same criterion for R2 and R1. |

## Project-management tracking

| WP | Status | Priority | Recommended Model | Architecture Gate | Product Owner Decision | Blocked By |
|---|---|---|---|---|---|---|
| 6.1 | BACKLOG | Medium (expansion; not on minimum path) | Sonnet 5 | None (Opus reactive only) | — | WP 5.6; Milestone M3 (WP 4.10) |
| 6.2 | BACKLOG | Medium | Sonnet 5 | None (Opus reactive only) | — | WP 6.1; Milestone M3 |
| 6.3 | BACKLOG | Medium | Sonnet 5 | None (Opus reactive only) | — | WP 3.8; Milestone M3 |
| 6.4 | BACKLOG | Medium (first Ontario source — meaningful for Orbit coverage) | Sonnet 5 | None (Opus reactive only) | — | WP 3.5; Milestone M3 |
| 6.5 | BACKLOG | Medium | Sonnet 5 | None (Opus reactive only) | — | WP 5.6; Milestone M3 |
| 6.6 | BACKLOG | Medium | Sonnet 5 | None (Opus reactive only) | — | WP 5.6; Milestone M3 |
| 6.7 | BACKLOG | Medium | Sonnet 5 | None (Opus reactive only) | **A11 (outreach ownership) — explicitly cited in this WP's own text** | WP 5.6; Milestone M3; Product Owner Decision A11 |
| 6.8 | BACKLOG | Medium | Sonnet 5 | None (Opus reactive only) | — | WP 5.6; Milestone M3 |
| 6.9 | BACKLOG | Medium | Sonnet 5 | None (Opus reactive only) | — | WP 6.8; Milestone M3 |
| 6.10 | BACKLOG | Medium | Sonnet 5 | None (Opus reactive only) | — | WP 5.6; Milestone M3 |
| 6.11 | BACKLOG | Medium | Sonnet 5 | None (Opus reactive only) | — | WP 5.6; Milestone M3 |
| 6.12 | BACKLOG | Medium (depends on organizer cooperation, not just engineering) | Sonnet 5 | None (Opus reactive only) | — | WP 5.6; Milestone M3; organizer key grant |
| 6.13 | BACKLOG | Medium | Sonnet 5 | None (Opus reactive only) | **A11 (outreach ownership) — explicitly cited in this WP's own text** | WP 5.6; Milestone M3; Product Owner Decision A11 |
| 6.14 | BACKLOG | **Low — explicitly deferrable** | Sonnet 5 | None (Opus reactive only) | **A12 (LLM-assisted extraction budget) — explicitly cited in this WP's own text** | WP 3.0, 5.6; Milestone M3; Product Owner Decision A12 |
| 6.15 | BACKLOG | Medium-tending-high (feeds Milestone M5) | Sonnet 5 | None (Opus reactive only) | — | WP 5.9, 7.9, 1.9; Milestone M3 |
| 6.16 | BACKLOG | **High — Milestone M5** ("Every ring has first-party sources") | Sonnet 5 | None (Opus reactive only) | — | WP 6.15 |
