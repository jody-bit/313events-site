-- Migration 021: many-to-many article <-> event links
--
-- Context (2026-09-04): Jody found a Metro Times roundup article that covers
-- several different festivals in one piece and asked how to get it
-- associated with EACH of those events. editorial_articles.matched_event_id
-- (migration_011) is a single foreign key — one article row can only ever
-- point at one event. That's fine for the common case (one article, one
-- event) but structurally can't represent "one article, several events."
--
-- This migration doesn't remove matched_event_id — every existing read
-- query (index.html's loadEditorialArticles(), event.html's "As seen in",
-- api/admin-editorial.js's queue filter) keeps using it as-is for now. What
-- changes is additive: a join table that can hold as many event links per
-- article as needed. api/admin-editorial.js is updated (this same session)
-- to write every link — the first one AND any additional ones — into this
-- table, while still setting matched_event_id on the first link only (so
-- "still needs review" queue filtering, which checks matched_event_id is
-- null, keeps working unchanged). A companion code change updates
-- index.html/event.html to read "As seen in" data from this table instead
-- of straight off editorial_articles, so an event shows the article
-- regardless of whether it was that article's first match or its third.
--
-- Idempotent: safe to re-run.

create table if not exists editorial_article_events (
  article_id  uuid not null references editorial_articles(id) on delete cascade,
  event_id    uuid not null references events(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (article_id, event_id)
);

create index if not exists editorial_article_events_event_id_idx on editorial_article_events (event_id);

-- Row Level Security: public read-only, same posture as editorial_articles
-- itself (migration_011) — these are just id pairs, nothing sensitive, but
-- index.html/event.html need anon-key SELECT to embed through this table.
-- Only api/admin-editorial.js (service_role, bypasses RLS) ever writes here.
alter table editorial_article_events enable row level security;

drop policy if exists "public read editorial article events" on editorial_article_events;
create policy "public read editorial article events" on editorial_article_events
  for select using (true);

-- Backfill: every article that already has a matched_event_id gets that
-- single link recorded here too, so index.html/event.html can switch their
-- read queries over to this table without losing any existing "As seen in"
-- link that was set before this migration ran.
insert into editorial_article_events (article_id, event_id)
select id, matched_event_id from editorial_articles
where matched_event_id is not null
on conflict (article_id, event_id) do nothing;
