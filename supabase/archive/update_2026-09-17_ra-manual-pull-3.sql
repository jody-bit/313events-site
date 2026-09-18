-- Manual Resident Advisor pull, 2026-09-17 (Jody: "check resident advisor").
-- Same policy as every prior RA file in this folder -- see update_2026-09-13/
-- 15/16's own headers and api/cron-halo.js's ("RA scraping remains off
-- limits per its Terms of Use") -- no automated crawler, a human-driven live
-- browser session against ra.co/events/us/detroit only, one event page at a
-- time via its own JSON-LD (script[type=application/ld+json]) rather than
-- parsed page text -- this is now the default technique for this recurring
-- task (see 2026-09-16's own notes on why).
--
-- SCOPE: 15 new event pages confirmed out of the listing's currently-visible
-- ~26 events (the rest were already in the DB from 2026-09-16's pull -- see
-- that file for their external_ids). No DataDome challenge was hit this
-- pass -- all 15 below were detail-confirmed one page at a time. Did not
-- click "Load more" past the first page of results, consistent with every
-- prior pull's scope.
--
-- Times: ra.co's own event pages display (and their JSON-LD startDate/
-- endDate fields carry) each event's venue-local time directly, not UTC --
-- same confirmed behavior as every prior pull, re-checked against this
-- pass's own first page (CARTOONS & STEREO's displayed "2:00 PM" doors).
--
-- Day-of-week sanity check: 17/18/19/20 Sept 2026 are Thu/Fri/Sat/Sun,
-- matching every one of ra.co's own displayed date labels below. Pull was
-- run live Thursday 2026-09-17, ~11:24 AM Detroit time -- both of today's
-- own events (ELIXIR THURS, Flavors) were still genuinely upcoming at pull
-- time, not yet started.
--
-- SERVICE AREA: three of these are outside Detroit proper but within the
-- project's own 75-mile radius (see SERVICE_AREA.md) -- Atonement wsg
-- Colliding Pins (Hamtramck), DJ MANDY: FALL TOUR 2026 (Pontiac, 25mi), and
-- The Outpost: Pleasure Cruise (Ferndale). venue_city_raw is set to each
-- venue's real city rather than blanket "Detroit" (RA's own addressRegion
-- field says "Detroit" for all of these regardless of actual city -- not
-- trusted for venue_city_raw, same lesson as every prior pull).
--
-- SECRET VENUES: Sleep Olympics and Texture // Decliner Release Party both
-- give "TBA" with no street address on their own ra.co pages -- same
-- intentional-secrecy pattern as Lucky Rabbit and the RA nightlife events
-- dismissed in earlier follow-up batches, not a parsing gap. venue_name_raw
-- records that plainly rather than leaving it blank with no explanation.
--
-- is_free: only CARTOONS & STEREO ("FREE ENTRY (DONATE AT DOOR)") and The
-- Outpost ("No Cover", explicit in its own description) have a real $0
-- tier -- those two are marked free. SHAKE DOWN, CORRUPTION: Remix Wars,
-- Atonement wsg Colliding Pins, DJ MANDY, ELIXIR THURS, and Flavors
-- currently have no ticket/price tier listed on ra.co at all -- left as
-- not-free/no price rather than guessed, same "don't guess" convention as
-- every other source in this project.
--
-- SECRET SETS (ra-2532512, Lincoln Factory, Fri 9/18): a second, distinct
-- event under this same recurring title at the same venue as the one noted
-- "dropped off the listing" in 2026-09-16's pull -- that was a different
-- event id/date; this is a new occurrence, not a resurrection of the old
-- one. Its own ra.co page has no description and no real event photo (its
-- JSON-LD image field is null and its og:image falls back to RA's generic
-- site logo) -- image_url left null rather than using that generic logo.
--
-- category: 'nightlife' for all 15, same project-wide convention as every
-- other Resident-Advisor-sourced row.
--
-- Idempotent: external_id makes this a stable upsert target, same pattern
-- as every cron/pull file here.

insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('ra-2502088', 'CARTOONS & STEREO VOL. 2: A SKATEBOARDING + MUSIC FESTIVAL',
 'Detroit''s independent, youth-driven skateboarding and music festival returns for a second edition after a successful 2025 debut.',
 'nightlife', 'Big Pink', '6440 Wight St', 'Detroit',
 '2026-09-19', '2026-09-20', '2:00 PM–12:00 AM', true, 0,
 'https://ra.co/events/2502088',
 'https://images.ra.co/3b7f6e0d9f707200c70707387846c5e12805f379.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2532237', 'SWAG: A JERK ERA PARTY (HIPHOP MUSIC)',
 'A 2009-throwback jerk-era hip hop party at Big Pink with DJ Mo Betta, sprng4evr, and Celex the DJ -- skinny jeans and snapbacks encouraged. 21+.',
 'nightlife', 'Big Pink', '6440 Wight St', 'Detroit',
 '2026-09-18', '2026-09-19', '10:00 PM–2:00 AM', false, 23.00,
 'https://ra.co/events/2532237',
 'https://images.ra.co/f6adf3d12bb5f31a5b5289a616abd5945cfd28a3.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2526468', 'Alternative School presents: BOUNCE THAT with DJ Assault',
 'The fourth BOUNCE THAT takes over two stages at Northern Lights Lounge, headlined by longtime Detroit dance music mainstay DJ Assault alongside DJ Psycho and Fullbodydurag, plus a patio set from Ember LaFiamma, Jamea, and We1sman.',
 'nightlife', 'Northern Lights Lounge', '660 W. Baltimore Street', 'Detroit',
 '2026-09-19', '2026-09-20', '10:00 PM–3:30 AM', false, 23.00,
 'https://ra.co/events/2526468',
 'https://images.ra.co/169990bf6dcd3f0c9624a1d1135d05b4f282c3e3.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2507381', 'Truncate - Julia Govor - JANSØ - Lincoln Factory',
 'Blank Code and The Lincoln Factory present a night of uncompromising techno with Truncate, Julia Govor, and JANSØ in one of Detroit''s intimate underground spaces.',
 'nightlife', 'Lincoln Factory', '1331 Holden Street', 'Detroit',
 '2026-09-19', '2026-09-20', '10:00 PM–5:00 AM', false, 34.50,
 'https://ra.co/events/2507381',
 'https://images.ra.co/af2331b71b43533c6d8fa86121ed80caab473bd7.png',
 'Resident Advisor', null, 'approved'),

('ra-2530518', 'Sleep Olympics 4 YEAR ANNIVERSARY w/ K''Alexi Shelby, DJ Cent, Body Mechanic',
 'Sleep Olympics marks four years of high-quality house and techno with Chicago jackmaster K''Alexi Shelby alongside Detroit stalwarts Body Mechanic and DJ Cent. Secret venue, disclosed to ticket holders.',
 'nightlife', 'TBA (secret venue, disclosed after ticket purchase)', null, 'Detroit',
 '2026-09-18', '2026-09-19', '10:00 PM–6:00 AM', false, 25.00,
 'https://ra.co/events/2530518',
 'https://images.ra.co/aede9af31529fccd9db9dedf5a0c4b4c56c145f9.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2460932', 'Texture // Decliner Release Party with Identified Patient',
 'Local techno act Decliner celebrates a forthcoming album with support from leftfield techno favorite Identified Patient. Secret venue, disclosed to ticket holders.',
 'nightlife', 'TBA (secret venue, disclosed after ticket purchase)', null, 'Detroit',
 '2026-09-19', '2026-09-20', '10:00 PM–6:00 AM', false, 20.00,
 'https://ra.co/events/2460932',
 'https://images.ra.co/f9f0f9cbdff65c7128175827acf111f2956f9612.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2536130', 'ELIXIR THURS: DR. Disko Dust + AIDEL',
 'Detroit DJ and Dolls Night Detroit co-founder AIDEL joins ELIXIR resident Dr. Disko Dust for a night blending disco, house, and techno.',
 'nightlife', 'Northern Lights Lounge', '660 W. Baltimore Street', 'Detroit',
 '2026-09-17', '2026-09-18', '8:00 PM–12:00 AM', false, null,
 'https://ra.co/events/2536130',
 'https://images.ra.co/991a81b832b88517082ad37b38889f683f213b0a.png',
 'Resident Advisor', null, 'approved'),

('ra-2533716', 'Flavors (staff appreciation night)',
 'Spkrbox marks 3 years downtown with a staff-appreciation edition of Flavors, featuring a guest set from ERNO alongside resident Gino.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-17', '2026-09-18', '10:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2533716',
 'https://images.ra.co/75d6cd799e224d27b18079a3d5c4fc9763a71b28.png',
 'Resident Advisor', null, 'approved'),

('ra-2516034', '3.1.3',
 'Sonotex Collective launches 3.1.3, an immersive audio-visual weekender assembling Detroit''s experimental vanguard at Andy Arts.',
 'nightlife', 'Andy Arts', '3000 Fenkell Ave', 'Detroit',
 '2026-09-18', '2026-09-19', '11:00 AM', false, 30.00,
 'https://ra.co/events/2516034',
 'https://images.ra.co/3ef41471815033c858e81cdbc861eee2f31629ba.png',
 'Resident Advisor', 'One-Day Pass price shown; event itself spans Fri 11am through Sat 11pm.', 'approved'),

('ra-2532512', 'SECRET SETS',
 null,
 'nightlife', 'Lincoln Factory', '1331 Holden Street', 'Detroit',
 '2026-09-18', '2026-09-19', '10:00 PM–4:00 AM', false, 11.50,
 'https://ra.co/events/2532512',
 null,
 'Resident Advisor', null, 'approved'),

('ra-2529208', 'SHAKE DOWN',
 'An evening at Roar Brewing Company blending ghettotech, hip-hop, and R&B with sets from Almighty Leo, Flexico, JMT, and Mykel Andre.',
 'nightlife', 'Roar Brewery Bar & Patio', '666 Selden St', 'Detroit',
 '2026-09-18', '2026-09-18', '8:00 PM–11:59 PM', false, null,
 'https://ra.co/events/2529208',
 'https://images.ra.co/8793a9c1e7242d040a1ced5608f1957571e6b295.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2520480', 'CORRUPTION: Remix Wars',
 'A night of industrial remixes and covers at Tangent Gallery, headlined by Remnant, with drinks from the venue''s steel apothecary bar.',
 'nightlife', 'Tangent Gallery', '715 E Milwaukee St', 'Detroit',
 '2026-09-18', '2026-09-19', '8:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2520480',
 'https://images.ra.co/fa45dca1c702aff7f74bbc9103c4217c5cb57ca3.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2521156', 'Atonement wsg Colliding Pins',
 'The September edition of Atonement brings Nick Burgess and collaborator Colliding Pins together for an extended back-to-back spanning techno, electro, IDM, and noise punk.',
 'nightlife', 'The Strays', '8850 Joseph Campau Ave', 'Hamtramck',
 '2026-09-18', '2026-09-19', '8:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2521156',
 'https://images.ra.co/52744f64d7e179425b740978e9381cc60fee8b30.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2495956', 'DJ MANDY: FALL TOUR 2026',
 'DJ Mandy''s Fall Tour 2026 stops at Elektricity in Pontiac, with support from juicy. 18+, doors at 9pm.',
 'nightlife', 'Elektricity', '15 South Saginaw Street', 'Pontiac',
 '2026-09-18', '2026-09-19', '9:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2495956',
 'https://images.ra.co/f301057b22c044641c4243ec979e7527bf90420c.png',
 'Resident Advisor', null, 'approved'),

('ra-2537997', 'The Outpost: Pleasure Cruise with DJ Rich Hansen',
 'An all-vinyl night of yacht rock, AOR, slow disco, and grown-folks jams at The Outpost in Ferndale. No cover.',
 'nightlife', 'Traverse City Whiskey Co. Outpost', '22812 Woodward Ave #200', 'Ferndale',
 '2026-09-18', '2026-09-18', '9:00 PM–11:59 PM', true, 0,
 'https://ra.co/events/2537997',
 'https://images.ra.co/38deec351755b552557239dac7eba7a3daa10fe1.jpg',
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

insert into schema_migrations (filename) values ('update_2026-09-17_ra-manual-pull-3.sql')
on conflict (filename) do nothing;
