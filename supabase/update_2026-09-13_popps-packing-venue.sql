-- New `venues` row for Popps Packing, a home/studio/experimental arts space
-- in Hamtramck (12138 St Aubin) — needed for the new cron-poppspacking.js
-- scraper's venue_id resolution (see api/_lib/venue-lookup.js) to have a
-- real row to link against, same as every other cron in this project.
--
-- Source: Yelp's listing for "POPPS PACKING" (12138 St Aubin, Hamtramck,
-- Michigan), corroborated by the venue's own site (poppspacking.org) as a
-- Hamtramck-based arts space. Per this project's existing scope decision
-- (see migration_002 / FOUNDATIONAL_ITEMS.md), only Detroit gets
-- neighborhood-level detail — Hamtramck is its own separate city, not a
-- Detroit neighborhood, so neighborhood_id/confidence/source stay at their
-- 'unconfirmed'/null default, same as this project's other Hamtramck
-- venues (Black Box, Small's).
--
-- Idempotent: ON CONFLICT targets the existing venues_name_city_key unique
-- INDEX (lower(name), lower(city)) directly by its expression list — see
-- update_2026-09-13_new_venues_from_ticketmaster_longtail.sql's header for
-- why `ON CONFLICT ON CONSTRAINT venues_name_city_key` is NOT used here
-- (that syntax only works against a real table constraint, not a plain
-- CREATE UNIQUE INDEX).

insert into venues (name, address, city, zip_code, neighborhood_id, neighborhood_confidence, neighborhood_source) values
('Popps Packing', '12138 St Aubin', 'Hamtramck', '48212', null, 'unconfirmed', null)
on conflict (lower(name), lower(city)) do nothing;

-- Link any already-loaded events that used this exact venue name (none
-- expected yet as of 2026-09-13, since cron-poppspacking.js hasn't had its
-- first run — this is just the same safe, idempotent backfill pattern every
-- other new-venue file here already runs, in case that changes).
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;
