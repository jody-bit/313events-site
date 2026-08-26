-- Migration 009a: grant INSERT on events to anon
--
-- Context: schema.sql's "public submit pending events" RLS policy was
-- always correct, but the anon role was never actually GRANTed table-level
-- INSERT on events — RLS policies only take effect on top of a base grant,
-- so every anon insert attempt fails with a row-level-security error even
-- though the policy itself allows it. This is that missing grant.
--
-- RUN THIS STATEMENT BY ITSELF — do not run it in the same
-- editor execution as migration_009b (the ALTER TYPE in that file cannot
-- run inside a multi-statement transaction block, and if the SQL editor
-- sends both files as one batch, a failure in 009b can roll this one back
-- too, silently. Paste just this file, click Run, confirm success, THEN
-- open 009b as a separate paste/run.
--
-- Harmless to re-run.

grant insert on events to anon;
