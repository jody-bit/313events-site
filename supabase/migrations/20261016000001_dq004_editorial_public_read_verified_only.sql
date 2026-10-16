-- DQ-004 (2026-10-16): verified-only editorial associations. Migration 2 of 2: public read.
--
-- Run AFTER migration 1 and the classification backfill, otherwise every association is hidden
-- (all rows are 'candidate' until classified). The database, not the page code, then guarantees
-- that the public key can read only verified rows, and only the non-internal columns
-- (verification_basis / verification_history / verified_by stay private to service_role).
--
-- Rollback (restores the previous behaviour exactly):
--   drop policy if exists "public read verified editorial article events" on editorial_article_events;
--   create policy "public read editorial article events" on editorial_article_events for select using (true);
--   grant select on editorial_article_events to anon, authenticated;

drop policy if exists "public read editorial article events" on editorial_article_events;
drop policy if exists "public read verified editorial article events" on editorial_article_events;
create policy "public read verified editorial article events" on editorial_article_events
  for select using (verification_status = 'verified');

revoke select on editorial_article_events from anon, authenticated;
grant select (article_id, event_id, created_at, verification_status) on editorial_article_events to anon, authenticated;
