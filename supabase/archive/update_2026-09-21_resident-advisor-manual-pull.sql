-- Manual Resident Advisor pull, 2026-09-21 (Jody: human-directed daily RA
-- harvest). Per this project's own established policy -- see
-- api/cron-halo.js's header ("RA scraping remains off limits per its Terms
-- of Use") -- there is no automated crawler here and never will be. Same
-- pattern as update_2026-09-13_resident-advisor-manual-pull.sql and
-- update_2026-09-15_resident-advisor-manual-pull.sql: a human-driven,
-- one-off "let's add" ask, never a schedule.
--
-- Each new row below was checked against events_public (by venue_name
-- ilike and title ilike, plus a full same-date dump across every source)
-- before being added here -- none were already present. The one UPDATE
-- below targets a row already confirmed present, enriching it with a real
-- RA permalink/flyer in place of what it had before.
--
-- category: 'nightlife' for the nightlife rows, matching the convention
-- for every other Resident-Advisor-sourced row in this database. The
-- House of Tarot row uses 'visual' instead, matching its own Oct 1/Oct 2
-- siblings already in the database (an exhibition/installation, not a
-- club night).
--
-- EXCLUDED, not inserted: "The Drexciyan Empire Detroit Techno Immersive
-- Experience feat. Abu Qadim Haqq" (RA event 2535766) -- confirmed
-- cancelled by RA itself. Confirmed via a title/artist search that this
-- was never previously captured in this database, so there is nothing to
-- mark cancelled -- it is simply left out, same precedent as
-- update_2026-09-13_resident-advisor-manual-pull.sql's exclusion of the
-- cancelled Moondog Cafe "Fire Music Green-House" listing ("publishing a
-- cancelled event as live would be actively wrong, not just incomplete").
--
-- STILL PENDING, not inserted (no canonical RA event ID/media URL exists
-- yet to capture against -- not fabricated): Ø [Phase] (Lincoln Factory),
-- HIPHOP NIGHT: NAMEBRANDSMITH & DJBJ 3525 (Big Pink), RADIANT presents
-- The Masquerade Party (HALO DETROIT), Marble Bar 11 Year Anniversary.
-- DENNETT (Magic Stick) is also still pending -- out of scope for this
-- asset batch entirely, not touched here.
--
-- Idempotent: external_id makes every new row a stable upsert target,
-- same pattern as every cron file here.

insert into events (
  external_id, title, description, category, venue_name_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, ticket_url, image_url,
  source, note, status
) values

-- NECTO PRIDE PRESENTS: HORSE MEAT DISCO -- Ann Arbor, not a Detroit venue
-- like every prior RA pull in this database, so venue_city_raw is set
-- explicitly here rather than left to the (Detroit) default the two prior
-- pulls relied on.
('ra-2423018', 'Necto Pride presents: Horse Meat Disco',
 'Lineup: Horse Meat Disco, DJ Holographic, The Maestro DJ (opening). Genres: House, Disco. 18+. Ticket sales support Ozone House.',
 'nightlife', 'Necto', 'Ann Arbor',
 '2026-10-09', '2026-10-09', '9:00 PM–2:00 AM', false, 'https://ra.co/events/2423018',
 'https://imgproxy.ra.co/_/quality%3A66/aHR0cHM6Ly9pbWFnZXMucmEuY28vOGRiMmI0Zjg4YjEwMWRjZDM1OGNkOWU2NmVmZjZiNzJiMjRmNTkxOC5wbmc%3D',
 'Resident Advisor', null, 'approved'),

-- THE HOUSE OF TAROT -- October 3. RA gives this a distinct event ID
-- (2504606) from whatever the existing Oct 1/Oct 2 rows carry, and RA's
-- own framing describes Oct 1-3 as one "Opening Weekend" run at the same
-- venue/time slot -- a genuine third occurrence, not a duplicate of
-- either existing row. No distinguishing subtitle was given for this
-- date (unlike Oct 2's "(Live: Dominant Hand)"), so the title matches the
-- plain Oct 1 listing.
('ra-2504606', 'The House of Tarot', null, 'visual', 'MAD Arts', 'Detroit',
 '2026-10-03', '2026-10-03', '6:00 PM–10:00 PM', false, 'https://ra.co/events/2504606',
 'https://imgproxy.ra.co/_/quality%3A66/aHR0cHM6Ly9pbWFnZXMucmEuY28vOGU3MzUyOWM2NGZjZGU4N2VmZTgzNzgxNGExMjBlZmVmMjMwYzA4MC5qcGc%3D',
 'Resident Advisor', null, 'approved');

-- A DUB SUPREME (MotorCity Wine, 2026-09-27) -- already present in the
-- database from an earlier RA pull, but with only a generic venue-
-- homepage fallback as ticket_url (https://motorcitywine.com) and no
-- image. Enriching in place with the real RA permalink/flyer rather than
-- inserting a duplicate row. Matched on title + venue_name_raw +
-- start_date + source, not by touching status or external_id (its
-- current external_id is left as-is to avoid any risk of a unique-
-- constraint collision from guessing at it).
update events
set ticket_url = 'https://ra.co/events/2485347',
    image_url = 'https://imgproxy.ra.co/_/quality%3A66/aHR0cHM6Ly9pbWFnZXMucmEuY28vYzY2ZmY1MjIyYWMwMjNiMGM3MmE4YTg3OWY0YTQyOWRiMjIyYWZhYS5qcGc%3D'
where title = 'A Dub Supreme'
  and venue_name_raw = 'MotorCity Wine'
  and start_date = '2026-09-27'
  and source = 'Resident Advisor';

insert into schema_migrations (filename) values ('update_2026-09-21_resident-advisor-manual-pull.sql')
on conflict (filename) do nothing;
