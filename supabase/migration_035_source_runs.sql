-- Migration 035: source_runs — per-run ingestion telemetry (WP 0.5)
--
-- Context: WP 0.5, pulled forward as the next Phase 0 infrastructure item
-- during the 2026-09-21 production ingestion-health incident (8 of 51 smoke
-- checks failing). Today's investigation had to reconstruct, by hand and by
-- live reproduction, things this table exists to answer automatically: did
-- a cron run at all, did the upstream respond, did parsing produce
-- anything, did the write succeed. This is the §8.1 subset named in the
-- INGESTION_BACKLOG.md spec for WP 0.5, refined 2026-09-21 per the Product
-- Owner's review of this incident: NOT the full observability platform in
-- INGESTION_PLATFORM_ARCHITECTURE.md §8 (no source_fetches, no
-- source_record_rejects, no per-record reject-reason histogram) — just
-- enough structured state per run to distinguish, per source, whether a
-- cron didn't run, started and never finished (probable timeout), failed
-- outright, was blocked by the upstream, or completed (with or without
-- records).
--
-- RUN LIFECYCLE (see api/_lib/run-log.js): a row is INSERTed the moment a
-- cron begins, with outcome='started' and finished_at=null, and UPDATEd in
-- place at completion. This means a run killed by the serverless runtime's
-- hard timeout -- which cannot be caught by any try/finally, per the
-- Product Owner's explicit instruction -- still leaves evidence: the row
-- exists, outcome is still 'started', finished_at is still null. A
-- monitoring/query layer classifies a 'started' row as "still running" or
-- "abandoned / probable timeout" based on how stale it is relative to that
-- source's own execution budget; this migration does not encode that
-- threshold or auto-rewrite the row itself.
--
-- Internal bookkeeping only, same as schema_migrations (migration_023): RLS
-- is enabled with NO public policies. Only the service-role key (every
-- cron handler, plus any future admin/health-dashboard endpoint written to
-- use service-role) can read or write this table; it is never exposed to
-- the anon key or the public site.

create table if not exists source_runs (
  id               uuid primary key default gen_random_uuid(),
  source_slug      text not null,          -- stable per-connector identifier, e.g. "lagerhouse", "metrotimes" -- see api/_lib/run-log.js for the canonical slug list
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,            -- null while the run is in flight or was abandoned (see header comment)
  outcome          text not null default 'started'
                     constraint source_runs_outcome_check
                     check (outcome in ('started', 'success', 'partial', 'failed', 'blocked')),
  http_status      integer,                -- the upstream response status where one clean status applies; null if not applicable/unavailable
  records_fetched  integer,                -- raw candidate records/items from the upstream acquisition stage, before parsing/filtering -- null if the connector's shape makes this genuinely unavailable, never invented
  records_parsed   integer,                -- event records successfully produced by parsing/normalization, before database write -- same null rule
  records_written  integer,                -- records successfully submitted/written, best reliable count available -- same null rule
  error_sample     text,                   -- bounded, sanitized (see api/_lib/run-log.js) -- never credentials, tokens, Authorization headers, or full payloads
  duration_ms      integer                 -- set at finalize time; null while outcome='started'
);

alter table source_runs enable row level security;
-- No public policies at all -- written and read only via the service-role
-- key (every cron handler; later, a health-dashboard/monitoring endpoint),
-- same convention as schema_migrations. Never queried by the public site or
-- the anon key.

-- Primary query shape: "the most recent run(s) for this source" (freshness
-- checks, the healthcheck cron, WP 0.10/0.13's dependents).
create index if not exists source_runs_source_slug_started_at_idx
  on source_runs (source_slug, started_at desc);

-- Supports "find runs still marked started" (in-flight or abandoned) without
-- scanning the whole table -- this is the query the monitoring/health layer
-- needs for the NO ROW / STARTED-still-running / STARTED-abandoned
-- distinction described in the header comment.
create index if not exists source_runs_started_outcome_idx
  on source_runs (started_at)
  where outcome = 'started';

insert into schema_migrations (filename) values ('migration_035_source_runs.sql')
on conflict (filename) do nothing;
