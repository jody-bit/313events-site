-- DQ-004 (2026-10-16): verified-only editorial associations.
--
-- Schema half. Additive and idempotent. Existing rows are NOT classified here: every
-- existing link starts as 'candidate' (hidden) and is classified by the separate,
-- separately approved backfill (supabase/proposed/dq004_backfill_classification.sql).
-- Run order in production: this file (columns only, step A) -> backfill -> public-read
-- policy swap (step B). Both steps are in this file; run step A and B in one transaction
-- together with the backfill so no moment exists where the policy is verified-only but
-- the classification has not been applied (see the release package).
--
-- Rollback:   drop policy "public read verified editorial article events" on editorial_article_events;
--             create policy "public read editorial article events" on editorial_article_events for select using (true);
--             grant select on editorial_article_events to anon, authenticated;   -- restores the old behaviour
--             (the columns are additive and may stay)

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

-- ---- Step B: public read is verified-only, enforced by the database --------------------
-- The public key may read only verified rows, and only the non-internal columns
-- (verification_basis / history / verified_by stay private to service_role).
drop policy if exists "public read editorial article events" on editorial_article_events;
drop policy if exists "public read verified editorial article events" on editorial_article_events;
create policy "public read verified editorial article events" on editorial_article_events
  for select using (verification_status = 'verified');

revoke select on editorial_article_events from anon, authenticated;
grant select (article_id, event_id, created_at, verification_status) on editorial_article_events to anon, authenticated;
