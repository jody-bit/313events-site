-- Set the Detroit Jazz Festival's daily hours, requested by Jody 2026-09-04.
-- Sourced from the Detroit Jazz Festival's own FAQ (detroitjazzfest.org/faq/),
-- Fox 2 Detroit's festival guide, and The Perna Team's festival guide:
--
--   Friday, Sep 4:                5:30 PM - 11:00 PM
--   Saturday, Sep 5 & Sunday, Sep 6: 12:30 PM - 11:00 PM
--   Monday, Sep 7 (Labor Day):     12:30 PM - 8:00 PM
--
-- Same "one row spans the whole run" situation as
-- update_2026-09-04_mistatefair_hours.sql (see that file's header for the
-- full reasoning) — this event is stored as ONE row spanning 2026-09-04
-- through 2026-09-07, shown on every date it spans with the same
-- time_display string each day, so the string below spells out the whole
-- day-by-day schedule at once rather than picking one day's hours.
--
-- note is extended (not overwritten) to keep the existing VIP-packages
-- caveat visible alongside the new sourcing note — see
-- seed_2026-09-04_more_annual_events.sql's detroitjazzfest-2026 row, kept
-- in sync with this text so a future re-run of that seed file doesn't
-- revert it.
--
-- Idempotent: safe to re-run.

update events
set
  time_display = '5:30–11 PM Fri, 12:30–11 PM Sat–Sun, 12:30–8 PM Mon (Labor Day)',
  note = 'VIP concert packages are ticketed separately (detroitjazzfest.org/vip-experience-packages/) — main-stage admission itself is free.'
where external_id = 'detroitjazzfest-2026';
