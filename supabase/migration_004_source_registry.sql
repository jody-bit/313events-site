-- Migration 004: Cultural Event Source Registry (Phase 1 — schema only)
--
-- Context: see SOURCE_REGISTRY_ARCHITECTURE.md for the full comparison this
-- migration implements. Today, a "source" only exists implicitly — as a
-- cron file plus a paragraph in sources.html. This migration adds a real
-- `sources` table so a source's type, ticketing platform, ingestion method,
-- and monetization potential are queryable data instead of prose, and adds
-- a `venue_type` column so `venues` can describe what KIND of space a venue
-- is (arena/club/jazz/DIY/gallery/etc.), which the existing `category` enum
-- on `events` never covered (that enum describes the event's genre, not the
-- venue's nature).
--
-- This is Phase 1 only: schema, no data, no ingestion code. Phase 2 will
-- populate this table (starting with the 213 venues already researched in
-- _research/313events_source_registry_draft.xlsx, plus reverse-discovery
-- research from ticketing platforms and promoters/festivals/arts orgs not
-- yet covered). Phase 3 will classify every row. Phase 4 builds ingestion
-- code. Run this once in Supabase's SQL Editor; safe to re-run (IF NOT
-- EXISTS / CREATE OR REPLACE throughout, same convention as schema.sql).

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------

-- Reused across several yes/no-ish confirmation fields below (ticketed,
-- affiliate availability, API/RSS/iCal/JSON-LD availability, extraction
-- feasibility). Not every field uses every value (e.g. only "ticketed"
-- typically uses 'sometimes'), but one shared enum is far easier to
-- maintain than seven near-identical ones.
do $$ begin
  create type confirmation_status as enum ('yes', 'no', 'sometimes', 'unconfirmed');
exception when duplicate_object then null;
end $$;

-- Shared by automation_feasibility and priority — same three-tier shape,
-- different meaning per column.
do $$ begin
  create type tier_level as enum ('high', 'medium', 'low');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type source_type as enum (
    'venue', 'promoter', 'presenter', 'festival', 'ticketing_platform', 'aggregator'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type ingestion_method as enum (
    'api',
    'structured_website_data',
    'rss_ical',
    'permitted_website_extraction',
    'ticketing_platform_feed',
    'manual_curation',
    'direct_partnership_required',
    'unable_to_ingest'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- venues: add venue_type
-- ---------------------------------------------------------------------------

-- Free text, not an enum — the venue-type taxonomy (music/performing-arts/
-- film/visual-arts/museums/cultural/education/literary/festivals/public-
-- spaces/alternative/experiential/large-entertainment, each with several
-- subtypes — see the framework in SOURCE_REGISTRY_ARCHITECTURE.md) is meant
-- to grow as new venue types get discovered, which an enum actively fights
-- (every new value needs an ALTER TYPE). A free-text convention of
-- "Category: subtype" (e.g. "Music: jazz club", "Visual arts: gallery") is
-- what the draft spreadsheet already uses — keep matching it.
alter table venues add column if not exists venue_type text;
comment on column venues.venue_type is
  'Free-text "Category: subtype" venue taxonomy, e.g. "Music: jazz club". Not an enum on purpose — see migration_004.';

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------

create table if not exists sources (
  id                          uuid primary key default gen_random_uuid(),

  name                        text not null,
  source_type                 source_type not null,
  venue_type                  text,        -- only meaningful when source_type = 'venue'; same free-text convention as venues.venue_type

  city                        text,
  state_province              text,
  country                     text,

  website                     text,
  events_calendar_url         text,

  ticketed                    confirmation_status not null default 'unconfirmed',
  primary_ticketing_platform  text,
  secondary_ticketing_platforms text[],
  ticketing_url               text,

  affiliate_program_available confirmation_status not null default 'unconfirmed',
  public_api_available        confirmation_status not null default 'unconfirmed',
  rss_available               confirmation_status not null default 'unconfirmed',
  ical_available               confirmation_status not null default 'unconfirmed',
  jsonld_available            confirmation_status not null default 'unconfirmed',
  other_structured_data       text,   -- free text: describe anything structured that isn't API/RSS/iCal/JSON-LD

  website_extraction_feasible confirmation_status not null default 'unconfirmed',
  robots_restrictions         text,   -- free text: what robots.txt/ToS actually say, once checked

  integration_status          text not null default 'Not yet integrated',  -- e.g. 'cron: api/cron-halo.js', 'blocked: 403', 'not yet integrated'
  ingestion_method            ingestion_method,
  automation_feasibility      tier_level,
  monetization_opportunity    text,   -- free text assessment, not a fixed tier — reasoning matters more than a label here
  priority                    tier_level,

  last_checked                date,
  notes                       text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists sources_source_type_idx on sources (source_type);
create index if not exists sources_city_idx on sources (city);
create index if not exists sources_priority_idx on sources (priority);

drop trigger if exists sources_set_updated_at on sources;
create trigger sources_set_updated_at before update on sources
  for each row execute function set_updated_at();  -- reuses the function schema.sql already defines for events

-- Row Level Security: same posture as venues (public read, no sensitive
-- data) — this is internal tooling data about SOURCES, not event content,
-- but there's no reason to hide it from the anon key either.
alter table sources enable row level security;

drop policy if exists "public read sources" on sources;
create policy "public read sources" on sources
  for select using (true);

-- No public insert/update/delete policy — same as venues, this table is
-- only ever written by the admin/service_role side, never by site visitors.

-- ---------------------------------------------------------------------------
-- events: link to sources (Phase 1 adds the link; does not migrate data or
-- drop the old free-text column yet — see SOURCE_REGISTRY_ARCHITECTURE.md
-- Phase 2/3 for backfill and eventual cleanup)
-- ---------------------------------------------------------------------------

alter table events add column if not exists source_id uuid references sources(id) on delete set null;
comment on column events.source_id is
  'FK into sources — added migration_004. events.source (free text) is kept temporarily for backfill; see SOURCE_REGISTRY_ARCHITECTURE.md.';

create index if not exists events_source_id_idx on events (source_id);
