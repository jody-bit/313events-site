-- #312 (proposed, NOT APPLIED, needs the owner's separate GO via R&Q hash validation): durable per-field ledger for
-- automated enrichment. Additive; nothing reads it until ENRICHMENT_LEDGER_TABLE=1 is set. Append-only by policy:
-- RLS on, no policy for anon/authenticated; only service_role (bypasses RLS) writes. Rows hold before/after values and
-- must never be publicly readable.
--
-- Rollback: drop table public.enrichment_change_log;  (nothing else depends on it)

create table if not exists public.enrichment_change_log (
  id           bigint generated always as identity primary key,
  event_id     uuid        not null,
  field        text        not null,
  before_value text,
  after_value  text,
  source       text        not null,                      -- e.g. 'SH.1 canonical_venue_id'
  run_id       text,                                      -- links to the daily source_runs summary
  status       text        not null check (status in ('applied', 'proposed', 'skipped')),
  created_at   timestamptz not null default now()
);

create index if not exists enrichment_change_log_event_idx on public.enrichment_change_log (event_id);
create index if not exists enrichment_change_log_run_idx   on public.enrichment_change_log (run_id);
create index if not exists enrichment_change_log_proposed_idx
  on public.enrichment_change_log (event_id, field, after_value) where status = 'proposed';

alter table public.enrichment_change_log enable row level security;
revoke all on public.enrichment_change_log from anon, authenticated;
-- Supabase default privileges give service_role everything, so grant alone is not append-only: revoke the rest explicitly.
revoke update, delete, truncate on public.enrichment_change_log from service_role;
grant select, insert on public.enrichment_change_log to service_role;
