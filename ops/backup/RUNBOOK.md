# Independent backup and restore runbook

Purpose: an encrypted, off-site copy of the production Supabase project that does not depend on Supabase's managed backups, plus a rehearsed way to rebuild from it.

STATUS: prepared, not scheduled. `.github/workflows/independent-backup.yml` has no cron trigger. Activation needs owner approval of the storage and security arrangements below.

## What is backed up
- Database (`public`, `supabase_migrations`): custom-format dump (`db.dump`), readable schema (`schema.sql`).
- Storage: bucket definitions and object metadata (`storage_meta.sql`) and every file in every bucket (`storage/<bucket>/...`). The database dump does not contain the files.
- `row_counts.tsv`, `MANIFEST.txt` (SHA-256 of every part, tool versions, counts).
Not backed up: Auth users (none exist today), Supabase platform settings, Vercel environment variables (kept in the password manager).

## Secrets (never commit; GitHub repository secrets or the password manager)
| Name | Holds | Notes |
|---|---|---|
| BACKUP_DB_URL | session-pooler connection string, read-only backup role | IPv4 compatible; no add-on needed |
| BACKUP_SUPABASE_URL, BACKUP_STORAGE_KEY | project URL, key used only for GET on Storage | rotate on a schedule |
| BACKUP_AGE_RECIPIENT | age PUBLIC key | safe to store; the private key is never on CI |
| BACKUP_S3_PROVIDER / ENDPOINT / KEY_ID / SECRET / BUCKET | off-site bucket credentials | key scoped to this bucket; private bucket |
| BACKUP_ALERT_WEBHOOK | URL for failure messages | messages contain no data |
The age private key lives in the owner's password manager plus one offline copy. Losing it makes archives unreadable; leaking it plus bucket access exposes the data.

## Run (manual)
`BACKUP_DRY_RUN=1 ops/backup/backup.sh` builds and encrypts locally. Without BACKUP_DRY_RUN it uploads to `$RCLONE_REMOTE/daily/` and verifies by reading back the hash. `ops/backup/test/dry-run.sh` exercises the flow offline with stubs.

## Verification and alerting
1. Before upload: `pg_restore --list` succeeds; schema and metadata files non-empty.
2. After upload: remote ciphertext hash equals the local hash.
3. `verify.sh` (daily, separate from the backup so a silent failure is caught): newest archive exists, is younger than 30 hours, hash matches, size plausible.
4. Failures post to the webhook and fail the workflow.
5. Monthly: full restore rehearsal (below) proves the archive restores, not just that it exists.

## Retention (proposed; owner to approve)
14 daily, 8 weekly (Sundays), 12 monthly. `prune.sh` previews deletions; `PRUNE_APPLY=1` deletes. The bucket should block deletion by the upload key where the provider supports it.

## Restore (rehearsal and real incident use the same script)
Only into a new, empty, isolated project (never production or staging; `restore-rehearsal.sh` refuses both refs and any non-empty target). Run it from a Mac or workstation holding the age private key; the database password and service key are prompted hidden by `restore-mac.sh` (or supplied as `PG*` / `RESTORE_SERVICE_KEY` environment variables), never as arguments.
1. Decrypt, verify every SHA-256 in the manifest.
2. `pg_restore` the database.
3. **Access-boundary gate (required).** A new Supabase project default-grants `anon` and `authenticated` on new public tables, and a dump cannot undo that (measured 2026-10-24: 336 grant rows vs 107 in production). The script revokes all table/view privileges for `anon`, `authenticated` and `service_role`, replays the source's exact grants from `acl_replay.sql` (captured at backup time, including column-level grants), then compares the catalog fingerprint (`fingerprint.sql`, 12 groups including table and column grants) with the source's. Any difference exits 4 with "DO NOT EXPOSE". **A restored database must not receive application traffic until this gate prints `ok` for every group.**
4. Row counts compared with the source counts in the manifest.
5. Storage: buckets are recreated from `buckets.json`, every file is uploaded, then every object is downloaded again and its SHA-256 compared with the manifest; the restored `storage.objects` row count and byte total must equal the archive's.
6. Record: recovery point (archive `created_utc`), total elapsed seconds (printed per phase), checks passed. Delete the rehearsal project.
Exit codes: 0 pass, 2 refused target, 3 target not empty, 4 access boundary differs, 5 counts differ, 6 restore errors, 7 storage verification failed.

## Disaster recovery (real incident)
Create a new project, run the same restore steps, then repoint the app: update Supabase URL and keys in Vercel (production), redeploy, re-register cron secrets, re-create Storage bucket policies. Expected recovery time and loss are the measured rehearsal numbers.

## One-time local backup (no credentials in chat)
`ops/backup/one-time-backup.sh` on the owner's Mac (needs `brew install postgresql@17 age jq`; stock macOS `shasum` and BSD tools are supported).
- Secrets: the database password and the service-role key come from the environment, the macOS Keychain, or a hidden prompt. They are never echoed, never in a command line (database via `PGPASSWORD`, Storage key via a `curl -K` config read from a pipe), never written to disk. Only the pooler host name (not secret) is typed visibly.
- Read-only: every database session sets `default_transaction_read_only`, `pg_dump` runs in a READ ONLY transaction, Storage is GET only. A preflight prints `on` for the read-only flag before any dump starts. (The credential is the project's postgres role until the least-privilege backup role is approved; see the role review.)
- Storage: the object list comes from `storage.objects` (so sub-folders cannot be skipped) and the backup fails unless the downloaded file count and byte total equal what the database reports.
- Creates the age key pair on first run at `~/.313events-backup/age.key` (outside the repo and CI; copy it to the password manager).
- After encrypting it decrypts the archive with the private key, verifies every hash, then deletes all plaintext. The output folder contains only `.tar.age`, `.sha256` and `.manifest.txt`.

## Tests
`test/dry-run.sh` (flow, nested Storage object, manifest, ciphertext only, no plaintext left), `test/no-secret-leak.sh` (sentinel secrets never appear in output, files or any process argument; no `set -x`), and `test/e2e-local.sh` (real local PostgreSQL plus a mock Storage API: backup with nested objects, fail-closed on a missing object, restore through every gate despite the default-privilege trap, anonymous access checks, refusal of non-empty/production/staging targets, fingerprint sensitivity). Full git history (1,073 commits) was scanned for key-shaped strings on 2026-10-24: only fake test fixtures matched.
