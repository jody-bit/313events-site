-- Migration 020: events.venue_address_raw
--
-- Context: Jody was creating an event from a Press coverage article
-- (admin.html) and found no address field at all — only Venue and City. She
-- asked whether she could just put the full street address in the City
-- field instead. That would have actively broken things: City is matched
-- exactly against a fixed list of known city names (map.html's
-- CITY_LOOKUP) to place the map pin and to test whether an event falls
-- inside someone's search radius — a street address wouldn't match
-- anything in that list, so the event would silently disappear from the
-- map under any location/radius filter.
--
-- Tracing this further turned up a real, separate bug: submit.html (the
-- public submission form) already has a "Street address" field and always
-- has — but api/submit.js destructures it from the request body and then
-- never once writes it into the row it inserts. It's been silently
-- discarded on every public submission. So today, NO path on the whole
-- site actually captures or stores a venue's street address.
--
-- This is a free-text sibling to venue_name_raw/venue_city_raw (same
-- pattern: a display fallback, not a foreign key, not fed into any
-- geocoding) — see migration_006_venue_city_raw.sql for the precedent.
-- Deliberately NOT wired into map.html's precise-pin system
-- (VENUE_LATLNG_MAP, keyed off the `venues` table's own lat/lng) — that's
-- a separate, larger decision (choosing a geocoding provider, API
-- keys/costs, accuracy verification) Jody hasn't made yet. This migration
-- only stops the address from being silently lost; it shows up on
-- event.html as a plain address line + a "Get directions" link, nothing
-- more, for now. Safe to re-run.

alter table events add column if not exists venue_address_raw text;
comment on column events.venue_address_raw is
  'Free-text street address for display only, e.g. "1501 Holden St, Detroit, MI" — same fallback pattern as venue_name_raw/venue_city_raw. NOT used for map pin placement (see map.html''s VENUE_LATLNG_MAP, keyed off venues.lat/lng instead) or any geocoding. Populated by api/submit.js (the public form''s existing "Street address" field, previously collected and silently discarded) and api/admin-editorial.js (create_event action). NULL/absent means no address was given.';
