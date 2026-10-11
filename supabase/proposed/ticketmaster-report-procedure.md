# Ticketmaster report-only run: secure procedure

Ticketmaster stays unscheduled and disabled. This procedure writes nothing and
holds no database credential.

1. Existing rows (read-only). Run `scripts/sql/ticketmaster-report-export.sql` in the
   Supabase SQL editor (SELECT only), download the result as JSON, save it outside the
   repo (e.g. `~/tm/existing.json`). No service-role key is used or needed.
2. Discovery data. Either (a) run locally with the Discovery API key in your shell only:
   `TICKETMASTER_API_KEY=... node scripts/ticketmaster-report.js --existing ~/tm/existing.json --out report.json --markdown report.md`
   or (b) save a Discovery response as `discovery.json` and pass `--tm discovery.json`
   (no key at all). The key is a Ticketmaster key, not a Supabase one, and is never printed.
3. The script prints only booleans in its preflight, makes GETs to the Discovery API only,
   writes no `source_runs` row, and reports `writes_performed: 0`.
4. Read `report.md`: pagination completeness (complete flag, API total vs fetched, 1,000-result
   deep-paging cap), duplicate candidates against other sources, publication impact
   (new rows that would publish as approved, descriptions protected), and stored events not
   returned (verify, never cancel).
5. Share only the report, not the export (it contains internal notes).
