-- Migration 024: hot-path indexes for events
--
-- Context: Jody, 2026-09-14 — "performance/cost" was one of the explicit
-- reasons given for wanting a scalable database plan. schema.sql already
-- indexes events.start_date, events.status, and events.category
-- individually (each useful on its own for admin.html's per-category
-- filters), but the single most common query this whole site ever runs —
-- every page load, via index.html's loadSupabaseEvents() — is the compound
-- condition `status='approved' AND start_date >= <today-ish floor>, ordered
-- by start_date`. Two separate single-column indexes let Postgres pick ONE
-- of them and then filter/sort the rest in memory; a single composite index
-- matching the exact WHERE+ORDER BY shape lets it satisfy the whole query
-- from the index alone. This matters more every day as approved-event
-- volume grows (today alone added 12 more rows across two sources) — at
-- today's size the difference is invisible; it won't stay that way.
--
-- Also adding: an index on events.venue_id (constantly scanned by the
-- venue_id backfill UPDATE at the bottom of nearly every seed/update file
-- in this project, and now also by migration_025's events_public view join)
-- and events.source (scanned by every single one of cron-healthcheck.js's
-- per-source freshness checks, admin.html's per-source dedupe views, and
-- ad hoc lookups like today's Elmwood Cemetery checks) — neither had a
-- dedicated index before, both are filtered on constantly.
--
-- Also adding: a case-insensitive index on venue_name_raw. Every single
-- migration/seed/update file's venue_id backfill step runs
-- `where lower(trim(e.venue_name_raw)) = lower(trim(v.name))` — without a
-- matching functional index, that's a full table scan with a lower()/trim()
-- call on every row, every time, growing linearly with total event count.
--
-- All additive, all `if not exists` — safe to re-run, no risk to existing
-- data or queries.

-- The hot path: "approved events from today (or the week floor) onward,
-- oldest first" — matches loadSupabaseEvents()'s exact query shape.
create index if not exists events_status_start_date_idx
  on events (status, start_date);

create index if not exists events_venue_id_idx
  on events (venue_id);

create index if not exists events_source_idx
  on events (source);

create index if not exists events_venue_name_raw_lower_idx
  on events (lower(trim(venue_name_raw)));

-- venues.name is joined/matched the same lower(trim(...)) way from the
-- other side of every backfill query — index that side too.
create index if not exists venues_name_lower_idx
  on venues (lower(trim(name)));

insert into schema_migrations (filename) values ('migration_024_event_indexes.sql')
on conflict (filename) do nothing;
