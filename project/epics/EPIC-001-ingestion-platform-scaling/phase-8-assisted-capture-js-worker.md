# EPIC-001 / Phase 8 — Assisted Capture & JS Worker

**Architecture Gate:** Per the routing directive: "Product Owner decisions and Opus 5 review where required. Sonnet 5 implementation after decisions." This is the most decision-gated phase in the whole program — two of its seven WPs (8.5, 8.6) directly execute specific unresolved Appendix A decisions, and the phase's own stated purpose is to formalize a practice (agent-assisted RA/Instagram capture) that the architecture doc itself flags as needing a policy decision before it should continue as-is.
**Recommended Model:** Sonnet 5 for implementation, after the relevant decision(s) are made. Opus 5 review recommended specifically for WP 8.2 (the capture tool's design) and required before WP 8.6 (render worker) if/when A4 is approved.
**Milestone:** None of this phase's WPs is a named milestone.
**Product Owner Decisions relevant to this phase:** **A3** (Resident Advisor/Instagram capture practice — explicitly cited in WP 8.5, and equivalent to `DISCOVERY-001` already tracked in `BACKLOG.md`) and **A4** (render worker for JS-only sources — explicitly cited in WP 8.6) both block this phase per Appendix A. Neither is decided yet.
**Status of this phase:** Prepared for grooming. Nothing implemented. Nothing in `IN PROGRESS`.

Full technical detail: `INGESTION_PLATFORM_ARCHITECTURE.md` §7.8 (the RA/Instagram reasoning — this is where the earlier, corrected framing on that question lives) and §2.2 (the render-worker's place in the pipeline diagram, as an optional component).

---

## Technical specification (verbatim from INGESTION_BACKLOG.md — authoritative)

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 8.1 | `api/ingest-intake` | S | 2.5 | An authenticated endpoint accepting `SourceEvent[]` for a registered manual or render source. Same validation and upsert path. | Posted records appear as `source_records` for the right source. A bad secret gives 401. |
| 8.2 | Capture tool UI | L | 8.1, 4.4, 4.8 | `admin.html` "Capture": paste URL/text/flyer, extract a draft, preview (venue, geo, duplicate candidates, flags), confirm. The flyer uploads to `event-flyers` in the same step. | One real flyer goes from upload to published with no SQL, and its duplicate check caught against a seeded duplicate. |
| 8.3 | Agent-session payload format | S | 8.1 | A documented JSON payload that agent-assisted sessions produce instead of SQL files, validated by 8.1. | A sample session output validates and imports. |
| 8.4 | Migrate recent manual SQL batches as records | S | 8.1, 2.10 | RA pulls 1–9 and the Instagram pulls are represented as `source_records` of their manual sources (provenance only). | Every `ra-*` event has a record under `ra-manual`. |
| 8.5 | RA / Instagram policy decision applied (A3) | S | — | Whatever Jody decides for A3 is recorded in the registry policy fields, and in `sources.html` if it's public. | Registry rows reflect the decision. The capture tool shows the policy note on those sources. |
| 8.6 | Render worker (if A4 approved) | L | 5.1, 8.1 | A GitHub Actions scheduled Playwright job that claims `js_rendered` jobs through the API, respects robots, the UA and per-host limits, and posts HTML snapshots or records to intake. | Pilot: one permitted JS-only source is active. The worker never processes a source whose policy denies it (test with a denied fixture). |
| 8.7 | Outreach tracker | S | 5.3 | Registry fields and a console view for partnership and feed asks (sent, response, outcome), with drafted ask text generated from the source row. | The Scarab, Metro Times, RA, CrowdWork and Communico asks are tracked. |

## Project-management tracking

| WP | Status | Priority | Recommended Model | Architecture Gate | Product Owner Decision | Blocked By |
|---|---|---|---|---|---|---|
| 8.1 | BACKLOG | Medium (foundational for the rest of the phase; not on minimum path) | Sonnet 5 | None flagged | — | WP 2.5 |
| 8.2 | BACKLOG | Medium-High (real moderator-facing product value — replaces ad hoc SQL capture) | Sonnet 5 | Opus 5 review recommended (capture-tool design) | — | WP 8.1, 4.4, 4.8 |
| 8.3 | BACKLOG | Medium | Sonnet 5 | None flagged | — | WP 8.1 |
| 8.4 | BACKLOG | Medium | Sonnet 5 | None flagged | — | WP 8.1, 2.10 |
| 8.5 | BACKLOG | High (formalizes a currently ad hoc, ToS-risky practice — see `DECISIONS.md` "Open, not yet decided" / `DISCOVERY-001`) | Sonnet 5 (after decision) | None flagged | **A3 (Resident Advisor/Instagram capture practice) — explicitly cited in this WP's own text; equivalent to `DISCOVERY-001` already tracked in `BACKLOG.md`** | Product Owner Decision A3 |
| 8.6 | BACKLOG | **Low — explicitly deferred by the architecture's own recommendation** ("defer until probing shows ≥ 10 permitted JS-only P0–P1 sources") | Sonnet 5 (after decision + gate) | **Opus 5 review required before implementation, if A4 is approved** | **A4 (render worker for JS-only sources) — explicitly cited in this WP's own text; recommendation in Appendix A is to defer** | WP 5.1, 8.1; Product Owner Decision A4 |
| 8.7 | BACKLOG | Low-Medium | Sonnet 5 | None flagged | — | WP 5.3 |
