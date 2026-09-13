-- New `venues` rows for the highest-volume venue names in `events` that had
-- no matching venues row at all (see update_2026-09-13_backfill_venue_id_
-- matched_venues.sql's header for the full "load-bearing gap" background).
-- Of 90 distinct unmatched venue names (763 events, checked live
-- 2026-09-13), these are the ~15-18 highest-volume ones — covering roughly
-- half of those events — researched with the same 2+-independent-source
-- rigor as the original 83 venues in migration_002 (see
-- FOUNDATIONAL_ITEMS.md §2's resolution tables, which this follows).
--
-- Scope: mostly wider-region venues Ticketmaster pulls in from the 75-mile
-- service area (Ann Arbor, Ferndale, Royal Oak, Rochester, Westland,
-- Windsor ON, Hamtramck, Wyandotte, Pontiac, Adrian, Sterling Heights,
-- Belleville, Warren), plus three real Detroit venues this project's own
-- crons already produce events for (Dossin Great Lakes Museum, PLAYGROUND
-- DETROIT, and Lager House's "After Hours @ Brooklyn Detroit" sister room)
-- that had simply never gotten a `venues` row created.
--
-- Per FOUNDATIONAL_ITEMS.md's existing scope decision, only Detroit gets
-- neighborhood-level detail — everywhere else is tracked at the city level
-- only, which venue_city_raw on the event itself already carries today.
-- So neighborhood_id/confidence/source are only set below for the three
-- Detroit venues; every other row's neighborhood fields stay at their
-- 'unconfirmed'/null default on purpose, matching every non-Detroit venue
-- already in this table.
--
-- Deliberately NOT created here (real findings, not oversights):
--   - Cinema Detroit — confirmed via its own site (cinemadetroit.org) to be
--     a traveling pop-up screening series with no fixed address (recent
--     screenings at Planet Ant/Ant Hall in Hamtramck AND Phoenix Theatres
--     in Wayne) — same "nomadic, no fixed address" situation
--     NEW_SOURCES_RESEARCH.md already flagged for Mothlight Microcinema.
--     Creating a venues row would misrepresent it as a single physical
--     location on a future map view. cron-cinema-detroit.js's events keep
--     venue_id null, honestly, until/unless it gets a permanent home.
--   - "Across from the Aretha Franklin Amphitheatre Universoul Circus" —
--     confirmed (by reading the actual events) to be Ticketmaster's own
--     name for a traveling circus's temporary tent site, not a fixed
--     addressable venue. Same reasoning as Cinema Detroit — left unlinked.
--
-- Idempotent: ON CONFLICT on the existing venues_name_city_key unique index
-- (lower(name), lower(city)) does nothing if a row already exists — safe
-- to re-run.

insert into venues (name, address, city, zip_code, neighborhood_id, neighborhood_confidence, neighborhood_source) values

-- Sources: Yelp (208 S 1st St, Ann Arbor, Michigan), blindpigmusic.com
('Blind Pig', '208 S 1st St', 'Ann Arbor', '48104', null, 'unconfirmed', null),

-- "Black Box" in this project's events data is Planet Ant Theatre's second
-- performance space, at the same building as Planet Ant Theatre itself.
-- Sources: cron-planetanttheatre.js's own scraped listing text ("Black Box
-- - 2357 Caniff Hamtramck, MI 48212"), corroborated by Yelp's listing for
-- Planet Ant Theatre at the identical address.
('Black Box', '2357 Caniff Ave', 'Hamtramck', '48212', null, 'unconfirmed', null),

-- Sources: Yelp, Apple Maps, themagicbag.com
('The Magic Bag', '22920 Woodward Ave', 'Ferndale', '48220', null, 'unconfirmed', null),

-- Sources: Wikipedia, Waze
('Royal Oak Music Theatre', '318 W 4th St', 'Royal Oak', '48067', null, 'unconfirmed', null),

-- Sources: Yelp, mbtheatre.com (on the Oakland University campus)
('Meadow Brook Theatre', '378 Meadow Brook Rd', 'Rochester', '48309', null, 'unconfirmed', null),

-- Sources: Yelp, Waze
('The Token Lounge', '28949 Joy Rd', 'Westland', '48185', null, 'unconfirmed', null),

-- Sources: Yelp, caesars.com. Canadian venue — city stored as "Windsor" to
-- match this project's existing venue_city_raw convention (no
-- country/province field exists anywhere in this schema yet, see
-- AUDIT_AND_ARCHITECTURE.md's "Canadian geography" gap).
('The Colosseum at Caesars Windsor', '377 Riverside Dr E', 'Windsor', null, null, 'unconfirmed', null),

-- Sources: Yelp, Apple Maps
('Small''s', '10339 Conant St', 'Hamtramck', '48212', null, 'unconfirmed', null),

-- Sources: Yelp, district142live.com
('District 142', '142 Maple St', 'Wyandotte', '48192', null, 'unconfirmed', null),

-- Sources: Yelp, thelovingtouchferndale.com
('The Loving Touch', '22634 Woodward Ave', 'Ferndale', '48220', null, 'unconfirmed', null),

-- Sources: Yelp, Ticketmaster's own venue page
('Flagstar Strand Theatre for the Performing Arts', '12 N Saginaw St', 'Pontiac', '48342', null, 'unconfirmed', null),

-- Sources: Wikipedia, Apple Maps
('Croswell Opera House', '129 E Maumee St', 'Adrian', '49221', null, 'unconfirmed', null),

-- Sources: Yelp, freedomhillamphitheater.com
('Michigan Lottery Amphitheatre at Freedom Hill', '14900 Metropolitan Pkwy', 'Sterling Heights', '48312', null, 'unconfirmed', null),

-- Sources: Yelp, Toast (restaurant/venue listing platform)
('Diamondback Music Hall', '49345 S Interstate 94 Service Dr', 'Belleville', '48111', null, 'unconfirmed', null),

-- Sources: Yelp, Sunrise Networking Group's own venue listing
('Andiamo Celebrity Showroom', '7096 E 14 Mile Rd', 'Warren', '48092', null, 'unconfirmed', null),

-- Detroit venue #1: on Belle Isle itself, same island as the existing
-- "Belle Isle Park" venue (which migration_002 already assigned
-- neighborhood_id = Belle Isle "(self)"). Sources: the museum's own
-- glmi.org directions page ("100 Strand on Belle Isle, Detroit, MI 48207"),
-- Detroit Historical Society (detroithistorical.org, its parent org).
('Dossin Great Lakes Museum', '100 Strand on Belle Isle', 'Detroit', '48207',
 (select id from neighborhoods where name = 'Belle Isle'), 'multi_source',
 'glmi.org (official) + Detroit Historical Society, corroborated — same island as this project''s existing Belle Isle Park venue'),

-- Detroit venue #2. Sources: Yelp ("2845 Gratiot Ave, Detroit, Michigan"),
-- and Eastern Market Partnership's OWN directory listing PLAYGROUND
-- DETROIT as an Eastern Market gallery (easternmarket.org/directory/
-- playground-detroit/) — a first-party confirmation of neighborhood, not
-- just an inferred one from the street address.
('PLAYGROUND DETROIT', '2845 Gratiot Ave', 'Detroit', '48207',
 (select id from neighborhoods where name = 'Eastern Market'), 'multi_source',
 'Eastern Market Partnership''s own directory (easternmarket.org) + Yelp address'),

-- Detroit venue #3: Lager House's sister room. cron-lagerhouse.js's own
-- header comment already documents this as "a different address ~1.5
-- blocks away" from Lager House (itself already a Corktown venue in this
-- table) "per its own listing text" — no further independent address was
-- found beyond that, so address stays null (an honest gap, not a guess)
-- but the neighborhood call is well-supported by that same fact. Same
-- confidence tier as this project's existing TV Lounge precedent ("no
-- source would commit, closest-on-a-map judgment call").
('After Hours @ Brooklyn Detroit', null, 'Detroit', null,
 (select id from neighborhoods where name = 'Corktown'), 'editorial_judgment',
 'cron-lagerhouse.js''s own header: "~1.5 blocks away" from Lager House (Corktown) per the venue''s own listing text — no independent address found beyond that')

on conflict on constraint venues_name_city_key do nothing;

-- Re-run the same generic name-match backfill from
-- update_2026-09-13_backfill_venue_id_matched_venues.sql now that these new
-- rows exist, so the events that use these exact venue names get linked in
-- the same pass. Safe/idempotent for the same reason that file already is
-- (only touches venue_id is null rows).
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;
