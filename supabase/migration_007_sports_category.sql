-- Migration 007: add 'sports' to event_category
--
-- Context: sports (Tigers, Lions, Pistons, Red Wings, etc.) were explicitly
-- excluded from day one — cron-ticketmaster.js's mapCategory() had a
-- deliberate comment scoping this to an arts/culture/nightlife calendar.
-- Decision 2026-08-26: include sports too. This migration adds the enum
-- value; cron-ticketmaster.js is updated separately to actually map
-- Ticketmaster's "Sports" segment to it instead of dropping those events.
--
-- Postgres requires ADD VALUE to run outside a transaction block with other
-- type usage in older versions; IF NOT EXISTS makes this safe to re-run
-- regardless. Run this on its own, before anything that inserts
-- category='sports' rows (i.e. before re-running the Ticketmaster cron).

alter type event_category add value if not exists 'sports';
