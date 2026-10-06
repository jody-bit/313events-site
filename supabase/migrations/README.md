# supabase/migrations — the reproducible schema

`20261006000000_baseline_schema.sql` is the production application schema on
2026-10-06, rebuilt from the production catalog (schema only). With
`20261006000001_reference_data.sql` and `20261006000002_baseline_grants.sql` it produces a database whose catalog is
identical to production (verified: 10 catalog fingerprints match; see
`supabase/verify/catalog_fingerprint.sql`).

## History is preserved, not replayed
The older `supabase/migration_*.sql`, `update_*.sql`, `schema.sql` and
`supabase/archive/` stay exactly where they are as the record of how
production got here. **Do not apply them to a new database**: they cannot
reproduce production (migration_010 is missing, two files are numbered 042,
migration_004 and the Facebook DDL were never applied to production, and some
data patches are production-specific). New work is a new file in this directory.

## Rules
- Never edit a file after it has been applied anywhere. Add a new one.
- Name: `YYYYMMDDHHMMSS_short_name.sql`, applied in order.
- Staging first, then production, before code that depends on the change.
- An `alter type ... add value` goes in its own file.
- Candidate changes that are not yet approved for production live in
  `supabase/proposed/`, never here.

## Verify a build against production
Run `supabase/verify/catalog_fingerprint.sql` against the new database and
against production (read-only); every row's hash must match.

## About the grants (legacy production baseline)
Production gives `anon`, `authenticated` and `service_role` full privileges on
every public table and the `events_public` view. That came from Supabase's
default privileges when the project was created; **it is not a current Supabase
default**, and new projects get far fewer. `20261006000002_baseline_grants.sql`
therefore states them explicitly so a rebuilt database matches production.
They are intentionally broad and **scheduled to be tightened by SZ-01** (a
later migration, staging first); the baseline does not endorse them.
