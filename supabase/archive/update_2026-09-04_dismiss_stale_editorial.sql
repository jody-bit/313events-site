-- One-time cleanup of admin.html's Press Coverage queue, requested by Jody
-- 2026-09-04 ("if an event is happening in the past, I don't need the
-- article that goes with it") after her uploaded screenshot showed several
-- 2018 Detroit Music Magazine articles still sitting in the unmatched queue.
--
-- These three predate this project's events table entirely (their
-- accompanying event -- Movement 2018, a Baron Crooks video premiere -- is
-- eight years gone) and were never going to match anything; they're pure
-- backlog. admin_dismissed=true (not a delete) so they simply drop out of
-- admin.html's queue, same reversible flag the "Not a fit" button sets.
--
-- This is a one-time pass for the EXISTING backlog only. Going forward,
-- api/cron-editorial.js's retryUnmatchedArticles() now auto-dismisses any
-- still-unmatched article once it's more than STALE_ARTICLE_DISMISS_DAYS
-- (120) old on every scheduled run, so this kind of backlog shouldn't
-- reaccumulate -- see that file's comment for the full reasoning.
--
-- Idempotent: safe to re-run (re-setting admin_dismissed=true is a no-op).

update editorial_articles
set admin_dismissed = true
where id in (
  '152095b4-2128-4e7b-91af-320ccc8ba6ab', -- "Baron Crooks Tangle Parade – 'Belly Ache' (Video) | DMM Premiere", Detroit Music Magazine, 2018-03-19
  '71ae004a-bb23-4170-b02d-aca666bb1da8', -- "The DMM Guide to Movement 2018", Detroit Music Magazine, 2018-05-25
  '9ce3f33b-01ec-4145-af21-fb173777dee1'  -- "Machine Listening: Movement 2018", Detroit Music Magazine, 2018-07-14
)
and matched_event_id is null;
