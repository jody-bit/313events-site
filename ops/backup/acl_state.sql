-- Read-only. One hash of every privilege that could be affected by creating or removing the backup_reader role.
-- Run before creating the role and after removing it: the hashes must be identical. Entries that name backup_reader are excluded,
-- default (NULL) ACLs are normalised with acldefault(), so "never granted" and "granted then revoked" compare equal.
select md5(coalesce(string_agg(line, E'\n' order by line), '')) as acl_state_hash, count(*) as lines from (
  select 'rel '||n.nspname||'.'||c.relname||' '||(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end)||' '||a.privilege_type||' '||a.is_grantable as line
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault((case when c.relkind='S' then 's' else 'r' end)::"char", c.relowner))) a
  where n.nspname in ('public','supabase_migrations','storage') and c.relkind in ('r','v','m','S','p','f')
    and (a.grantee=0 or a.grantee::regrole::text <> 'backup_reader')
  union all
  select 'col '||n.nspname||'.'||c.relname||'.'||at.attname||' '||(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end)||' '||a.privilege_type
  from pg_attribute at join pg_class c on c.oid=at.attrelid join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(at.attacl) a
  where n.nspname in ('public','supabase_migrations','storage') and at.attacl is not null and (a.grantee=0 or a.grantee::regrole::text <> 'backup_reader')
  union all
  select 'schema '||n.nspname||' '||(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end)||' '||a.privilege_type
  from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n'::"char", n.nspowner))) a
  where n.nspname in ('public','supabase_migrations','storage') and (a.grantee=0 or a.grantee::regrole::text <> 'backup_reader')
  union all
  select 'defacl '||coalesce(d.defaclnamespace::regnamespace::text,'global')||' '||d.defaclrole::regrole::text||' '||d.defaclobjtype::text||' '||a.grantee::text||' '||a.privilege_type
  from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
  where a.grantee=0 or a.grantee::regrole::text <> 'backup_reader'
  union all
  select 'role '||rolname||' '||rolsuper||' '||rolcreaterole||' '||rolcreatedb||' '||rolcanlogin||' '||rolbypassrls||' '||rolconnlimit from pg_roles where rolname <> 'backup_reader'
  union all
  select 'member '||roleid::regrole::text||'>'||member::regrole::text from pg_auth_members where roleid::regrole::text <> 'backup_reader' and member::regrole::text <> 'backup_reader'
) s;
