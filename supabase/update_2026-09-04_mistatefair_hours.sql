-- Set the Michigan State Fair's daily hours, requested by Jody 2026-09-04.
-- Sourced directly from michiganstatefairllc.com/dailyschedule:
--   Thursday & Friday:            11:00 AM - 8:00 PM (entrance/box office close 7:00 PM)
--   Saturday, Sunday & Monday:    10:00 AM - 8:00 PM (entrance/box office close 7:00 PM)
--
-- This event is stored as ONE row spanning 2026-09-03 (Thu) through
-- 2026-09-07 (Mon) — see seed_2026-09-04_more_annual_events.sql — and
-- index.html/calendar.html show every multi-day event's card on each date
-- it spans (expandDateRange()) using this same single time_display string
-- every day, rather than one row per day. So time_display below spells out
-- both halves of the schedule in one string rather than picking just one
-- day's hours; the "hide once ended" logic (matchesFilters()'s
-- parseTimeRange()) only reads the LAST h:mm-AM/PM pair it finds for the
-- actual closing time, which is 8:00 PM on both halves of this string, so
-- that behavior stays correct on every day of the run regardless of which
-- half a visitor is looking at.
--
-- note is extended (not overwritten) to keep the existing Ultimate
-- Admission-tier caveat visible on the card alongside the new
-- entrance-cutoff caveat — see seed_2026-09-04_more_annual_events.sql's
-- mistatefair-2026 row, kept in sync with this text so a future re-run of
-- that seed file doesn't revert it.
--
-- Idempotent: safe to re-run.

update events
set
  time_display = '11:00 AM–8:00 PM Thu & Fri, 10:00 AM–8:00 PM Sat–Mon',
  note = 'price_from is base "Fair Admission" ($10); an "Ultimate Admission" tier ($42, includes rides/shows) also exists. Entrance and box office close at 7:00 PM nightly, even though the fair itself runs until 8:00 PM.'
where external_id = 'mistatefair-2026';
