-- Adds the two curated venue rows api/cron-bagleycommunity.js resolves
-- against, and corrects neighborhoods.Bagley's area_note to the verified
-- official boundary -- 2026-10-01, Product Owner request ("Add Bagley as a
-- first-class neighborhood... Add Bagley Community Council as an event
-- source").
--
-- IMPORTANT, read before touching anything else in this file: "Bagley"
-- already exists as a seeded neighborhoods row (migration_002, line ~81) --
-- there is no new neighborhoods INSERT here. This migration only (1)
-- sharpens that row's area_note with a verified boundary and (2) adds two
-- venues, deliberately assigned to TWO DIFFERENT neighborhoods -- see the
-- "why two venues, why different neighborhoods" note below. Do not assume
-- "Bagley Community Council" as a source implies every venue it touches is
-- geographically inside Bagley; that is exactly the Bagley-Street-vs-
-- Bagley-neighborhood confusion the Product Owner explicitly warned
-- against, generalized one step further (an organizing body's own name is
-- not its venue's geography either).
--
-- BOUNDARY VERIFICATION (per explicit instruction: "VERIFY this boundary
-- before implementing it"): the Product Owner's stated boundary (North:
-- West Outer Drive; South: West McNichols/6 Mile; East: Livernois; West:
-- Wyoming) was checked directly against Bagley Community Council's own
-- "About" page (https://bagleycommunity.org/about/), which states this
-- verbatim: "bordered to the South by McNichols (6 Mile), to the West by
-- Wyoming Ave, the East by Livernois Ave, and to the North by West Outer
-- Drive." Exact match -- confirmed, not assumed.
--
-- WHY TWO VENUES, WHY DIFFERENT NEIGHBORHOODS:
-- 1. "Neighborhood Home Base" (7426 W. McNichols Rd., aka Live6 Alliance) --
--    the recurring meeting venue for Bagley Community Council's own General
--    Meetings (confirmed from the connector's real parsed event content:
--    "Neighborhood Home Base located at 7426 W. McNichols Rd. (aka Live6
--    Alliance)"). McNichols is Bagley's own SOUTHERN boundary, and this
--    address sits on the south/Fitzgerald side of it -- confirmed by an
--    independent press source (modeldmedia.com's HomeBase-opening coverage,
--    which places it in "the Fitzgerald neighborhood" / "Livernois-
--    McNichols area"), and consistent with this project's own existing,
--    already-seeded area_note for Fitzgerald: "northwest, Livernois/
--    McNichols corridor (\"Live6\")" (migration_002). Assigned to
--    Fitzgerald, NOT Bagley, even though the organizing council is named
--    Bagley and events.source will read "Bagley Community Council" --
--    neighborhood reflects where the event physically happens, not who
--    organizes it, per the Product Owner's own "use geographic location,
--    not text matching" instruction.
-- 2. "Bagley Elementary School" (8100 Curtis Street, Detroit, MI 48221) --
--    the venue for the Council's "Annual Trunk or Treat" (confirmed from
--    real parsed content: "on Greenlawn St. at Bagley Elementary school").
--    Address confirmed via GreatSchools/Trulia/Yelp (8100 Curtis Street),
--    well inside the verified Bagley boundary (between Livernois and
--    Wyoming, north of McNichols) -- the school's own namesake is
--    consistent with, not the basis for, this placement.
--
-- Same idempotent on-conflict convention as every other venue-creation
-- script here (e.g. update_2026-09-22_gottagacha-venue.sql). Prepared for
-- Jody to run by hand (same workflow every prior venue/migration script in
-- this engagement has used) -- not executed from this session, which has
-- no production write credential.

-- 1. Sharpen the existing Bagley neighborhood row's area_note with the
--    verified boundary. Does not touch is_district or add a new row.
update neighborhoods
set area_note = 'Bounded by West Outer Drive (N), West McNichols/6 Mile Rd (S), Livernois Ave (E), and Wyoming Ave (W). Verified 2026-10-01 against Bagley Community Council''s own stated boundary (bagleycommunity.org/about).'
where lower(name) = lower('Bagley');

-- 2a. Neighborhood Home Base / Live6 Alliance -- Fitzgerald, not Bagley.
insert into venues (name, address, city, zip_code, website, neighborhood_id, neighborhood_confidence, neighborhood_source)
values (
  'Neighborhood Home Base',
  '7426 W. McNichols Rd.',
  'Detroit',
  '48221',
  'https://www.live6detroit.org/',
  (select id from neighborhoods where lower(name) = lower('Fitzgerald')),
  'single_source',
  'Model D Media (modeldmedia.com), "HomeBase community center opening in Detroit''s Livernois-McNichols district" -- places this address in the Fitzgerald neighborhood; corroborated by this project''s own existing Fitzgerald area_note ("Livernois/McNichols corridor (Live6)", migration_002). On the south/Fitzgerald side of McNichols, Bagley''s own stated southern boundary.'
)
on conflict (lower(name), lower(city)) do update set
  address = excluded.address,
  zip_code = excluded.zip_code,
  website = excluded.website,
  neighborhood_id = excluded.neighborhood_id,
  neighborhood_confidence = excluded.neighborhood_confidence,
  neighborhood_source = excluded.neighborhood_source;

-- 2b. Bagley Elementary School -- genuinely inside the Bagley boundary.
insert into venues (name, address, city, zip_code, neighborhood_id, neighborhood_confidence, neighborhood_source)
values (
  'Bagley Elementary School',
  '8100 Curtis Street',
  'Detroit',
  '48221',
  (select id from neighborhoods where lower(name) = lower('Bagley')),
  'single_source',
  'GreatSchools/Trulia/Yelp (address: 8100 Curtis Street) -- well within the verified Bagley boundary (between Livernois and Wyoming, north of McNichols); corroborated by Bagley Community Council''s own event text locating its Trunk or Treat "on Greenlawn St. at Bagley Elementary school."'
)
on conflict (lower(name), lower(city)) do update set
  address = excluded.address,
  zip_code = excluded.zip_code,
  neighborhood_id = excluded.neighborhood_id,
  neighborhood_confidence = excluded.neighborhood_confidence,
  neighborhood_source = excluded.neighborhood_source;

-- 3. Backfill venue_id for any already-existing event rows whose
--    venue_name_raw happens to exactly match either venue name (same
--    pattern as every other venue-creation script here) -- harmless no-op
--    today since no prior connector has ever written these exact names,
--    but keeps the script correct/reusable if that ever changes.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null
  and lower(v.name) in (lower('Neighborhood Home Base'), lower('Bagley Elementary School'));

insert into schema_migrations (filename) values ('update_2026-10-01_bagley-venues-and-boundary.sql')
on conflict (filename) do nothing;
