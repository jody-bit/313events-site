-- 2026-09-23 — title-corrected retry of
-- update_2026-09-22_white-shag-reunion-time.sql.
--
-- That file's own header explicitly flagged the risk: "the exact title
-- below ('White Shag Reunion') is taken directly from the Product Owner's
-- request; this repo has no independent record of the row to confirm the
-- title is stored verbatim. If this UPDATE affects 0 rows when run, the
-- stored title likely differs slightly... needs to be confirmed before
-- retrying." The Product Owner has now confirmed exactly that: production
-- stores the title as "The White Shag Reunion" (leading "The"), not
-- "White Shag Reunion". This file re-issues the identical, already-
-- confirmed fix (Doors: 7:00 PM, 2026-10-10) against the corrected title.
--
-- Does not edit or replace the original file -- this project's convention
-- for these one-off `update_*.sql` notes is an append-only log, not
-- in-place correction, so the original mistaken assumption stays visible
-- rather than silently vanishing from history. Running the original file
-- (0 rows affected, matching its own predicted failure mode) and this one
-- is safe and idempotent either way -- the WHERE title match means only
-- the one that actually matches the stored title does anything, and the
-- `(time_display is null or time_display = '')` guard means neither can
-- ever run twice or overwrite a moderator-entered value.
--
-- No end time is invented -- the Product Owner did not provide one, so
-- none is set here, same as the original file.

update events
set time_display = 'Doors 7:00 PM'
where title = 'The White Shag Reunion'
  and start_date = '2026-10-10'
  and (time_display is null or time_display = '');
