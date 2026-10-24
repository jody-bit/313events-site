-- Core catalog fingerprint (mirrors supabase/verify/core_fingerprint.sql from PR #293). Read-only.
-- Output: group <tab> md5 <tab> line count. Includes table and column grants (read from the ACL catalogs, so the result does not depend on the caller's own privileges), so it proves the access boundary.
with core as (
  select c.oid, c.relname, c.relkind from pg_class c
  where c.relnamespace='public'::regnamespace and c.relkind in ('r','v')
    and c.relname !~ '_backup_' and c.relname !~ '^zz_'
)
select k, md5(string_agg(d, E'\n' order by d)) as h, count(*) as n from (
 select 'columns' k, c.relname||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull::text||' '||coalesce(pg_get_expr(d.adbin,d.adrelid),'') d
   from core c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relkind='r'
 union all select 'constraints', c.relname||' '||k.conname||' '||pg_get_constraintdef(k.oid) from pg_constraint k join core c on c.oid=k.conrelid
 union all select 'indexes', i.indexname||' '||i.indexdef from pg_indexes i where i.schemaname='public' and i.tablename in (select relname from core)
 union all select 'enums', t.typname||':'||e.enumlabel||'@'||e.enumsortorder from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typnamespace='public'::regnamespace
 union all select 'views', c.relname||' '||pg_get_viewdef(c.oid,true) from core c where c.relkind='v'
 union all select 'view_options', c.relname||' '||coalesce((select string_agg(o, ',' order by o) from unnest(cl.reloptions) o),'none') from core c join pg_class cl on cl.oid=c.oid where c.relkind='v'
 union all select 'functions', pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace
 union all select 'triggers', pg_get_triggerdef(t.oid) from pg_trigger t join core c on c.oid=t.tgrelid where not t.tgisinternal
 union all select 'policies', p.tablename||'.'||p.policyname||' '||p.cmd||' '||p.roles::text||' '||coalesce(p.qual,'-')||' '||coalesce(p.with_check,'-') from pg_policies p where p.schemaname='public' and p.tablename in (select relname from core)
 union all select 'rls', c.relname||' '||cl.relrowsecurity::text from core c join pg_class cl on cl.oid=c.oid where c.relkind='r'
 union all select 'table_grants', c.relname||' '||r.rolname||' '||x.privilege_type from core c join pg_class cl on cl.oid=c.oid cross join lateral aclexplode(cl.relacl) x join pg_roles r on r.oid=x.grantee where r.rolname in ('anon','authenticated','service_role')
 union all select 'column_grants', c.relname||'.'||a.attname||' '||r.rolname||' '||x.privilege_type from core c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped join pg_class cl on cl.oid=c.oid cross join lateral (select g.grantee, g.privilege_type from aclexplode(cl.relacl) g where g.privilege_type in ('SELECT','INSERT','UPDATE','REFERENCES') union select g.grantee, g.privilege_type from aclexplode(a.attacl) g) x join pg_roles r on r.oid=x.grantee where r.rolname in ('anon','authenticated')
) x group by k order by k;
