-- Manual event submissions, 2026-10-01 (Jody, via a CSV of events she found
-- while looking at the Bagley / Avenue of Fashion area --
-- bagley_avenue_of_fashion_events_october_2026.csv). All 8 rows below came
-- from that CSV; each was independently corroborated against a second
-- source before being written as 'approved' (see each row's internal_note),
-- except one (The Poisoner) that could not be corroborated and is left
-- 'pending_review' instead -- see its own note.
--
-- IMPORTANT, READ BEFORE ASSUMING THESE ARE BAGLEY/AVENUE OF FASHION
-- EVENTS: none of them are. The CSV's filename and Jody's own framing
-- pointed at Bagley/Avenue of Fashion, but every venue in it independently
-- verifies to a physical address OUTSIDE both:
--   - Marygrove Theatre / Marygrove Conservancy, 8425 W. McNichols Rd --
--     sits on W. McNichols, Bagley's own SOUTHERN boundary, on the south
--     (Fitzgerald) side of it. Same exact reasoning already established for
--     "Neighborhood Home Base" in update_2026-10-01_bagley-venues-and-
--     boundary.sql (also on W. McNichols): the street is Bagley's edge, not
--     its interior. This project's own existing Fitzgerald area_note
--     ("Livernois/McNichols corridor") and its NEIGHBORHOOD_PHOTOS entry
--     for Fitzgerald (Marygrove College's Madame Cadillac Hall) both
--     already treat Marygrove as Fitzgerald, independent of this file.
--   - Titan Field (University of Detroit Mercy's McNichols Campus),
--     4001 W. McNichols Rd -- this is the University District's own
--     namesake institution; migration_002's area_note for University
--     District literally reads "near U of D Mercy". Confirmed via UDM's own
--     campus-locations page (sites.udmercy.edu) and detroittitans.com's
--     official 2026 schedules.
--   - Avenue of Fashion (the Livernois commercial corridor) has no venue in
--     this CSV at all -- nothing here is actually on Livernois Ave.
-- None of this is a new canonical neighborhood and none of it touches
-- Bagley's own boundary/venues from the companion migration. Two existing
-- neighborhoods (Fitzgerald, University District) absorb all 8 rows via the
-- same venue_id -> neighborhood_id FK chain (migration_025) every other
-- source already uses -- nothing new added to that mechanism either.
--
-- WHY TWO SEPARATE "MARYGROVE" VENUES: the CSV (and each event's own
-- source) distinguishes "Marygrove Theatre" (the Poisoner, the magic show)
-- from "Marygrove Conservancy" (the gala, Project Purple Light) as two
-- named spaces at the one campus address -- mirrored here as given, not
-- merged or split by guesswork (same posture as every other venue-naming
-- decision in this project).
--
-- DUPLICATE RISK WORTH A MANUAL CHECK: the 4 Detroit Mercy Titans soccer
-- games below may already exist in `events` from cron-ticketmaster.js --
-- Ticketmaster has carried Titans soccer before (see the archived
-- description for a Titans-at-Oakland match, update_2026-09-12_followup_
-- descriptions_batch_A.sql line ~1495). A Ticketmaster-sourced row would
-- use a different external_id and NOT be caught by this file's
-- on-conflict(external_id) upsert, so it could sit alongside these as an
-- apparent duplicate. Worth a quick look in admin.html for "Detroit Mercy"
-- + these 4 dates before approving, if you want to be sure.
--
-- SOURCING NOTE ON TICKET LINKS: the CSV's own soccer ticket_urls are
-- viagogo (third-party resale) listings. Swapped for the official
-- detroittitans.com schedule page instead -- same game, no resale markup,
-- and it's where Jody's own site already sends visitors to actual tickets.
-- Every other field (date/time/opponent/venue) was independently confirmed
-- against detroittitans.com's own 2026 schedule pages before this file was
-- written, not taken from the CSV or viagogo alone.
--
-- VENUES: both Marygrove entries and Titan Field get real venues rows
-- below (not left as venue_name_raw text) -- all three are recurring,
-- multi-event venues (UDM alone has a full fall season at Titan Field),
-- the same bar this project already used to justify curating Bagley's two
-- venues rather than leaving them as text.

-- 1. Venues -- same idempotent on-conflict(lower(name), lower(city))
--    convention as update_2026-10-01_bagley-venues-and-boundary.sql.
insert into venues (name, address, city, zip_code, neighborhood_id, neighborhood_confidence, neighborhood_source)
values (
  'Marygrove Theatre',
  '8425 W. McNichols Rd',
  'Detroit',
  '48221',
  (select id from neighborhoods where lower(name) = lower('Fitzgerald')),
  'multi_source',
  'marygroveconservancy.org (own contact page, confirms the 8425 W McNichols Rd address) + this project''s own pre-existing Fitzgerald area_note ("Livernois/McNichols corridor") and NEIGHBORHOOD_PHOTOS entry crediting Marygrove College''s Madame Cadillac Hall to Fitzgerald -- same McNichols-is-Bagley''s-southern-edge reasoning already used for Neighborhood Home Base.'
)
on conflict (lower(name), lower(city)) do update set
  address = excluded.address,
  zip_code = excluded.zip_code,
  neighborhood_id = excluded.neighborhood_id,
  neighborhood_confidence = excluded.neighborhood_confidence,
  neighborhood_source = excluded.neighborhood_source;

insert into venues (name, address, city, zip_code, website, neighborhood_id, neighborhood_confidence, neighborhood_source)
values (
  'Marygrove Conservancy',
  '8425 W. McNichols Rd',
  'Detroit',
  '48221',
  'https://marygroveconservancy.org/',
  (select id from neighborhoods where lower(name) = lower('Fitzgerald')),
  'multi_source',
  'Same address/reasoning as Marygrove Theatre immediately above -- two distinct named spaces on one campus, kept separate because the sources themselves (and Jody''s CSV) treat them separately, not merged by assumption.'
)
on conflict (lower(name), lower(city)) do update set
  address = excluded.address,
  zip_code = excluded.zip_code,
  website = excluded.website,
  neighborhood_id = excluded.neighborhood_id,
  neighborhood_confidence = excluded.neighborhood_confidence,
  neighborhood_source = excluded.neighborhood_source;

insert into venues (name, address, city, zip_code, website, neighborhood_id, neighborhood_confidence, neighborhood_source)
values (
  'Titan Field',
  '4001 W. McNichols Rd',
  'Detroit',
  '48221',
  'https://detroittitans.com/',
  (select id from neighborhoods where lower(name) = lower('University District')),
  'multi_source',
  'sites.udmercy.edu''s own campus-locations page (exact address) + migration_002''s own pre-existing area_note for University District ("near U of D Mercy") -- the neighborhood is this institution''s namesake.'
)
on conflict (lower(name), lower(city)) do update set
  address = excluded.address,
  zip_code = excluded.zip_code,
  website = excluded.website,
  neighborhood_id = excluded.neighborhood_id,
  neighborhood_confidence = excluded.neighborhood_confidence,
  neighborhood_source = excluded.neighborhood_source;

-- 2. Events
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, internal_note, status
) values

('humanitix-detroitmagic-2026-10-09',
 'A Magic Show For Sports Fans: The Game Changing Magic Tour',
 'Family-friendly magic performance explicitly tailored for sports fans, at Marygrove Theatre.',
 'theatre', 'Marygrove Theatre', '8425 W. McNichols Rd', 'Detroit',
 '2026-10-09', null, '7:00 PM', false, null,
 'https://events.humanitix.com/detroitmagic',
 null,
 'Manual', null,
 'Sourced from Jody''s CSV. Corroborated as a real touring show, not independently confirmed for this exact Detroit date: the "detroitmagic" Humanitix URL follows the identical per-city naming pattern (columbusmagic, baltimoremagic, buffalomagic, harrisburgmagic, albanymagic, etc.) as multiple other confirmed live stops of the same "Game Changing Magic Tour" -- high confidence, but the Humanitix page itself could not be fetched directly this session (tooling restriction, not a content concern). No price/free status stated.',
 'approved'),

('fb-903176305912750-blades-brilliance-gala',
 'Blades & Brilliance: A Dream Detroit Gala (2nd Annual)',
 '2nd annual elegant fundraising gala supporting young Detroit ice skaters, at Marygrove Conservancy.',
 'community', 'Marygrove Conservancy', '8425 W. McNichols Rd', 'Detroit',
 '2026-10-17', null, '7:00 PM', false, null,
 'https://www.facebook.com/events/marygrove-conservancy/2nd-annual-blades-brilliance-a-dream-detroit-gala/903176305912750/',
 null,
 'Manual', null,
 'Sourced from Jody''s CSV. Corroborated indirectly: a "Blades & Brilliance: A Dream Detroit Gala" 1st-annual event is independently findable (Eventbrite, Sep 2025), confirming this is a real recurring series consistent with "2nd annual" -- the FB event itself could not be fetched directly this session (tooling restriction). No price/free status stated; a ticketed gala almost certainly isn''t free, but no figure is asserted without a source.',
 'approved'),

('fb-2281799372573388-the-poisoner',
 'The Poisoner (Play)',
 'Neo-noir thriller play inspired by the Flint water crisis, at Marygrove Theatre.',
 'theatre', 'Marygrove Theatre', '8425 W. McNichols Rd', 'Detroit',
 '2026-10-29', null, '7:30 PM (date approximate -- see note)', false, null,
 'https://www.facebook.com/events/marygrove-conservancy/the-poisoner-detroit-mi/2281799372573388/',
 null,
 'Manual', null,
 'Sourced from Jody''s CSV, which itself hedged the date ("Late October, e.g., Oct 29-30, 2026"). "The Poisoner" is confirmed as a real Uncommon Productions/Citizen56 7-city national touring play (press coverage of stops in Kalamazoo MI, Bethlehem PA, Pittsburgh PA, and three Wisconsin cities) -- but none of that press coverage names Detroit/Marygrove as one of the 7 stops, so this specific date/venue could not be independently corroborated this session. Left status=pending_review rather than approved; confirm the exact date (and that Detroit is genuinely on this tour) directly from the FB event before publishing.',
 'pending_review'),

('eventbrite-1997921488956-purple-light',
 'Project Purple Light: Annual Resilience Gathering',
 'Community support gathering dedicated to raising awareness for domestic violence advocacy, at Marygrove Conservancy.',
 'community', 'Marygrove Conservancy', '8425 W. McNichols Rd', 'Detroit',
 '2026-10-03', null, '12:00 PM', false, null,
 'https://www.eventbrite.com/e/1997921488956?aff=ebdiglgoogleliveevents',
 null,
 'Manual', null,
 'Sourced from Jody''s CSV. Project Purple Light is confirmed as a real, active domestic-violence-advocacy organization (projectpurplelight.org) that runs awareness events; this specific Eventbrite listing could not be fetched directly this session (tooling restriction), so the exact title/time are taken from the CSV, not independently re-verified beyond confirming the org itself is real. No price/free status stated.',
 'approved'),

('detroitmercy-wsoc-2026-10-04-youngstown-state',
 'Youngstown State at Detroit Mercy Titans Women''s Soccer',
 'Horizon League women''s soccer match as Detroit Mercy hosts Youngstown State at Titan Field.',
 'sports', 'Titan Field', '4001 W. McNichols Rd', 'Detroit',
 '2026-10-04', null, '1:00 PM', false, null,
 'https://detroittitans.com/sports/womens-soccer/schedule/2026',
 null,
 'Manual', null,
 'Independently verified against detroittitans.com''s official 2026 women''s soccer schedule (Oct 4, 1 p.m., vs Youngstown State, Titan Field, Horizon League) -- exact match to the CSV. Ticket link swapped from the CSV''s viagogo (resale) link to the official schedule page. See this file''s header note on a possible pre-existing Ticketmaster duplicate for this game.',
 'approved'),

('detroitmercy-msoc-2026-10-17-oakland',
 'Oakland Golden Grizzlies at Detroit Mercy Titans Men''s Soccer',
 'Collegiate soccer match as Detroit Mercy hosts Oakland at Titan Field.',
 'sports', 'Titan Field', '4001 W. McNichols Rd', 'Detroit',
 '2026-10-17', null, '6:00 PM', false, null,
 'https://detroittitans.com/sports/mens-soccer/schedule',
 null,
 'Manual', null,
 'Independently verified against detroittitans.com''s official 2026 men''s soccer schedule (Oct 17, 6 p.m., vs Oakland, Home, Titan Field) -- exact match to the CSV. Ticket link swapped from the CSV''s viagogo (resale) link to the official schedule page. See this file''s header note on a possible pre-existing Ticketmaster duplicate for this game.',
 'approved'),

('detroitmercy-wsoc-2026-10-22-northern-kentucky',
 'Northern Kentucky Norse at Detroit Mercy Titans Women''s Soccer',
 'Horizon League women''s soccer match as Detroit Mercy hosts Northern Kentucky at Titan Field.',
 'sports', 'Titan Field', '4001 W. McNichols Rd', 'Detroit',
 '2026-10-22', null, '1:00 PM', false, null,
 'https://detroittitans.com/sports/womens-soccer/schedule/2026',
 null,
 'Manual', null,
 'Independently verified against detroittitans.com''s official 2026 women''s soccer schedule (Oct 22, 1 p.m., vs Northern Kentucky, Titan Field, Horizon League) -- exact match to the CSV. Ticket link swapped from the CSV''s viagogo (resale) link to the official schedule page. See this file''s header note on a possible pre-existing Ticketmaster duplicate for this game.',
 'approved'),

('detroitmercy-msoc-2026-10-30-milwaukee',
 'Milwaukee Panthers at Detroit Mercy Titans Men''s Soccer',
 'Collegiate soccer match as Detroit Mercy hosts Milwaukee at Titan Field.',
 'sports', 'Titan Field', '4001 W. McNichols Rd', 'Detroit',
 '2026-10-30', null, '3:00 PM', false, null,
 'https://detroittitans.com/sports/mens-soccer/schedule',
 null,
 'Manual', null,
 'Independently verified against detroittitans.com''s official 2026 men''s soccer schedule (Oct 30, 3 p.m. ET, vs Milwaukee, Home, Titan Field) -- exact match to the CSV. Ticket link swapped from the CSV''s viagogo (resale) link to the official schedule page. See this file''s header note on a possible pre-existing Ticketmaster duplicate for this game.',
 'approved')

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
  note = excluded.note,
  internal_note = excluded.internal_note,
  status = excluded.status;

-- 3. Backfill venue_id for these rows now that the venues above exist.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null
  and lower(v.name) in (lower('Marygrove Theatre'), lower('Marygrove Conservancy'), lower('Titan Field'));

insert into schema_migrations (filename) values ('update_2026-10-01_marygrove-udm-mcnichols-corridor-events.sql')
on conflict (filename) do nothing;
