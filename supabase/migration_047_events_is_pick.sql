-- migration_047_events_is_pick.sql
-- Weekly curated picks: one flag so the subscribable calendar feed (/calendar.ics) can list only the picks.
-- NOT applied by any deploy step: run by hand, with Product Owner approval (exact hash), by Event Intelligence only.
--
-- Two columns, additive, no backfill, no index, no trigger. Every existing row is NOT a pick (default false), which is the
-- honest value; nothing is invented. Written only by the admin portal's set_pick action. Connector upserts never name these
-- columns, so a re-ingest cannot clear or set a pick. events_public is deliberately not changed (curation is internal).
--
-- Order: apply this migration, THEN the feed works. Before it is applied /calendar.ics answers 503 (the column does not exist)
-- and the admin toggle answers an error; nothing else depends on the column.
--
-- REVERSE (see migration_047_events_is_pick.rollback.sql):
--   alter table public.events drop column if exists picked_at; alter table public.events drop column if exists is_pick;

alter table public.events add column if not exists is_pick boolean not null default false;
alter table public.events add column if not exists picked_at timestamptz;

comment on column public.events.is_pick is
  'true when the editor has chosen this event for the weekly picks (the only rows /calendar.ics lists). Set only by admin-events set_pick. Default false.';
comment on column public.events.picked_at is
  'When is_pick was last set true; NULL when not a pick.';
