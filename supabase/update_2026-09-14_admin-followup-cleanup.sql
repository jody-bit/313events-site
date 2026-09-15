-- Admin "Needs Follow-Up" queue cleanup, 2026-09-14 — Jody uploaded a
-- screenshot of admin.html's "needs follow-up" list (~50 live events
-- missing a description, venue address/city, start time, or ticket link)
-- and asked for help filling in what's findable. She picked four buckets to
-- tackle first: real venue addresses, Redford Theatre start times,
-- Ticketmaster event descriptions, and the Paxahau/"venue TBA" ones.
--
-- HOW THIS MATCHES ROWS: admin.html's own queue doesn't expose each event's
-- id/external_id in the screenshot Jody sent — only title, date, and venue.
-- Every UPDATE below matches on (title, start_date), which should be
-- unique enough for these specific rows, and every SET clause is guarded
-- with a "...is null" condition so it only fills an actual gap — same
-- "never clobber an existing value" rule admin.html's own save button
-- already follows (see admin.html's update_fields comment). Sanity-check
-- the affected-row count the SQL Editor reports after running this (each
-- statement should report exactly 1) before trusting it silently worked.
--
-- WHAT'S NOT IN HERE ON PURPOSE:
--   - The ~13 Resident Advisor nightlife rows that were ALSO missing a
--     description (Sanctified Sundays, Tequila Sunset, Art of Noise, Foggy
--     Sundays, Música, Bang Box, Elixir Thurs, Flavors, Shake Down, SWAG,
--     3.1.3, Corruption: Remix Wars, Atonement wsg Colliding Pins) — Jody's
--     scoping only asked for venue addresses + Ticketmaster descriptions,
--     not RA nightlife descriptions, so only the address/city gap on those
--     rows is fixed below. Their description gaps are still open.
--   - 3.1.3's missing START TIME (Andy Arts, 9/18) — same reasoning, out of
--     the scope Jody picked (only Redford Theatre times were asked for).
--   - The Paxahau shows (Channel Tres, Sam Alfred, MPH, ACRAZE, Devault x
--     Fallon) and the RA "secret location" events (Texture x2, Lucky
--     Rabbit, Grave Rave, Sleep Olympics). Checked directly: RA has a real,
--     named feature for this ("RA Pro Secret Location Announcements" —
--     ra.co/news/78193) and Lucky Rabbit's own Eventbrite listing literally
--     calls itself "The Private Loft Party." These are undisclosed BY
--     DESIGN, revealed only to ticket holders close to the date — not a
--     data-entry gap. Inventing an address here would be worse than
--     leaving it blank. No SQL for these; nothing to fix.
--   - "Los Tigres del Mundo" (Fox Theatre, 11/21) — flagging, not fixing:
--     this looks like it might be a Ticketmaster typo for "Los Tigres del
--     Norte" (their real, well-known "La Lotería" tour is playing the same
--     venue the very same night — see the "Suite Rental" row right below
--     it). Wrote a cautious description that doesn't assume that, but
--     worth Jody double-checking whether this is a duplicate/typo of the
--     Norte show rather than a second real event.

-- ---------------------------------------------------------------------------
-- 1) VENUE ADDRESS / CITY — real, verified addresses for named venues.
-- ---------------------------------------------------------------------------

update events set venue_address_raw = '920 Euclid St', venue_city_raw = 'Detroit'
where title = 'SUNDANCE' and start_date = '2026-09-13' and venue_address_raw is null;

update events set venue_address_raw = '4626 3rd Ave', venue_city_raw = 'Detroit'
where title = 'Sanctified Sundays Season Finale' and start_date = '2026-09-13' and venue_address_raw is null;

update events set venue_address_raw = '6440 Wight St', venue_city_raw = 'Detroit'
where title = 'TEQUILA SUNSET: LATIN DAY PARTY (SWDEJAY & DJ IZA)' and start_date = '2026-09-13' and venue_address_raw is null;

update events set venue_address_raw = '8045 Linwood St', venue_city_raw = 'Detroit'
where title = 'The Art of Noise 9/13: AnJelic, Bill Harris, Novalés' and start_date = '2026-09-13' and venue_address_raw is null;

update events set venue_address_raw = '200 E Grand River Ave', venue_city_raw = 'Detroit'
where title = 'Foggy Sundays' and start_date = '2026-09-13' and venue_address_raw is null;

update events set venue_address_raw = '200 E Grand River Ave', venue_city_raw = 'Detroit'
where title = 'Música' and start_date = '2026-09-14' and venue_address_raw is null;

update events set venue_address_raw = '200 E Grand River Ave', venue_city_raw = 'Detroit'
where title = 'Bang Box' and start_date = '2026-09-15' and venue_address_raw is null;

update events set venue_address_raw = '660 W Baltimore Ave', venue_city_raw = 'Detroit'
where title = 'ELIXIR THURS: DR. Disko Dust, AIDEL' and start_date = '2026-09-17' and venue_address_raw is null;

update events set venue_address_raw = '200 E Grand River Ave', venue_city_raw = 'Detroit'
where title = 'Flavors (staff appreciation night)' and start_date = '2026-09-17' and venue_address_raw is null;

update events set venue_address_raw = '666 Selden St', venue_city_raw = 'Detroit'
where title = 'SHAKE DOWN' and start_date = '2026-09-18' and venue_address_raw is null;

update events set venue_address_raw = '6440 Wight St', venue_city_raw = 'Detroit'
where title = 'SWAG: A Jerk Era Party (Hip-Hop Music)' and start_date = '2026-09-18' and venue_address_raw is null;

update events set venue_address_raw = '3000 Fenkell St', venue_city_raw = 'Detroit'
where title = '3.1.3' and start_date = '2026-09-18' and venue_address_raw is null;

update events set venue_address_raw = '715 E Milwaukee St', venue_city_raw = 'Detroit'
where title = 'CORRUPTION: Remix Wars' and start_date = '2026-09-18' and venue_address_raw is null;

update events set venue_address_raw = '8850 Joseph Campau Ave', venue_city_raw = 'Hamtramck'
where title = 'Atonement wsg Colliding Pins' and start_date = '2026-09-18' and venue_address_raw is null;

-- ---------------------------------------------------------------------------
-- 2) REDFORD THEATRE START TIMES — verified against redfordtheatre.com's
--    own event pages, which is why a couple of these are more than a bare
--    time (doors/Q&A schedule matters for these specific screenings).
-- ---------------------------------------------------------------------------

update events set time_display = '7:00 PM'
where title = '9th Annual NOIR CITY DETROIT' and start_date = '2026-09-18' and (time_display is null or time_display = '');

update events set time_display = 'Doors 6:00 PM, movie at 8:00 PM'
where title = 'Bram Stoker''s Dracula (1992)' and start_date = '2026-10-03' and (time_display is null or time_display = '');

update events set time_display = 'Doors 6:30 PM (Julie Carmen signing/Q&A until 7:30 PM), movie at 8:00 PM'
where title = 'Special Event: Fright Night Part 2 (1988)' and start_date = '2026-10-23' and (time_display is null or time_display = '');

update events set time_display = '3:00 PM'
where title = 'MB Music Presents: The Little Mermaid Live' and start_date = '2026-11-07' and (time_display is null or time_display = '');

update events set time_display = '8:00 PM'
where title = 'Return of the Jedi (1983)' and start_date = '2026-11-13' and (time_display is null or time_display = '');

-- ---------------------------------------------------------------------------
-- 3) TICKETMASTER DESCRIPTIONS — short, researched write-ups for events
--    that only had a title/date/venue.
-- ---------------------------------------------------------------------------

update events set description = 'A six-band punk and hardcore bill at the Blind Pig, headlined by A Nightmare on 1st Street with support from Motown Rage, Concrete Angels, Damn That Hurt, Tight Like That, and Taylor Mountain.'
where title = 'A Nightmare on 1st Street, Motown Rage, Concrete Angels, DAMN THAT HURT, Tight Like That, Taylor Mountain' and start_date = '2026-10-24' and (description is null or description = '');

update events set description = 'Long-running Arizona punk/ska band Authority Zero brings its 2026 Apocalyptour to Small''s, with support from Counterpunch, Come Out Fighting, and Proud House of Shmucks.'
where title = 'Authority Zero Apocalyptour 2026 with Counterpunch wsg Come Out Fighting + Proud House Of Shmucks' and start_date = '2026-10-25' and (description is null or description = '');

update events set description = 'A double dose of classic metal tributes back to back at District 142: Eyes of the Nile recreates Iron Maiden''s catalog, and Devil''s Child covers Judas Priest.'
where title = 'NIGHT OF THE BEAST featuring EYES OF THE NILE (Iron Maiden Tribute) and DEVIL''S CHILD (Judas Priest Tribute)' and start_date = '2026-10-31' and (description is null or description = '');

update events set description = 'Lee Emi, the solo project of Emilee Petersmark (also of The Crane Wives), plays The Magic Bag with support from indie-folk act Cal in Red.'
where title = 'Magic Bag Presents: Lee Emi with Cal in Red' and start_date = '2026-11-20' and (description is null or description = '');

update events set description = 'A tribute show recreating Creedence Clearwater Revival''s catalog of swamp-rock hits, at Andiamo Celebrity Showroom.'
where title = 'Creedence Clearwater Revival Tribute Show' and start_date = '2026-11-20' and (description is null or description = '');

update events set description = 'Meadow Brook Theatre''s long-running annual production of Charles Dickens'' holiday classic — a Rochester tradition for decades.'
where title = 'A Christmas Carol' and start_date = '2026-11-20' and (description is null or description = '');

update events set description = 'Sir Woman, the soul-and-groove side project of Wild Child''s Kelsey Wilson, plays the Blind Pig.'
where title = 'Sir Woman' and start_date = '2026-11-20' and (description is null or description = '');

update events set description = 'A nationally touring Morgan Wallen tribute act recreating his catalog of country hits, at District 142.'
where title = 'WHISKEY FRIENDS - The Morgan Wallen Experience wsg Y''all Band' and start_date = '2026-11-20' and (description is null or description = '');

update events set description = 'Indie/emo band Dogs on Shady Lane plays the Pike Room at The Crofoot.'
where title = 'Dogs on Shady Lane' and start_date = '2026-11-20' and (description is null or description = '');

update events set description = 'Faith-based EDM artist Rave Jesus brings his Rave Revival Tour to Diamondback Music Hall.'
where title = 'RAVE JESUS: RAVE REVIVAL TOUR' and start_date = '2026-11-20' and (description is null or description = '');

update events set description = 'A touring Christian/indie music package that has featured artists like Josiah Queen and Hulvey at other stops, at the Michigan Theater in Ann Arbor.'
where title = 'Campus Nights Tour' and start_date = '2026-11-20' and (description is null or description = '');

update events set description = 'ECHL hockey: the Toledo Walleye host the Rapid City Rush at Huntington Center.'
where title = 'Toledo Walleye vs. Rapid City Rush' and start_date = '2026-11-20' and (description is null or description = '');

update events set description = 'Listed as "Los Tigres del Mundo" — this may be a data typo for Los Tigres del Norte''s "La Lotería" tour, which is playing the Fox Theatre this same night (see the "Suite Rental" listing below). Worth double-checking whether this is a duplicate/typo rather than a second real event before publishing further.'
where title = 'Los Tigres del Mundo' and start_date = '2026-11-21' and (description is null or description = '');

update events set description = 'Legendary Norteño band Los Tigres del Norte bring their "La Lotería" tour to the Fox Theatre; this listing is Ticketmaster''s suite-rental ticket package for the same show.'
where title = 'Los Tigres del Norte - Suite Rental' and start_date = '2026-11-21' and (description is null or description = '');

update events set description = 'Flint emo/post-hardcore veterans Small Brown Bike play The Loving Touch as part of their "Dead Reckoning" 25th-anniversary tour.'
where title = 'Small Brown Bike' and start_date = '2026-11-21' and (description is null or description = '');

update events set description = 'Comedic hip-hop/pop artist Yung Gravy brings his 2026 Joyrider Tour to Saint Andrew''s Hall.'
where title = 'Yung Gravy: The Joyrider Tour' and start_date = '2026-11-21' and (description is null or description = '');

update events set description = 'A tribute band recreating Fleetwood Mac''s catalog, at District 142.'
where title = 'THE SEVEN WONDERS (A Tribute to Fleetwood Mac)' and start_date = '2026-11-21' and (description is null or description = '');

update events set description = 'NHL hockey: the Detroit Red Wings host the New York Islanders at Little Caesars Arena.'
where title = 'Detroit Red Wings vs. New York Islanders' and start_date = '2026-11-21' and (description is null or description = '');

insert into schema_migrations (filename) values ('update_2026-09-14_admin-followup-cleanup.sql')
on conflict (filename) do nothing;
