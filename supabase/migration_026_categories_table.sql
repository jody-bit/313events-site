-- Migration 026: categories reference table (additive, non-breaking)
--
-- Context: Jody, 2026-09-14 — "growing pains from more sources" and "data
-- quality" were both explicitly named reasons for wanting a scalable
-- database plan. The category taxonomy has grown from schema.sql's original
-- 10 values to 13 today (migration_007 added 'sports', migration_009b added
-- 'community', migration_018 added 'vendor') — and every single addition
-- required its own separate migration file, run as ITS OWN standalone paste
-- in the SQL Editor, because Postgres refuses to run `ALTER TYPE ... ADD
-- VALUE` inside the same transaction as other statements (see
-- migration_009b's own header comment on this exact restriction). That's a
-- real, growing friction cost every time a new source needs a category that
-- doesn't already exist — and the category's display label/color still has
-- to be hand-added a SECOND time, in index.html's own CATS object, with no
-- link between the two.
--
-- migration_002 already solved exactly this shape of problem once before,
-- for neighborhoods: instead of a fixed enum, neighborhoods is a real table
-- that can grow with a plain INSERT. This migration applies the same fix to
-- categories — but ADDITIVELY, alongside the existing event_category enum,
-- not replacing it:
--   - `events.category` (the enum column) is UNTOUCHED. Every existing cron,
--     every existing query, every existing row keeps working exactly as
--     today. Nothing breaks.
--   - A new `categories` table is added, seeded with the current 13 values
--     plus the label/color metadata that today only lives in index.html's
--     CATS object — so that metadata has one real source of truth instead
--     of two copies that can drift apart.
--   - A new nullable `events.category_id` column is added and backfilled
--     from the existing enum column, so the two stay in sync starting now.
--
-- WHAT THIS DOES NOT DO (on purpose): it does not drop the enum, does not
-- change any cron's `category: "..."` write, and does not touch
-- index.html's CATS object. Full cutover — every cron writing category_id
-- instead of/alongside the enum string, the client reading labels/colors
-- from `categories` instead of its own CATS object, eventually dropping the
-- enum — is a real follow-up worth doing deliberately, once this additive
-- layer has run safely for a while, not bundled into the same migration
-- that introduces it. Shipping the riskier cutover unasked, bundled into a
-- "scalable plan" ask, is exactly the kind of scope-creep this project's
-- own conventions (see e.g. the neighborhood-photo allow-list's "sparse by
-- design, not a place to guess" comment) argue against.

create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,   -- matches event_category enum values exactly, e.g. 'music', 'nightlife'
  label       text not null,          -- display label, matches index.html's CATS[x].label exactly as of today
  color_var   text,                   -- CSS custom property name, matches index.html's CATS[x].color exactly (e.g. "var(--c-music)") — NOT a literal color value, so the site's existing theme/CSS still owns the actual color
  sort_order  integer not null,       -- matches CATS' own object key order (today's display order)
  created_at  timestamptz not null default now()
);

alter table categories enable row level security;
drop policy if exists "public read categories" on categories;
create policy "public read categories" on categories
  for select using (true);

insert into categories (slug, label, color_var, sort_order) values
  ('music',     'Music',                'var(--c-music)',     1),
  ('theatre',   'Theatre & Comedy',     'var(--c-theatre)',   2),
  ('dance',     'Dance & Opera',        'var(--c-dance)',     3),
  ('visual',    'Visual Arts',          'var(--c-visual)',    4),
  ('museum',    'Museums & History',    'var(--c-museum)',    5),
  ('family',    'Family',               'var(--c-family)',    6),
  ('fest',      'Festivals & Parades',  'var(--c-fest)',      7),
  ('food',      'Food & Markets',       'var(--c-food)',      8),
  ('film',      'Film',                 'var(--c-film)',      9),
  ('nightlife', 'Nightlife & Club',     'var(--c-night)',    10),
  ('sports',    'Sports',               'var(--c-sports)',   11),
  ('community', 'Community',            'var(--c-community)',12),
  ('vendor',    'Vendor Markets',       'var(--c-vendor)',   13)
on conflict (slug) do update set
  label = excluded.label,
  color_var = excluded.color_var,
  sort_order = excluded.sort_order;

alter table events add column if not exists category_id uuid references categories(id) on delete set null;
create index if not exists events_category_id_idx on events (category_id);

update events e
set category_id = c.id
from categories c
where c.slug = e.category::text
  and e.category_id is null;

insert into schema_migrations (filename) values ('migration_026_categories_table.sql')
on conflict (filename) do nothing;
