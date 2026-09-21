# EPIC-003 — Entity & Identity Data Buildout

**Status:** Partially built. Re-scoped from the original 2026-08 audit since several of its blockers have since closed.

## Objective

Real, indexable per-entity pages (events, venues, organizers, neighborhoods) backed by accurate identity data — no fabricated activity, no invented organizations, no placeholder content standing in for real data that doesn't exist yet.

## Problem (as originally identified, 2026-08)

`AUDIT_AND_ARCHITECTURE.md` originally flagged: no per-entity URLs at all, no `organizers` table, no neighborhood field on events, `events.venue_id` never populated (making the neighborhood backfill inert), and no venue photography field.

## Current status — what's since changed

- **Closed:** No per-entity routing. `event-template.html` and `venue-template.html` now exist (server-rendered, with dynamic OG cards via `api/event-meta.js`/`api/venue-meta.js`), plus `venues.html`.
- **Closed:** `events.venue_id` never populated. Resolved 2026-09-13 via `api/_lib/venue-lookup.js` (exact-name match, going-forward) plus a one-time historical backfill (`supabase/archive/update_2026-09-13_backfill_venue_id_matched_venues.sql`). See `DEC-012`.
- **Still open:** No `organizers` pages exist, and the `organizers` table remains deliberately, mostly unpopulated (only Paxahau) per `DEC-005` — hand-curation only, no auto-derivation from `source`.
- **Still open:** No venue photography field.
- **Still open:** No structured `start_time` column — `time_display` remains a loose human string; NOW/TONIGHT-style logic (EPIC-002) can only approximate from it.

## Scope

- Organizer population strategy: define how a promoter/institution gets added (hand-curation, same method used for the original 187-event seed set) and build organizer profile pages once there's real data to populate them with.
- Venue photography field + backfill plan.
- Evaluate whether a structured `start_time` column is worth adding given how many downstream features (EPIC-002's TONIGHT logic, any future "happening in the next 3 hours" feature) only approximate today.

## Out of scope

- The ingestion-side venue/organizer *resolution* work as part of scaling to hundreds of new sources — that's EPIC-001's dedup/entity-resolution phase. This epic is about the current, already-known entity set's data completeness and public-facing pages, not about ingesting net-new entities at scale.

## Success criteria

Organizer profile pages exist and show only hand-verified real promoters/institutions; venue pages have real photography where available and an honest placeholder where not (never a fabricated stock image implying activity that doesn't exist).

## Architecture implications

Organizer population is a data/process question, not a schema one (the `organizers` table and `events.organizer_id` FK already exist, migration_002). Venue photography needs a new column/storage bucket, similar in shape to the existing `event-flyers` bucket (migration_013).

## Dependencies

Organizer pages depend on the organizer population strategy being decided first (`PRODUCT DECISION REQUIRED`, `PRODUCT.md`).

## Stories / tasks

Not yet broken into `BACKLOG.md` items pending the organizer-strategy decision.

## Risks

Low — this is incremental, additive work on an already-partially-built foundation. The main risk is scope creep into "populate organizers for every event," which `DEC-005` already explicitly rejects in favor of hand-curation of clearly-real entities only.

## Open questions

Organizer population strategy and timeline (`PRODUCT DECISION REQUIRED`, `PRODUCT.md`). Whether a structured `start_time` column is worth the migration effort given current approximation is "good enough" for existing features.

## Relevant decisions

`DEC-005` (source ≠ organizer, hand-curation only), `DEC-012` (venue_id resolution pattern this epic's remaining work builds on top of).
