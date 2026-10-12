-- READ-ONLY export for scripts/mcw-reconcile-report.js. SELECT only; changes nothing.
-- Run in the Supabase SQL editor, download as JSON, keep the file: it is also the rollback baseline.
select id, external_id, title, start_date, status, source, internal_note, created_at
  from events
 where external_id like 'mcw-%'
 order by start_date, external_id;
