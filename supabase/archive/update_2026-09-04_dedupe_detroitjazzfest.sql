-- Consolidate the Detroit Jazz Festival duplicates Jody found, 2026-09-04.
--
-- Live-queried the database directly (via the Supabase REST API) to find
-- every "Detroit Jazz Festival" row rather than guess — there were 8, not 2:
--   1. Four old manual rows (source='Manual', external_id=null, created
--      2026-08-23 — predates this session), one bare "Detroit Jazz
--      Festival" per day Sep 4-7, all time_display='All day'. The Sep 4 one
--      (id ba848fbd-...) already had 3 press articles linked to it via
--      editorial_article_events (2 WDET pieces + 1 Hour Detroit piece) —
--      the "As seen in" badge Jody's screenshot showed.
--   2. One WDET-cron row (source='WDET', external_id='wdet-250808', titled
--      "47th Detroit Jazz Festival", Sep 4 only).
--   3. Our three new detroitjazzfest-2026-fri/sat-sun/mon rows from
--      update_2026-09-04_detroitjazzfest_hours.sql (2026-09-04, this
--      session) — the best data: real per-day hours, ticket URL, VIP-tier
--      note, dated source.
--
-- Plan: keep the three detroitjazzfest-2026-* rows, re-point the 3 press
-- articles from the old manual Sep-4 row onto ALL THREE surviving rows
-- (this is genuinely festival-wide coverage, not specific to one day — and
-- per Jody's separate "let an event have as many articles as it needs"
-- request, editorial_article_events already supports several articles per
-- event AND several events per article), then remove the old rows.
--
-- The WDET row can't just be deleted outright: api/cron-wdet.js re-upserts
-- on external_id='wdet-250808' every run and WDET's own feed will keep
-- offering this item, so a plain DELETE would silently come back on the
-- next scheduled run. cron-wdet.js preserves whatever status a row already
-- has on every re-run (status-preserving upsert, same pattern as every
-- other cron here) — so setting status='rejected' sticks permanently
-- instead of being reset. The four old manual rows have external_id=null
-- (nothing automated manages them), so those are safe to hard-delete.
--
-- Idempotent: safe to re-run (re-pointing articles that are already
-- pointed correctly is a no-op via ON CONFLICT; deleting already-deleted
-- rows and re-rejecting an already-rejected row are both no-ops).

-- 1. Re-point the 3 articles currently linked only to the old Sep-4 manual
--    row onto all three surviving per-day-group rows.
insert into editorial_article_events (article_id, event_id)
select aae.article_id, surviving.id
from editorial_article_events aae
cross join (
  select id from events
  where external_id in ('detroitjazzfest-2026-fri', 'detroitjazzfest-2026-sat-sun', 'detroitjazzfest-2026-mon')
) surviving
where aae.event_id = 'ba848fbd-65e1-441a-bfc3-479d1c97db52'
on conflict (article_id, event_id) do nothing;

-- 2. Give each of those articles a real matched_event_id too (currently
--    null-able single-pointer column, used only by admin.html's "still
--    needs review" queue filter — see migration_011/021) so they don't
--    read back as "unmatched." Point at the Friday row as the canonical
--    single match; the join table above is what actually drives every
--    multi-event/multi-article display.
update editorial_articles
set matched_event_id = (select id from events where external_id = 'detroitjazzfest-2026-fri')
where id in (
  select article_id from editorial_article_events
  where event_id = 'ba848fbd-65e1-441a-bfc3-479d1c97db52'
);

-- 3. Remove the old manual duplicate rows (their editorial_article_events
--    rows cascade-delete automatically — see migration_021's "on delete
--    cascade" — now that the articles are safely re-pointed above).
delete from events where id in (
  'ba848fbd-65e1-441a-bfc3-479d1c97db52', -- Sep 4, Manual, "All day"
  '97280896-85b0-4811-84d9-ccd75db4f673', -- Sep 5, Manual, "All day"
  '60432fb5-7bee-4656-aeb1-0e678db1eab6', -- Sep 6, Manual, "All day"
  '585ed033-4a4b-4c00-8a92-4f947dec9f81'  -- Sep 7, Manual, "All day"
);

-- 4. Suppress (don't delete) the WDET duplicate — see the header comment
--    for why a hard delete wouldn't stick.
update events set status = 'rejected'
where id = '73d9276f-c9d1-4b40-854e-f2c4c836cf9c'; -- external_id wdet-250808, "47th Detroit Jazz Festival"
