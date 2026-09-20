-- New venue, 2026-09-20 (Jody: "new venue in Detroit! rentfreehaus.com/events
-- let's add it to the database"). rent free haus is a small bar/listening
-- room at 1347 Fisher Freeway East, Detroit, MI 48207 (address confirmed on
-- the venue's own /visit page). Not yet a curated row in the venues table,
-- so venue_name_raw/address/city are set directly on each event, same
-- pattern as every other not-yet-curated venue in this project.
--
-- All 5 currently-listed nights pulled directly from rentfreehaus.com/events
-- and each event's own page -- each event page is extremely minimal (night
-- name, who selected/DJ'd, day/time, "AT THE DOOR"), so descriptions below
-- combine that real info with the venue's own real tagline text from its
-- homepage rather than inventing anything not actually on the site. No
-- ticket price is shown anywhere on the site (all nights are "AT THE DOOR"
-- with an optional table reservation, not a ticket purchase) -- price_from
-- is left null and a genuine visitor-facing note reflects that, same
-- handling as every other no-price-shown event in this project.
--
-- Two of the five (Plastic Sofa Sundays, Special Event) are today,
-- 2026-09-20, but both are still later today (5pm and 7pm start, current
-- time ~12:36pm ET) -- included since they haven't happened yet.
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('rentfreehaus-special-event-2026-09-20', 'Special Event (rent free haus)',
 'Selected by Ray O''Shay, at rent free haus -- a small Detroit bar and listening room built around music, drinks, and records.',
 'nightlife', 'rent free haus', '1347 Fisher Freeway East', 'Detroit',
 '2026-09-20', '2026-09-20', '5:00 PM–7:00 PM', false, null,
 'https://rentfreehaus.com/events/special-event-2026-09-20',
 null,
 'rent free haus (rentfreehaus.com/events, researched 2026-09-20)', 'No advance ticket -- entry at the door; tables can be reserved via the venue''s site.', 'approved'),

('rentfreehaus-plastic-sofa-sundays-2026-09-20', 'Plastic Sofa Sundays (rent free haus)',
 'Selected by Drake, at rent free haus -- a small Detroit bar and listening room built around music, drinks, and records.',
 'nightlife', 'rent free haus', '1347 Fisher Freeway East', 'Detroit',
 '2026-09-20', '2026-09-20', '7:00 PM–11:00 PM', false, null,
 'https://rentfreehaus.com/events/plastic-sofa-sundays-2026-09-20',
 null,
 'rent free haus (rentfreehaus.com/events, researched 2026-09-20)', 'No advance ticket -- entry at the door; tables can be reserved via the venue''s site.', 'approved'),

('rentfreehaus-rotation-fridays-2026-09-25', 'Rotation Fridays (rent free haus)',
 'Selected by Completd + DJ Mia, at rent free haus -- a small Detroit bar and listening room built around music, drinks, and records.',
 'nightlife', 'rent free haus', '1347 Fisher Freeway East', 'Detroit',
 '2026-09-25', '2026-09-25', '10:00 PM–2:00 AM', false, null,
 'https://rentfreehaus.com/events/rotation-fridays-2026-09-25',
 null,
 'rent free haus (rentfreehaus.com/events, researched 2026-09-20)', 'No advance ticket -- entry at the door; tables can be reserved via the venue''s site.', 'approved'),

('rentfreehaus-wednesday-vinyl-n-wine-2026-09-30', 'Wednesday Vinyl n Wine (rent free haus)',
 'Selected by James Adams, at rent free haus -- a small Detroit bar and listening room built around music, drinks, and records.',
 'nightlife', 'rent free haus', '1347 Fisher Freeway East', 'Detroit',
 '2026-09-30', '2026-09-30', '7:00 PM–10:00 PM', false, null,
 'https://rentfreehaus.com/events/wednesday-vinyl-n-wine-2026-09-30',
 null,
 'rent free haus (rentfreehaus.com/events, researched 2026-09-20)', 'No advance ticket -- entry at the door; tables can be reserved via the venue''s site.', 'approved'),

('rentfreehaus-sip-sounds-2026-10-04', 'Sip + Sounds (rent free haus)',
 'DJs to be announced, at rent free haus -- a small Detroit bar and listening room built around music, drinks, and records.',
 'nightlife', 'rent free haus', '1347 Fisher Freeway East', 'Detroit',
 '2026-10-04', '2026-10-04', '3:00 PM–7:00 PM', false, null,
 'https://rentfreehaus.com/events/sip-sounds-2026-10-04',
 null,
 'rent free haus (rentfreehaus.com/events, researched 2026-09-20)', 'No advance ticket -- entry at the door; tables can be reserved via the venue''s site.', 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  venue_address_raw = excluded.venue_address_raw,
  venue_city_raw = excluded.venue_city_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  is_free = excluded.is_free,
  price_from = excluded.price_from,
  ticket_url = excluded.ticket_url,
  note = excluded.note;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-20_rentfreehaus-new-venue.sql')
on conflict (filename) do nothing;
