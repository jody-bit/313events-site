-- Grants fingerprint (companion to catalog_fingerprint.sql). Legacy production
-- baseline: all 12 tables and events_public carry the ACL below. Expect 13/13.
-- This describes the state BEFORE 20261006000003_sz01_public_access_boundary.sql.
-- After SZ-01 the expected result is 0/13 for anon/authenticated and
-- public_boundary_check.sql is the check to run instead.
select count(*)::text || '/13' as relations_with_production_acl
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v')
  and c.relacl::text = '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}';
