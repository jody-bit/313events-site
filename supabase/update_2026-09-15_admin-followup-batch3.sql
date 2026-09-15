-- Admin follow-up queue, batch 3 — 2026-09-15. Jody re-uploaded the admin
-- panel PDF after running batch2; queue is down to ~25 items. This file
-- covers the ones with a confidently SOURCED start time found this round.
-- See the chat response for the full remaining list, including several
-- items intentionally left OUT of this file because no reliable source time
-- could be found (rather than guessing) — those still need Jody's own call.
--
-- Safe to re-run: guarded, matched by (title, start_date).

-- Detroit Harvest Fest, 2026-10-03, Ralph C. Wilson Jr. Centennial Park.
-- Source: detroitriverfront.org event listing — gates/start 11:00 AM.
update events
set time_display = '11:00 AM'
where title = 'Detroit Harvest Fest'
  and start_date = '2026-10-03'
  and (time_display is null or time_display = '');

-- Zoo Boo, 2026-10-03, Detroit Zoo.
-- Source: detroitzoo.org — Zoo Boo runs from 3:00 PM.
update events
set time_display = '3:00 PM'
where title = 'Zoo Boo'
  and start_date = '2026-10-03'
  and (time_display is null or time_display = '');

-- Adult Art Camp!, 2026-09-30, Cranbrook Art Museum.
-- Source: cranbrookartmuseum.org/calendar — 9:30 AM start. Session is
-- listed as SOLD OUT as of this pull; still real/dated, listing per
-- this project's own past practice (see Elmwood trolley tour note).
update events
set time_display = '9:30 AM'
where title = 'Adult Art Camp!'
  and start_date = '2026-09-30'
  and (time_display is null or time_display = '');

-- Hallowe'en in Greenfield Village, 2026-10-01, Greenfield Village.
-- Source: thehenryford.org — event runs 6:00 PM-9:30 PM; using the start.
update events
set time_display = '6:00 PM'
where title = 'Hallowe’en in Greenfield Village'
  and start_date = '2026-10-01'
  and (time_display is null or time_display = '');

insert into schema_migrations (filename) values ('update_2026-09-15_admin-followup-batch3.sql')
on conflict (filename) do nothing;
