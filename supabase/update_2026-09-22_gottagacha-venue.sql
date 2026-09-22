-- Adds the curated venues row for GottaGacha, 2026-09-22 (Product Owner
-- decision after source discovery + implementation approval for
-- cron-gottagacha.js). Address/city/website are exactly as the Product
-- Owner specified when approving this source; no scraping/guessing
-- involved.
--
-- NOT YET RUN AGAINST PRODUCTION. Claude's execution environments cannot
-- currently reach the 313.events Supabase production database directly
-- (DEBT-002, see BACKLOG.md), and the production schema_migrations/
-- categories state is not independently verifiable from here either.
-- Marked BLOCKED by DEBT-002. Prepared for Jody to run by hand in the
-- Supabase SQL Editor, same workflow as update_2026-09-20_rentfreehaus-
-- venue.sql (the precedent this file mirrors exactly).
--
-- Until this is run, cron-gottagacha.js's own venue lookup (see
-- api/_lib/venue-lookup.js) finds no matching venues row by name, so
-- every event it writes falls back to venue_id: null, venue_name_raw:
-- "GottaGacha" -- the same honest-gap fallback every other connector uses
-- before its own venue exists in the table. This is deliberate and
-- required: the connector itself must NOT create venues (see
-- venue-lookup.js's own header for why), so ingestion is not blocked on
-- this migration running -- events just display without a venue page link
-- until it does.
insert into venues (name, address, city, website)
values ('GottaGacha', '29200 Dequindre Rd #2B', 'Warren', 'https://www.gottagacha.com/')
on conflict (lower(name), lower(city)) do update set
  address = excluded.address,
  website = excluded.website;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-22_gottagacha-venue.sql')
on conflict (filename) do nothing;
