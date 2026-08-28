-- Migration 014: Reformat raw 24-hour time_display values into "h:MM AM/PM"
--
-- Context: api/submit.js stored <input type="time">'s raw browser value
-- ("18:00") straight into time_display with no conversion — every other
-- source on this site (RSS/scraper crons) already formats its own times as
-- "6:00 PM", so this was the one path showing "army time" on event.html and
-- index.html (Jody, 2026-08-28). Fixed going forward in api/submit.js
-- (formatTimeDisplay()); this migration cleans up rows already submitted
-- through the public form before that fix shipped — confirmed affected:
-- "Fleatroit Junk City" (stored "12:00", ambiguous with noon so easy to
-- miss) and "Art 4 Earth's Sake" (stored "18:00", the one that got
-- noticed). There may be others from the same submission path.
--
-- Only touches rows matching the exact raw "H:MM"/"HH:MM" 24-hour shape
-- (anchored start-to-end) — a time_display that already reads "6:00 PM" or
-- anything else doesn't match and is left untouched. Safe to re-run: a row
-- this already fixed no longer matches the WHERE clause.
--
-- Written as plain split_part/int arithmetic rather than
-- to_char(to_timestamp(...), 'FMHH12:MI AM') on purpose — this sandbox has
-- no way to execute-test against a live Postgres, and to_char's FM-prefix
-- scoping rules (does it suppress zero-padding on just HH12, or leak into
-- MI too and produce "6:5 PM"?) weren't worth trusting from memory alone on
-- a live table. Every branch below was hand-traced instead: 00:00->12:00
-- AM, 06:05->6:05 AM, 09:00->9:00 AM, 12:00->12:00 PM, 18:00->6:00 PM,
-- 23:59->11:59 PM.
--
-- Preview before running the UPDATE below, to sanity-check against real
-- rows first (same "verify before trusting" habit this project already
-- leans on):
--
--   select id, title, time_display,
--     (case
--       when split_part(time_display, ':', 1)::int = 0 then '12'
--       when split_part(time_display, ':', 1)::int > 12
--         then (split_part(time_display, ':', 1)::int - 12)::text
--       else split_part(time_display, ':', 1)::int::text
--     end)
--     || ':' || split_part(time_display, ':', 2)
--     || ' ' || (case when split_part(time_display, ':', 1)::int >= 12 then 'PM' else 'AM' end)
--     as would_become
--   from events
--   where time_display ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$';

update events
set time_display =
  (case
    when split_part(time_display, ':', 1)::int = 0 then '12'
    when split_part(time_display, ':', 1)::int > 12
      then (split_part(time_display, ':', 1)::int - 12)::text
    else split_part(time_display, ':', 1)::int::text
  end)
  || ':' || split_part(time_display, ':', 2)
  || ' ' || (case when split_part(time_display, ':', 1)::int >= 12 then 'PM' else 'AM' end)
where time_display ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$';
