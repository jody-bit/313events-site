-- Dedicated read-only backup account. Run ONCE in the production SQL editor, only after the owner's explicit GO.
-- Replace PASTE-PASSWORD-HERE with a long random password (see the execution package); never paste it anywhere else.
-- Before running: run acl_state.sql and record acl_state_hash. After removal it must be identical.
create role backup_reader login password 'PASTE-PASSWORD-HERE' bypassrls connection limit 2;
alter role backup_reader set default_transaction_read_only = on;
grant usage on schema public, supabase_migrations, storage to backup_reader;
grant select on all tables in schema public to backup_reader;
grant select on all sequences in schema public to backup_reader;
grant select on all tables in schema supabase_migrations to backup_reader;
grant select on storage.buckets, storage.objects to backup_reader;
