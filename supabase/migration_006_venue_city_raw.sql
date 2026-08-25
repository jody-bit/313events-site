-- Migration 006: events.venue_city_raw
--
-- Context: the Ticketmaster cron (api/cron-ticketmaster.js) now searches the
-- full 75-mile radius, not just Detroit — a live run surfaced real events at
-- Meadow Brook Amphitheatre (Rochester Hills), Michigan Lottery Amphitheatre
-- at Freedom Hill (Sterling Heights), Pine Knob Music Theatre (Clarkston),
-- Royal Oak Music Theatre (Royal Oak), etc. The site only ever displayed
-- venue_name_raw, with no city shown, so every one of those looked
-- Detroit-local on the calendar even though they aren't.
--
-- This is a free-text sibling to venue_name_raw (same pattern: a display
-- fallback, not a foreign key), not a fix for the deeper events.venue_id gap
-- — that's still open, still tracked in FOUNDATIONAL_ITEMS.md, and is the
-- "real" long-term home for this (venues.city, one join away). This column
-- exists so city displays correctly TODAY without waiting on that larger
-- fix. Safe to re-run.

alter table events add column if not exists venue_city_raw text;
comment on column events.venue_city_raw is
  'Free-text city for display, e.g. "Rochester Hills" — same fallback pattern as venue_name_raw. Populated by crons whose source spans multiple cities (currently just Ticketmaster); NULL/absent means "assume Detroit" for older single-venue sources. Superseded eventually by venues.city via venue_id — see FOUNDATIONAL_ITEMS.md.';
