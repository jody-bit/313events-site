-- Migration 019: Automated health check log
--
-- Context: Jody asked (2026-09-02) when the "automated smoke tests" she'd
-- been told about were going to actually exist. The original plan — a
-- Playwright script run on a recurring schedule from this project's own dev
-- sandbox — turned out not to work: that sandbox (and any fresh session
-- spun up on the same schedule) has no general internet egress, so it could
-- never actually reach the live site. Real, reliable internet access to
-- https://313.events on a schedule only exists in one place this project
-- already trusts: Vercel's own servers, where every other cron already
-- runs. So the smoke test suite is itself a new cron
-- (api/cron-healthcheck.js) — this table is where each run's results land,
-- one row per run, read back by api/admin-healthcheck.js and surfaced as a
-- banner at the top of admin.html.
--
-- `checks` is a jsonb array of individual probe results
-- ({name, ok, detail, ms}) rather than one column per check, because the
-- exact set of things worth checking will keep changing (new source added,
-- new endpoint added) and a jsonb array never needs another migration just
-- to add a new probe. `overall` is the one thing worth indexing/filtering
-- on directly.
--
-- Run this once in Supabase's SQL Editor; safe to re-run (IF NOT EXISTS
-- throughout, same convention as every migration before this one).

create table if not exists healthchecks (
  id            uuid primary key default gen_random_uuid(),

  run_at        timestamptz not null default now(),
  overall       text not null check (overall in ('ok', 'fail')),
  duration_ms   integer,
  checks        jsonb not null default '[]'::jsonb,

  created_at    timestamptz not null default now()
);

create index if not exists healthchecks_run_at_idx on healthchecks (run_at desc);

-- Row Level Security: unlike every public-facing table in this project,
-- nothing here should EVER be readable by the anon key — a failing check's
-- `detail` text can include things like "expected 401, got 200" for a
-- specific admin/cron endpoint, which is exactly the kind of detail that
-- shouldn't be handed to an anonymous visitor. No policies are created at
-- all: api/cron-healthcheck.js (service role) writes, api/admin-healthcheck.js
-- (service role, behind ADMIN_SECRET) reads — both bypass RLS entirely, the
-- same posture admin.html's other endpoints already rely on. Anon and
-- authenticated roles get a hard default-deny.
alter table healthchecks enable row level security;
