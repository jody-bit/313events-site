-- Migration 008: Self-service feed sources
--
-- Context: submit.html previously only accepted one event at a time. Some
-- venues/organizers already publish an ongoing calendar feed of their own —
-- most usably an iCalendar (.ics) export, the same format behind "Add to
-- Google Calendar" links, Outlook exports, Eventbrite's organizer-side
-- export, and WordPress's "The Events Calendar" plugin (already relied on
-- elsewhere in this project, via its JSON REST API instead — see
-- api/cron-wdet.js, api/cron-belle-isle-nature-center.js). This migration
-- lets an organizer register that feed URL once instead of resubmitting
-- every event by hand, with a human approval step before anything is ever
-- polled automatically — see api/submit-feed.js, api/admin-feeds.js, and
-- api/cron-feeds.js.
--
-- Distinct from `sources` (migration_004_source_registry.sql): that table
-- is an internal RESEARCH catalog of every venue/promoter this project
-- knows about — populated by hand, describing ingestion characteristics
-- (API/RSS/iCal/JSON-LD availability, robots.txt findings, etc.) in detail,
-- read-only to the public. `feed_sources` is narrower and operational: a
-- queue of feed URLs organizers THEMSELVES submitted through the public
-- site, each needing a one-time human approval before api/cron-feeds.js
-- starts pulling from it on a schedule — the self-submission analog of
-- `sources`, the same way `events.status='pending_review'` is already the
-- self-submission analog of `venues`.
--
-- v1 scope, deliberately: only feed_format='ics' is actually polled by
-- api/cron-feeds.js. 'rss' is accepted here so the schema doesn't need a
-- migration later, but generic RSS has no reliable event start-date
-- semantics (a <pubDate> is when the item was POSTED, not when the event
-- IS) — auto-parsing it would risk silently wrong dates, which this
-- project has a specific hard-won reason to avoid (see the HTML-entity and
-- venue_id honesty notes elsewhere in FOUNDATIONAL_ITEMS.md). Shipping
-- ICS-only now and documenting RSS as a real but unfinished future case
-- beats half-supporting it. Run this once in Supabase's SQL Editor; safe
-- to re-run (IF NOT EXISTS / CREATE OR REPLACE throughout, same convention
-- as schema.sql and every migration before this one).

do $$ begin
  create type feed_format as enum ('ics', 'rss');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type feed_status as enum ('pending_review', 'approved', 'rejected', 'paused');
exception when duplicate_object then null;
end $$;

create table if not exists feed_sources (
  id                uuid primary key default gen_random_uuid(),

  venue_name        text not null,
  contact_email     text not null,
  website           text,               -- optional — for the admin's own reference when reviewing, not shown publicly

  feed_url          text not null,
  feed_format       feed_format not null default 'ics',
  default_category  event_category not null,  -- reuses events' own category enum; applied to every event this feed produces (single-venue feeds have one predominant genre, same assumption cron-cinema-detroit.js already makes)

  notes             text,               -- anything the organizer wants the reviewer to know

  status            feed_status not null default 'pending_review',

  last_polled_at    timestamptz,        -- set by api/cron-feeds.js on every run, success or failure
  last_poll_result  text,               -- e.g. "12 events found" or an error string — same "fail soft, document honestly" convention the crons already use (see sources.html)

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists feed_sources_url_key on feed_sources (lower(feed_url));
create index if not exists feed_sources_status_idx on feed_sources (status);

drop trigger if exists feed_sources_set_updated_at on feed_sources;
create trigger feed_sources_set_updated_at before update on feed_sources
  for each row execute function set_updated_at();  -- reuses the function schema.sql already defines for events

-- Row Level Security: mirrors events' existing "public can submit, always
-- pending" policy — an organizer can register a new feed (always landing
-- pending_review regardless of what they send, same self-approval guard as
-- events), but can never read the queue at all (which would leak other
-- organizers' contact emails alongside their own) or change its status.
-- Moderation (approve/reject/pause/resume) and polling both happen only
-- through service_role endpoints (api/admin-feeds.js, api/cron-feeds.js),
-- which bypass RLS entirely — same posture as admin.html/api/admin-events.js.
alter table feed_sources enable row level security;

drop policy if exists "public submit pending feed sources" on feed_sources;
create policy "public submit pending feed sources" on feed_sources
  for insert with check (status = 'pending_review');

-- events: track which approved feed a row came from. Needed for upsert
-- dedupe scoping and so a feed can eventually be paused/removed without
-- hunting for its events by matching a free-text venue name.
alter table events add column if not exists feed_source_id uuid references feed_sources(id) on delete set null;
create index if not exists events_feed_source_id_idx on events (feed_source_id);
