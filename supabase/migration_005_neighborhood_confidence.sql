-- Migration 005: Detroit neighborhood confidence/source + event-level
-- neighborhood exception path
--
-- Context: see FOUNDATIONAL_ITEMS.md §5 for the full recommendation this
-- implements. Run this AFTER migration_002_neighborhoods_and_organizers.sql
-- (it depends on the `neighborhoods` table and `venues.neighborhood_id`
-- that migration creates). Safe to re-run: IF NOT EXISTS / idempotent
-- updates throughout, same convention as every other migration here.
--
-- This migration does NOT fix the events.venue_id gap (every cron still
-- writes venue_name_raw as free text, so venue_id stays null on essentially
-- every row) — that's a code change, not a schema change, and is called out
-- explicitly in FOUNDATIONAL_ITEMS.md as the load-bearing prerequisite for
-- neighborhood filtering to actually work end-to-end. This migration is the
-- schema half only.

-- ---------------------------------------------------------------------------
-- Shared enum for neighborhood-assignment confidence
-- ---------------------------------------------------------------------------

-- Names the exact tiers migration_002's comments already used informally
-- ("2+ independent sources" / "one source — you accepted it" / "no source
-- would commit, closest-on-a-map judgment call") — this migration makes
-- that provenance queryable instead of leaving it only in SQL comments.
do $$ begin
  create type neighborhood_confidence_level as enum (
    'geographic',         -- verified against real lat/lng + a boundary dataset (not used anywhere yet — no boundary data exists in this project)
    'multi_source',       -- 2+ independent corroborating sources (venue site, Wikipedia, press, etc.)
    'single_source',      -- exactly one source found and accepted
    'editorial_judgment', -- no source would commit either way; a human made the closest call
    'unconfirmed'         -- default — no neighborhood assignment attempted/reviewed yet
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- venues: zip + confidence + source
-- ---------------------------------------------------------------------------

alter table venues add column if not exists zip_code text;

alter table venues add column if not exists neighborhood_confidence neighborhood_confidence_level not null default 'unconfirmed';
comment on column venues.neighborhood_confidence is
  'How the neighborhood_id assignment (from migration_002) was determined. See migration_005 and FOUNDATIONAL_ITEMS.md §5.';

alter table venues add column if not exists neighborhood_source text;
comment on column venues.neighborhood_source is
  'Free-text citation for the neighborhood_id assignment, e.g. a named source or "geographic: lat/lng vs. City of Detroit boundary layer".';

-- ---------------------------------------------------------------------------
-- Backfill confidence/source for the venues migration_002 already assigned.
-- Transcribed directly from FOUNDATIONAL_ITEMS.md §2's resolution tables —
-- this data already existed as prose; this just makes it queryable.
-- Anything not listed here (i.e. any venue with neighborhood_id still set
-- but not touched below) simply stays at the 'unconfirmed' default rather
-- than getting a confidence level invented for it.
-- ---------------------------------------------------------------------------

-- Applied automatically (high confidence: 2+ independent sources)
update venues set
  neighborhood_confidence = 'multi_source',
  neighborhood_source = 'Web research, 2+ independent sources (venue site, Wikipedia, and/or press) — see migration_002'
where lower(name) in (
  lower('Cliff Bell''s'), lower('Comerica Park'), lower('Detroit Opera House'), lower('Fox Theatre'),
  lower('Spkrbox'), lower('Hart Plaza'),
  lower('DIA – Detroit Film Theatre'), lower('DIA – Rivera Court'), lower('Detroit Historical Museum'),
  lower('Detroit Institute of Arts'), lower('MOCAD'), lower('Magic Stick'), lower('Majestic Theatre'),
  lower('El Club'), lower('Marble Bar'), lower('Northern Lights Lounge'), lower('MotorCity Wine'),
  lower('Tangent Gallery'), lower('Trumbullplex'), lower('Eastern Market'), lower('Belle Isle Park'),
  lower('Andy Arts')
);

-- Little Caesars Arena — multi-source, but with a deliberate editorial call
-- documented separately (chose the more explicitly sourced claim over
-- common "Downtown"/District Detroit marketing usage).
update venues set
  neighborhood_confidence = 'multi_source',
  neighborhood_source = 'Web research, 2+ sources support Midtown over common "Downtown"/District Detroit marketing usage — editorial call confirmed, see migration_002'
where lower(name) = lower('Little Caesars Arena');

-- TV Lounge — no source committed either way; lowest-confidence tier.
update venues set
  neighborhood_confidence = 'editorial_judgment',
  neighborhood_source = 'No source would commit (Corktown vs. "near Cass Tech" vs. Woodbridge all seen) — closest-on-a-map judgment call, treat as lower confidence than the rest'
where lower(name) = lower('TV Lounge');

-- Russell Industrial Center — one strong source.
update venues set
  neighborhood_confidence = 'single_source',
  neighborhood_source = 'Bridge Michigan (single source, accepted)'
where lower(name) = lower('Russell Industrial Center');

-- Moondog Cafe — one source.
update venues set
  neighborhood_confidence = 'single_source',
  neighborhood_source = 'Metro Times (single source, accepted)'
where lower(name) = lower('Moondog Cafe');

-- Big Pink — one non-press source.
update venues set
  neighborhood_confidence = 'single_source',
  neighborhood_source = 'Zillow listing description (single source, not press; accepted)'
where lower(name) = lower('Big Pink');

-- Cannons — technically two sources, but flagged thin because the venue
-- opened late 2025 (limited press to draw on yet).
update venues set
  neighborhood_confidence = 'multi_source',
  neighborhood_source = 'Redfin + Detroit News (2 sources, but thin — venue opened late 2025); accepted'
where lower(name) = lower('Cannons');

-- Menjo's intentionally has no neighborhood_id (city confirmed Detroit, but
-- no commonly-recognized neighborhood name resolved for that McNichols
-- stretch) — left at the 'unconfirmed' default, nothing to backfill.

-- ---------------------------------------------------------------------------
-- events: neighborhood exception path (pop-up/outdoor/warehouse events with
-- no permanent venue row to inherit a neighborhood from)
-- ---------------------------------------------------------------------------

-- NORMAL path: an event's neighborhood is its venue's neighborhood, via
-- venue_id -> venues.neighborhood_id (a join, once venue_id is populated —
-- see the venue_id gap noted at the top of this file). This column is only
-- for the EXCEPTION: an event with no venue row at all to join against.
alter table events add column if not exists neighborhood_id uuid references neighborhoods(id) on delete set null;
comment on column events.neighborhood_id is
  'Exception path only — set directly ONLY when an event has no venue_id to inherit a neighborhood from (pop-up/outdoor/warehouse events). Normal events should inherit via venue_id -> venues.neighborhood_id, not duplicate it here.';

alter table events add column if not exists neighborhood_confidence neighborhood_confidence_level not null default 'unconfirmed';
alter table events add column if not exists neighborhood_source text;

create index if not exists events_neighborhood_id_idx on events (neighborhood_id);
