-- RA pull batch 2 of ~10, 2026-09-20 (continuing update_2026-09-20_ra-manual-pull-7.sql).
--
-- Two of this batch's 10 IDs were deliberately skipped, not overlooked:
--   - ra-2535766 "[CANCELLED] The Drexciyan Empire..." -- RA's own page
--     title is prefixed [CANCELLED]. Never added; nothing to add, it's not
--     happening.
--   - ra-2485347 "A Dub Supreme" at MotorCity Wine, 2026-09-27 -- already
--     live in the DB (external_id currently null, presumably from
--     cron-motorcitywine.js's own pull) under the exact same title/date/
--     venue. Adding it again as ra-2485347 would create a duplicate; left
--     as-is rather than merged, since the existing row isn't this file's to
--     touch and merging it is a separate, deliberate task like the Numa
--     Crew merge was.
--
-- venue_name_raw for two events below is "Location TBA" -- RA's own page
-- has no venue named/confirmed yet for these; a genuine visitor-facing
-- caveat is set on `note` for both (not internal_note -- this is real,
-- useful information for anyone looking at the listing, same pattern as
-- ra-2524313 from the September 18 note-leak fix).
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('ra-2539079', 'BerettaMusic & Roar Brewing: Pop-up Market',
 'House music (Marcus NF Harris, DJ Ryte Nou, Ryan Sadorus) plus a pop-up market of local vendors on the patio -- food, sweets, handmade goods. All ages welcome.',
 'community', 'Roar Brewing', '666 Selden Street, Suite B', 'Detroit',
 '2026-09-26', '2026-09-26', '1:00 PM–5:00 PM', false, null,
 'https://ra.co/events/2539079',
 'https://images.ra.co/dfdfb2cfa1c2c7c3665bea8dea593c0b8f37d70f.png',
 'Resident Advisor', null, 'approved'),

('ra-2501462', 'Sunset Sessions w/ Andre Terrell',
 'An evening of cocktails, community, and house music with Andre Terrell, bringing together professionals, creatives, and neighborhood residents.',
 'community', 'Cannons', '15421 Mack Ave', 'Detroit',
 '2026-09-26', '2026-09-26', '6:00 PM–10:00 PM', false, 5.50,
 'https://ra.co/events/2501462',
 'https://images.ra.co/65a0f705b8b91e281a4ecd30c49c98076bb076fb.jpg',
 'Resident Advisor', 'Early bird tickets have sold out -- check RA for current pricing.', 'approved'),

('ra-2529036', 'The Sponges',
 'The Sponges, with support from N2N, Dino Munaco, and Gina Maria, at the Magic Stick. 18+.',
 'music', 'Magic Stick', '4120-4140 Woodward Avenue', 'Detroit',
 '2026-09-26', '2026-09-27', '9:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2529036',
 'https://images.ra.co/b4344009f387bf747f5f337cef6bb9f119a1b771.png',
 'Resident Advisor', null, 'approved'),

('ra-2525678', 'Day/Care',
 'A Sunday day party built around play and connection for Detroit''s queer and minority communities -- DJs, interactive experiences, and community-building beyond just dancing.',
 'community', 'Location TBA', null, 'Detroit',
 '2026-09-27', '2026-09-27', '2:00 PM–8:00 PM', false, 20.00,
 'https://ra.co/events/2525678',
 'https://images.ra.co/eb52d04916698f0dded413f4ac4f313a0d8edb2c.jpg',
 'Resident Advisor', 'Venue location not yet announced by the event.', 'approved'),

('ra-2529778', 'Theresa Hill presents Gospel House 313',
 'Gospel House 313 returns to TV Lounge with Theresa Hill and Terrence Parker -- soulful house grooves and gospel vocals for a Sunday-morning dance party, with complimentary breakfast bites.',
 'nightlife', 'TV Lounge', '2548 Grand River Avenue', 'Detroit',
 '2026-09-27', '2026-09-27', '10:00 AM–2:00 PM', false, 23.00,
 'https://ra.co/events/2529778',
 'https://images.ra.co/73cc5d5f785b466db15d04bfdb6c35cd17b18eef.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2504589', 'The House of Tarot',
 'An immersive exhibition of large-scale installations, projection mapping, sculpture, and live performance at MAD Arts, built around tarot archetypes as physical spaces. This date is opening weekend; performance artist Zarah Ackerwoman opens as The Magician.',
 'visual', 'MAD Arts', '560 Custer Street', 'Detroit',
 '2026-10-01', '2026-10-01', '6:00 PM–10:00 PM', false, 12.65,
 'https://ra.co/events/2504589',
 'https://images.ra.co/ec129c6249b3a97f3b57fd2de6d5cbed031600f2.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2518556', 'The Holodeck',
 'A quarterly community-built party, back for another edition, with DJ Holographic, ASL Princess, and Chachi Guerrero.',
 'nightlife', 'Location TBA', null, 'Detroit',
 '2026-10-02', '2026-10-03', '11:00 PM–6:00 AM', false, 25.00,
 'https://ra.co/events/2518556',
 'https://images.ra.co/e6086d1dce1d56e386a60e9f84ade6af33660e11.jpg',
 'Resident Advisor', 'Venue location not yet announced by the event.', 'approved'),

('ra-2540893', 'High Energy Booty Music: Nanoos b2b Sheefy McFly, FUL-MT & Mondai',
 'Ghettotech and dance music from Nanoos b2b Sheefy McFly, FUL-MT (fullbodydurag & JMT), and Mondai. 21+.',
 'nightlife', 'Big Pink', '6440 Wight St', 'Detroit',
 '2026-10-02', '2026-10-03', '10:00 PM–2:00 AM', true, null,
 'https://ra.co/events/2540893',
 'https://images.ra.co/69b6da920c3874fa4089950d599c0e10c3c77dec.jpg',
 'Resident Advisor', 'Free entry, first come first served.', 'approved')

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

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-20_ra-manual-pull-8.sql')
on conflict (filename) do nothing;
