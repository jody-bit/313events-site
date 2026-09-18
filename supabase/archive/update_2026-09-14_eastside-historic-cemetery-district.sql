-- Eastside Historic Cemetery District, 2026-09-14 (Jody: "Eastside Historic
-- Cemetery District is a new neighborhood - the cemetary has an event page
-- https://www.eventbrite.com/cc/history-tours-and-programs-4656633/", then
-- separately: "District: Eastside Historic Cemetery District / General
-- Area: East Side of Detroit, just a couple of miles from downtown. /
-- Borders: Near Mt. Elliott St. and E. Lafayette St., alongside the historic
-- Bloody Run creek.")
--
-- Corrects the placeholder name this project guessed on 2026-08-27
-- (migration_010): a stone-bridge photo Jody supplied was matched by GPS to
-- the nearest of the existing 39 neighborhoods (closer, on paper, to
-- "Rivertown"), then misidentified by sight as "Belle Isle" — Jody corrected
-- this in person ("the stone bridge is actually at Elmwood cemetary I went
-- to a goth picnic there today"), so migration_010 filed the venue under a
-- new placeholder neighborhood, "Elmwood Park". Jody has since supplied the
-- real, official name for this area, which this file applies as a RENAME
-- (same id, same technique migration_010 itself used for
-- Fitzgerald->Fitzgerald-Marygrove and Rivertown->Rivertown-Warehouse
-- District) so the existing "Elmwood Cemetery" venue row carries over
-- automatically rather than needing to be re-pointed.
--
-- SOURCES (multi_source confidence):
--   - Wikipedia: "Eastside Historic Cemetery District"
--     https://en.wikipedia.org/wiki/Eastside_Historic_Cemetery_District
--     -- listed on the National Register of Historic Places, Dec 2, 1982,
--     reference #82000550. Boundary given as "Elmwood Avenue, Mt. Elliott
--     Avenue, Lafayette Street, and Waterloo Street." Coordinates:
--     42.34972, -83.01806. Comprises three adjacent 19th-century cemeteries:
--     Mount Elliott Cemetery (Catholic, est. 1841), Elmwood Cemetery
--     (Protestant, est. 1846), and Lafayette Street Cemetery (Jewish, est.
--     1850).
--   - detroithistorical.org, elmwoodhistoriccemetery.org, detroit1701.org,
--     and a YouTube video — all supplied directly by Jody as citations for
--     the same district, not independently re-checked here.
--   - Jody's own on-the-ground confirmation (2026-09-14): visited the
--     cemetery in person.
-- Safe to re-run: renames/upserts throughout, same convention as every
-- other migration/patch file here.

-- ---------------------------------------------------------------------------
-- 1. Rename the neighborhood row (same id — see note above) and fill in the
--    area_note this placeholder never had (migration_010 left it null).
-- ---------------------------------------------------------------------------
update neighborhoods set
  name = 'Eastside Historic Cemetery District',
  area_note = 'East side, ~2 miles from downtown; bounded by Elmwood Ave, Mt. Elliott Ave, Lafayette St, and Waterloo St, alongside the historic Bloody Run creek. A National Register historic district (NRHP #82000550, listed 1982) comprising three adjacent 19th-century cemeteries: Elmwood (Protestant, est. 1846), Mount Elliott (Catholic, est. 1841), and Lafayette Street Cemetery (Jewish, est. 1850).',
  is_district = true
where name = 'Elmwood Park';

-- ---------------------------------------------------------------------------
-- 2. Elmwood Cemetery venue (already exists, from migration_010): fill in
--    the address/zip we now have, and upgrade confidence from
--    'editorial_judgment' to 'multi_source' now that it's backed by the
--    NRHP listing + Wikipedia, not just Jody's spreadsheet call.
-- ---------------------------------------------------------------------------
update venues set
  address = '1200 Elmwood Street',
  zip_code = '48207',
  neighborhood_confidence = 'multi_source',
  neighborhood_source = 'NRHP #82000550 / Wikipedia "Eastside Historic Cemetery District"; address from the venue''s own Eventbrite listing; Jody (site owner) visited in person, 2026-09-14'
where lower(name) = lower('Elmwood Cemetery');

-- ---------------------------------------------------------------------------
-- 3. New venues for the district's other two cemeteries — added now that
--    the district itself is real and sourced, not because either has a
--    confirmed event source yet (Mount Elliott Cemetery Association's own
--    site, mtelliott.com, turned out to be a Clinton Township-based
--    corporate/admin page for a multi-location Catholic cemetery operator,
--    with no dated, location-specific events for this Detroit site — so no
--    events are seeded for it here, unlike Elmwood below). Street addresses
--    for these two aren't independently confirmed yet, so left null rather
--    than guessed.
-- ---------------------------------------------------------------------------
insert into venues (name, city, neighborhood_id, neighborhood_confidence, neighborhood_source)
values ('Mount Elliott Cemetery', 'Detroit',
        (select id from neighborhoods where name = 'Eastside Historic Cemetery District'),
        'multi_source', 'NRHP #82000550 / Wikipedia "Eastside Historic Cemetery District" — one of the district''s three founding cemeteries')
on conflict (lower(name), lower(city)) do update set
  neighborhood_id = excluded.neighborhood_id,
  neighborhood_confidence = excluded.neighborhood_confidence,
  neighborhood_source = excluded.neighborhood_source;

insert into venues (name, city, neighborhood_id, neighborhood_confidence, neighborhood_source)
values ('Lafayette Street Cemetery', 'Detroit',
        (select id from neighborhoods where name = 'Eastside Historic Cemetery District'),
        'multi_source', 'NRHP #82000550 / Wikipedia "Eastside Historic Cemetery District" — one of the district''s three founding cemeteries')
on conflict (lower(name), lower(city)) do update set
  neighborhood_id = excluded.neighborhood_id,
  neighborhood_confidence = excluded.neighborhood_confidence,
  neighborhood_source = excluded.neighborhood_source;

-- ---------------------------------------------------------------------------
-- 4. Real events: Elmwood Cemetery's own Eventbrite "History Tours and
--    Programs" collection (the page Jody flagged) currently lists exactly
--    three dated, FUTURE trolley tours as of this pull (2026-09-14). A
--    fourth listed item ("Wednesday, sales ended", no date shown on the
--    collection page) resolved on its own event page to Sept 16, 2026 —
--    added below since the date is now confirmed, even though ticket sales
--    have closed (313.events lists what's happening, not just what's still
--    purchasable). A separate walking tour on the same collection page
--    ("Elmwood Walks: Detroit Music History," Sun Sept 13) had already
--    passed by pull time and is not included. This is a one-time manual
--    transcription, same as the Resident Advisor/visitdetroit.com pulls the
--    same week — no Eventbrite scraping/automation set up here.
--
-- category: 'museum' — a guided historical tour, matching this project's
-- existing use of 'museum' for DIA/Detroit Historical Museum etc., not
-- 'fest' or 'community'.
-- ---------------------------------------------------------------------------
insert into events (
  external_id, title, description, category, venue_name_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  source, note, status
) values

('elmwood-trolley-tour-2026-09-16', 'Elmwood Cemetery Trolley Tour',
 'Get to know Elmwood''s history, art, nature and landscape from the comfort of a charming vintage trolley, in partnership with Detroit''s Grand Trolley. A two-hour guided tour of the 86-acre historic cemetery, with optional hop-off stops. Discounted $10/person rate thanks to the Mary Thompson Foundation; capacity limited to 24 people.',
 'museum', 'Elmwood Cemetery', null,
 '2026-09-16', '2026-09-16', '10:00 AM–12:00 PM', false, 10.00,
 'https://www.eventbrite.com/e/elmwood-cemetery-trolley-tour-tickets-1995465272346',
 'Manual', 'Ticket sales had already ended for this date at pull time (2026-09-14); listed anyway since the tour itself is real and dated.', 'approved'),

('elmwood-trolley-tour-2026-09-20', 'Elmwood Cemetery Trolley Tour',
 'Get to know Elmwood''s history, art, nature and landscape from the comfort of a charming vintage trolley, in partnership with Detroit''s Grand Trolley. A two-hour guided tour of the 86-acre historic cemetery, with optional hop-off stops. Discounted $10/person rate thanks to the Mary Thompson Foundation; capacity limited to 24 people.',
 'museum', 'Elmwood Cemetery', null,
 '2026-09-20', '2026-09-20', '10:00 AM–12:00 PM', false, 10.00,
 'https://www.eventbrite.com/e/elmwood-cemetery-trolley-tour-tickets-1995471809900',
 'Manual', null, 'approved'),

('elmwood-trolley-tour-2026-10-14', 'Elmwood Cemetery Trolley Tour',
 'Get to know Elmwood''s history, art, nature and landscape from the comfort of a charming vintage trolley, in partnership with Detroit''s Grand Trolley. A two-hour guided tour of the 86-acre historic cemetery, with optional hop-off stops. Discounted $10/person rate thanks to the Mary Thompson Foundation; capacity limited to 24 people.',
 'museum', 'Elmwood Cemetery', null,
 '2026-10-14', '2026-10-14', '10:00 AM–12:00 PM', false, 10.00,
 'https://www.eventbrite.com/e/elmwood-cemetery-trolley-tour-tickets-1995951734367',
 'Manual', null, 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  venue_city_raw = excluded.venue_city_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  price_from = excluded.price_from,
  ticket_url = excluded.ticket_url,
  note = excluded.note;

-- Same generic name-match backfill as every other new-events file here.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

-- =============================================================================
-- PART 2 — added same day, follow-up request. Jody sent the direct URLs for
-- all 16 events listed on mtelliott.com/news-events/ ("you have to click on
-- each one of the cards on the page to see the details") and said to add
-- them since they're within the 75-mile service area even though they're
-- not in the Eastside Historic Cemetery District itself. She also sent
-- Elmwood Cemetery's own second Eventbrite collection ("Birding, Trees, and
-- Nature").
--
-- IMPORTANT — what mtelliott.com actually turned out to be: not the
-- historic "Mt. Elliott Cemetery" inside the Eastside Historic Cemetery
-- District at all. It's the public site for the Mt. Elliott Cemetery
-- Association, a separate multi-location Catholic cemetery operator
-- headquartered in Clinton Township that also happens to run the historic
-- Mt. Elliott Cemetery as one of several properties. Every one of the 16
-- event pages, when actually opened, named a location — and none of them
-- named the historic Detroit cemetery. All 16 are at the Association's
-- OTHER properties: Resurrection Cemetery (Clinton Township), Guardian
-- Angel Cemetery (Rochester), All Saints Cemetery, and Mt. Olivet Cemetery
-- (both Detroit-area but not this district). So none of what follows
-- touches the Eastside Historic Cemetery District neighborhood_id — these
-- get their own city, no neighborhood assignment, exactly as Jody's own
-- framing ("still within our 75-mile radius") anticipated.
--
-- Of the 16 pages, most turned out to be STALE — last year's (or older)
-- event page, not yet refreshed for the current season. Caught by checking
-- each stated date's day-of-week against a real 2026 calendar:
--   * Patriot Day (Sep 11, 2026): real date, but already 3 days in the past
--     as of this pull (2026-09-14) — excluded.
--   * All Saints/All Souls Day: page still shows "November 2, 2025".
--   * Veterans Day: page still shows "Saturday, November 11, 2023".
--   * Season of Remembrance: page still shows December 2025 dates.
--   * Mt. Olivet Remembrance Tree Lighting: "Saturday, December 7" — but
--     Dec 7, 2026 is a Monday, not a Saturday. Stale from a past year.
--   * Stations of the Cross: page still shows "Friday, April 18, 2025".
--   * Remembering Mom (Mother's Day): correctly dated Sunday, May 10, 2026
--     — but that's already 4 months in the past as of this pull.
--   * Memorial Day Mass: page still shows "Monday, May 26, 2025" (and 2026's
--     Memorial Day is May 25, not the 26th, confirming it's stale).
--   * Remembering Dad (Father's Day): page still shows "Sunday, June 16,
--     2024".
--   * Independence Day extended hours: "Friday, July 4" / "Wednesday, July
--     9" — but July 4, 2026 is a Saturday and July 9, 2026 is a Thursday.
--     Stale, from whatever year those weekdays actually lined up.
--   * Children's Remembrance: page still shows "Saturday, August 24, 2024".
-- None of these are added — adding a specific dated row from a page that's
-- demonstrably showing an old year's date would misinform, not help.
-- (Christmas Vigil, Dec 24-26, gives no year at all — genuinely ambiguous
-- either way, also excluded rather than guessed.)
--
-- What's left — checked against a real calendar and confirmed genuinely
-- upcoming as of 2026-09-14 — is what's inserted below:
--   * Resurrection Cemetery Preplanning Seminar (Thu Sep 17, 2026)
--   * Michigan POW-MIA Vigil (Fri Sep 18, 2026)
--   * Monument Design Day (Tue Oct 6 AND Wed Oct 14, 2026 — two dates)
--   * Resurrection Cemetery Fall Open House and Tour (Wed Oct 7, 2026)
--   * Wreaths Across America (Sat Dec 12, 2026 — simultaneous ceremonies at
--     both Resurrection and Guardian Angel, added as two separate rows
--     since they're two different physical locations)
--   * Fall Tree Walk at Elmwood Cemetery (Sun Oct 11, 2026) — from the
--     second Eventbrite collection Jody sent, a real Elmwood Cemetery event
--     (this one DOES belong to the Eastside Historic Cemetery District,
--     via the existing 'Elmwood Cemetery' venue).
--
-- All free (no ticket cost stated on any of these pages), so is_free=true
-- and price_from is left null throughout.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- New venues for the Association's other properties (no neighborhood_id —
-- these are not in the Eastside Historic Cemetery District).
-- ---------------------------------------------------------------------------
insert into venues (name, city)
values ('Resurrection Cemetery', 'Clinton Township')
on conflict (lower(name), lower(city)) do nothing;

insert into venues (name, city)
values ('Guardian Angel Cemetery', 'Rochester')
on conflict (lower(name), lower(city)) do nothing;

insert into venues (name, city, address)
values ('Fern Hill Golf Club', 'Clinton Township', '17600 Clinton River Rd')
on conflict (lower(name), lower(city)) do nothing;

-- Fill in what we now know about Resurrection Cemetery's address (repeated
-- across several of the source pages).
update venues set address = '18201 Clinton River Road'
where lower(name) = lower('Resurrection Cemetery') and lower(city) = lower('Clinton Township')
  and address is null;

update venues set address = '4701 N. Rochester Rd'
where lower(name) = lower('Guardian Angel Cemetery') and lower(city) = lower('Rochester')
  and address is null;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
insert into events (
  external_id, title, description, category, venue_name_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  source, note, status
) values

('elmwood-fall-tree-walk-2026-10-11', 'Fall Tree Walk at Elmwood Cemetery',
 'A walking tour of Elmwood Cemetery''s certified Arboretum — over 1,200 trees representing 90+ species — led by local master arborist Todd Fleishans, with tree care basics, identification tips, and fall color viewing.',
 'museum', 'Elmwood Cemetery', null,
 '2026-10-11', '2026-10-11', '1:00 PM–3:00 PM', true, null,
 'https://www.eventbrite.com/e/fall-tree-walk-at-elmwood-cemetery-tickets-2000298313101',
 'Manual', null, 'approved'),

('mtelliott-resurrection-preplanning-seminar-2026-09-17', 'Resurrection Cemetery Preplanning Seminar',
 'A free educational seminar on cemetery preplanning, hosted by Mt. Elliott Cemetery Association for Resurrection Cemetery.',
 'community', 'Fern Hill Golf Club', 'Clinton Township',
 '2026-09-17', '2026-09-17', '6:00 PM', true, null,
 'https://www.mtelliott.com/preplanning-seminars/',
 'Manual', 'Educational/informational seminar, not a ticketed public event — included per Jody''s request.', 'approved'),

('mtelliott-pow-mia-vigil-2026-09-18', 'Michigan POW-MIA Vigil',
 'Vietnam Veterans of America Chapter 154''s annual vigil honoring Michigan''s missing service members from the Vietnam War: reading of the names of the 48 Vietnam MIA from Michigan with a rifle volley and Taps (3pm), an opening ceremony (6pm), continuing until the vigil concludes at 9pm.',
 'community', 'Resurrection Cemetery', 'Clinton Township',
 '2026-09-18', '2026-09-18', '3:00 PM–9:00 PM', true, null,
 'https://www.mtelliott.com/michigan-pow-mia-vigil/',
 'Manual', null, 'approved'),

('mtelliott-monument-design-day-2026-10-06', 'Monument Design Day',
 'A complimentary monument design consultation with a granite designer, plus Family Service Counselors available to answer questions. Appointment required.',
 'community', 'Resurrection Cemetery', 'Clinton Township',
 '2026-10-06', '2026-10-06', 'By appointment', true, null,
 'https://www.mtelliott.com/monument-design-day/',
 'Manual', 'Appointment-based consultation, not a public gathering — included per Jody''s request; she may want to reconsider whether this belongs on a general events-discovery site.', 'approved'),

('mtelliott-monument-design-day-2026-10-14', 'Monument Design Day',
 'A complimentary monument design consultation with a granite designer, plus Family Service Counselors available to answer questions. Appointment required.',
 'community', 'Resurrection Cemetery', 'Clinton Township',
 '2026-10-14', '2026-10-14', 'By appointment', true, null,
 'https://www.mtelliott.com/monument-design-day/',
 'Manual', 'Appointment-based consultation, not a public gathering — included per Jody''s request; she may want to reconsider whether this belongs on a general events-discovery site. Also note: same calendar date as one of the Elmwood Cemetery Trolley Tour rows added above, at a completely different venue/city — not a duplicate.', 'approved'),

('mtelliott-resurrection-fall-open-house-2026-10-07', 'Resurrection Cemetery Fall Open House and Tour',
 'A fall open house and tour of Resurrection Cemetery.',
 'community', 'Resurrection Cemetery', 'Clinton Township',
 '2026-10-07', '2026-10-07', '11:00 AM–6:00 PM', true, null,
 'https://www.mtelliott.com/preplanning-seminars/',
 'Manual', null, 'approved'),

('mtelliott-wreaths-across-america-resurrection-2026-12-12', 'Wreaths Across America',
 'Volunteers place wreaths on veterans'' graves to honor their service. Resurrection Cemetery hosts one of Michigan''s largest annual Wreaths Across America events; donations tax-deductible through the Clinton Township Kiwanis Club Foundation.',
 'community', 'Resurrection Cemetery', 'Clinton Township',
 '2026-12-12', '2026-12-12', '12:00 PM', true, null,
 'https://www.mtelliott.com/wreaths-across-america/',
 'Manual', 'Simultaneous ceremony also held at Guardian Angel Cemetery, Rochester, same date/time — see the separate row below; not a duplicate.', 'approved'),

('mtelliott-wreaths-across-america-guardian-angel-2026-12-12', 'Wreaths Across America',
 'Volunteers place wreaths on veterans'' graves to honor their service, at Guardian Angel Cemetery''s simultaneous Wreaths Across America ceremony.',
 'community', 'Guardian Angel Cemetery', 'Rochester',
 '2026-12-12', '2026-12-12', '12:00 PM', true, null,
 'https://www.mtelliott.com/wreaths-across-america/',
 'Manual', 'Simultaneous ceremony also held at Resurrection Cemetery, Clinton Township, same date/time — see the separate row above; not a duplicate.', 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  venue_city_raw = excluded.venue_city_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  is_free = excluded.is_free,
  ticket_url = excluded.ticket_url,
  note = excluded.note;

-- Same generic name-match backfill, re-run for the new venues/events above.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and (e.venue_city_raw is null or lower(trim(e.venue_city_raw)) = lower(trim(v.city)))
  and e.venue_id is null;
