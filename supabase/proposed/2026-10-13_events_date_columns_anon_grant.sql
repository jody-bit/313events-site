-- EVENTS DATE COLUMNS: ANON READ GRANT. APPLIED to production 2026-10-13 (owner-approved; Platform-verified;
-- rollback tested in a discarded transaction; post-apply VERIFY: true,true,false,false,false,23,21).
-- Kept here as the record of what ran; test/public-boundary.test.js reads the grant from this file.
-- Why: calendar.html and map.html read the raw `events` table with the anon key, where anon
-- has column-level SELECT only. Checked on production 2026-10-13:
--   has_column_privilege('anon','public.events','date_semantics','select')   = false
--   has_column_privilege('anon','public.events','occurrence_dates','select') = false
-- so those two pages cannot select the new columns until this grant exists (PostgREST would
-- return "permission denied for column" and the whole page query would fail).
-- index.html reads the owner-rights view events_public, which already exposes them (works today).
-- Role scope (owner safeguard 2026-10-13): anon only. The pages use the anon key exclusively (no
-- Supabase Auth in the site code), so `authenticated` is deliberately NOT granted. Today anon and
-- authenticated each hold 21 events columns; after this, anon has 23 and authenticated stays 21.
-- Both columns are public by design (they only say which days an event is on); recurrence_evidence
-- is NOT granted (source text/URLs, internal). Purely additive.
-- Release order: apply this, run the VERIFY below, and only then merge the PR that adds the columns to calendar.html / map.html selects.

grant select (date_semantics, occurrence_dates) on public.events to anon;

insert into public.schema_migrations (filename) values ('2026-10-13_events_date_columns_anon_grant.sql')
on conflict (filename) do nothing;

-- VERIFY (expect true, true, false, false, false, 23, 21, and no write privileges):
select has_column_privilege('anon','public.events','date_semantics','select') as anon_date_semantics,
       has_column_privilege('anon','public.events','occurrence_dates','select') as anon_occurrence_dates,
       has_column_privilege('anon','public.events','recurrence_evidence','select') as anon_evidence_must_be_false,
       has_column_privilege('authenticated','public.events','date_semantics','select') as authenticated_must_be_false,
       has_column_privilege('anon','public.events','date_semantics','insert,update') as anon_write_must_be_false,
       (select count(*) from information_schema.column_privileges where table_schema='public' and table_name='events' and grantee='anon' and privilege_type='SELECT') as anon_select_cols,
       (select count(*) from information_schema.column_privileges where table_schema='public' and table_name='events' and grantee='authenticated' and privilege_type='SELECT') as authenticated_select_cols;

-- ROLLBACK (revert the calendar/map select PR first):
-- revoke select (date_semantics, occurrence_dates) on public.events from anon;
-- delete from public.schema_migrations where filename = '2026-10-13_events_date_columns_anon_grant.sql';
