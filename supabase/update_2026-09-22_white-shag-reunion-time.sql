-- 2026-09-22 — Jody confirmed the missing start/door time for the existing
-- White Shag Reunion event on 2026-10-10: "Doors: 7:00 PM".
--
-- This event was flagged in admin.html's "Needs follow-up" queue under the
-- 2026-09-05 rule that a missing time_display is treated the same as a
-- missing venue/link — see getMissingFields() in admin.html:
--   if (!e.is_all_day && !(e.time_display && e.time_display.trim())) missing.push('start time');
--
-- No local record of this event exists anywhere in this repo (not seeded by
-- any supabase/*.sql file, not written by any api/cron-*.js connector under
-- a matching source name) -- it was evidently entered directly in
-- production (e.g. a manual admin.html submission) outside this session's
-- visibility, so there is no external_id to match on the way
-- update_2026-09-05_hamtramck_labor_day_time.sql did. Matches on the exact
-- title + date instead, same pattern as
-- update_2026-09-14_admin-followup-cleanup.sql's own start-time fixes
-- (e.g. "update events set time_display = '7:00 PM' where title = '9th
-- Annual NOIR CITY DETROIT' and start_date = '2026-09-18' and
-- (time_display is null or time_display = '');").
--
-- Value format ("Doors 7:00 PM", no colon after "Doors") matches this
-- project's established door-time convention (see e.g.
-- update_2026-09-15_parisbar-julez-and-the-rollerz.sql,
-- update_2026-09-14_paris-bar-industry-mondays.sql: 'Doors 8:00 PM').
--
-- Idempotent and safe: the `(time_display is null or time_display = '')`
-- guard means this only ever fills a genuinely blank field -- it can never
-- overwrite a value a moderator already entered, and running it more than
-- once is a no-op after the first successful run. No other column is
-- touched. No end time is invented -- the Product Owner did not provide
-- one, so none is set here.
--
-- ASSUMPTION FLAGGED: the exact title below ("White Shag Reunion") is
-- taken directly from the Product Owner's request; this repo has no
-- independent record of the row to confirm the title is stored verbatim.
-- If this UPDATE affects 0 rows when run, the stored title likely differs
-- slightly (extra words/punctuation) and needs to be confirmed before
-- retrying.

update events
set time_display = 'Doors 7:00 PM'
where title = 'White Shag Reunion'
  and start_date = '2026-10-10'
  and (time_display is null or time_display = '');
