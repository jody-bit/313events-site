-- Fail-closed identity check for a dedicated backup account. Prints one line per problem; no output means the account is acceptable.
select 'role attribute: '||a from (
  select unnest(array[case when rolsuper then 'superuser' end, case when rolcreaterole then 'createrole' end, case when rolcreatedb then 'createdb' end, case when rolreplication then 'replication' end]) a
  from pg_roles where rolname = current_user) s where a is not null
union all
select 'member of '||r.rolname from pg_roles r
 where r.rolname in ('supabase_privileged_role','supabase_admin','pg_write_all_data','pg_execute_server_program','pg_read_server_files','pg_write_server_files','pg_signal_backend','pg_monitor','pg_read_all_data')
   and pg_has_role(current_user, r.oid, 'member')
union all
select 'CREATE on database '||current_database() where has_database_privilege(current_user, current_database(), 'CREATE')
union all
select 'CREATE on schema '||n.nspname from pg_namespace n
 where n.nspname in ('public','storage','supabase_migrations','extensions','auth','vault','pg_catalog') and has_schema_privilege(current_user, n.oid, 'CREATE');
