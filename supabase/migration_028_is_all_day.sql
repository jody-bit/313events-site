-- Lets a source mark an event as genuinely all-day (a festival, an expo, a
-- multi-day run with no single published start time) so the admin
-- follow-up queue can tell "nobody filled this in" apart from "there was
-- never a specific time to fill in" — same idea as migration_027's
-- followup_dismissed, but automatic instead of a manual click, for the
-- specific "missing START TIME" cases that are all-day by nature rather
-- than a real parsing gap. See api/cron-visitdetroit.js's own isAllDay
-- comment (2026-09-16) for the events that prompted this (Detroit Black
-- Film Festival, Metro Detroit Women's Expo, Banana Ball, Detroit Legacy
-- Weekend, and others like them).
alter table events add column if not exists is_all_day boolean not null default false;

comment on column events.is_all_day is
  'True when the source explicitly marked this listing as having no specific time-of-day (a festival/expo run, not a parsing gap). admin.html''s getMissingFields() does not flag start time as missing when this is true.';

insert into schema_migrations (filename) values ('migration_028_is_all_day.sql')
on conflict (filename) do nothing;
