-- 313 Events — Supabase (Postgres) schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query) once,
-- on a fresh project. Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE.
--
-- Design notes:
--   * Two tables, not three. Earlier drafts of this plan proposed a separate
--     "submissions" table that would later be "promoted" into events. In
--     practice that's an extra join and an extra sync step for no real
--     benefit — a single `events` table with a `status` column does the same
--     job. Venue-submitted events land as status='pending_review'; curated
--     and Ticketmaster-sourced events land as 'approved' directly.
--   * `venues` is its own table (not just a text field) so we can dedupe
--     venues across events, geocode them once, and eventually add a venue
--     detail page — same pattern clevelandartsevents.com uses.
--   * Row Level Security (RLS) is ON for both tables. The public (anon key,
--     used by the website itself) can only READ approved events and INSERT
--     new pending submissions — never read other people's pending
--     submissions, never update/delete anything. The admin moderation page
--     uses the Supabase service_role key (server-side only, never shipped to
--     the browser) which bypasses RLS entirely.

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- venues
-- ---------------------------------------------------------------------------
create table if not exists venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  city        text not null default 'Detroit',        -- Any city within ~75 miles of Detroit (the site's
                                                        -- service area — see SERVICE_AREA.md). Was
                                                        -- previously constrained to Detroit/Hamtramck/
                                                        -- Highland Park only; that restriction was lifted
                                                        -- 2026-08 to match the Census-defined 75-mile radius.
  website     text,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);

create unique index if not exists venues_name_city_key on venues (lower(name), lower(city));

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
do $$ begin
  create type event_category as enum (
    'music','theatre','dance','visual','museum','family','fest','food','film','nightlife'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type event_status as enum ('pending_review','approved','rejected');
exception when duplicate_object then null;
end $$;

create table if not exists events (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  category        event_category not null,
  venue_id        uuid references venues(id) on delete set null,
  venue_name_raw  text,                 -- fallback display name if venue_id is null (e.g. "Venue TBA")
  start_date      date not null,
  end_date        date,                 -- for multi-day runs (e.g. "Doodle Art" through Aug 23)
  time_display    text,                 -- human string, e.g. "7:00–9:00 PM" — matches existing site data
  is_recurring    boolean not null default false,
  is_free         boolean not null default false,
  price_from      numeric(10,2),
  ticket_url      text,
  image_url       text,
  source          text not null default 'Manual',   -- 'Manual' | 'Ticketmaster' | 'Venue Submission' | etc.
  note            text,                              -- editorial caveat, e.g. "Confirm venue location"

  status          event_status not null default 'approved',

  -- populated only for venue/organizer submissions (status starts pending_review)
  submitter_org_name  text,
  submitter_email     text,

  external_id     text,               -- e.g. Ticketmaster event id, for upsert/dedupe on cron re-runs
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists events_start_date_idx on events (start_date);
create index if not exists events_status_idx on events (status);
create index if not exists events_category_idx on events (category);
-- No WHERE clause here on purpose: in standard SQL, NULL is never considered
-- equal to another NULL, so a plain unique index already allows unlimited
-- rows with external_id = NULL (manually-entered events with no dedupe key)
-- without any partial-index predicate. A partial index was tried here
-- originally and broke every cron's `?on_conflict=external_id` upsert, since
-- PostgREST always generates a plain `ON CONFLICT (external_id)` that can
-- only match a non-partial unique index — Postgres requires an exact match
-- between the ON CONFLICT target and the index definition. Fixed 2026-08-25.
create unique index if not exists events_external_id_key on events (external_id);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at before update on events
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table venues enable row level security;
alter table events enable row level security;

-- Anyone (anon key) can read venues — no sensitive data here.
drop policy if exists "public read venues" on venues;
create policy "public read venues" on venues
  for select using (true);

-- Anyone can read APPROVED events only. Pending/rejected stay hidden from
-- the public site and are only visible via the service_role key (admin page).
drop policy if exists "public read approved events" on events;
create policy "public read approved events" on events
  for select using (status = 'approved');

-- Anyone can submit a new event, but it always lands as pending_review —
-- the insert policy hard-codes that regardless of what the client sends,
-- so a submitter can't self-approve by posting status='approved'.
drop policy if exists "public submit pending events" on events;
create policy "public submit pending events" on events
  for insert with check (status = 'pending_review');

-- No public update/delete policies exist for either table — moderation
-- (approve/reject/edit) happens only through the admin API route, which uses
-- the service_role key and therefore bypasses RLS entirely.
