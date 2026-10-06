# EPIC-019 — Cultural Archive, Tours & Data Products

**Status:** IDEA — captured 2026-10-06 by Product Owner request. **Direction-preservation only.** Nothing is designed, built, estimated or scheduled. Does not displace Sprint Zero. Explicitly **no** generalized entity/knowledge-graph infrastructure is to be built for this epic; the additive path identified in `ENGINEERING_READINESS_REVIEW.md` (§26, Future Product Extensibility Check) is what must stay clean.

## Objective

Preserve the longer-term direction that the event record becomes a durable cultural artifact, that Detroit/Orbit cultural data can compose personalized experiences, and that the structured, historical database is itself a product.

## 1. Cultural archive connection

An historical event page could eventually contain: the original listing; flyer; venue; performers/artists; organizer; audience material; photographs; video; social posts; press; recordings; corrections; provenance; relationships to people, organizations and places. This supports the larger cultural-knowledge/tour/history direction **without requiring a knowledge graph now**. Event-level capture of media is `EPIC-018` (OL.3, OL.12, OL.13); the cross-entity relationships are `EPIC-003`'s identity buildout (venues live today; artists/organizations are schema-only or absent — see `DISCOVERY-021`, `DISCOVERY-009`).

## 2. Future tour / cultural-experience capability

Preserve an additive path for personalized Detroit/Orbit experiences built from 313's cultural data. Future structured knowledge could include: places, landmarks, architecture, neighborhoods, venues, artists, historians, cultural figures, organizations, stories, music history, community history, events, historical occurrences, relationships, evidence/provenance.

Potential experience: a user describes interests and preferences and 313 composes a route/experience from structured knowledge plus live events. Human Detroit experts could eventually participate as paid experience contributors/guides at points along a route.

**Not to be built now:** generalized entity/knowledge-graph infrastructure. Guardrails to honor meanwhile: identity-key shapes (G-4), never destructively overwrite/delete and history on venues (G-1/G-2), no new Postgres enums (G-3), canonical value separate from rights and affiliate decoration (G-5).

## 3. Data / cultural-intelligence product direction

Historical normalized data is potentially a major moat. **Do not discard expired event history** merely because it is no longer useful to the consumer calendar (`DEC-027`; G-1). Possible products, none evaluated: API access; licensed feeds; embeddable calendars/widgets; tourism intelligence; cultural/economic activity reports; historical datasets; custom exports; venue/promoter market intelligence; research access; white-label event discovery.

Constraints: no individual user data is sold (`DEC-021`); licensing/rights of upstream sources must be checked before any redistribution — several sources are manual/editorial-only because their terms prohibit automated use (`DEC-010`; `PRODUCT.md`'s "visibility ≠ authorization"), and a licensed feed of someone else's data is a different question from displaying it; editorial truth stays independent of payment (`DEC-015`).

## 4. Low-operations revenue ideas to preserve (inventory, mapped to existing owners — not duplicated)

| Idea | Existing owner |
|---|---|
| Ticket affiliate revenue | `EPIC-014` |
| Travel / hotel / activity affiliate revenue (where appropriate) | `EPIC-014` (extension; no platform researched — `DISCOVERY-016`) |
| Direct local advertising, sponsorship, sponsored categories/areas, newsletter sponsorship | `EPIC-016` |
| Promoted events, clearly labeled and separate from editorial | `EPIC-015`, firewall `EPIC-010` |
| Organizer / Venue Pro | `EPIC-017` |
| Widgets / embeddable calendars; API access; data licensing | **this epic** (§3) — the only items in this list without an owner until now |
| Supporter membership without a consumer-discovery paywall | **this epic** — new, unscoped; relates to `EPIC-013` (returning-visitor relationship) |

Do not implement any of these during Sprint Zero. Build order for the established revenue epics remains `DEC-019`; these additions have no position in it and would need a Product Owner decision to be sequenced.

## Out of scope

Everything implementation-level. This file holds direction so it is not lost.

## Dependencies

`EPIC-003` (entity/identity buildout), `EPIC-018` (event identity, retention, media), the Engineering Readiness Review guardrails, `EPIC-011` (measurement), `DEC-021`, `DEC-015`/`DEC-020`. Source terms-of-use for any data-licensing idea.

## Open questions

See `DISCOVERY-023` in `BACKLOG.md`.

## Relevant decisions

`DEC-005`, `DEC-010`, `DEC-015`, `DEC-017`, `DEC-019`, `DEC-021`, `DEC-027`. No new decision is recorded by this capture.
