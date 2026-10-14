-- ROLLBACK for 2026-10-13_eloise_oct30_correction.sql. Restores exactly the two backed-up rows.
begin;
update public.events e
set description = b.description, time_display = b.time_display, price_from = b.price_from, date_semantics = b.date_semantics
from public.events_correction_backup_20261013_eloise b
where b.id = e.id and e.id in ('8e4db9ef-2f29-4155-9927-2da3bf771bcf','25a74571-7cde-44b5-b0e9-5f8c25a02cdc');
do $$ declare n int; begin
  select count(*) into n from public.events
  where (id='8e4db9ef-2f29-4155-9927-2da3bf771bcf' and date_semantics is null and time_display='6:00 PM doors')
     or (id='25a74571-7cde-44b5-b0e9-5f8c25a02cdc' and price_from=34.99 and time_display='7:00–11:00 PM');
  if n <> 2 then raise exception 'rollback restored % rows, expected 2; aborting', n; end if;
end $$;
commit;
