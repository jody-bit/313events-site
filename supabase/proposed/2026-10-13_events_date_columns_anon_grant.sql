-- EVENTS DATE COLUMNS: ANON READ GRANT (PROPOSED, NOT EXECUTED). Needs owner SQL approval.
-- Why: calendar.html and map.html read the raw `events` table with the anon key, where anon
-- has column-level SELECT only. Checked on production 2026-10-13:
--   has_column_privilege('anon','public.events','date_semantics','select')   = false
--   has_column_privilege('anon','public.events','occurrence_dates','select') = false
-- so those two pages cannot select the new columns until this grant exists (PostgREST would
-- return "permission denied for column" and the whole page query would fail).
-- index.html reads the owner-rights view events_public, which already exposes them (works today).
-- Both columns are public by design (they only say which days an event is on); recurrence_evidence
-- is NOT granted (source text/URLs, internal). Purely additive.
-- Release order: apply this, run the VERIFY below, and only then merge the PR that adds the columns to calendar.html / map.html selects.

grant select (date_semantics, occurrence_dates) on public.events to anon, authenticated;

insert into public.schema_migrations (filename) values ('2026-10-13_events_date_columns_anon_grant.sql')
on conflict (filename) do nothing;

-- VERIFY (expect true, true, false):
select has_column_privilege('anon','public.events','date_semantics','select') as date_semantics,
       has_column_privilege('anon','public.events','occurrence_dates','select') as occurrence_dates,
       has_column_privilege('anon','public.events','recurrence_evidence','select') as recurrence_evidence_must_be_false;

-- ROLLBACK (revert the calendar/map select PR first):
-- revoke select (date_semantics, occurrence_dates) on public.events from anon, authenticated;
-- delete from public.schema_migrations where filename = '2026-10-13_events_date_columns_anon_grant.sql';
