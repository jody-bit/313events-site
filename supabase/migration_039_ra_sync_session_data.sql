-- Migration 039: source_runs.session_data — two-phase RA sync session state
--
-- Context: RA architecture simplification (2026-09-25), approved by the
-- Product Owner after the RA workflow's old per-run reconciliation broke
-- (device network egress blocked from reaching 313.events; a secret
-- mismatch between RA_AUTOMATION_SECRET and CRON_SECRET). Full design is
-- in the "RA Sync: Simplified Server-Side Architecture" doc; this
-- migration implements Decision 5 of the Product Owner's approval
-- ("model each RA run as one sync session"): the device's browser-driven
-- acquisition calls a "start" action (candidate ids in, a diff back) and
-- later a "complete" action (fetched detail data in, an ingest result
-- back) against the SAME source_runs row, identified by that row's own id
-- acting as the session id — no new table needed.
--
-- session_data holds exactly what a two-phase connector needs to carry
-- between its start and complete calls, and what the Admin "Resident
-- Advisor Sync" observability panel needs to render without recomputing
-- anything: candidate/known/new counts from the start call, the exact set
-- of ids promised detail-fetch (so the complete call can be validated
-- against what THIS session actually diffed, not an arbitrary submitted
-- list), and imported/duplicate/skipped/error counts once complete() has
-- run. See scripts/ra-sync.js for the only code that reads or writes this
-- column.
--
-- Deliberately a single nullable jsonb column, not a new table: every
-- other connector's source_runs row is a flat one-shot record (see
-- migration_035's own header — "just enough structured state per run"),
-- and a two-phase connector is the one shape that doesn't fit those five
-- fixed numeric columns. jsonb keeps this additive and connector-specific
-- (every existing row and every non-RA connector is completely unaffected;
-- session_data is simply null for them) rather than growing source_runs'
-- fixed schema for a shape only one connector currently needs.
--
-- INCOMPLETE-RUN DETECTION (Decision 5's other requirement — "if
-- acquisition starts but completion never arrives, Admin must be able to
-- distinguish an incomplete RA sync from a successful one"): this migration
-- adds no new mechanism for that at all — it doesn't need to. A session
-- that never completes is simply a source_runs row that stays
-- outcome='started', finished_at=null forever, exactly the existing
-- migration_035 "abandoned run" contract every connector already gets for
-- free. A Claude scheduled task's own "succeeded" status is a completely
-- separate signal (whether the wrapper script finished running) from
-- whether it ever actually called this project's complete action — Admin
-- never reads the scheduled task's own status, only this table.

alter table source_runs add column if not exists session_data jsonb;

comment on column source_runs.session_data is
  'Two-phase connector session state (currently RA sync only) -- candidate/known/new counts and the promised-detail-fetch id list from the start call, then imported/duplicate/skipped/error counts once complete() runs. Null for every ordinary one-shot connector run. See scripts/ra-sync.js.';

insert into schema_migrations (filename) values ('migration_039_ra_sync_session_data.sql')
on conflict (filename) do nothing;
