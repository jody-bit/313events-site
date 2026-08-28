-- Migration 016: admin review of unmatched editorial articles
--
-- Context (Jody, 2026-08-28, right after migration_015/the ingestion
-- filter shipped): "I thought you were going to add articles that mention
-- an event to my admin review tool so that I could generate an event for
-- them and then they would be displayed?" — a fair catch. The original
-- question this whole thread started from (radar.html showing "Not yet
-- linked to a listed event" cards) had two halves: (1) articles that don't
-- really cover a specific event shouldn't be stored/shown at all — that's
-- what migration_015 + cron-editorial.js's looksLikeEventCoverage() filter
-- already did; (2) articles that DO plausibly cover a real event 313.events
-- just doesn't have listed yet should give Jody an easy way to create that
-- event from the article, so it stops being a dead-end "not yet linked"
-- card. Only half (1) actually shipped. This migration is the missing data
-- support for half (2): api/admin-editorial.js (new) and admin.html's new
-- "Press coverage" section use this to list the review queue and let a
-- reviewed article drop out of it once handled.
--
-- Every unmatched row in editorial_articles (matched_event_id is null) is
-- already, by construction, a row that passed looksLikeEventCoverage() at
-- ingest time — cron-editorial.js only stores an unmatched article at all
-- when it looks like real event coverage. So the admin review queue's WHERE
-- clause is simply "unmatched and not yet reviewed" — no separate content
-- filter needed here, that work already happened upstream.
--
-- admin_dismissed: distinct from matched_event_id, which only records a
-- SUCCESSFUL link. Without a separate "reviewed and declined" flag, an
-- article Jody looked at and decided wasn't worth turning into an event
-- (e.g. a preview that's too vague, or an event that's actually out of
-- scope) would keep reappearing in the queue on every visit to admin.html,
-- forever, since nothing about the row itself would change. This is that
-- flag — a plain boolean is enough (no need for a reason/enum today; add
-- one later if Jody ever wants to see WHY something was dismissed).
-- Safe to re-run.

alter table editorial_articles add column if not exists admin_dismissed boolean not null default false;

create index if not exists editorial_articles_admin_review_idx
  on editorial_articles (published_at desc)
  where matched_event_id is null and admin_dismissed = false;
