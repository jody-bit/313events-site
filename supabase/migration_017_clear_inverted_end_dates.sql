-- Migration 017: Clear end_date where it's before start_date
--
-- Context: submit.html's "End date (if multi-day)" field is a completely
-- independent date picker with no client- or server-side check tying it to
-- Start date — nothing stops a submitter from landing on the wrong day in
-- that picker for what's actually a single-day event. Confirmed affected:
-- "Fleatroit Junk City" (start_date 2026-08-30, end_date 2026-08-29 — one
-- day *before* it starts). Caught 2026-08-29 while Jody was trying to show
-- the listing to the event's own owner the day before it ran.
--
-- Nothing on the live site actually reads end_date today (mapSupabaseRow()
-- in index.html/calendar.html/map.html doesn't select it), so this wasn't
-- what was hiding the listing — it's a data-quality cleanup, not a
-- visibility fix. Going forward this exact shape is now rejected at
-- submission time by api/submit.js (see its endDate/startDate check) and
-- the submit.html date picker won't let you pick an earlier end date in
-- the first place — this migration only cleans up rows that predate both
-- of those guards.
--
-- Clears end_date back to NULL rather than guessing a "correct" value —
-- for a single-day event the right fix is just "no end date", not a
-- fabricated one. Safe to re-run: a row with end_date already NULL or
-- already >= start_date doesn't match the WHERE clause.
--
-- Preview before running the UPDATE below:
--
--   select id, title, start_date, end_date from events
--   where end_date is not null and end_date < start_date;

update events
set end_date = null
where end_date is not null and end_date < start_date;
