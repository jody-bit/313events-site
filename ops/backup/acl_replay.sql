-- Emits the GRANT statements that reproduce the source's explicit table, view and column privileges for the three API roles.
-- A new Supabase project default-grants anon/authenticated on new public tables, so a restore must revoke and replay these
-- before the database is exposed (measured in the 2026-10-24 rehearsal: 336 grant rows vs 107 in production).
select format('grant %s on %s.%I to %I;', lower(a.privilege_type), n.nspname, c.relname, r.rolname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(c.relacl) a join pg_roles r on r.oid=a.grantee
where n.nspname='public' and c.relkind in ('r','v','m') and r.rolname in ('anon','authenticated','service_role')
union all
select format('grant %s (%I) on %s.%I to %I;', lower(a.privilege_type), at.attname, n.nspname, c.relname, r.rolname)
from pg_attribute at join pg_class c on c.oid=at.attrelid join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(at.attacl) a join pg_roles r on r.oid=a.grantee
where n.nspname='public' and c.relkind in ('r','v','m') and at.attnum>0 and at.attacl is not null and r.rolname in ('anon','authenticated','service_role')
order by 1;
