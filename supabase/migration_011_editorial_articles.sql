-- Migration 011: Editorial article association ("As seen in")
--
-- Context: Jody wants local press/editorial coverage surfaced on the
-- SPECIFIC event it's about — an "As seen in: [Article title] →" link on
-- that event's own row in the list — not a generic separate press feed
-- page. See api/cron-editorial.js for the RSS-pulling + matching logic that
-- populates this table; index.html's loadEditorialArticles()/
-- editorialLinkHtml() read it back out.
--
-- Copyright/design-goal constraint (Jody, 2026-08-27): only ever store
-- title, a short excerpt, the article's own URL, its source name, and a
-- thumbnail — NEVER the full article body. The whole point is that this
-- site always drives a click back to the outlet that did the reporting,
-- the same way api/cron-feeds.js already refuses to expand/guess at
-- ambiguous data rather than get it silently wrong (see that file's RSS
-- scope note) — here the equivalent discipline is "never reproduce," not
-- "never guess."
--
-- Distinct from every existing table: `sources` (migration_004) is an
-- internal research catalog of VENUES/PROMOTERS as event sources;
-- `feed_sources` (migration_008) is organizer-submitted EVENT feeds (ICS).
-- `editorial_articles` is neither — it's press/editorial writing ABOUT
-- events, pulled from a short fixed list of local outlets' own RSS feeds
-- (no self-service submission queue; the outlet list is curated in
-- api/cron-editorial.js itself, same fixed-list convention as the other
-- single-purpose crons like cron-halo.js). Run once in Supabase's SQL
-- Editor; safe to re-run (IF NOT EXISTS / CREATE OR REPLACE throughout,
-- same convention as every migration before this one).

-- How an article got matched to an event, kept for transparency/debugging
-- rather than silently overwriting a human's future judgment call. 'title'
-- means the event's own title appeared in the article text (the strongest,
-- most specific signal). 'venue_date' means only the venue name matched,
-- corroborated by the article's publish date falling near the event's
-- start date (guards against a common venue name like "The Fillmore"
-- matching every article that ever mentions it). 'manual' is reserved for
-- a future admin override and unused by api/cron-editorial.js today.
do $$ begin
  create type editorial_match_type as enum ('title', 'venue_date', 'manual');
exception when duplicate_object then null;
end $$;

create table if not exists editorial_articles (
  id                uuid primary key default gen_random_uuid(),

  source            text not null,        -- e.g. "Metro Times", "BridgeDetroit" — rendered as "As seen in" attribution
  feed_url          text not null,        -- which RSS feed produced this row, for debugging a bad match back to its source

  title             text not null,
  excerpt           text,                 -- short summary only — see the no-full-text constraint above; truncated at ingest time in api/cron-editorial.js
  url               text not null,        -- the article's own page — always where the "As seen in" link sends a reader
  thumbnail_url     text,
  published_at      timestamptz,

  matched_event_id  uuid references events(id) on delete set null,
  match_type        editorial_match_type,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Dedupe key for upsert re-runs (?on_conflict=url, same pattern as events'
-- external_id) — an outlet's RSS feed re-lists the same article on every
-- poll until it ages out of the feed, and re-fetching it isn't a new row.
create unique index if not exists editorial_articles_url_key on editorial_articles (lower(url));
create index if not exists editorial_articles_matched_event_id_idx on editorial_articles (matched_event_id);
create index if not exists editorial_articles_published_at_idx on editorial_articles (published_at);

drop trigger if exists editorial_articles_set_updated_at on editorial_articles;
create trigger editorial_articles_set_updated_at before update on editorial_articles
  for each row execute function set_updated_at();  -- reuses the function schema.sql already defines for events

-- Row Level Security: public read-only, same posture as `sources`
-- (migration_004) — this is public press metadata (title/url/source of
-- articles already published elsewhere), not sensitive in any way, but
-- there's no reason for the anon key to be able to write it either. Only
-- api/cron-editorial.js (service_role, bypasses RLS entirely) ever inserts
-- or updates a row — there is no public-submission path for this table,
-- unlike feed_sources.
alter table editorial_articles enable row level security;

drop policy if exists "public read editorial articles" on editorial_articles;
create policy "public read editorial articles" on editorial_articles
  for select using (true);
