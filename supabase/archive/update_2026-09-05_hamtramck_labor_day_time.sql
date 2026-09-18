-- 2026-09-05 — Jody flagged that the Hamtramck Labor Day Festival (running
-- today through Monday, Sept 5-7) had no start time at all on the live site,
-- and asked for event start time to be treated as critical information to
-- check going forward (see admin.html's "Needs follow-up" section, updated
-- alongside this patch to flag missing time_display too).
--
-- This event's own row already carries the answer — it was just never
-- pulled out into the structured time_display field when the whole
-- "City of Hamtramck (2026 Annual Events flyer)" batch was seeded (see
-- seed_hamtramck_2026_annual_events.sql, which never had a time_display
-- column at all). Its description already says "Runs noon-10pm each day."
--
-- The other 15 events from that same flyer batch also have no time_display,
-- but unlike this one, their own descriptions never mention a time in the
-- first place ("Annual community 5k walk/run cultural celebration.", "Fat
-- Tuesday cultural celebration.", etc.) — nothing to extract, so nothing is
-- patched here for those. They'll now surface in admin.html's "Needs
-- follow-up" section (once this session's admin.html change is pushed) so
-- Jody can research and fill in real times for each one individually rather
-- than have one guessed here.
--
-- Matched on external_id (stable, from the original seed) rather than
-- title, in case the title ever changes.

update events
set time_display = 'Noon – 10 PM each day'
where external_id = 'hamtramck-2026-labor-day-festival';
