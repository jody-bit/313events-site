-- Migration 034: clothing-optional content tag for events
--
-- Context: Jody, 2026-09-20 — wants nudist/clothing-optional club events
-- (e.g. Naked Adventure Club of Detroit) addable to the site, and was right
-- to push back on lumping that under a generic "Adult" label: nudity isn't
-- sexual content, and conflating the two would misrepresent these events to
-- visitors. Decision this session, in three parts:
--   1. Category: reuse the existing 'community' category (added
--      migration_009b) rather than mint a near-duplicate 'social' one —
--      Community is already a broad, non-arts-specific bucket and this
--      project's own migration history (026, 031/032) explicitly flags
--      "every new category needs its own standalone ALTER TYPE migration"
--      as real, ongoing friction worth avoiding when an existing category
--      already fits.
--   2. Age restriction (18+/21+): Jody explicitly chose NOT to add a
--      structured field for this — same posture as every other editorial
--      caveat on this site (venue address uncertainty, etc.), it goes in
--      the free-text description/note, same as submit.html's own
--      description placeholder already invites ("dress code, age
--      restriction, accessibility info, etc.").
--   3. Content nature (clothing-optional): THIS does get a real structured,
--      filterable field — a boolean, same shape as is_free/is_recurring —
--      because it's a distinct, non-negotiable fact about the event (not a
--      caveat) that should render as its own clear badge rather than being
--      buried in a paragraph of description text.
--
-- Plain ALTER TABLE ADD COLUMN — not an enum type, so (unlike
-- migration_009b/031's `alter type ... add value`) this does NOT need to be
-- run as its own standalone transaction. Safe to run as one normal paste
-- alongside the view update below.
--
-- IF NOT EXISTS / CREATE OR REPLACE make this safe to re-run regardless.

alter table events add column if not exists is_clothing_optional boolean not null default false;

-- events_public must be recreated to expose the new column — it's a view
-- with an explicit column list (see migration_025's own security note on
-- why), so a new events column is invisible to the public site until it's
-- added here too. Full column list copied from migration_025, plus the one
-- new line.
create or replace view events_public as
select
  e.id,
  e.title,
  e.description,
  e.image_url,
  e.start_date,
  e.end_date,
  e.time_display,
  e.category,
  e.is_free,
  e.price_from,
  e.source,
  e.note,
  e.ticket_url,
  e.event_url,
  e.venue_id,
  e.is_clothing_optional,
  coalesce(v.name, e.venue_name_raw) as venue_name,
  coalesce(v.city, e.venue_city_raw) as venue_city,
  n.name as neighborhood
from events e
left join venues v on v.id = e.venue_id
left join neighborhoods n on n.id = v.neighborhood_id
where e.status = 'approved';

grant select on events_public to anon, authenticated;

insert into schema_migrations (filename) values ('migration_034_clothing_optional.sql')
on conflict (filename) do nothing;
