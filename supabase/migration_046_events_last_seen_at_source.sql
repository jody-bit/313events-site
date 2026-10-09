-- migration_046_events_last_seen_at_source.sql
-- Admin Hardening Slice 2, Part C (currency foundation). NOT applied by any
-- deploy step: run by hand, with Product Owner approval, in the Supabase
-- SQL editor.
--
-- One nullable column, no default, no backfill, no index, no trigger.
-- NULL means "not observed since this column existed" — the honest value
-- for every existing row; nothing is invented for history we do not have.
--
-- Written only by api/_lib/event-upsert.js, and only when the Vercel
-- environment variable EVENTS_LAST_SEEN_AT_SOURCE=on: every row a connector
-- upserts is a row it has just seen at its source, so the batch's hand-over
-- time is stamped on each. Admin edits, enrichment and duplicate merges do
-- not touch it (unlike updated_at, which every UPDATE bumps), which is what
-- makes it a real "last seen at source" instead of a "last touched" proxy.
--
-- Order: apply this migration, THEN set the variable. The other order is
-- safe too (the helper resends a group without the column when PostgREST
-- says it is missing), just one wasted request per group until applied.
--
-- events_public is deliberately not changed: currency is an Admin concern.
--
-- REVERSE:
--   (1) unset EVENTS_LAST_SEEN_AT_SOURCE in Vercel (stops the writes), then
--   (2) alter table public.events drop column if exists last_seen_at_source;

alter table public.events add column if not exists last_seen_at_source timestamptz;

comment on column public.events.last_seen_at_source is
  'When an ingestion connector last saw this event at its source (api/_lib/event-upsert.js, EVENTS_LAST_SEEN_AT_SOURCE=on). NULL = not observed since migration_046. Stale is not cancelled.';
