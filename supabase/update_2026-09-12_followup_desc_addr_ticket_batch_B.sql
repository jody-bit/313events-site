-- 313.events: Batch B — nightlife/club events needing description + venue address/city + ticket link
-- Batch: Phase-1 admin follow-up backlog (799-record PDF), desc+addr+ticket subset (102 events)
-- Venue street addresses verified via web search against venue's own site + multiple listing sources (Yelp/RA/MapQuest/etc), Sept 2026.
-- 'Venue TBA' / 'Multiple Locations' events: address left NULL (honest — no fixed address exists to report).
-- See SQL comments per row for confidence (researched/generic) and ticket_url_note.

-- THE BLACKOUT: UNDERWEAR PARTY | HALO Detroit | 2026-09-12 9:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A themed underwear/dress-down nightlife party at HALO Detroit, an LGBTQ+ nightclub on Greenfield Rd known for regular themed club nights and dance parties.', venue_address_raw = '8070 Greenfield Rd', venue_city_raw = 'Detroit', ticket_url = 'https://www.thehalodetroit.com' WHERE id = '0aaa8427-de19-43ff-820d-6f3c6d2cb4fc';

-- Strange Beautiful Music 19 (Day 3) | Multiple Locations | 2026-09-12 See schedule | confidence: researched | ticket_note: no single fixed venue for this multi-location event and no website given; check Interdimensional Transmissions/Ectomorph's own promotion channels
UPDATE events SET description = 'A day of Strange Beautiful Music, a long-running multi-day Detroit techno/electronic music event series presented by Interdimensional Transmissions (the collective behind the group Ectomorph), spanning multiple venues/locations with DJ and live electronic-music sets. Note: this series has historically run during Memorial Day weekend in Detroit, so a September date for this edition is worth double-checking against the promoter''s own announcements.', venue_address_raw = NULL, venue_city_raw = NULL, ticket_url = NULL WHERE id = 'e7f76b80-50e5-47cb-b88f-bf714a16d2bd';

-- LAÍRE NIGHT X | Northern Lights Lounge | 2026-09-12 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A nightlife/DJ event at Northern Lights Lounge, a Detroit music venue and bar.', venue_address_raw = '660 W Baltimore St', venue_city_raw = 'Detroit', ticket_url = 'https://www.northernlightslounge.com' WHERE id = '17d82096-05b8-467e-9fd1-3ce2fa5539d5';

-- BerettaMusic & Friends | Spkrbox | 2026-09-12 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A DJ/nightlife event at Spkrbox, a Detroit bar and event space, featuring BerettaMusic alongside supporting acts.', venue_address_raw = '200 Grand River Ave', venue_city_raw = 'Detroit', ticket_url = 'https://spkrbox.bar' WHERE id = 'c3435578-0031-4ebc-940d-8647b78ae90a';

-- Dally in the Alley: Official Afters | Marble Bar | 2026-09-12 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'The official after-party for Dally in the Alley, Detroit''s long-running (since 1977) free annual street festival in the Cass Corridor near Wayne State University, held at Marble Bar.', venue_address_raw = '1501 Holden St', venue_city_raw = 'Detroit', ticket_url = 'https://themarblebar.com' WHERE id = '517856ff-09d2-43a2-a0c1-3392d49df20a';

-- It's A 2000s Party: Detroit | El Club | 2026-09-12 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A 2000s-themed nostalgia dance party at El Club, a Southwest Detroit music venue, featuring DJ sets of 2000s-era pop, hip-hop, and dance hits.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = '0b8392d3-bc41-4e9c-8470-89eeb8fbf3f9';

-- BLUF DETROIT MONTHLY SOCIAL | HALO Detroit | 2026-09-12 5:00 PM – 8:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A monthly social gathering hosted by the Detroit chapter of BLUF, an international social/networking group for gay and bi men into leather, uniform, and fetish gear, held at HALO Detroit.', venue_address_raw = '8070 Greenfield Rd', venue_city_raw = 'Detroit', ticket_url = 'https://www.thehalodetroit.com' WHERE id = '90b1605b-b7a3-4e54-9483-d82d3ca241a7';

-- HOT ASH CIGAR & PIPE SOCIAL | HALO Detroit | 2026-09-12 8:00 PM – 10:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A cigar and pipe social event at HALO Detroit, a casual meetup for cigar/pipe enthusiasts.', venue_address_raw = '8070 Greenfield Rd', venue_city_raw = 'Detroit', ticket_url = 'https://www.thehalodetroit.com' WHERE id = 'ef870af3-7555-4519-9b73-df810fcaa087';

-- Channel Tres — The Enigma Tour | Venue TBA (Paxahau) | 2026-09-18 See paxahau.com | confidence: researched | ticket_note: no fixed venue announced ahead of the show; check Paxahau's own event page/promotion channels
UPDATE events SET description = 'A performance by Channel Tres, an American singer, rapper, and producer from Compton, CA known for blending house music, hip-hop, and R&B on tracks like "Controller" and "Topdown" and for collaborations with artists such as Tyler, the Creator and Disclosure. This Detroit-area date is Paxahau-affiliated with the specific venue not yet publicly announced.', venue_address_raw = NULL, venue_city_raw = NULL, ticket_url = 'https://paxahau.com' WHERE id = '33777d2d-c008-48bc-9364-f4468fd26a20';

-- DJ Mandy: Fall Tour 2026 | Elektricity | 2026-09-18 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A DJ performance by DJ Mandy as part of a fall 2026 tour, at Elektricity, a nightclub/music venue in Pontiac, MI.', venue_address_raw = '15 S Saginaw St', venue_city_raw = 'Pontiac', ticket_url = 'https://www.elektricitymusic.com' WHERE id = '3113d4d0-2760-4736-a31a-399df383314d';

-- Three.One.Three | Andy Arts | 2026-09-18 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A nightlife/DJ event titled "Three.One.Three" (a nod to Detroit''s 313 area code) at Andy Arts, a Detroit event space.', venue_address_raw = '3000 Fenkell St', venue_city_raw = 'Detroit', ticket_url = 'https://www.andyarts.org' WHERE id = '643536cf-9479-4e3e-b8de-744feb9cbdac';

-- thrg pres. CAM GIRL, Spray, Father Dukes, Candor, SYD, Nico | Marble Bar | 2026-09-18 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A multi-act nightlife show at Marble Bar presented by thrg, featuring a lineup of DJs/artists including CAM GIRL, Spray, Father Dukes, Candor, SYD, and Nico.', venue_address_raw = '1501 Holden St', venue_city_raw = 'Detroit', ticket_url = 'https://themarblebar.com' WHERE id = '5d1f3c14-593f-4581-abea-d598386a8f80';

-- Brian Fallon & The Painkillers | El Club | 2026-09-18 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A live performance by Brian Fallon, best known as the lead singer/guitarist of the New Jersey rock band The Gaslight Anthem, backed by his band billed as The Painkillers (a name tied to his 2016 solo album "Painkillers") performing Fallon''s solo, Americana-tinged rock material at El Club.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = 'b5805fd7-7925-48ca-beb6-ce6c3989cf79';

-- Cartoons & Stereo Vol. 2: A Skateboarding + Music Festival | Big Pink | 2026-09-19 Day | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A skateboarding-and-music festival at Big Pink, likely combining skate demos/sessions with live music or DJ sets and vendors, per the event''s title.', venue_address_raw = '6440 Wight St', venue_city_raw = 'Detroit', ticket_url = 'https://bigpinklovesyou.com' WHERE id = 'b53f69dd-f59e-4d1d-930a-b43dc6091421';

-- Truncate, Julia Govor | Lincoln Factory | 2026-09-19 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A techno night at Lincoln Factory featuring Truncate (Rich Hunn), a techno producer/DJ known for hypnotic, driving techno releases on labels including his own Truncate Records, and Julia Govor, a Russian-born, New York-based techno DJ/producer known for dark, propulsive sets and releases on labels such as Correspondant.', venue_address_raw = '1331 Holden St', venue_city_raw = 'Detroit', ticket_url = 'https://thecrofoot.com/venues/lincoln-factory' WHERE id = 'ed8e7a74-ba53-4ff2-b660-82274298c042';

-- Texture | Venue TBA (Detroit) | 2026-09-19 Evening | confidence: generic | ticket_note: no fixed venue announced; check event's own promotion channels
UPDATE events SET description = 'A nightlife/club event titled "Texture" in the Detroit area, with the specific venue not publicly announced ahead of the show.', venue_address_raw = NULL, venue_city_raw = NULL, ticket_url = NULL WHERE id = 'aa086cb4-3217-4cb3-97d0-0910245114a5';

-- Sweat | Cannons | 2026-09-19 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A dance/nightlife party titled "Sweat" at Cannons, a Detroit bar.', venue_address_raw = '15421 Mack Ave', venue_city_raw = 'Detroit', ticket_url = 'https://www.cannonsbar.com' WHERE id = 'f38459e2-bc87-469a-903c-3794058ef91e';

-- The Charlatans UK — North American Tour | El Club | 2026-09-19 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'The Charlatans UK are a long-running English rock band that emerged from the Madchester scene in the late 1980s, known for hits like "The Only One I Know" and "North Country Boy" and fronted by Tim Burgess. This El Club date is part of a North American tour run.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = 'bbf7267f-b8c5-4cde-951f-f479a771313a';

-- DRAG UNIQUE | HALO Detroit | 2026-09-19 9:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A drag show at HALO Detroit, an LGBTQ+ nightclub, featuring drag performances as part of the venue''s nightlife programming.', venue_address_raw = '8070 Greenfield Rd', venue_city_raw = 'Detroit', ticket_url = 'https://www.thehalodetroit.com' WHERE id = '18385cef-d21c-4ba8-a32c-5a9fcc3281c0';

-- LØLØ — God Forbid a Girl Goes on Tour | El Club | 2026-09-21 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'LØLØ is a Canadian singer-songwriter known for blending pop-punk energy with alt-pop hooks. This El Club stop is part of her "God Forbid a Girl Goes on Tour" tour.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = 'b94f3707-35a6-4628-a243-91437d61efb3';

-- Glenn Jones | Trinosophes | 2026-09-21 7:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Glenn Jones is an acclaimed American primitive-style fingerstyle guitarist and former member of Cul de Sac, carrying on the tradition of John Fahey and Robbie Basho. He performs a solo acoustic set at Trinosophes.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = 'e348fb10-f091-434a-88dd-6a330b662b59';

-- Nick Schillace | Trinosophes | 2026-09-21 7:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Nick Schillace is a Michigan-based fingerstyle acoustic guitarist working in the American primitive guitar tradition. He appears at Trinosophes the same evening as fellow guitarist Glenn Jones, per the listed schedule.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = '049d5aa7-a834-476c-93fe-cfee424eaef5';

-- Beth Orton | El Club | 2026-09-23 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Beth Orton is a British singer-songwriter celebrated for blending folk songwriting with electronic textures ("folktronica"), known for albums like "Trailer Park" and "Central Reservation" and past collaborations with the Chemical Brothers. She performs at El Club.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = '76c83436-e05d-4eff-98ac-9a7872adac3d';

-- Sip & Stroll at Detroit Opera (last day) | Detroit Opera House | 2026-09-24 Varies | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A food-and-drink-focused stroll/tasting event held at Detroit Opera House, listed here on its final day of this run.', venue_address_raw = '1526 Broadway St', venue_city_raw = 'Detroit', ticket_url = 'https://detroitopera.org' WHERE id = 'be7eac03-2b1d-4d2c-8cb5-00626065f230';

-- Hector Romero does TV | TV Lounge | 2026-09-25 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Hector Romero is a veteran house-music DJ and remixer from the New York club scene. This nightlife event brings his DJ set to TV Lounge.', venue_address_raw = '2548 Grand River Ave', venue_city_raw = 'Detroit', ticket_url = 'https://www.tvloungedetroit.com' WHERE id = '826b977d-5ae5-4f1a-8623-aac140a07c24';

-- Texture — TBA | Venue TBA (Detroit) | 2026-09-25 Evening | confidence: generic | ticket_note: no fixed venue announced; check event's own promotion channels
UPDATE events SET description = 'A nightlife/dance event billed as "Texture," following the common underground-electronic-event practice of announcing the lineup ahead of the venue itself; no fixed location has been made public for this date.', venue_address_raw = NULL, venue_city_raw = NULL, ticket_url = NULL WHERE id = 'cf16c1be-1d97-4c17-9794-8b7527da9410';

-- Warren Zeiders — No Brakes Album Release Tour | El Club | 2026-09-25 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Warren Zeiders is an American country artist who broke out through viral acoustic covers on social media, known for his gravelly baritone and songs like "Ride the Lightning" and "Pretty Little Poison." Per the event title, this El Club date is part of his "No Brakes" album release tour.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = '5d46980f-026e-4a6e-b2dc-d33d6b346ec5';

-- Swartz Et | Trinosophes | 2026-09-25 7:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A live music performance at Trinosophes, a Detroit venue known for eclectic and experimental programming spanning jazz, folk, and avant-garde sounds.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = '6ebcac42-175f-4ef4-9239-a759b366f82d';

-- Windy and Carl Meet Optigan Conservatory | Trinosophes | 2026-09-25 7:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Windy and Carl are a Dearborn, Michigan dream-pop/drone duo (Windy Weber and Carl Hultgren) and longtime pillars of the ambient and shoegaze underground, formerly running the Stormy Records shop. This Trinosophes date pairs them with the Optigan Conservatory project, built around the vintage Optigan optical organ instrument.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = '6d80b572-a37e-48c6-b1b7-db9b3e9eec17';

-- BUY TICKETS NOW | Trinosophes | 2026-09-25 7:00 PM | confidence: generic | ticket_note: venue's official site/calendar; title appears to be a data-quality error, not a real event name
UPDATE events SET description = 'Event details could not be confirmed — the listed title, "BUY TICKETS NOW," reads as a scraped call-to-action button label rather than an actual event or artist name. This is likely a live music event at Trinosophes on the given date.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = '8262db18-0a62-4bdc-9300-ed60a27d4b39';

-- The Coney Detroit | Detroit Opera House | 2026-09-26 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A theatrical production, "The Coney Detroit," presented at Detroit Opera House; specific plot, cast, or production details are not confidently known.', venue_address_raw = '1526 Broadway St', venue_city_raw = 'Detroit', ticket_url = 'https://detroitopera.org' WHERE id = '92d92539-a92f-4be4-85ec-2ec3264611ad';

-- Paxahau presents: Eddie Fowlkes | TV Lounge | 2026-09-26 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Eddie Fowlkes is one of the founding figures of Detroit techno, part of the genre''s first wave of producers and DJs. This night is presented by Paxahau, the Detroit promotion company best known for organizing the Movement electronic music festival, at TV Lounge.', venue_address_raw = '2548 Grand River Ave', venue_city_raw = 'Detroit', ticket_url = 'https://www.tvloungedetroit.com' WHERE id = 'b649e473-aa2f-49f5-b8e5-1f205ce57b46';

-- SHDW (Mutual Rytm) & Redax (Urban Pulse), Extended Sets | Tangent Gallery | 2026-09-26 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'SHDW (releasing on the Mutual Rytm label) and Redax (associated with Urban Pulse Records) are underground techno producers/DJs. This event at Tangent Gallery features extended sets from both.', venue_address_raw = '715 E Milwaukee Ave', venue_city_raw = 'Detroit', ticket_url = 'https://tangentgallery.com' WHERE id = '9f5aa787-7d52-4f79-a2fe-c7374b14950c';

-- Sunset Sessions w/ Andre Terrell | Cannons | 2026-09-26 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A DJ set / nightlife event at Cannons featuring Andre Terrell, part of the bar''s recurring "Sunset Sessions" programming.', venue_address_raw = '15421 Mack Ave', venue_city_raw = 'Detroit', ticket_url = 'https://www.cannonsbar.com' WHERE id = 'b1ff4258-c3a5-4c8c-aa35-baf239fb3c40';

-- Sanctuary: Descent | Menjo's | 2026-09-26 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A nightlife/club event called "Sanctuary: Descent" at Menjo''s, a longtime Detroit nightclub, likely featuring DJ sets in a darker/alternative dance-music vein based on the event name.', venue_address_raw = '928 W McNichols Rd', venue_city_raw = 'Detroit', ticket_url = 'https://www.menjoscomplex.net' WHERE id = 'f44173dd-6112-4b3b-9ee6-ef633ce0d060';

-- Theo Katzman | El Club | 2026-09-26 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A live performance by Theo Katzman, a singer-songwriter and multi-instrumentalist best known as a founding member of the funk/pop band Vulfpeck, who also tours behind his own solo albums of soulful pop-rock.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = '9cf27c85-3531-4c20-8cac-4c3c6037a293';

-- A Dub Supreme | MotorCity Wine | 2026-09-27 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = '"A Dub Supreme" appears to be a dub/reggae-themed night at MotorCity Wine, a Detroit bar and lounge known for hosting DJ sets and live music spanning soul, funk, and dance genres.', venue_address_raw = '1949 Michigan Ave', venue_city_raw = 'Detroit', ticket_url = 'https://motorcitywine.com' WHERE id = '5ac6a595-ab18-4a42-805e-03f52c22f579';

-- Allison Eide — I Still Don't Know Tour | El Club | 2026-09-27 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A stop on Allison Eide''s "I Still Don''t Know Tour," a live music show at El Club, a Detroit venue known for indie, rock, and singer-songwriter touring acts.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = 'c593b55d-865a-41de-b9bd-bfaf3e5f1365';

-- Spiral Galaxy | Trinosophes | 2026-09-28 7:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A live music performance by Spiral Galaxy at Trinosophes, a Detroit venue known for booking experimental, jazz, and independent touring acts.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = 'df2f2820-ead0-41bc-ad02-f08ed8d9c691';

-- Russian Circles | El Club | 2026-09-28 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A performance by Russian Circles, the instrumental post-rock/post-metal trio from Chicago (guitarist Mike Sullivan, bassist Brian Cook, drummer Dave Turncrantz) known for their heavy, atmospheric, largely wordless sound built around long-form dynamic builds.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = 'cec7ecd4-e40a-45e5-bc4f-5dc87f449265';

-- Viands | Trinosophes | 2026-09-28 7:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A live music performance by Viands at Trinosophes, a Detroit venue known for booking experimental and independent touring acts.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = '71149a91-6e7f-4e2e-bcc3-2192c6b48e3f';

-- Matthew Smith (solo instrumental) | Trinosophes | 2026-09-28 7:00 PM | confidence: generic | ticket_note: venue's official site/calendar; could not confirm which Matthew Smith (a Detroit-area musician of this name leads the bands Outrageous Cherry and The Volebeats, but that identification is not certain)
UPDATE events SET description = 'A solo instrumental performance by Matthew Smith at Trinosophes, a Detroit venue known for experimental and improvisational music programming.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = 'ba67bd2b-409b-4367-8412-e258fb0c26f6';

-- Bahamas — Industrial Sport & Sound | El Club | 2026-09-30 Evening | confidence: generic | ticket_note: venue's official site/calendar; flagging that the tour subtitle could not be verified
UPDATE events SET description = 'A performance billed as "Bahamas — Industrial Sport & Sound" at El Club. Bahamas is the stage name of Canadian singer-songwriter Afie Jurvanen, known for warm, guitar-driven folk-pop (songs like "Lost in the Light" and "All the Time"); the "Industrial Sport & Sound" subtitle is not something we could independently confirm as an official tour name for this artist.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = 'ee117288-f403-421e-87f3-8451a2e8b097';

-- Horse Lords | Trinosophes | 2026-09-30 7:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A performance by Horse Lords, the Baltimore-based experimental/avant-rock band known for microtonal, just-intonation guitar tunings, interlocking polyrhythms, and releases on labels like NNA Tapes and RVNG Intl.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = 'e59eadf1-8d5a-40a4-bd10-066ee95e2d1d';

-- BUY TICKETS NOW | Trinosophes | 2026-09-30 7:00 PM | confidence: generic | ticket_note: venue's official site/calendar; source title looks like a data-quality error, not a real event name
UPDATE events SET description = 'A live music event at Trinosophes; the listed title "BUY TICKETS NOW" appears to be leftover call-to-action text rather than an actual event or artist name, so no further detail could be determined.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = 'd5ce8b12-1871-4a9c-bfa3-15105fa4b3b7';

-- Pertinence | El Club | 2026-10-01 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A live music performance by Pertinence at El Club, a Detroit venue known for booking indie, rock, and touring independent acts.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = 'cfa3ee03-cbda-4d68-bebb-611966699416';

-- BASIC | Trinosophes | 2026-10-01 7:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A live music performance by BASIC at Trinosophes, a Detroit venue known for experimental and independent programming.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = '3396c046-19e7-4589-9119-0379536fdbe0';

-- Sam Alfred — USA Tour | Venue TBA (Paxahau) | 2026-10-02 See paxahau.com | confidence: generic | ticket_note: no fixed venue announced; check Paxahau's own event listing/promotion channels
UPDATE events SET description = 'A stop on Sam Alfred''s USA Tour, a nightlife/electronic music event affiliated with Paxahau (the Detroit-based promoter behind Movement festival and other electronic music shows); the exact venue had not been announced publicly.', venue_address_raw = NULL, venue_city_raw = NULL, ticket_url = 'https://paxahau.com' WHERE id = '0ea54c50-b242-4441-8db9-ca067f0c5d7e';

-- NIIKO x SWAE | Elektricity | 2026-10-02 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A club night at Elektricity in Pontiac featuring DJ sets from NIIKO x SWAE, in keeping with the venue''s electronic dance music programming.', venue_address_raw = '15 S Saginaw St', venue_city_raw = 'Pontiac', ticket_url = 'https://www.elektricitymusic.com' WHERE id = '4308c527-0eab-47e0-8caf-fe221f0afcba';

-- Valentino Khan | Lincoln Factory | 2026-10-02 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A DJ performance by Valentino Khan (Owen Christian Ott), an American electronic music producer known for bass-heavy trap and dance tracks such as "Deep Down Low" and his collaborations within the Skrillex/OWSLA-adjacent scene.', venue_address_raw = '1331 Holden St', venue_city_raw = 'Detroit', ticket_url = 'https://thecrofoot.com/venues/lincoln-factory' WHERE id = '6e39f3b4-c3ce-495d-b46d-9a90689b73d5';

-- Elder Island — Hello Baby Okay Tour | El Club | 2026-10-02 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A stop on Elder Island''s "Hello Baby Okay" tour at El Club. Elder Island is a Bristol, UK-based electronic/indie band known for atmospheric, textured electronic-pop production paired with soulful vocals.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = '3619a6b4-a509-4fa3-a45e-70580387883a';

-- The Sixth Sense (1999) | Redford Theatre | 2026-10-02 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'M. Night Shyamalan''s 1999 supernatural thriller starring Bruce Willis as a child psychologist treating a boy (Haley Joel Osment) who says he can see dead people, screening as part of a classic-film program at the historic Redford Theatre movie palace.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = '56bac4bd-470c-428d-814d-9b612ae8ac39';

-- Yheti & Toadface: Sleight of Sound Tour | Elektricity | 2026-10-03 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A bass-music tour stop featuring producers Yheti and Toadface, both known for glitch-hop/dubstep-leaning electronic sets, at Elektricity nightclub in Pontiac.', venue_address_raw = '15 S Saginaw St', venue_city_raw = 'Pontiac', ticket_url = 'https://www.elektricitymusic.com' WHERE id = '14ed9842-caec-4fda-8e05-8cb9bd47e156';

-- Ellie Falaris Ganelin with Michael Malis and Joel Peterson | Trinosophes | 2026-10-03 7:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A live performance at Trinosophes, Detroit''s Eastern Market venue known for jazz and experimental music, featuring vocalist Ellie Falaris Ganelin alongside Detroit-based jazz musicians Michael Malis (piano) and Joel Peterson (bass).', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = 'b4b9d218-e254-4de5-ac6a-e7a4879fdbe4';

-- Olivia O'Brien Presents: The Pixie Tour | El Club | 2026-10-04 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A headlining tour stop by pop singer-songwriter Olivia O''Brien, known for songs like "Josslyn" and her collaboration with iann dior on "Not Over You," at Detroit''s El Club.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = '9caf509d-6691-40a8-b1ff-b9e5c6b2906b';

-- Brand New | Fox Theatre | 2026-10-05 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A concert by Brand New, the Long Island rock/emo band behind albums such as Deja Entendu and The Devil and God Are Raging Inside Me, which largely stepped back from touring after 2017 misconduct allegations against frontman Jesse Lacey.', venue_address_raw = '2211 Woodward Ave', venue_city_raw = 'Detroit', ticket_url = 'https://www.313presents.com' WHERE id = 'fe8ddee2-a86b-420f-b3c8-b50c117e1fc3';

-- Detroit Story Fest | Detroit Opera House | 2026-10-08 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A storytelling-focused festival event held at the Detroit Opera House.', venue_address_raw = '1526 Broadway St', venue_city_raw = 'Detroit', ticket_url = 'https://detroitopera.org' WHERE id = '312d5ff2-8ade-402e-a625-01f3a0d8ee2a';

-- The Occasional Thursday Party w/ London Elektricity | Marble Bar | 2026-10-08 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A club night at Marble Bar featuring London Elektricity (Tony Colman), the veteran British drum and bass producer/DJ and co-founder of Hospital Records.', venue_address_raw = '1501 Holden St', venue_city_raw = 'Detroit', ticket_url = 'https://themarblebar.com' WHERE id = 'b8f1c6eb-efb1-4294-9503-d8c8c37e330e';

-- SICKICK | Elektricity | 2026-10-09 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A performance by Sickick, the Canadian producer and DJ known for his masked public persona and viral genre-blending mashups and remixes, at Elektricity nightclub in Pontiac.', venue_address_raw = '15 S Saginaw St', venue_city_raw = 'Pontiac', ticket_url = 'https://www.elektricitymusic.com' WHERE id = '341ce047-74ce-4189-96b5-6faa5e1018ec';

-- Zach John King — Get to Drinkin' Tour | El Club | 2026-10-09 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A headlining tour stop by rising country singer-songwriter Zach John King, who built a following through social media and songs like "Poor Boy," at El Club.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = '3a648251-484d-4a2e-a24c-84157300fa5c';

-- They Live (1988) | Redford Theatre | 2026-10-09 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'John Carpenter''s 1988 sci-fi cult classic starring "Rowdy" Roddy Piper as a drifter who discovers special sunglasses revealing that aliens secretly control society through subliminal messages, screening at the historic Redford Theatre.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = '59581c6a-8675-4e00-8ada-74a91413ddd1';

-- The Voice of Whitney: A Symphonic Celebration | Detroit Opera House | 2026-10-10 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A symphonic tribute concert celebrating the music and voice of Whitney Houston, performed at the Detroit Opera House.', venue_address_raw = '1526 Broadway St', venue_city_raw = 'Detroit', ticket_url = 'https://detroitopera.org' WHERE id = 'a189d289-2f09-4275-926a-4accaabd56e7';

-- KICK Invites: Circumscums, KINX | Vault313 (Highland Park) | 2026-10-10 Evening | confidence: generic | ticket_note: venue's Resident Advisor (RA) listing page
UPDATE events SET description = 'An underground/electronic music night at Vault313 in Highland Park, part of the KICK event series, featuring sets from Circumscums and KINX.', venue_address_raw = '16940 Hamilton Ave', venue_city_raw = 'Highland Park', ticket_url = 'https://ra.co/clubs/detroit/thevault313' WHERE id = 'c1f7587f-1f85-4c03-be78-0f111b23b693';

-- Paxahau presents: WESTEND | Russell Industrial Center | 2026-10-10 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'An electronic/dance music event produced by Paxahau, the Detroit-based promoter best known for organizing the annual Movement Electronic Music Festival, held at the Russell Industrial Center.', venue_address_raw = '1600 Clay St', venue_city_raw = 'Detroit', ticket_url = 'https://www.russellindustrialcenter.com' WHERE id = '126f6fab-4a08-4f00-a4b2-2c77de17bd9c';

-- BLUF DETROIT MONTHLY SOCIAL (1) | HALO Detroit | 2026-10-10 5:00 PM – 8:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A recurring monthly social gathering for the BLUF (Bikers/Leather/Uniform) community at HALO Detroit.', venue_address_raw = '8070 Greenfield Rd', venue_city_raw = 'Detroit', ticket_url = 'https://www.thehalodetroit.com' WHERE id = 'ba7a7811-4ed4-4e5d-aca5-3b1a741a9ad4';

-- HOT ASH CIGAR & PIPE SOCIAL | HALO Detroit | 2026-10-10 8:00 PM – 10:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A social gathering for cigar and pipe enthusiasts held at HALO Detroit.', venue_address_raw = '8070 Greenfield Rd', venue_city_raw = 'Detroit', ticket_url = 'https://www.thehalodetroit.com' WHERE id = '0a6baaa0-4ef6-42ec-87a1-e72fa6210543';

-- An American Werewolf in London (1981) | Redford Theatre | 2026-10-10 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'John Landis''s 1981 horror-comedy about two American backpackers attacked by a werewolf on the English moors, notable for its landmark practical transformation effects, screening at the Redford Theatre.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = '8f48e148-8f91-4c62-aaa1-2c0f42e68cdb';

-- Casper (1995) | Redford Theatre | 2026-10-10 2:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'The 1995 family film based on the Harvey Comics character Casper the Friendly Ghost, starring Christina Ricci and Bill Pullman, screening at the Redford Theatre.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = '83f11a91-15a9-4765-80f1-d45b2e170423';

-- Jazz Is Dead presents Cortex with Adrian Younge and J.Rocc | Lincoln Factory | 2026-10-11 Evening | confidence: researched | ticket_note: venue's official site/calendar; no confirmed specific ticket listing link found
UPDATE events SET description = 'Jazz Is Dead is a concert series and reissue label founded by composer/producer Adrian Younge and Ali Shaheed Muhammad that showcases classic jazz, funk, and soul artists in live performance. This date features French jazz-funk group Cortex — best known for their heavily-sampled 1975 album ''Troupeau Bleu'' — alongside Adrian Younge and DJ J.Rocc of the Beat Junkies.', venue_address_raw = '1331 Holden St', venue_city_raw = 'Detroit', ticket_url = 'https://thecrofoot.com/venues/lincoln-factory' WHERE id = '38ed8ec1-b194-4199-87b0-2f74bb31e920';

-- SLIFT | El Club | 2026-10-11 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Slift is a French psychedelic/space-rock trio from Toulouse known for expansive, heavy albums like ''Ummon'' and ''Ilion'' and for intense, immersive live shows.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = '028a6f4c-48bd-4cbf-8af2-121006b4d813';

-- Dana and Alden — Papa's Boat Tour | El Club | 2026-10-13 Evening | confidence: researched | ticket_note: venue's official site/calendar; specifics of 'Papa's Boat Tour' name not independently confirmed
UPDATE events SET description = 'Dana and Alden are a DJ and production duo known for melodic house and dance-music tracks and remixes, bringing a live DJ set to El Club as part of this tour.', venue_address_raw = '4114 W Vernor Hwy', venue_city_raw = 'Detroit', ticket_url = 'https://elclubdetroit.com' WHERE id = '12b4eef8-29dc-4507-ae14-51e10677ff6d';

-- Paxahau presents: Restricted | Russell Industrial Center | 2026-10-16 Evening | confidence: generic | ticket_note: venue's official site; Paxahau ticketing is typically at paxahau.com but not confirmed for this specific listing
UPDATE events SET description = 'Paxahau, the Detroit promoter behind Movement Festival, presents ''Restricted,'' an electronic/techno-focused nightlife event at the Russell Industrial Center, a historic industrial complex often used for large-scale dance events.', venue_address_raw = '1600 Clay St', venue_city_raw = 'Detroit', ticket_url = 'https://www.russellindustrialcenter.com' WHERE id = '9ea14d04-75ac-4d7d-9f59-d726a0dc7634';

-- MPH — Detroit, Forever | Venue TBA (Paxahau) | 2026-10-16 See paxahau.com | confidence: generic | ticket_note: no fixed venue announced; check Paxahau's own site/promotion channels
UPDATE events SET description = 'An electronic music event presented by Paxahau, Detroit''s noted techno/house promoter, featuring the artist MPH; the exact venue has not been publicly announced ahead of the show.', venue_address_raw = NULL, venue_city_raw = NULL, ticket_url = 'https://paxahau.com' WHERE id = '5eb30571-2484-4b5e-be27-9bf735471c3e';

-- TSU NAMI: Limerence Tour (360° DJ Experience) | Elektricity | 2026-10-16 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A nightlife event at Elektricity in Pontiac featuring DJ TSU NAMI''s ''Limerence'' tour stop, billed as a 360-degree immersive DJ experience/stage setup.', venue_address_raw = '15 S Saginaw St', venue_city_raw = 'Pontiac', ticket_url = 'https://www.elektricitymusic.com' WHERE id = 'a500f51a-7d17-4ce7-bf11-caee0e2c0f28';

-- Young Frankenstein (1974) | Redford Theatre | 2026-10-16 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Mel Brooks'' 1974 horror-comedy ''Young Frankenstein,'' starring Gene Wilder, Marty Feldman, Peter Boyle, and Madeline Kahn, lovingly spoofs the classic Universal Frankenstein films; screened as a revival showing at the Redford Theatre.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = '7fe72d98-65c3-46df-a94e-82a23bde5018';

-- Ballets Jazz Montréal | Detroit Opera House | 2026-10-17 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Les Ballets Jazz de Montréal (BJM) is a Montreal-based contemporary dance company known for athletic, genre-blurring repertory works that blend jazz, ballet, and modern dance, performing at the Detroit Opera House.', venue_address_raw = '1526 Broadway St', venue_city_raw = 'Detroit', ticket_url = 'https://detroitopera.org' WHERE id = '77d9a62e-e8f1-4e97-96e8-0582382f2ec2';

-- Paxahau presents: Walker & Royce | Lincoln Factory | 2026-10-17 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Walker & Royce are an American house-music DJ and production duo known for club tracks such as ''Slave to the Vibe'' and ''Bad Company''; Paxahau brings them to Lincoln Factory for this nightlife event.', venue_address_raw = '1331 Holden St', venue_city_raw = 'Detroit', ticket_url = 'https://thecrofoot.com/venues/lincoln-factory' WHERE id = '4bba1709-90ea-4e9b-9aa9-9239e4d1a8b7';

-- The Fly (1958) | Redford Theatre | 2026-10-17 2:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'The 1958 science-fiction horror classic ''The Fly,'' starring Vincent Price and David Hedison, follows a scientist whose teleportation experiment goes horrifyingly wrong; screened as part of the Redford Theatre''s classic film programming.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = '9d9abdce-2417-4709-8128-53fdcdd0ad08';

-- The Fly (1986) | Redford Theatre | 2026-10-17 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'David Cronenberg''s 1986 body-horror remake of ''The Fly'' stars Jeff Goldblum as a scientist whose teleportation experiment transforms him into a monstrous fly-human hybrid; screened as a Redford Theatre revival showing, paired on this date with the 1958 original.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = 'd5edc776-7dca-47b6-888d-5620bf38a093';

-- Double Feature: The Fog (1980) and Carnival of Souls (1962) Donor Event | Redford Theatre | 2026-10-22 7:00 PM | confidence: researched | ticket_note: venue's official site/calendar; donor events may have separate/restricted ticketing not reflected on the general site
UPDATE events SET description = 'A donor-appreciation double-feature screening at the Redford Theatre pairing John Carpenter''s 1980 ghost-story horror film ''The Fog'' with the 1962 independent cult classic ''Carnival of Souls.''', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = 'e608f317-562c-4d44-a98f-cf0e14a3b563';

-- Whethan — Warehouse.Wavs Tour | Majestic Theatre | 2026-10-23 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Whethan (Ethan Snoreck) is an American electronic-music producer known for future-bass/dance-pop tracks and collaborations with artists like Dua Lipa; this show brings his ''Warehouse.Wavs'' tour to the Majestic Theatre.', venue_address_raw = '4140 Woodward Ave', venue_city_raw = 'Detroit', ticket_url = 'https://www.majesticdetroit.com' WHERE id = 'b6c7a352-9b81-41ca-a2e7-a8c5544fa02b';

-- Paxahau presents: ACRAZE | Venue TBA (Paxahau) | 2026-10-23 See paxahau.com | confidence: researched | ticket_note: no fixed venue announced; check Paxahau's own site/promotion channels
UPDATE events SET description = 'ACRAZE is an American DJ/producer best known for the viral tech-house hit ''Do It To It''; Paxahau presents this club date at a venue to be announced closer to the show.', venue_address_raw = NULL, venue_city_raw = NULL, ticket_url = 'https://paxahau.com' WHERE id = '49060f26-b175-4191-b51f-14472d27ae78';

-- Anime Rave: Halloween Edition | Elektricity | 2026-10-23 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A Halloween-themed anime-music rave/club night at Elektricity, featuring DJ sets built around anime, video-game, and J-pop/electronic music with costume-friendly theming typical of anime rave events.', venue_address_raw = '15 S Saginaw St', venue_city_raw = 'Pontiac', ticket_url = 'https://www.elektricitymusic.com' WHERE id = '7a3b4a63-bdef-47f1-bc7a-102a6d1ff79d';

-- Wonkyween | Elektricity | 2026-10-24 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A Halloween-themed bass-music club night at Elektricity in Pontiac, with a name playing on ''wonky'' bass music styles.', venue_address_raw = '15 S Saginaw St', venue_city_raw = 'Pontiac', ticket_url = 'https://www.elektricitymusic.com' WHERE id = '62b45628-2650-44df-9a6c-b02ea91cf123';

-- The Unknown (1927) | Redford Theatre | 2026-10-24 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = '''The Unknown'' (1927) is a silent film directed by Tod Browning starring Lon Chaney as a knife-throwing circus performer hiding a dark secret, with a young Joan Crawford co-starring; screened as part of the Redford Theatre''s classic/silent film programming.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = '9031acab-e0cc-4eb4-a36a-b337e361e5fe';

-- Sick Gazelle (Doug McCombs, Steve Shelley, Bruce Lamont, Eric Block) | Trinosophes | 2026-10-25 7:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Sick Gazelle is an instrumental rock/experimental project featuring Doug McCombs (Tortoise, Eleventh Dream Day), Steve Shelley (Sonic Youth), Bruce Lamont (Yakuza, Corrections House), and Eric Block. The show brings this lineup of veteran Chicago/underground-rock musicians to Trinosophes, a Detroit venue known for adventurous jazz, experimental, and rock bookings.', venue_address_raw = '1464 Gratiot Ave', venue_city_raw = 'Detroit', ticket_url = 'https://trinosophes.com' WHERE id = 'fab5d0b8-a1d1-44bc-82ef-33d400d1095a';

-- The Occasional Thursday Party w/ DJ Craze + Friends | Marble Bar | 2026-10-29 Evening | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'DJ Craze is a Miami-based turntablist and three-time DMC World DJ Championship winner known for genre-blending sets spanning hip-hop, drum & bass, and dancehall/reggae. This date is part of Marble Bar''s recurring ''Occasional Thursday Party'' club night, with him joined by additional guest DJs.', venue_address_raw = '1501 Holden St', venue_city_raw = 'Detroit', ticket_url = 'https://themarblebar.com' WHERE id = '3d8d80ec-b706-47c8-b7a1-c8946f69e177';

-- Devault x Fallon | Venue TBA (Paxahau) | 2026-10-30 See paxahau.com | confidence: generic | ticket_note: no fixed venue announced; check Paxahau's site/promotion channels for venue and ticket details
UPDATE events SET description = 'A Paxahau-affiliated Detroit dance/techno event pairing DJs Devault and Fallon. As with a number of Paxahau''s shows, the exact venue is kept under wraps and only announced to attendees closer to the date.', venue_address_raw = NULL, venue_city_raw = NULL, ticket_url = 'https://paxahau.com' WHERE id = 'df885983-a8eb-41e0-a914-e3be4dd9d74c';

-- Samhain XXVI Weekend | Tangent Gallery | 2026-10-30 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A Halloween-season nightlife event at Tangent Gallery, part of the venue''s ''Samhain XXVI'' weekend of programming (the numbering implies a long-running annual series) spanning multiple nights and stages of dance/electronic and alternative music.', venue_address_raw = '715 E Milwaukee Ave', venue_city_raw = 'Detroit', ticket_url = 'https://tangentgallery.com' WHERE id = '7cc52aaf-f406-41f6-bc7d-8cfeef02a15f';

-- I.T. presents Beyond | Tangent Gallery | 2026-10-30 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A nightlife/DJ event billed as ''I.T. presents Beyond,'' held at Tangent Gallery as part of the venue''s Halloween-week lineup of electronic and underground dance programming.', venue_address_raw = '715 E Milwaukee Ave', venue_city_raw = 'Detroit', ticket_url = 'https://tangentgallery.com' WHERE id = 'f3b0ee4e-4767-4d8a-b176-a83f350ba0af';

-- Lucky Rabbit | Venue TBA (secret loft, revealed to ticket holders) | 2026-10-30 Evening | confidence: generic | ticket_note: no fixed venue announced (secret location revealed to ticket holders); check event's own promotion channels
UPDATE events SET description = 'Lucky Rabbit is a Devil''s Night-weekend nightlife/DJ event held at a secret loft location, with the address revealed only to ticket holders ahead of the show.', venue_address_raw = NULL, venue_city_raw = NULL, ticket_url = NULL WHERE id = '915467ae-512f-42dd-82d0-071578f5bfcf';

-- Choptober: Devils Night Edition | Elektricity | 2026-10-30 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A Devil''s Night-themed installment of the ''Choptober'' club night at Elektricity in Pontiac, part of the venue''s Halloween-week nightlife programming.', venue_address_raw = '15 S Saginaw St', venue_city_raw = 'Pontiac', ticket_url = 'https://www.elektricitymusic.com' WHERE id = '0464bc64-819d-4d80-8c49-449a83647183';

-- Scream (1996) | Redford Theatre | 2026-10-30 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Wes Craven''s 1996 slasher Scream, starring Neve Campbell, Courteney Cox, David Arquette, and Drew Barrymore, follows a masked killer stalking a small town and is widely credited with reviving and reinventing the teen-horror genre through its self-aware humor. It screens here as part of the Redford Theatre''s Halloween-season classic-film programming.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = '9fb3e195-eab4-407a-813e-9e5fe9974ff7';

-- Samhain XXVI | Tangent Gallery | 2026-10-31 Evening | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'The main Halloween-night installment of Tangent Gallery''s ''Samhain XXVI,'' a long-running annual multi-genre dance/electronic and alternative-music event held on Halloween itself.', venue_address_raw = '715 E Milwaukee Ave', venue_city_raw = 'Detroit', ticket_url = 'https://tangentgallery.com' WHERE id = '4987adf7-5add-4f98-94c6-d6fd9d4d1f02';

-- Grave Rave | Venue TBA (Detroit) | 2026-10-31 Evening | confidence: generic | ticket_note: no fixed venue announced; check event's own promotion channels
UPDATE events SET description = 'Grave Rave is a Halloween-night (Oct 31) club/dance event in Detroit, with the venue not publicly announced ahead of the show.', venue_address_raw = NULL, venue_city_raw = NULL, ticket_url = NULL WHERE id = '36fb66fb-6b14-4112-b262-bdb4653a5234';

-- Buffy the Vampire Slayer (1992) | Redford Theatre | 2026-10-31 2:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Buffy the Vampire Slayer (1992), written by Joss Whedon and starring Kristy Swanson as a high-school cheerleader chosen to fight vampires, predates and inspired the later TV series of the same name. It screens as part of the Redford Theatre''s Halloween-season programming.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = 'c1198c3a-273a-4dcb-8e7f-7fe23f4948dc';

-- Evil Dead 2 Dead by Dawn (1987) in 35mm | Redford Theatre | 2026-10-31 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Sam Raimi''s 1987 horror-comedy sequel Evil Dead II: Dead by Dawn stars Bruce Campbell as Ash Williams battling demonic forces in a remote cabin, blending splatter horror with slapstick comedy; it''s a cult classic being shown here in a 35mm print at the Redford Theatre.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = '5ad2d0ef-b09f-48b9-b515-0fb59c451c57';

-- Light in the Dark Musical Theatre Company Presents: Rocky Horror: Sweet Transvest-Night | Redford Theatre | 2026-11-06 8:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A live shadow-cast stage performance accompanying a screening of The Rocky Horror Picture Show, presented by the Light in the Dark Musical Theatre Company at the Redford Theatre, in the tradition of interactive Rocky Horror screenings with costumes, props, and audience participation.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = 'b84715ee-dbad-45e4-be65-0d2cb914e745';

-- BLUF DETROIT MONTHLY SOCIAL | HALO Detroit | 2026-11-14 5:00 PM – 8:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A recurring monthly social gathering for the BLUF (Boots, Leather, Uniform, Fetish) community, held at HALO Detroit, an LGBTQ+ nightlife venue.', venue_address_raw = '8070 Greenfield Rd', venue_city_raw = 'Detroit', ticket_url = 'https://www.thehalodetroit.com' WHERE id = '8498b5f8-832c-4e4b-9e1b-b303351e8e31';

-- HOT ASH CIGAR & PIPE SOCIAL | HALO Detroit | 2026-11-14 8:00 PM – 10:00 PM | confidence: generic | ticket_note: venue's official site/calendar
UPDATE events SET description = 'A cigar and pipe social gathering held at HALO Detroit.', venue_address_raw = '8070 Greenfield Rd', venue_city_raw = 'Detroit', ticket_url = 'https://www.thehalodetroit.com' WHERE id = '84820911-b116-4e6a-8c06-4cb2bd63bae0';

-- All About Eve (1950) | Redford Theatre | 2026-11-14 2:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Joseph L. Mankiewicz''s 1950 drama All About Eve stars Bette Davis as an aging Broadway star whose life is upended by an ambitious young admirer, Eve Harrington (Anne Baxter). The film won six Academy Awards, including Best Picture, and is regarded as a landmark of classic Hollywood cinema; it screens here as part of the Redford Theatre''s classic-film series.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = 'd6e4bf86-1cfc-4858-8ac0-9887c8724ce2';

-- The Departed (2006) | Redford Theatre | 2026-11-20 8:00 PM | confidence: researched | ticket_note: venue's official site/calendar
UPDATE events SET description = 'Martin Scorsese''s 2006 crime thriller The Departed, starring Leonardo DiCaprio, Matt Damon, and Jack Nicholson, follows an undercover cop and a mob-planted mole within the Boston police as each tries to uncover the other''s identity; it won the Academy Award for Best Picture. It screens as part of the Redford Theatre''s classic/repertory film series.', venue_address_raw = '17360 Lahser Rd', venue_city_raw = 'Detroit', ticket_url = 'https://redfordtheatre.com' WHERE id = '65a26fd5-24a2-4b7c-a356-d09fa46cac8a';
