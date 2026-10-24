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

## Restore rehearsal
Only into a new, empty, isolated project (never production or staging; `restore-rehearsal.sh` refuses both and refuses a non-empty target).
1. Download an archive; have the age private key available locally.
2. `RESTORE_DB_URL=... AGE_IDENTITY=... ARCHIVE=... ops/backup/restore-rehearsal.sh`
3. Re-upload the Storage files to the new project's bucket; fetch a few public URLs.
4. Run `supabase/verify/public_boundary_check.sql` and `catalog_fingerprint.sql` and compare with production; check `select count(*) from events_public`.
5. Record: archive timestamp (recovery point), total restore seconds (recovery time), checks passed.
6. Delete the rehearsal project.

## Disaster recovery (real incident)
Create a new project, run the same restore steps, then repoint the app: update Supabase URL and keys in Vercel (production), redeploy, re-register cron secrets, re-create Storage bucket policies. Expected recovery time and loss are the measured rehearsal numbers.

## One-time local backup (no credentials in chat)
`ops/backup/one-time-backup.sh` on the owner's Mac. Secrets come from environment, the macOS Keychain, or a hidden prompt; none is echoed, passed as an argument or stored. It creates the age key pair on first run at `~/.313events-backup/age.key` (outside the repo and CI; copy it to the password manager), runs `backup.sh` in local-only mode, and prints the archive path, size and manifest row counts.

## Tests
`ops/backup/test/dry-run.sh` (flow, manifest, ciphertext only) and `ops/backup/test/no-secret-leak.sh` (sentinel secrets never appear in output or manifest; no `set -x`). Full git history (1,073 commits) was scanned for key-shaped strings on 2026-10-24: only fake test fixtures matched.
