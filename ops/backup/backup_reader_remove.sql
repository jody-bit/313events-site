-- Verified removal of the backup account. Every statement names backup_reader as the grantee or the role being dropped,
-- so no other role's privileges and no object can be affected. There is deliberately no DROP OWNED.
-- Step 1: backup_reader must own nothing. This STOPS the script (with ON_ERROR_STOP) if it owns anything; run it with psql -v ON_ERROR_STOP=1.
do $$ declare n int; begin
  select count(*) into n from pg_shdepend d join pg_roles r on r.oid = d.refobjid where r.rolname = 'backup_reader' and d.deptype = 'o';
  if n <> 0 then raise exception 'STOP: backup_reader owns % object(s); nothing was changed', n; end if;
end $$;
-- Step 2: mirror-image revokes of exactly the grants made in backup_reader_create.sql.
revoke select on storage.buckets, storage.objects from backup_reader;
revoke select on all tables in schema supabase_migrations from backup_reader;
revoke select on all sequences in schema public from backup_reader;
revoke select on all tables in schema public from backup_reader;
revoke usage on schema public, supabase_migrations, storage from backup_reader;
-- Step 3: plain DROP ROLE. It FAILS (and changes nothing) if any privilege or object still depends on the role.
drop role backup_reader;
-- Step 4: run acl_state.sql again; acl_state_hash must equal the value recorded before creation.
