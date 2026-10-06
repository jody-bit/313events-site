select k, md5(string_agg(d, E'\n' order by d)) as h, count(*) as n from (
 select 'columns' k, c.relname||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull::text||' '||coalesce(pg_get_expr(d.adbin,d.adrelid),'') d
   from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
   where c.relnamespace='public'::regnamespace and c.relkind='r'
 union all select 'column_order', c.relname||'.'||a.attname||'@'||a.attnum from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped where c.relnamespace='public'::regnamespace and c.relkind='r'
 union all select 'constraints', conrelid::regclass::text||' '||conname||' '||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace
 union all select 'indexes', indexname||' '||indexdef from pg_indexes where schemaname='public'
 union all select 'enums', t.typname||':'||e.enumlabel||'@'||e.enumsortorder from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typnamespace='public'::regnamespace
 union all select 'view', pg_get_viewdef(c.oid,true) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'
 union all select 'functions', pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace
 union all select 'triggers', pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
 union all select 'policies', tablename||'.'||policyname||' '||cmd||' '||roles::text||' '||coalesce(qual,'-')||' '||coalesce(with_check,'-') from pg_policies where schemaname='public'
 union all select 'rls', relname||' '||relrowsecurity::text from pg_class where relnamespace='public'::regnamespace and relkind='r'
) x group by k order by k;
