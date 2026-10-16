-- DQ-004 (2026-10-16): verified-only editorial associations. Migration 1 of 2: columns only.
--
-- Additive and idempotent. Behaviour does not change when this runs: existing rows all
-- default to 'candidate' (fail closed), and the public-read policy is untouched until
-- migration 2 (20261016000001_dq004_editorial_public_read_verified_only.sql).
-- Production order: this file -> supabase/proposed/dq004_backfill_classification.sql -> migration 2,
-- then the code deploy is safe (the code selects/inserts these columns, so this file must come first).
--
-- Rollback: the columns are additive and may stay. To remove them:
--   alter table editorial_article_events drop column verification_status, drop column verified_by,
--     drop column verified_at, drop column verification_basis, drop column verification_history;

-- ---- Step A: columns -------------------------------------------------------------------
alter table editorial_article_events
  add column if not exists verification_status  text        not null default 'candidate',
  add column if not exists verified_by          text,
  add column if not exists verified_at          timestamptz,
  add column if not exists verification_basis   text,
  add column if not exists verification_history jsonb       not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.editorial_article_events'::regclass
      and conname = 'editorial_article_events_verification_status_check'
  ) then
    alter table editorial_article_events
      add constraint editorial_article_events_verification_status_check
      check (verification_status in ('verified', 'candidate', 'needs_follow_up', 'rejected'));
  end if;
end $$;

create index if not exists editorial_article_events_status_idx on editorial_article_events (verification_status);
