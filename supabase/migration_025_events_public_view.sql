-- Migration 025: events_public view — resolve venue/neighborhood server-side
--
-- Context: Jody, 2026-09-14 — all three stated reasons for wanting a
-- scalable database plan (growing pains from more sources, performance/
-- cost, data quality) converge on one specific thing this migration fixes.
--
-- WHAT'S WRONG TODAY (verified by reading index.html directly):
--   - Every single page load calls loadNeighborhoodData(), which fetches
--     ALL rows from `venues` (up to 1000) AND ALL rows from `neighborhoods`
--     (up to 200) — unconditionally, on every visitor, on every page —
--     just to build a client-side `venue name (lowercased/trimmed) ->
--     neighborhood name` lookup Map in memory (VENUE_NEIGHBORHOOD_MAP).
--   - mapSupabaseRow() then resolves each event's neighborhood by looking
--     up `row.venue_name_raw.trim().toLowerCase()` in that Map — i.e. by
--     matching venue NAME TEXT again, not by the real venue_id foreign key
--     the schema already has. This is the exact same fragile text-matching
--     this project has already been burned by elsewhere (see e.g. the
--     "Majestic Theater" vs "Majestic Theatre" split migration_002 had to
--     clean up) — a typo, a trailing space, or an unnormalized punctuation
--     difference in venue_name_raw silently drops that event out of its
--     neighborhood's count with no error anywhere.
--   - This doesn't scale: as venues/neighborhoods grow, that's an ever
--     larger unconditional fetch on every single pageview, done entirely
--     client-side, to reimplement a join Postgres could just do once.
--
-- THE FIX: a server-side view that does the join for real, keyed on the
-- actual venue_id foreign key (falling back to the raw text fields only
-- when venue_id is null, same fallback posture the rest of this project
-- already uses for display). The client can select straight from this view
-- instead of separately fetching venues+neighborhoods and text-matching.
-- (See the follow-up index.html change in this same batch — a view nobody
-- queries yet doesn't fix anything by itself.)
--
-- SECURITY NOTE — read this before changing the view body: this view is
-- created by a privileged role (via the SQL Editor), which in Postgres
-- normally means the view executes with the OWNER's rights, not the
-- querying anon/authenticated role's — i.e. it does NOT automatically
-- inherit events' "only status='approved' is public" RLS policy just
-- because the underlying table has RLS enabled. That's exactly the kind of
-- gap that could quietly leak pending_review/rejected events to the public
-- anon key through this view if not handled explicitly. Rather than lean on
-- Postgres-version-specific view options (security_invoker support varies),
-- this view hard-codes `where e.status = 'approved'` directly in its own
-- body below — the same restriction the base table's own RLS policy
-- enforces, made explicit and impossible to bypass regardless of view
-- ownership semantics. Grants are equally explicit: SELECT is granted only
-- to `anon`/`authenticated`, nothing else.

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
  -- Real venue name from the venues table when linked; falls back to the
  -- raw text this event was written with when venue_id is still null (the
  -- same fallback posture index.html's mapSupabaseRow() already uses for
  -- display) — never silently prefers one over the other in a way that
  -- would change what's actually shown.
  coalesce(v.name, e.venue_name_raw) as venue_name,
  coalesce(v.city, e.venue_city_raw) as venue_city,
  -- The actual fix: resolved via the real FK chain (events.venue_id ->
  -- venues.neighborhood_id -> neighborhoods.name), not text-matching.
  n.name as neighborhood
from events e
left join venues v on v.id = e.venue_id
left join neighborhoods n on n.id = v.neighborhood_id
where e.status = 'approved';

grant select on events_public to anon, authenticated;

insert into schema_migrations (filename) values ('migration_025_events_public_view.sql')
on conflict (filename) do nothing;
