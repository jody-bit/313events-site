-- Stone Wall Pumpkin Festival: correct a published editorial event
-- (Admin Hardening slice 1, 2026-10-08).
--
-- APPROVED by the Product Owner 2026-10-08 (correct the event, category
-- Festival, add the venue if not already represented). Applied 2026-10-08
-- through the Supabase SQL connection; see the slice 1 report.
--
-- The row (19b56f57-73dc-497a-bf47-74129cdbd99f, source "Editorial Review
-- (Automated)", created from C&G Newspapers' 2026-10-06 article "Pumpkin
-- festival celebrates fall harvest with family fun") was published as:
--   venue "Venue TBA", address "11 Mile Road", city "Warren",
--   2026-10-06 to 2026-10-10, no time, category visual, description cut at
--   "from 10 a.m."
-- "11 Mile Road, Warren" is C&G's own office (site footer); 2026-10-06 is
-- the article's publish date. See test/editorial-stone-wall-regression.test.js.
--
-- Verified 2026-10-08:
--   - the article: Rochester Hills Museum at Van Hoosen Farm; 10 a.m. to
--     4 p.m. Saturday, Oct. 10; pumpkins lit 7-9 p.m.; $8 members, $12
--     nonmembers, under 2 free; rain or shine.
--   - rochesterhills.org museum page: Rochester Hills Museum at Van Hoosen
--     Farm, 1005 Van Hoosen Rd, Rochester Hills, MI 48306; the festival is
--     held the "Second Saturday in October".
--   - City of Rochester Hills calendar, Oct. 10, 2026: "10:00 - 4:00 Stone
--     Wall Pumpkin Festival, Presented by Genisys Credit Union"; no other
--     day that week.
-- Not used as evidence: the Google Maps link (supporting only).
--
-- Schedule: time_display carries only the festival's own daytime hours
-- (10 AM - 4 PM). The evening lighting (7-9 PM) is a separate session, so it
-- is stated in the description rather than stretched into one 10 AM - 9 PM
-- range the event does not have.
--
-- ONE statement, so it is atomic. Guarded: the event changes only while it
-- still holds exactly the known-bad values (it cannot overwrite a later
-- correction); the venue is inserted only if no venue with that name and
-- city exists. The original values are kept in internal_note (admin-only;
-- no change-history table yet). Same event id: no second event is created.

with new_venue as (
  insert into venues (name, address, city, zip_code, website)
  select 'Rochester Hills Museum at Van Hoosen Farm', '1005 Van Hoosen Rd', 'Rochester Hills', '48306', 'https://www.rochesterhills.org/museum'
  where not exists (
    select 1 from venues
    where lower(trim(name)) = lower('Rochester Hills Museum at Van Hoosen Farm')
       or lower(coalesce(address, '')) like '1005 van hoosen%'
  )
  on conflict (lower(name), lower(city)) do nothing
  returning id
), venue as (
  select id from new_venue
  union
  select id from venues
  where lower(trim(name)) = lower('Rochester Hills Museum at Van Hoosen Farm') and lower(city) = 'rochester hills'
)
update events
set venue_id          = (select id from venue limit 1),
    venue_name_raw    = 'Rochester Hills Museum at Van Hoosen Farm',
    venue_address_raw = '1005 Van Hoosen Rd',
    venue_city_raw    = 'Rochester Hills',
    start_date        = '2026-10-10',
    end_date          = null,
    time_display      = '10:00 AM – 4:00 PM',
    category          = 'fest',
    description       = 'The Rochester Hills Museum at Van Hoosen Farm''s annual Stone Wall Pumpkin Festival. Festival activities run 10 a.m. to 4 p.m. and include pumpkin carving, pumpkin bowling, live entertainment, crafts and food. Carved pumpkins are then placed on the museum''s historic stone walls and lit for a one-night display from 7 to 9 p.m. Admission is $8 for museum members and $12 for nonmembers; children under 2 are free. Held rain or shine.',
    description_source = null,
    internal_note     = coalesce(internal_note || E'\n', '') ||
      'CORRECTED | v1 | at=2026-10-08 | approved_by=Product Owner | was: venue_name_raw=Venue TBA; venue_address_raw=11 Mile Road; venue_city_raw=Warren; start_date=2026-10-06; end_date=2026-10-10; time_display=null; category=visual; description cut at "10 a.m." | cause=publisher footer address + byline publish date + a.m. sentence split (press-coverage-linking.js) | evidence=C&G article + rochesterhills.org/museum + rochesterhills.org/calendar.php 2026-10-10'
where id = '19b56f57-73dc-497a-bf47-74129cdbd99f'
  and venue_city_raw = 'Warren'
  and venue_address_raw = '11 Mile Road'
  and start_date = '2026-10-06'
  and end_date = '2026-10-10'
  and category = 'visual'
returning id, venue_id, venue_name_raw, venue_address_raw, venue_city_raw, start_date, end_date, time_display, category, status;
