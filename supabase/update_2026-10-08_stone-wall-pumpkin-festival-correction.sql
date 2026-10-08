-- Stone Wall Pumpkin Festival: correct a published editorial event
-- (Admin Hardening slice 1, 2026-10-08).
--
-- NOT RUN. Needs Product Owner approval before it touches production.
-- Prepared to run by hand in the Supabase SQL Editor.
--
-- The row (19b56f57-73dc-497a-bf47-74129cdbd99f, source "Editorial Review
-- (Automated)", created from C&G Newspapers' 2026-10-06 article "Pumpkin
-- festival celebrates fall harvest with family fun") was published as:
--   venue "Venue TBA", address "11 Mile Road", city "Warren",
--   2026-10-06 to 2026-10-10, no time, description cut at "from 10 a.m."
-- "11 Mile Road, Warren" is C&G's own office (site footer); 2026-10-06 is
-- the article's publish date. See test/editorial-stone-wall-regression.test.js.
--
-- Verified 2026-10-08:
--   - the article: Rochester Hills Museum at Van Hoosen Farm; 10 a.m. to
--     4 p.m. Saturday, Oct. 10; pumpkins lit 7-9 p.m.
--   - rochesterhills.org museum page: Rochester Hills Museum at Van Hoosen
--     Farm, 1005 Van Hoosen Rd, Rochester Hills, MI 48306; the festival is
--     held the "Second Saturday in October".
--   - City of Rochester Hills calendar, Oct. 10, 2026: "10:00 - 4:00 Stone
--     Wall Pumpkin Festival, Presented by Genisys Credit Union"; no other
--     day that week.
-- Not used as evidence: the Google Maps link (supporting only).
--
-- Guarded: changes nothing unless the row still holds exactly the known-bad
-- values, so it cannot overwrite a correction someone already made. The
-- original values are kept in internal_note (no change-history table yet).
-- Same row, same id: no second event is created.

update events
set venue_name_raw    = 'Rochester Hills Museum at Van Hoosen Farm',
    venue_address_raw = '1005 Van Hoosen Rd',
    venue_city_raw    = 'Rochester Hills',
    start_date        = '2026-10-10',
    end_date          = null,
    time_display      = '10:00 AM – 4:00 PM',
    description       = 'For over 25 years, the museum has been bringing families together for its Stone Wall Pumpkin Festival, held this year from 10 a.m. to 4 p.m. Saturday, Oct. 10.',
    internal_note     = coalesce(internal_note || E'\n', '') ||
      'CORRECTED | v1 | at=2026-10-08 | was: venue_name_raw=Venue TBA; venue_address_raw=11 Mile Road; venue_city_raw=Warren; start_date=2026-10-06; end_date=2026-10-10; time_display=null; description cut at "10 a.m." | cause=publisher footer address + byline publish date + a.m. sentence split (press-coverage-linking.js) | evidence=article + rochesterhills.org/museum + rochesterhills.org/calendar.php 2026-10-10'
where id = '19b56f57-73dc-497a-bf47-74129cdbd99f'
  and venue_city_raw = 'Warren'
  and venue_address_raw = '11 Mile Road'
  and start_date = '2026-10-06'
  and end_date = '2026-10-10';

-- OPTIONAL, separate Product Owner decisions (left commented out):
--
-- (a) Category. Stored as "visual" because the article also mentions a
--     scarecrow exhibit. The event is a festival.
-- update events set category = 'fest' where id = '19b56f57-73dc-497a-bf47-74129cdbd99f' and category = 'visual';
--
-- (b) Canonical venue, so future events at this venue resolve to it
--     (venue-lookup.js matches by exact name). Values are the museum's own
--     published name and address.
-- insert into venues (name, address, city, website)
-- values ('Rochester Hills Museum at Van Hoosen Farm', '1005 Van Hoosen Rd', 'Rochester Hills', 'https://www.rochesterhills.org/museum')
-- on conflict (lower(name), lower(city)) do nothing;
-- update events e set venue_id = v.id from venues v
--  where e.id = '19b56f57-73dc-497a-bf47-74129cdbd99f' and e.venue_id is null
--    and lower(v.name) = lower('Rochester Hills Museum at Van Hoosen Farm') and lower(v.city) = 'rochester hills';
