-- Verified removal of the backup account. Every statement names backup_reader as the grantee or the role being dropped,
-- so no other role's privileges and no object can be affected. There is deliberately no DROP OWNED.
-- Step 1 (must return 0): backup_reader owns nothing.
select count(*) as owned_objects from pg_shdepend d join pg_roles r on r.oid = d.refobjid
 where r.rolname = 'backup_reader' and d.deptype = 'o';
-- Step 2: mirror-image revokes of exactly the grants made in backup_reader_create.sql.
revoke select on storage.buckets, storage.objects from backup_reader;
revoke select on all tables in schema supabase_migrations from backup_reader;
revoke select on all sequences in schema public from backup_reader;
revoke select on all tables in schema public from backup_reader;
revoke usage on schema public, supabase_migrations, storage from backup_reader;
-- Step 3: plain DROP ROLE. It FAILS (and changes nothing) if any privilege or object still depends on the role.
drop role backup_reader;
-- Step 4: run acl_state.sql again; acl_state_hash must equal the value recorded before creation.
