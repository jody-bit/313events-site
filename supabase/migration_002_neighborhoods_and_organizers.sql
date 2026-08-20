-- 313 Events — Migration 002: Neighborhoods + Organizers (proposal)
-- Run this in the Supabase SQL Editor AFTER schema.sql/seed.sql have already run.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.
--
-- This migration does two things, and only the first one is backed by
-- verified research — the second is a schema proposal, not yet populated:
--
--   1. NEIGHBORHOODS — a real reference table (not a hardcoded enum) because
--      Detroit's neighborhood list is genuinely open-ended: while building
--      this migration, venue research turned up "Dexter-Fenkell" as a real,
--      sourced neighborhood that wasn't on the initial ~35-entry list. A
--      table can grow; a check-constraint enum would need a migration every
--      time. venues.neighborhood_id is a nullable FK — most rows below are
--      left NULL on purpose (see "NOT auto-applied" section) rather than
--      guessed.
--
--   2. ORGANIZERS — table + nullable events.organizer_id FK, created but
--      deliberately left EMPTY. There's a real open question about how this
--      relates to the existing events.source field (source records "where
--      we found this listing," e.g. 'Resident Advisor' or '19hz.info' — an
--      organizer is "who is actually presenting the event," e.g. Paxahau.
--      Those aren't the same thing and souldn't be silently merged; see
--      FOUNDATIONAL_ITEMS.md. Populating this table is a separate decision,
--      not part of this migration.

-- ---------------------------------------------------------------------------
-- 1. NEIGHBORHOODS
-- ---------------------------------------------------------------------------
create table if not exists neighborhoods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  area_note   text,     -- rough locator, e.g. "east side, along Jefferson Ave" — not a legal boundary
  is_district boolean not null default false,  -- true for places that are themselves a district/landmark
                                                -- rather than a residential neighborhood (Eastern Market, Belle Isle)
  created_at  timestamptz not null default now()
);

alter table venues add column if not exists neighborhood_id uuid references neighborhoods(id) on delete set null;

alter table neighborhoods enable row level security;
drop policy if exists "public read neighborhoods" on neighborhoods;
create policy "public read neighborhoods" on neighborhoods for select using (true);

-- Seed data — researched via web search against Wikipedia, the City of
-- Detroit Planning & Development Dept, Detroit Historical Society, Model D
-- Media, Bridge Michigan, and Metro Times (full source list in
-- FOUNDATIONAL_ITEMS.md). Detroit has no single authoritative boundary map —
-- the City's Planning Dept organizes work by ~7 "design regions," not a flat
-- neighborhood list — so treat area_note as an orientation hint, not survey-
-- grade boundaries. Where sources disagreed on scope (e.g. whether
-- Grandmont-Rosedale is one neighborhood or four), the more commonly-used
-- umbrella name was kept.
insert into neighborhoods (name, area_note, is_district) values
  ('Downtown',            'city center, riverfront to the Fisher Fwy area', false),
  ('Midtown',              'north of downtown, Wayne State / Woodward corridor', false),
  ('New Center',           'west of Woodward at Grand Blvd, north of Midtown', false),
  ('Corktown',             'west of downtown, near Michigan Ave/Trumbull — Detroit''s oldest surviving neighborhood', false),
  ('North Corktown',       'north of Corktown, cut off by I-75 construction', false),
  ('Core City',            'west of downtown near Grand River/Trumbull, adjacent to North Corktown', false),
  ('Woodbridge',           'between Midtown and Corktown, west of the Lodge Fwy, near Wayne State', false),
  ('Eastern Market',       'northeast of downtown along Gratiot Ave — a district in its own right', true),
  ('Brush Park',           'just north of downtown, east of Woodward', false),
  ('Lafayette Park',       'east of downtown, riverfront-adjacent', false),
  ('Rivertown',            'east of downtown along E. Jefferson Ave, riverfront (includes Harbortown)', false),
  ('Indian Village',       'east side along Jefferson Ave, bounded by Mack/Burns/Seminole', false),
  ('West Village',         'just west of Indian Village, near Jefferson/Kercheval', false),
  ('Islandview',           'between West Village and the river, south to Jefferson', false),
  ('Milwaukee Junction',   'historic industrial district, east side near New Center/North End', false),
  ('North End',            'east side, north of New Center, around John R/California St; borders Highland Park', false),
  ('Poletown East',        'east side, directly bordering Hamtramck', false),
  ('Jefferson-Chalmers',   'far east side, along E. Jefferson Ave near the river', false),
  ('Belle Isle',           'island state park in the Detroit River, off the east side — city-owned, DNR-operated since 2014', true),
  ('Morningside',          'east side, roughly Harper Ave/I-94 to the north, Mack Ave to the south', false),
  ('East English Village',  'northeast side, tree-lined residential district', false),
  ('Boston-Edison',        'north of New Center, between Woodward and Linwood Aves', false),
  ('Arden Park-East Boston','adjacent to Boston-Edison, between Woodward and Oakland', false),
  ('University District',  'north-central, ~1 mile west of Woodward, near U of D Mercy', false),
  ('Palmer Park',          'north-central, Woodward (east) to 7 Mile (north) to McNichols (south)', false),
  ('Palmer Woods',         'just north/west of Palmer Park, private historic enclave', false),
  ('Sherwood Forest',      'northwest, 7 Mile (south), Livernois (west), Pembroke (east)', false),
  ('Bagley',               'northwest, west of Palmer Woods/Sherwood Forest/University District', false),
  ('Russell Woods',        'northwest, near Livernois/Elmhurst', false),
  ('Fitzgerald',           'northwest, Livernois/McNichols corridor ("Live6")', false),
  ('Grandmont-Rosedale',   'northwest, near Grand River/Southfield Fwy — umbrella name for four platted subdivisions', false),
  ('Old Redford',          'northwest, around Grand River Ave and Lahser Rd', false),
  ('Warrendale',           'west side, one of Detroit''s largest neighborhoods, near Warren Ave', false),
  ('Brightmoor',           'far northwest side, near Fenkell/Lahser', false),
  ('Mexicantown / Southwest Detroit', 'southwest, along W. Vernor Hwy from Clark St', false),
  ('Springwells',          'southwest, near Dix Hwy/Fort St, adjacent to Mexicantown', false),
  ('Delray',               'far southwest, along the river near Fort St/Zug Island — heavily industrial', false),
  ('Dexter-Fenkell',       'northwest, Dexter Ave corridor near Fenkell — surfaced via venue research, not the original city-wide pass; confirm before treating as canonical', false),
  ('Wildemere Park',       'northwest, Dexter-Linwood corridor — surfaced via venue research (single source: Metro Times), not the original city-wide pass', false)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Venue -> neighborhood backfill — HIGH CONFIDENCE ONLY
-- Every row below was corroborated by 2+ independent sources during research
-- (official venue site, Wikipedia, and/or Yelp/press). Anything less certain
-- was deliberately left out of this migration — see FOUNDATIONAL_ITEMS.md
-- "Needs your decision" table instead of guessing here.
-- ---------------------------------------------------------------------------
update venues set neighborhood_id = (select id from neighborhoods where name = 'Downtown')
  where lower(name) in (lower('Cliff Bell''s'), lower('Comerica Park'), lower('Detroit Opera House'), lower('Fox Theatre'), lower('Spkrbox'), lower('Hart Plaza'));

update venues set neighborhood_id = (select id from neighborhoods where name = 'Midtown')
  where lower(name) in (lower('DIA – Detroit Film Theatre'), lower('DIA – Rivera Court'), lower('Detroit Historical Museum'), lower('Detroit Institute of Arts'), lower('MOCAD'), lower('Magic Stick'), lower('Majestic Theater'), lower('Majestic Theatre'), lower('Little Caesars Arena'));
-- Little Caesars Arena: sits on the Downtown/Midtown line; you chose Midtown
-- (the more explicitly sourced claim) over the common "Downtown"/District
-- Detroit marketing usage — see FOUNDATIONAL_ITEMS.md.

update venues set neighborhood_id = (select id from neighborhoods where name = 'Mexicantown / Southwest Detroit')
  where lower(name) = lower('El Club');

update venues set neighborhood_id = (select id from neighborhoods where name = 'New Center')
  where lower(name) in (lower('Marble Bar'), lower('Northern Lights Lounge'));

update venues set neighborhood_id = (select id from neighborhoods where name = 'Corktown')
  where lower(name) = lower('MotorCity Wine');

update venues set neighborhood_id = (select id from neighborhoods where name = 'Milwaukee Junction')
  where lower(name) in (lower('Tangent Gallery'), lower('Russell Industrial Center'));
-- Russell Industrial Center: only one strong source (Bridge Michigan) — you
-- confirmed accepting it rather than waiting for corroboration.

update venues set neighborhood_id = (select id from neighborhoods where name = 'North Corktown')
  where lower(name) = lower('TV Lounge');
-- TV Lounge: sources genuinely disagreed (Corktown vs "near Cass Tech" vs
-- Woodbridge). You chose North Corktown as the closest-on-a-map judgment
-- call — treat this one as lower-confidence than the rest of this list.

update venues set neighborhood_id = (select id from neighborhoods where name = 'Woodbridge')
  where lower(name) = lower('Trumbullplex');

update venues set neighborhood_id = (select id from neighborhoods where name = 'Eastern Market')
  where lower(name) = lower('Eastern Market');

-- Menjo's: confirmed as Detroit (McNichols corridor), not Highland Park, per
-- the venue's own address and most listings — city was already correct in
-- seed data. Left with no neighborhood_id: this stretch of McNichols didn't
-- resolve to one commonly-recognized neighborhood name.

update venues set neighborhood_id = (select id from neighborhoods where name = 'Belle Isle')
  where lower(name) = lower('Belle Isle Park');

update venues set neighborhood_id = (select id from neighborhoods where name = 'Wildemere Park')
  where lower(name) = lower('Moondog Cafe');
-- Moondog Cafe: single-source (Metro Times) — you confirmed accepting it.

update venues set neighborhood_id = (select id from neighborhoods where name = 'Rivertown')
  where lower(name) = lower('Big Pink');
-- Big Pink: single-source (Zillow listing description, not press) — you
-- confirmed accepting it.

update venues set neighborhood_id = (select id from neighborhoods where name = 'Morningside')
  where lower(name) = lower('Cannons');
-- Cannons: two sources (Redfin + Detroit News), thin because the venue
-- opened late 2025 — you confirmed accepting it.

-- ---------------------------------------------------------------------------
-- Data-quality fixes surfaced by this research — confirmed by you, applied
-- here rather than left as flags.
-- ---------------------------------------------------------------------------

-- "Elektricity" was tagged city='Detroit' in the original seed data, but
-- every source (its own listings, Resident Advisor, Yelp) places it at
-- 15 S Saginaw St, Pontiac, MI — a different city 25 miles north.
update venues set city = 'Pontiac' where lower(name) = lower('Elektricity');

-- "The Strays" was tagged city='Detroit', but every source (its own
-- Instagram/Facebook, listings) places it in Hamtramck, MI — same as Paris
-- Bar and Small's, which are already correctly tagged.
update venues set city = 'Hamtramck' where lower(name) = lower('The Strays');

-- Merge "Majestic Theater" / "Majestic Theatre" — same building
-- (4120–4140 Woodward Ave, Midtown), split across two venue rows by a
-- spelling difference. Canonical spelling matches the venue's own site and
-- Wikipedia ("Majestic Theatre (Detroit)"). Events reference venues by
-- venue_name_raw text (see FOUNDATIONAL_ITEMS.md — venue_id isn't populated
-- yet), so the text on existing events has to be normalized too, or the
-- merge wouldn't actually fix the display-level split.
update events set venue_name_raw = 'Majestic Theatre' where venue_name_raw = 'Majestic Theater';
delete from venues where lower(name) = lower('Majestic Theater');

update venues set neighborhood_id = (select id from neighborhoods where name = 'Dexter-Fenkell')
  where lower(name) = lower('Andy Arts');

-- ---------------------------------------------------------------------------
-- 2. ORGANIZERS — schema only, deliberately NOT populated.
-- See FOUNDATIONAL_ITEMS.md for the source-vs-organizer question this raises
-- before anyone starts filling this table in.
-- ---------------------------------------------------------------------------
create table if not exists organizers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  website     text,
  instagram   text,
  type        text,     -- e.g. 'promoter' | 'collective' | 'institution' | 'festival' | 'community org'
  image_url   text,
  created_at  timestamptz not null default now()
);

create unique index if not exists organizers_name_key on organizers (lower(name));

alter table events add column if not exists organizer_id uuid references organizers(id) on delete set null;

alter table organizers enable row level security;
drop policy if exists "public read organizers" on organizers;
create policy "public read organizers" on organizers for select using (true);
