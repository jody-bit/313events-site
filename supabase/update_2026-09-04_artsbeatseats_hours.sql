-- Set Arts, Beats & Eats' daily hours, requested by Jody 2026-09-04.
-- Sourced from artsbeatseats.com and the Free Press' storm-delay coverage
-- (freep.com, 2026-09-03 — Friday's opening pushed from 11 AM to noon due
-- to storm/wind delays).
--
--   Friday, Sep 4 (Labor Day weekend kickoff): Noon - 11:00 PM
--     (fine arts fair itself starts later, 2:00 PM)
--   Saturday, Sep 5:                            11:00 AM - 11:00 PM
--   Sunday, Sep 6:                               11:00 AM - 11:00 PM
--   Monday, Sep 7 (Labor Day):                   11:00 AM - 9:00 PM
--
-- Same "one row spans the whole run" situation as
-- update_2026-09-04_mistatefair_hours.sql (see that file's header for the
-- full reasoning) — this event is stored as ONE row spanning 2026-09-04
-- through 2026-09-07, shown on every date it spans with the same
-- time_display string each day, so the string below spells out the whole
-- day-by-day schedule at once rather than picking one day's hours.
--
-- The separate, slightly different fine-arts-fair-only schedule (Fri
-- 2-9 PM, Sat-Sun 11 AM-9 PM, Mon 11 AM-5 PM) is NOT folded into
-- time_display — one time_display string covering two different schedules
-- for two different things (the festival at large vs. just its art fair
-- component) would be unreadable on a card. It's covered in note instead.
--
-- note is extended (not overwritten) to keep the existing sourcing caveat
-- visible alongside the new hours/weather-delay caveats — see
-- seed_2026-09-04_more_annual_events.sql's artsbeatseats-2026 row, kept in
-- sync with this text so a future re-run of that seed file doesn't revert
-- it.
--
-- Idempotent: safe to re-run.

update events
set
  time_display = 'Noon–11 PM Fri, 11 AM–11 PM Sat–Sun, 11 AM–9 PM Mon (Labor Day)',
  note = 'Official festival site (artsbeatseats.com) wasn''t directly fetchable this session (redirect loop) — price/dates cross-checked via its Showpass ticketing page and ClickOnDetroit''s 2026 coverage instead. Friday''s official opening was delayed to noon (from a scheduled 11 AM) due to storm/wind delays — freep.com, 2026-09-03. The fine arts fair runs on its own slightly different schedule: 2:00-9:00 PM Friday, 11:00 AM-9:00 PM Saturday-Sunday, 11:00 AM-5:00 PM Monday.'
where external_id = 'artsbeatseats-2026';
