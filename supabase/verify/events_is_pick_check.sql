-- Read-only readback for migration_047_events_is_pick.sql. Expect every row below to be true, and picks_now = 0 right after applying.
select 'is_pick exists, boolean, not null, default false' as check_name,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='is_pick'
          and data_type='boolean' and is_nullable='NO' and column_default='false') as ok
union all select 'picked_at exists, timestamptz, nullable',
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='picked_at'
          and data_type='timestamp with time zone' and is_nullable='YES')
union all select 'anon can read is_pick (feed uses the anon key)', has_column_privilege('anon','public.events','is_pick','SELECT')
union all select 'anon cannot write is_pick', not has_column_privilege('anon','public.events','is_pick','UPDATE')
union all select 'events_public does not expose is_pick',
  not exists (select 1 from information_schema.columns where table_schema='public' and table_name='events_public' and column_name='is_pick')
union all select 'picks_now = 0 (fresh)', (select count(*) from public.events where is_pick) = 0;
