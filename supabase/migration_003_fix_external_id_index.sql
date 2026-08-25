-- Fixes the events_external_id_key unique index so cron upserts actually work.
--
-- The original index (in schema.sql, before 2026-08-25) was:
--   create unique index events_external_id_key on events (external_id)
--     where external_id is not null;
--
-- That partial index is why every single cron — Halo, Trinosophes, WDET, and
-- all five added 2026-08 — has been failing every run with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification" (Postgres error 42P10)
--
-- Cause: every cron's Supabase REST call uses `?on_conflict=external_id`,
-- which PostgREST always translates to a plain `ON CONFLICT (external_id)`.
-- Postgres requires that to exactly match the index it's targeting — a plain
-- ON CONFLICT can never match a *partial* index, no matter what the WHERE
-- clause says.
--
-- Fix: drop the partial index and replace it with a plain one. This loses
-- nothing — in standard SQL, NULL is never equal to another NULL, so a plain
-- unique index already permits unlimited rows with external_id = NULL
-- (manually-entered events with no dedupe key) without needing a WHERE
-- clause at all. The partial index was solving a problem that didn't exist.
--
-- Safe to run against existing data: as of 2026-08-25 production has 161
-- rows, all with external_id = NULL — a plain unique index allows that same
-- as the partial one did, so this will not fail on existing rows.

drop index if exists events_external_id_key;
create unique index if not exists events_external_id_key on events (external_id);
