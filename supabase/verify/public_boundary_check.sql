-- SZ-01 public/private boundary check. Read-only. Run against staging (and,
-- once approved and applied, production). Every row must read pass = true.
-- It inspects grants and catalog state only; it reads no event data.
with private_cols(c) as (values
  ('submitter_email'),('submitter_org_name'),('internal_note'),('organizer_id'),
  ('feed_source_id'),('external_id'),('created_at'),('followup_dismissed'),
  ('followup_dismissed_note'),('followup_dismissed_at'),('neighborhood_id'),
  ('neighborhood_confidence'),('neighborhood_source'),('description_source'),
  ('link_check_status'),('link_checked_at'),('is_recurring'),('is_all_day'),
  ('no_fixed_venue')),
roles(r) as (values ('anon'),('authenticated')),
internal(t) as (values ('event_source_identities'),('feed_sources'),('healthchecks'),
  ('schema_migrations'),('source_runs'))
select 'no private events column is selectable by '||r||': '||c as check, 
       not has_column_privilege(r, 'public.events', c, 'SELECT') as pass
from private_cols, roles
union all
select 'no write/maintenance privilege for '||r||' on '||t, 
       not (has_table_privilege(r, 'public.'||t, 'INSERT') or has_table_privilege(r, 'public.'||t, 'UPDATE')
         or has_table_privilege(r, 'public.'||t, 'DELETE') or has_table_privilege(r, 'public.'||t, 'TRUNCATE')
         or has_table_privilege(r, 'public.'||t, 'TRIGGER') or has_table_privilege(r, 'public.'||t, 'REFERENCES'))
from roles, (select tablename t from pg_tables where schemaname='public') x
union all
select 'internal table unreadable by '||r||': '||t, not has_table_privilege(r, 'public.'||t, 'SELECT') from roles, internal
union all
select 'events_public is security_invoker', coalesce((select 'security_invoker=true' = any(reloptions) from pg_class where oid='public.events_public'::regclass), false)
union all
select 'every INSERT policy is unsatisfiable (with check false)',
       not exists (select 1 from pg_policies where schemaname='public' and cmd='INSERT' and coalesce(with_check,'') <> 'false')
union all
select 'events_public does not read note', not (pg_get_viewdef('public.events_public'::regclass) ilike '%e.note%')
union all
select 'events_public: anon/authenticated can only SELECT', not (has_table_privilege('anon','public.events_public','INSERT') or has_table_privilege('anon','public.events_public','UPDATE') or has_table_privilege('authenticated','public.events_public','INSERT'))
union all
select 'set_updated_at has a fixed search_path', exists (select 1 from pg_proc where proname='set_updated_at' and pronamespace='public'::regnamespace and proconfig is not null)
union all
select 'set_updated_at not executable by anon/authenticated', not (has_function_privilege('anon','public.set_updated_at()','EXECUTE') or has_function_privilege('authenticated','public.set_updated_at()','EXECUTE'))
union all
select 'service_role keeps full access to '||t, has_table_privilege('service_role','public.'||t,'SELECT') and has_table_privilege('service_role','public.'||t,'INSERT') and has_table_privilege('service_role','public.'||t,'UPDATE')
from (select tablename t from pg_tables where schemaname='public') y
order by 1;
