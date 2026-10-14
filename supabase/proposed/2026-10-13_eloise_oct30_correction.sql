-- ELOISE ASYLUM OCT 30 CORRECTION (PROPOSED, NOT EXECUTED). Needs owner SQL approval.
-- Two rows, no inserts (the concert already exists: no duplicate is created).
--   8e4db9ef-2f29-4155-9927-2da3bf771bcf  Rockin' Haunt Night Concert at Eloise Asylum (enrich)
--   25a74571-7cde-44b5-b0e9-5f8c25a02cdc  Eloise Asylum Haunted Attraction, Oct 30 night row (stop showing generic Friday hours and $34.99)
-- The season row (dcc30a40-...) and the other 14 nightly rows are NOT touched.
-- EVIDENCE: eloiseasylum.com/rockin-haunt-night-concert/ (read 2026-10-13) + Jody's official poster.
--   Page: doors 6:00 PM; no set times, no prices; Haunt/Concert GA/VIP are "the only Haunt ticket options valid for October 30th".
--   Poster: Concert Zone access = concert, beer tent, food trucks, vendors; rain or shine; MCs Trudi Daniels, John Bobby.
-- Not invented: performance start/end time, ticket prices, Oct 30 haunt hours.
begin;

create table if not exists public.events_correction_backup_20261013_eloise as
select id, title, description, time_display, price_from, date_semantics, is_all_day from public.events where false;

insert into public.events_correction_backup_20261013_eloise
select id, title, description, time_display, price_from, date_semantics, is_all_day
from public.events
where id in ('8e4db9ef-2f29-4155-9927-2da3bf771bcf','25a74571-7cde-44b5-b0e9-5f8c25a02cdc')
  and not exists (select 1 from public.events_correction_backup_20261013_eloise b where b.id = events.id);

update public.events set
  date_semantics = 'single',
  description = 'One night at Eloise Asylum in Westland: DJ 3choc@t, Mob Opera and Marz Radio, with MCs Trudi Daniels and John Bobby. Doors open at 6 PM, rain or shine. Concert-only tickets include Concert Zone access (concert, beer tent, food trucks and vendors). Combined Haunt/Concert GA and VIP tickets add the haunted attraction; they are the only haunt tickets valid on October 30, and regular haunt admission is not accepted. The Haunt requires guests to be 18 or older. Set times and ticket prices are not published; see official ticketing.'
where id = '8e4db9ef-2f29-4155-9927-2da3bf771bcf' and status = 'approved'
  and date_semantics is null and time_display = '6:00 PM doors';

update public.events set
  time_display = 'Special Haunt/Concert night; see official ticketing for times',
  price_from = null,
  description = 'Haunted attraction at Eloise Asylum in Westland. On October 30 the haunt runs with the Rockin'' Haunt Night Concert: only the special Haunt/Concert GA or VIP ticket is valid, and regular haunt admission is not accepted. Guests must be 18 or older. Check official ticketing for details.'
where id = '25a74571-7cde-44b5-b0e9-5f8c25a02cdc' and status = 'approved'
  and time_display = '7:00–11:00 PM' and price_from = 34.99;

do $$ declare n int; begin
  select count(*) into n from public.events
  where (id = '8e4db9ef-2f29-4155-9927-2da3bf771bcf' and date_semantics = 'single')
     or (id = '25a74571-7cde-44b5-b0e9-5f8c25a02cdc' and price_from is null and time_display like 'Special Haunt/Concert%');
  if n <> 2 then raise exception 'Eloise Oct 30 correction matched % rows, expected 2; rolling back', n; end if;
end $$;
commit;

-- VERIFY: select id,title,time_display,price_from,date_semantics from public.events where id in (...both ids...);
--         and confirm events_public shows both, and approved count unchanged.
-- ROLLBACK: run 2026-10-13_eloise_oct30_correction_rollback.sql (restores description, time_display, price_from, date_semantics from the backup table).
-- NOT CHANGED on either row: title, dates, is_all_day, event_url, ticket_url, image_url, venue_id, status.
