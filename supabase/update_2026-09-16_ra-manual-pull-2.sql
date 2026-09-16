-- Manual Resident Advisor pull, 2026-09-16 part 2 (Jody: "check RA today
-- for new events"). Same policy as every prior RA file in this folder --
-- see update_2026-09-13/15's own headers and api/cron-halo.js's ("RA
-- scraping remains off limits per its Terms of Use") -- no automated
-- crawler, a human-driven live browser session against
-- ra.co/events/us/detroit only, one event page at a time.
--
-- SCOPE: the 2026-09-15 pull left 11 candidate titles detail-unconfirmed
-- after ra.co's DataDome bot-detection started challenging that browser
-- session partway through. This pass picked those 11 back up (10 still
-- upcoming; SECRET SETS at Lincoln Factory had dropped off the listing
-- entirely by today, presumably cancelled/removed -- not added), plus 3
-- more new titles that appeared on today's listing since. No challenge
-- was hit this time -- all 13 below were detail-confirmed one page at a
-- time, same as every prior pull.
--
-- Times: ra.co's own event pages display (and their JSON-LD startDate/
-- endDate fields carry) each event's venue-local time directly, not UTC --
-- confirmed by cross-checking the first page fetched (HIPHOP NIGHT)
-- against its own displayed "22:00 - 02:00" -- so no timezone conversion
-- was needed, same as reading the times straight off the page.
--
-- Same day-of-week sanity check as every pull since Jody's flagged
-- mismatch incident: 16/17/18/19 Sept 2026 are Wed/Thu/Fri/Sat, matching
-- every one of ra.co's own displayed date labels below exactly.
--
-- Four of these (Penthousepartiii, Low End Theory, Nightcap Detroit,
-- Planet Funk -- all Wed 9/16, i.e. tonight) were still genuinely upcoming
-- at pull time (confirmed against the live site's own current-time
-- signal, ~5:18pm Detroit) -- none had already started.
--
-- is_free: only HIPHOP NIGHT has a real $0 "FREE ENTRY (FIRST COME FIRST
-- SERVE)" ticket tier on its own page -- that one's marked free. Several
-- others (Interface, Groove Night, Nightcap Detroit, Planet Funk)
-- currently have no ticket/price tier listed on ra.co at all -- left as
-- not-free/no price rather than guessed at either way, same "don't guess"
-- convention as every other source in this project.
--
-- Planet Funk's own ra.co listing gives it an unusually long window (7:00
-- PM today through 10:00 PM tomorrow) -- reproduced as-is from their own
-- page rather than corrected, since there's no way to tell from here
-- whether that's a real all-day/residency format or a listing quirk on
-- their end.
--
-- category: 'nightlife' for all 13, same project-wide convention as every
-- other Resident-Advisor-sourced row.
--
-- Idempotent: external_id makes this a stable upsert target, same pattern
-- as every cron/pull file here.

insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('ra-2533999', 'HIPHOP NIGHT: DJ KDIRTY + DJ CARTER (HIPHOP CLUB BANGERS)',
 'Big Pink''s official Cartoons & Stereo afterparty -- hip hop and club bangers from open to close. Free entry, first come first served. 21+.',
 'nightlife', 'Big Pink', '6440 Wight St', 'Detroit',
 '2026-09-19', '2026-09-20', '10:00 PM–2:00 AM', true, null,
 'https://ra.co/events/2533999',
 'https://images.ra.co/427239be3f6feb833568ab4567504259dba14c5f.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2523930', 'A BIG A$$ PARTY: shekdash, AK, Disc Jockey George b2b JMT',
 'Techno night at TV Lounge headlined by rising producer Shekdash, alongside Movement veterans AK, Disc Jockey George, and JMT.',
 'nightlife', 'TV Lounge', '2548 Grand River Avenue', 'Detroit',
 '2026-09-19', '2026-09-20', '9:00 PM–2:00 AM', false, 23.00,
 'https://ra.co/events/2523930',
 'https://images.ra.co/e70da4993b2f25d287768c52fbf9f5befe75ad72.png',
 'Resident Advisor', null, 'approved'),

('ra-2536892', 'FIESTA HOUSE',
 'Latin and global club night at Marble Bar marking the start of Hispanic Heritage Month -- two stages of reggaeton, Latin house, dembow, cumbia, and ghetto tech, plus late-night tacos.',
 'nightlife', 'Marble Bar', '1501 Holden St', 'Detroit',
 '2026-09-19', '2026-09-20', '10:00 PM–4:00 AM', false, 11.50,
 'https://ra.co/events/2536892',
 'https://images.ra.co/95bbeafc294632a70028c076361be46caff7bf76.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2511471', 'thrg pres. CAM GIRL, Spray, Father Dukes, Candor, SYD, & Nico',
 'Two-stage showcase at Marble Bar headlined by CAM GIRL and Spray, with support from Father Dukes, Candor, SYD, and thrg resident Nico.',
 'nightlife', 'Marble Bar', '1501 Holden St', 'Detroit',
 '2026-09-18', '2026-09-19', '9:00 PM–4:00 AM', false, 23.00,
 'https://ra.co/events/2511471',
 'https://images.ra.co/3840009cd19c0f2e28b8efb4c5c5ee4269bc0b38.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2532529', 'TOP2BTTM presents: OPEN CALL',
 'Queer nightlife party at The Eagle of Detroit hosted by WE1SMAN and resident Kanary -- underwear contest with cash prizes, drag performances, and dance music.',
 'nightlife', 'The Eagle of Detroit', '950 West McNichols', 'Detroit',
 '2026-09-18', '2026-09-19', '11:00 PM–4:00 AM', false, 5.00,
 'https://ra.co/events/2532529',
 'https://images.ra.co/17a5bf058f2ed1128d2674f3b81030fb7c902f02.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2536273', 'Ember',
 'A night at Spkrbox featuring a DJ set from Stretch.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-18', '2026-09-19', '10:00 PM–2:00 AM', false, 11.20,
 'https://ra.co/events/2536273',
 'https://images.ra.co/e027654b46e271a9e96c599af40e78ca8d37abf5.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2536271', 'Interface',
 'A night at Spkrbox featuring a DJ set from Dj Disc.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-18', '2026-09-19', '10:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2536271',
 'https://images.ra.co/11b16cd164d568bda7415ce8ea13e0a43e938393.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2536214', 'Groove Night',
 'A recurring groove/house night at Spkrbox, hosted by SPKRBOX Presents.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-17', '2026-09-18', '10:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2536214',
 'https://images.ra.co/d5314db2f77f62ed552bec82345a44a7b6463c57.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2538093', 'small talk with britty. & BeatLoaf',
 'britty. and BeatLoaf (together, "brittloaf") play a new monthly patio session at Marble Bar.',
 'nightlife', 'Marble Bar', '1501 Holden St', 'Detroit',
 '2026-09-17', '2026-09-18', '9:00 PM–3:00 AM', false, 5.50,
 'https://ra.co/events/2538093',
 'https://images.ra.co/24b3203bfebe1e4d271d6a17d1cb82e37505be22.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2538238', 'Penthousepartiii',
 'Live DJ session at Bankle Art Gallery on Woodward, featuring Disc Jockey George and JMT.',
 'nightlife', 'Bankle Building', '2944 Woodward Avenue', 'Detroit',
 '2026-09-16', null, '8:00 PM–10:00 PM', false, null,
 'https://ra.co/events/2538238',
 'https://images.ra.co/135a2bc3435ab2fce675145bcbf89a37fc22e68c.png',
 'Resident Advisor', null, 'approved'),

('ra-2536213', 'Low End Theory',
 'A night at Spkrbox featuring a DJ set from BLAAQGOLD.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-16', '2026-09-17', '10:00 PM–2:00 AM', false, 11.20,
 'https://ra.co/events/2536213',
 'https://images.ra.co/2d876695eeccd8230636e3b39caea2869333b32b.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2536212', 'Nightcap Detroit',
 'Nightcap Detroit at Spkrbox, hosted by Detroit Vinyl Room, featuring a DJ set from Isaac Prieto.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-16', '2026-09-17', '11:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2536212',
 'https://images.ra.co/cef54c8192296a0ae92fe79e9159deca8e86ba6d.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2536211', 'Planet Funk',
 'Planet Funk at Spkrbox, hosted by SPKRBOX Presents.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-16', '2026-09-17', '7:00 PM', false, null,
 'https://ra.co/events/2536211',
 'https://images.ra.co/79572d5fde8d43c4f91d9f901fc3e71fc39b5a62.jpg',
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

insert into schema_migrations (filename) values ('update_2026-09-16_ra-manual-pull-2.sql')
on conflict (filename) do nothing;
