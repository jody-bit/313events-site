-- Migration 009: add 'community' to event_category
--
-- Context: importing two organizer-compiled .ics feeds (2026-08-26,
-- "detroit_black_events_perpetuity.ics" / "detroit_all_events_taxonomy.ics")
-- surfaced one event — "Black Leaders Detroit Presents: Speak For Yourself"
-- (a community discussion/networking dinner) — that didn't cleanly fit any
-- of the 11 previously-locked categories (Music, Theatre & Comedy, Dance &
-- Opera, Visual Arts, Museums & History, Family, Festivals, Food & Markets,
-- Film, Nightlife & Club, Sports). Decision 2026-08-26: add "Community" as
-- a real 12th category rather than force-fitting it elsewhere. This updates
-- the taxonomy lock from the earlier "PRESERVE EXISTING EVENT TYPE
-- TAXONOMY" amendment — that amendment locked the list as of its date, not
-- forever; this is a deliberate, explicit expansion of it, not a violation.
--
-- Postgres requires ADD VALUE to run outside a transaction block with other
-- type usage in older versions; IF NOT EXISTS makes this safe to re-run
-- regardless. Run this on its own, before inserting any category='community'
-- rows.

alter type event_category add value if not exists 'community';

-- ---------------------------------------------------------------------------
-- Also required for this same import: the public "submit a pending event"
-- RLS policy (schema.sql's "public submit pending events") was already
-- correct, but the anon role was never actually GRANTed table-level INSERT
-- on events — RLS policies only take effect on top of a base grant, so
-- without this, every anon insert attempt fails with a row-level-security
-- error even though the policy itself is fine. Harmless to re-run.
grant insert on events to anon;
