-- Anton Art Center venue row -- PROPOSED 2026-10-11, NOT APPLIED.
--
-- api/cron-antonartcenter.js resolves venue_id by EXACT name against
-- venues.name ("Anton Art Center"). A read-only look at production on
-- 2026-10-11 found no such venue row, so until this runs every Anton row is
-- written with venue_id empty and carries the gallery by name, address and
-- city (venue_name_raw / venue_address_raw / venue_city_raw) -- complete
-- enough to display, but not linked to a venue page or map pin. The
-- connector needs nothing from this file to run; it is what links the rows.
--
-- Address is the one the site states in its footer on every page and in the
-- Events Calendar's own location text for the gallery's events:
-- 125 Macomb Place, Mount Clemens, MI 48043.
--
-- No neighborhood is assigned: Mount Clemens is an orbit city
-- (api/_lib/orbit-cities.js), not one of the Detroit neighborhoods, and this
-- file does not invent one.
--
-- Same idempotent on-conflict convention as the other venue scripts here
-- (e.g. update_2026-10-01_bagley-venues-and-boundary.sql). For Jody to run by
-- hand; this session has no production write credential.

insert into venues (name, address, city, zip_code, website)
values (
  'Anton Art Center',
  '125 Macomb Place',
  'Mount Clemens',
  '48043',
  'https://www.theartcenter.org/'
)
on conflict (lower(name), lower(city)) do update set
  address = excluded.address,
  zip_code = excluded.zip_code,
  website = excluded.website;
