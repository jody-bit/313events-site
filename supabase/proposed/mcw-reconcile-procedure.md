# MotorCity Wine reconciliation: obtaining the two datasets (report-only)

Nothing here writes. No `external_id` is changed. Output is a report to review.

1. Current authoritative ICS. Open the calendar URL (`ICS_URL` in `api/cron-motorcitywine.js`)
   in a browser, save the response as `mcw.ics` (it must start with `BEGIN:VCALENDAR`; an HTML
   page means it was blocked: tell Claude). Do this on the day of the report.
2. Stored rows. In the Supabase SQL editor run `scripts/sql/mcw-reconcile-export.sql` (SELECT only),
   download as JSON, save as `mcw-rows.json`. Keep this file: it is also the rollback baseline.
3. Run (no network, no credential):
   `node scripts/mcw-reconcile-report.js --ics mcw.ics --existing mcw-rows.json --out mcw-report.json --markdown mcw-report.md`
4. The report lists exact matches, proposed adoptions (renames flagged "confirm first"),
   ambiguous matches, rescheduled instances, potential duplicates, missing or cancelled instances
   (flagged for verification, never cancelled), a rollback mapping (from -> to external_id), and
   the publication impact: only `external_id` changes on adopted rows, so status, notes and
   enrichment are untouched, and new instances are the only rows that could newly publish.
5. Share the report, not the export. A migration needs separate explicit approval.
