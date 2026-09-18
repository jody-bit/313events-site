-- Manual Resident Advisor pull, 2026-09-18 part 2 (Jody: "I do want you to
-- add what you can from RA for all of the events and then try recrawling
-- again"). Same no-automated-crawler / one-page-JSON-LD-at-a-time policy
-- as every prior RA file. The 9/18 session that only got "MAD presents:
-- The Big One" (see update_2026-09-18_ra-manual-pull-4.sql) cleared on
-- retry a bit later -- both the plain listing page and individual event
-- pages loaded normally again, so this pass picked up 20 more of the
-- ~27 candidates spotted on that first sweep (through 9/25, plus VINDICATE
-- 006 and Texture on 9/25) before the session got challenged again partway
-- through. Still outstanding: 12 Hour Party (a 9/25 recurrence, distinct
-- from the 8/29 one already in the database), Ms. Nina with SWDEJAY and
-- Psy-Chick, DJ Rozwell, Hottie's World, NICE TIME, G.E.D., RIDDIM
-- RESTAURANT, Club 1BD, and LATIN NIGHT: DJ IZA & SWDJEY -- all from
-- Friday 9/25 or Saturday 9/26 -- reported separately, not guessed at
-- from listing-page text.
--
-- Times are ra.co's own venue-local startDate/endDate from each event's
-- JSON-LD, same as every prior pull -- no timezone conversion needed.
-- venue_city_raw is corrected against the street address in each event's
-- own JSON-LD, not the (unreliable) addressRegion field, which says
-- "Detroit" even for the Pontiac, Royal Oak, Ferndale, and Hamtramck
-- venues below -- same caveat as every prior pull.
--
-- is_free / price_from only set when an event's own JSON-LD offers a real
-- $0 tier or its description says so explicitly (Blue Bird Inn Annual
-- BBQ, The Outpost: Aaron Halfacre, YOUNG MONEY NIGHT) -- events with a
-- "free before X" partial-free line (NOIRTEK, CRANKED) are left as
-- not-free with whatever ticket price is shown, same "don't guess"
-- convention as every other source in this project.
--
-- category: 'nightlife' for all of these except Blue Bird Inn Annual BBQ,
-- which is a 2-5pm community/heritage event (hard-hat tour of the venue's
-- restoration, live jazz from the Blue Bird Collective) rather than a
-- club night -- categorized 'community' instead, a deliberate deviation
-- from the usual blanket-nightlife convention for RA-sourced rows.
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('ra-2530554', 'ISMOS presents: ABSTRACT',
 'ISMOS label showcase marking the arrival of its first various-artists compilation, ABSTRACT VOL. I, on a Funktion-One sound system -- curated by Detroit artist and ISMOS founder RN ISMO, moving through minimal, deep tech, and house.',
 'nightlife', 'TBA - 51 Harper Ave', '51 Harper Ave', 'Detroit',
 '2026-09-19', '2026-09-20', '7:00 PM–12:30 AM', false, null,
 'https://ra.co/events/2530554',
 'https://images.ra.co/7744d036df8c77745fef40d052c191f8657dabf2.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2527427', 'Body Worx wsg Brenner (Headcleaner - Columbus, OH)',
 'Body Worx brings in Headcleaner''s Brenner to uncover molten acid house at Temple Bar, alongside Dretraxx.',
 'nightlife', 'Temple Bar', '2906 Cass Avenue', 'Detroit',
 '2026-09-19', '2026-09-20', '9:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2527427',
 'https://images.ra.co/2fadc695d4d71750170854d1833eea5f93039d6b.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2527957', 'DANCE FACTORY',
 'Machine-funk night at The Eagle of Detroit (also known as DANCE FACTORY) from ang31t3ch and Wax Assassin.',
 'nightlife', 'The Eagle of Detroit', '950 West McNichols', 'Detroit',
 '2026-09-19', '2026-09-20', '11:00 PM–5:00 AM', false, 5.00,
 'https://ra.co/events/2527957',
 'https://images.ra.co/6b244a25cc46b1a8890b7eb72e81f33450b61c24.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2529728', 'Blue Bird Inn Annual BBQ',
 'Detroit Sound Conservancy''s annual community BBQ at the Blue Bird Inn -- live music from the Blue Bird Collective (Naima Shamborguer, Ingrid Racine, Pamela Wise, Marion Hayden, Gayelynn McKinney) carrying on the venue''s house-band jazz legacy, plus a hard-hat tour of the restoration in progress. Free with RSVP.',
 'community', 'Blue Bird Inn', '5021 Tireman Ave', 'Detroit',
 '2026-09-19', null, '2:00 PM–5:00 PM', true, null,
 'https://ra.co/events/2529728',
 'https://images.ra.co/afde2855767536c52ed38c69e40706b5072d6bc4.png',
 'Resident Advisor', null, 'approved'),

('ra-2536279', '3K Techno',
 'Techno night at Spkrbox with Milan Ariel and YerikODJ.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-19', '2026-09-20', '10:00 PM–2:00 AM', false, 11.20,
 'https://ra.co/events/2536279',
 'https://images.ra.co/f7d3cf7a8b1d4b13c8a05313d2bd39588de688a7.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2528897', 'DNB DEPOT',
 'Drum and bass night at Elektricity''s patio with Parallax and Sinister Dosage. 18+.',
 'nightlife', 'Elektricity', '15 S. Saginaw St', 'Pontiac',
 '2026-09-19', '2026-09-20', '9:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2528897',
 'https://images.ra.co/77509b10eda13216fa7ab7daff955607f20c126b.png',
 'Resident Advisor', null, 'approved'),

('ra-2536276', 'Drama',
 'A night at Spkrbox featuring a DJ set from Tylr.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-19', '2026-09-20', '10:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2536276',
 'https://images.ra.co/1038a21e068668096d510b65ab9a2982195baafa.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2540217', 'PEEP',
 'PEEP arrives at Pronto Royal Oak -- DJ Anti with gogo dancer Koby Kruze and Michigan''s Alternative Entertainer of the Year Sir Gin.',
 'nightlife', 'Pronto Royal Oak', '608 Washington Ave', 'Royal Oak',
 '2026-09-19', '2026-09-20', '8:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2540217',
 'https://images.ra.co/0a08f6536a0d52026124c4814e1bad0c66cb5390.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2537140', 'NOIRTEK',
 'A night at TBA venue The Social Brew. Free before 11PM.',
 'nightlife', 'TBA - The Social Brew', null, 'Detroit',
 '2026-09-19', '2026-09-20', '10:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2537140',
 'https://images.ra.co/2c88b88fcef5e0f1e7048e8da65bb9b672aa4a27.png',
 'Resident Advisor', null, 'approved'),

('ra-2538000', 'The Outpost: Aaron Halfacre',
 'All-vinyl night of rare groove, funk, soul, and jazz at Traverse City Whiskey Co. Outpost in Ferndale. No cover.',
 'nightlife', 'Traverse City Whiskey Co. Outpost', '22812 Woodward Ave #200', 'Ferndale',
 '2026-09-19', null, '9:00 PM–11:59 PM', true, null,
 'https://ra.co/events/2538000',
 'https://images.ra.co/5d1ef8189fa18e06cf690f1b84b11945d99f0e24.png',
 'Resident Advisor', null, 'approved'),

('ra-2536283', 'Domingo',
 'A night at Spkrbox with SWDEJAY and Pressure.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-20', '2026-09-21', '10:00 PM–2:00 AM', false, 11.20,
 'https://ra.co/events/2536283',
 'https://images.ra.co/ee89b6a060e7161c5ebbdc4c1941f1f91ec66098.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2536282', 'Foggy Sunday',
 'A night at Spkrbox with Tylr and steph szud.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-20', '2026-09-21', '10:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2536282',
 'https://images.ra.co/64c95237e8701bef2bc7e6ca5fab471c875394d2.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2536281', 'SPKR BRNCH',
 'Sunday brunch session at Spkrbox: The Big Man Restless.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-20', null, '11:00 AM–3:00 PM', false, null,
 'https://ra.co/events/2536281',
 'https://images.ra.co/645066f81e23b43723c8b483dc6c9217d889d618.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2529556', 'Natural Blk Invention / Pumpy / Nicole Alonso / Sean Monaghan',
 'Ambient and experimental electronic showcase at Moondog Cafe -- Natural Blk Invention''s heart-core dub style, Pumpy''s dense collage rhythms, Nicole Alonso''s unconventional sampling, and Sean Monaghan''s homemade Raspberry Pi instruments and modular synthesis.',
 'nightlife', 'Moondog Cafe', '8045 Linwood St #2', 'Detroit',
 '2026-09-21', '2026-09-21', '7:00 PM–10:00 PM', false, 11.50,
 'https://ra.co/events/2529556',
 'https://images.ra.co/fda7f101c72cdd211b39a2727223a6458f90ca53.png',
 'Resident Advisor', null, 'approved'),

('ra-2534879', 'CRANKED',
 'Debut of M00N-Pi''s fall/winter party series CRANKED at Menjo''s -- regional club, juke, ballroom, techno, and footwork. Free before 11.',
 'nightlife', 'Menjo''s', '928 W. McNichols Rd', 'Detroit',
 '2026-09-24', '2026-09-25', '10:00 PM–2:00 AM', false, 5.00,
 'https://ra.co/events/2534879',
 'https://images.ra.co/6026d76fc402f0e53f3ff167db0cb05032fa495d.png',
 'Resident Advisor', null, 'approved'),

('ra-2534859', 'LLORA LIVE',
 'A night at The Strays in Hamtramck with Kenjiro.',
 'nightlife', 'The Strays', '8850 Joseph Campau Ave', 'Hamtramck',
 '2026-09-24', null, '7:00 PM–11:59 PM', false, 23.00,
 'https://ra.co/events/2534859',
 'https://images.ra.co/044316b6f1ef8c23ae7bff08752d965666c195b8.png',
 'Resident Advisor', null, 'approved'),

('ra-2535308', 'Techno Thursday: 313 Trenches',
 'Techno Thursday at Marble Bar -- Signal Authority (Shawescape Renegade & DJ Ace) 2x4 debut, plus Tommie Cool.',
 'nightlife', 'Marble Bar', '1501 Holden St', 'Detroit',
 '2026-09-24', '2026-09-25', '9:00 PM–2:00 AM', false, 5.50,
 'https://ra.co/events/2535308',
 null,
 'Resident Advisor', null, 'approved'),

('ra-2534008', 'YOUNG MONEY NIGHT: LIL WAYNE, NICKI MINAJ & MORE (DJ TAY MADE + MORE)',
 'Big Pink''s Young Money night returns for round 2 -- hits from Lil Wayne, Drake, Nicki Minaj, and more. Limited free tickets, skip the cover. 21+.',
 'nightlife', 'Big Pink', '6440 Wight St', 'Detroit',
 '2026-09-25', '2026-09-26', '10:00 PM–2:00 AM', true, null,
 'https://ra.co/events/2534008',
 'https://images.ra.co/c1cb9ca76227154e12efdc488877811721fa5054.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2486512', 'Texture with Andy Martin + Belle Island in Room 2',
 'Texture showcase with Andy Martin, sts, Loren, Tammy Lakkis, Father Dukes, Ryan Spencer, Green River Haze, and Adri, plus a second room from Belle Island.',
 'nightlife', 'TBA', null, 'Detroit',
 '2026-09-25', '2026-09-26', '7:00 PM–6:00 AM', false, 18.00,
 'https://ra.co/events/2486512',
 'https://images.ra.co/256b4f0beab2c0efcf6111d91f2c871665cce5ed.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2535594', 'VINDICATE 006 - Hard Techno, Schranz & Groove',
 'Vindicate collective''s sixth gathering marking six months of hard techno, schranz, and groove -- 88 MPH, Austin Buck, J AE G U AR, and BOYD b2b J/T. Free entry for the first 100 guests before 11pm. Location sent day-of.',
 'nightlife', 'TBA', null, 'Detroit',
 '2026-09-25', '2026-09-26', '9:00 PM–2:00 AM', false, 11.50,
 'https://ra.co/events/2535594',
 'https://images.ra.co/2c608d19145cef860c3f80d1c7193f95f96d300b.jpg',
 'Resident Advisor', null, 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  venue_address_raw = excluded.venue_address_raw,
  venue_city_raw = excluded.venue_city_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  is_free = excluded.is_free,
  price_from = excluded.price_from,
  ticket_url = excluded.ticket_url,
  image_url = excluded.image_url,
  note = excluded.note;

-- Same generic name-match backfill as every other new-events file here --
-- only touches venue_id is null rows, safe to re-run.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-18_ra-manual-pull-5.sql')
on conflict (filename) do nothing;
