-- Rollback for migration_047_events_is_pick.sql. Not guarded: dropping the columns discards every pick flag. Run only with owner approval.
-- After this, /calendar.ics answers 503 until the feed is reverted or the column returns.
alter table public.events drop column if exists picked_at;
alter table public.events drop column if exists is_pick;
