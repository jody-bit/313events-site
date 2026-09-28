-- Migration 040: no_fixed_venue column, 2026-09-28 (Needs Follow-up
-- self-healing pass 2, mobile/tour-event false positive).
--
-- Root problem: VisitDetroit Christmas Cookie Coach Tour and The Original
-- Detroit Christmas Bakery Bus Tour are genuinely venue-less (they're bus
-- tours with a departure point, not a fixed address) but were permanently
-- stuck in Needs Follow-up under "venue address/city" -- the only existing
-- escape hatch, isVenueTbaByDesign() in admin.html, requires the EXACT
-- string venue_name_raw = "Venue TBA", which these events never have
-- (VisitDetroit's Algolia index supplies no address field for them at all,
-- so venue_name_raw/venue_address_raw/venue_city_raw are all null -- not
-- the string "Venue TBA"). No prior connector or admin mechanism could
-- resolve this because a resolvable venue genuinely does not exist to
-- resolve.
--
-- This is deliberately a boolean, not a text enum: the only decision the
-- rest of the system needs from it is "does this event legitimately not
-- need a conventional venue" (yes/no), not a taxonomy of WHY (tour vs.
-- parade vs. crawl). Never set true by guessing -- only when a source's
-- own structured category data (or, as a generic fallback for sources with
-- no such category signal, an unambiguous title keyword -- see
-- api/_lib/mobile-event.js) positively identifies the listing as a
-- mobile/no-fixed-venue event type. Default false preserves every existing
-- event's current behavior exactly.
alter table events add column if not exists no_fixed_venue boolean not null default false;

comment on column events.no_fixed_venue is
  'True when a source authoritatively identifies this event as a tour/excursion/crawl/parade/ride or similar with no conventional fixed venue (a departure/meeting point, not a venue, is the correct "location" concept). Never inferred/guessed -- set only from a source''s own structured category data or an explicit title-keyword match (api/_lib/mobile-event.js''s isLikelyNoFixedVenue()). When true, admin.html''s Needs Follow-up queue does not require venue_address_raw/venue_city_raw/a linked venue to consider the event healthy. Default false so every existing row''s behavior is unchanged.';

insert into schema_migrations (filename) values ('migration_040_no_fixed_venue.sql')
on conflict (filename) do nothing;
