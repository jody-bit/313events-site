-- GLENN BARR CORRECTION: VERIFY + ROLLBACK (PROPOSED, NOT EXECUTED).
-- VERIFY (expect one row: time_display null, is_all_day true, date_semantics continuous, end_date 2026-12-30, status approved)
select id, title, time_display, is_all_day, date_semantics, start_date, end_date, status, left(description, 160) as description_start
from public.events where id = '15c5c165-ab1e-4d8a-817b-8cc1eb135b9f';

-- ROLLBACK: restores the three changed fields, only if the row still holds exactly what the correction wrote.
update public.events e
set time_display = b.time_display, is_all_day = b.is_all_day, description = b.description, date_semantics = null
from public.events_correction_backup_20261013 b
where e.id = b.id
  and e.time_display is null and e.is_all_day = true;
-- When accepted, the backup may be dropped:  drop table public.events_correction_backup_20261013;
