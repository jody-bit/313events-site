-- 313.events: Batch C — misc follow-up fixes (25 events): mixed single/multi-field gaps
-- Batch: Phase-1 admin follow-up backlog (799-record PDF), final misc subset
-- Only the fields each record's admin panel actually flagged as missing are set here.
-- See per-row comment for source/confidence notes and any flags for manual review.

-- Dally in the Alley | Cass Corridor / North Cass | 2026-09-12 
-- NOTE: 47th annual Dally in the Alley; hours per official event listings (Wayne State events calendar, WDET, Deadline Detroit), Sept 2026.
UPDATE events SET time_display = '11:00 AM – 11:00 PM' WHERE id = '27dce20f-fd48-4d4a-8a49-07b56cf872c0';

-- Hamtramck Night Bazaar | 10037 Joseph Campau, Hamtramck | 2026-09-12 
-- NOTE: Recurring monthly market at Pope Park; address/hours per official listings (Eventbrite, City of Hamtramck Facebook) are consistent across dates, but the specific Sept 12 date was not independently confirmed against the recurring schedule (confirmed dates found: Jun 6, Jul 11, Aug 1, Sep 5) — recommend verifying this exact date.
UPDATE events SET venue_address_raw = '10037 Joseph Campau Ave', venue_city_raw = 'Hamtramck', ticket_url = 'https://www.eventbrite.com/e/hamtramck-night-bazaar-tickets', time_display = '6:00 PM – 10:00 PM' WHERE id = 'db2495b4-7a20-4304-9b3d-226eafae005c';

-- Mo and Jim’s Rock and Roll Trivia | Paris Bar | 2026-09-13 3:00 PM
-- NOTE: No dedicated ticket page found for this recurring trivia night; linked to Paris Bar's own site (2961 E McNichols, Detroit) — trivia nights are typically free/no-ticket.
UPDATE events SET ticket_url = 'https://www.parisbardetroit.com' WHERE id = 'aa059ff0-be43-45e4-b2de-8fdcc7077ba0';

-- Motor City Comedy Festival | Mic Drop Comedy Detroit, Ant Hall, The Independent Comedy Club, and The Comedy Bar | 2026-09-16 
-- NOTE: Multi-day, multi-venue comedy festival (Mic Drop Comedy, Ant Hall, The Independent, The Comedy Bar); individual shows have separate start times (e.g. 6–9:30 PM range) rather than one single festival start time. See motorcitycomedyfestival.com/schedule for exact showtimes.
UPDATE events SET time_display = 'Varies by venue/show — festival runs Sept 16–20' WHERE id = 'a1091241-54b3-4f9e-b745-c1396af4d5a2';

-- State of the Strait: REWILDING in Action | Belle Isle Nature Center | 2026-09-17 8:00 AM – 5:00 PM
-- NOTE: Belle Isle Nature Center address confirmed via belleislenaturecenter.org + multiple listings.
UPDATE events SET venue_address_raw = '176 Lakeside Dr', venue_city_raw = 'Detroit' WHERE id = '4f66583c-c58c-4da0-ae41-aecb7ca8890d';

-- Eastern Market After Dark | Eastern Market | 2026-09-17 
-- NOTE: Per easternmarket.org and Eastern Market After Dark's own site, Sept 17 2026: 6-11pm (Detroit Riverfront Conservancy lists 6-10pm for the same night — used the market's own official listing).
UPDATE events SET time_display = '6:00 PM – 11:00 PM' WHERE id = '023ba8a6-27c6-48de-b528-f47961c09b27';

-- 9th Annual NOIR CITY DETROIT | Redford Theatre | 2026-09-18  | confidence: researched
-- NOTE: Redford Theatre's standard Friday evening screening time (doors 6:30 PM, film 8:00 PM); the festival's own multi-day schedule was not independently confirmed for this exact date.
UPDATE events SET description = 'The 9th annual Noir City Detroit festival brings a weekend of classic film noir screenings to the historic Redford Theatre, part of the nationally touring Noir City series presented by the Film Noir Foundation.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com/events/', time_display = '8:00 PM' WHERE id = '965432cb-93b8-44bb-8d38-94ee02ee2843';

-- Dance City Festival — Detroit | Detroit Institute of Arts | 2026-09-18 
-- NOTE: Dance City Festival Choreographers Showcase, per DIA's own events calendar (dia.org/events), Friday Sept 18 2026: 7 PM.
UPDATE events SET time_display = '7:00 PM' WHERE id = 'aa2daf57-13c3-44e4-936e-21f8bc01ace0';

-- Take a Detroit Tour. Support Planet Ant! | MEETING LOCATION: Guardian Building | 2026-09-20 2:00 PM
-- NOTE: Guardian Building address — well-established landmark address.
UPDATE events SET venue_address_raw = '500 Griswold St', venue_city_raw = 'Detroit' WHERE id = '62baa072-f253-48de-b392-1e1d81d45cde';

-- Ferndale DIY Street Fair | East Nine Mile Rd | 2026-09-25 
-- NOTE: Per ferndalediy.com official site: Friday Sept 25 2026 hours 6-11pm (Sat 11am-11pm, Sun 12-9pm for the other festival days).
UPDATE events SET time_display = '6:00 PM – 11:00 PM' WHERE id = '88306749-3e66-43c2-9d5a-17a2add656c4';

-- Funky Ferndale Art Fair | Woodward Ave & Nine Mile | 2026-09-25 
-- NOTE: Per funkyferndaleartfair.com official site: Friday Sept 25 2026 hours 5-9pm (Sat 10am-9pm, Sun 11am-5pm for the other festival days).
UPDATE events SET time_display = '5:00 PM – 9:00 PM' WHERE id = '69f36b20-89ac-473b-bcbb-97cb4f7b2beb';

-- Bram Stoker’s Dracula (1992) | Redford Theatre | 2026-10-03  | confidence: researched
-- NOTE: Redford Theatre's standard Saturday evening screening time (doors 6:30 PM, film 8:00 PM); exact showtime for this specific date not independently confirmed.
UPDATE events SET description = 'A screening of Francis Ford Coppola''s 1992 gothic horror film Bram Stoker''s Dracula, starring Gary Oldman as Dracula alongside Winona Ryder, Anthony Hopkins, and Keanu Reeves.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com/events/', time_display = '8:00 PM' WHERE id = 'bf1c277a-9a87-40b7-95b8-2ac6d29ee398';

-- Detroit Harvest Fest | Ralph C. Wilson Jr. Centennial Park | 2026-10-03 
-- NOTE: Per Detroit Riverfront Conservancy's own event listing, Oct 3-4 2026: 11am-8pm at Ralph C. Wilson Jr. Centennial Park.
UPDATE events SET time_display = '11:00 AM – 8:00 PM' WHERE id = '4358a48e-f670-4444-b47a-eb9b8dcfba7e';

-- Hamtramck Night Bazaar | 10037 Joseph Campau, Hamtramck | 2026-10-03 
-- NOTE: Same recurring market as the Sept 12 entry; address/hours consistent across official listings, though this exact Oct 3 date wasn't independently confirmed against the recurring schedule found (Jun 6, Jul 11, Aug 1, Sep 5).
UPDATE events SET venue_address_raw = '10037 Joseph Campau Ave', venue_city_raw = 'Hamtramck', ticket_url = 'https://www.eventbrite.com/e/hamtramck-night-bazaar-tickets', time_display = '6:00 PM – 10:00 PM' WHERE id = '1a439458-3240-4ec9-a44b-ab4be7b9f982';

-- Neighborhood Arts Festival | City-Wide (Hamtramck) — multiple venues | 2026-10-03 
-- NOTE: Hamtramck Neighborhood Arts Festival's official date sources conflict slightly (Oct 3 per city .gov PDF vs Oct 4 per HNAF Instagram/ham.town) — kept the Oct 3 date already in the DB. Hours are an estimate based on the festival's historical full-day format; not independently confirmed for 2026. Main address per HNAF's own Instagram: 3901 Christopher St, Hamtramck.
UPDATE events SET venue_address_raw = '3901 Christopher St', venue_city_raw = 'Hamtramck', ticket_url = 'https://hnaf.org', time_display = '11:00 AM – 8:00 PM' WHERE id = '67dc8094-66d0-4e53-9a2d-16bdc5f1f718';

-- Motown on the Menu – Vinyl Tasting Dinner | Terri’s Detroit | 2026-10-17 12:00 AM – 11:59 PM | confidence: generic
-- NOTE: Terri's Detroit (also known as Terri's Cakes Detroit) address confirmed via multiple listings; no specific details found on this particular dinner's exact format/menu, so description is an honest generic fallback.
UPDATE events SET description = 'A themed dinner event pairing food and drink with a curated vinyl listening experience celebrating Motown-era music, hosted at Terri''s Detroit.', venue_address_raw = '16311 E Warren Ave', venue_city_raw = 'Detroit' WHERE id = '7ae5ae12-44bd-4342-997e-6edf1c13f584';

-- Special Event: Fright Night Part 2 (1988) | Redford Theatre | 2026-10-23  | confidence: researched
-- NOTE: Redford Theatre's standard Friday evening screening time; exact showtime for this specific date not independently confirmed.
UPDATE events SET description = 'A screening of the 1988 horror-comedy sequel Fright Night Part 2, continuing the vampire story from the original 1985 cult favorite, starring Roddy McDowall and William Ragsdale.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com/events/', time_display = '8:00 PM' WHERE id = 'd399dbd4-aef1-4fd0-ad44-d383f793cafe';

-- Transition: A Journey from Birth to Death - Opening Reception | Office Space gallery | 2026-10-24 6:00 - 10:00 PM
-- NOTE: Office Space Gallery (2868 E Grand Blvd, Detroit) is run by Mosaic Productions LLC; no dedicated ticket page found for this opening reception — likely free/RSVP. Linked to the gallery's own site.
UPDATE events SET ticket_url = 'https://www.mosaicproductionsllc.com' WHERE id = 'bbb03a7b-634d-4a69-ba2f-d5b229e529a7';

-- Detroit Fall Beer Festival | Eastern Market | 2026-10-24 
-- NOTE: Per Michigan Brewers Guild's own event listing, Oct 24 2026 at Eastern Market: general admission 1-6pm, gates open noon for VIP/enthusiast members.
UPDATE events SET time_display = '1:00 PM – 6:00 PM (VIP/early entry Noon)' WHERE id = '5a8f7297-0a51-4610-a97b-75d8512825c8';

-- Devil's Night Film Festival | Venue TBA | 2026-10-28 
-- NOTE: Devil's Night Film Festival runs Oct 28-31 2026; the Oct 28 program ("The First Invocation") is confirmed via multiple independent ticketing sources at Senate Theater, 6424 Michigan Ave, Detroit, 7:00 PM — linked to the festival's own official site rather than a specific third-party ticket vendor link.
UPDATE events SET ticket_url = 'https://www.devilsnight.org', time_display = '7:00 PM' WHERE id = '6c3de1de-4ca2-416f-ac4b-8ab4a8145fec';

-- Youmacon | Huntington Place | 2026-10-29 
-- NOTE: Youmacon runs Oct 29-Nov 1 2026 at Huntington Place; opening-day (Thursday) hours vary significantly by track/panel (e.g. tabletop gaming 6-10pm) with no single confirmed convention-wide start time found.
UPDATE events SET time_display = 'Afternoon (exact hours vary by program — see youmacon.com/schedule)' WHERE id = '2cb556e2-ebac-4b9d-88d7-e0dd0bf0aabf';

-- MB Music Presents: The Little Mermaid Live | Redford Theatre | 2026-11-07  | confidence: generic
-- NOTE: No confirmed specific details found on 'MB Music' or this exact production's format; description kept generic. Start time is Redford Theatre's standard Saturday evening slot, not independently confirmed for this date.
UPDATE events SET description = 'A live presentation of Disney''s The Little Mermaid at the Redford Theatre, presented by MB Music — likely a sing-along or live-music-accompanied screening format.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com/events/', time_display = '8:00 PM' WHERE id = '56829cf4-33c8-424a-9f85-77ba93d20d73';

-- Return of the Jedi (1983) | Redford Theatre | 2026-11-13  | confidence: researched
-- NOTE: Redford Theatre's standard Friday evening screening time; exact showtime for this specific date not independently confirmed.
UPDATE events SET description = 'A screening of Return of the Jedi (1983), the third film in the original Star Wars trilogy, directed by Richard Marquand and starring Mark Hamill, Harrison Ford, and Carrie Fisher.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com/events/', time_display = '8:00 PM' WHERE id = '05840217-33c1-4a33-99da-8b9e0ce99207';

-- Wicked Sing-a-Long (2024) A Night of Magic, Music &#038; Giving | Redford Theatre | 2026-09-12  | confidence: researched
-- NOTE: Appears to be a duplicate DB entry alongside another 'Wicked Sing-a-Long' record for the same date/venue (title differs only in a &#038; HTML-entity vs. plain & ampersand) — flagged for Jody to check whether these are two rows that should be merged/deduped.
UPDATE events SET description = 'A sing-along screening of the 2024 film adaptation of the Broadway musical Wicked, presented as a charity benefit night ("A Night of Magic, Music & Giving") at the Redford Theatre.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com/events/', time_display = '8:00 PM' WHERE id = '4d2a862a-a101-44d4-ba56-b4e142f6247f';

-- Wicked Sing-a-Long (2024) A Night of Magic, Music & Giving | Redford Theatre | 2026-09-12  | confidence: researched
-- NOTE: Likely duplicate of the other 'Wicked Sing-a-Long' record for the same date/venue (see note there) — flagged for Jody to check for a dedup opportunity.
UPDATE events SET description = 'A sing-along screening of the 2024 film adaptation of the Broadway musical Wicked, presented as a charity benefit night ("A Night of Magic, Music & Giving") at the Redford Theatre.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com/events/', time_display = '8:00 PM' WHERE id = 'def4c016-c15b-44a7-91e5-553fd41f133a';
