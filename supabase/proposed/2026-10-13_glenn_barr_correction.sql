-- GLENN BARR CORRECTION (PROPOSED, NOT EXECUTED). Needs owner SQL approval.
-- ONE row: 15c5c165-ab1e-4d8a-817b-8cc1eb135b9f  "Glenn Barr: The Beautiful and the Banal"
--          The Gallery at Ideation Orange, source Manual, status approved.
--
-- EVIDENCE
--  * galleryatio.com (read 2026-10-13): "Opening Friday October 9th from 7 to 10pm"; gallery hours
--    Wed-Fri 12-5. The page states NO exhibition end date.
--  * Row's own internal_note: Dec 30, 2026 came from an artist Instagram post supplied by a user;
--    it is NOT confirmed by the gallery. It is therefore not presented as confirmed.
--  * The opening reception was Fri Oct 9 and is past: it is not listed as an upcoming event.
--
-- BEFORE  time_display = 'Opening reception 7:00–10:00 PM', is_all_day = false, end_date = 2026-12-30,
--         description = '...The exhibition opens Friday, October 9 with an opening reception from 7–10 PM
--         and remains on view through December 30, 2026.'
-- AFTER   time_display = NULL, is_all_day = true (ongoing exhibition, no clock time on any day),
--         description states only that the exhibition opened Oct 9 with an opening reception and points to
--         the gallery for hours: NO closing date and no "artist announced" wording in the text.
--         end_date UNCHANGED (see decision below). No hours or recurrence added.
-- DECISION FOR OWNER (open): the stored end_date 2026-12-30 is unconfirmed by the gallery. Keeping it
--   means the site still shows a "Through Dec 30" label and lists the exhibition to then; setting it to NULL
--   drops the exhibition off after Oct 9 until the gallery confirms. This file leaves it unchanged; the
--   alternative is one extra `end_date = null` line.
-- After the date-semantics migration: also set date_semantics = 'continuous' (second statement below).

begin;

create table if not exists public.events_correction_backup_20261013 as
select id, title, description, start_date, end_date, time_display, is_all_day
from public.events where false;

insert into public.events_correction_backup_20261013 (id, title, description, start_date, end_date, time_display, is_all_day)
select id, title, description, start_date, end_date, time_display, is_all_day
from public.events
where id = '15c5c165-ab1e-4d8a-817b-8cc1eb135b9f'
  and not exists (select 1 from public.events_correction_backup_20261013 b where b.id = '15c5c165-ab1e-4d8a-817b-8cc1eb135b9f');

update public.events
set time_display = null,
    is_all_day = true,
    description = 'Detroit artist Glenn Barr presents The Beautiful and the Banal, a solo exhibition at The Gallery at Ideation Orange in Hazel Park. The exhibition opened Friday, October 9, with an opening reception. See the gallery for current hours.'
where id = '15c5c165-ab1e-4d8a-817b-8cc1eb135b9f'
  and time_display = 'Opening reception 7:00–10:00 PM'
  and is_all_day = false
  and status = 'approved';
-- expect exactly 1 row; if not, ROLLBACK and report.

commit;
