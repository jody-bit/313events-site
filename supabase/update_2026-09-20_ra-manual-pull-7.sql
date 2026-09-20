-- Automated RA pull batch 7 of ~10, 2026-09-20 (Jody: "we need to do another
-- pull today" -- RA's Detroit listing page wasn't DataDome-blocked today, so
-- this is a real pull, not a manual-screenshot workaround. Found via RA's own
-- "Load more" pagination link (?page=N), which is what actually loads more
-- results -- window scroll does not trigger it).
--
-- 119 of RA's reported "122 upcoming events" loaded before the Load More
-- link disappeared; cross-checked against the 54 ra-* rows already live in
-- the DB -- 100 are new. This is batch 1 of 10 (10 events each), pulled one
-- event page's own JSON-LD at a time, no guessing.
--
-- Descriptions: several of RA's own event pages carry very long promotional
-- copy (hundreds of words). Where that's the case, the description below is
-- a condensed, fact-only summary of RA's actual text (not invented) rather
-- than the full copy, since a full wall of promotional text isn't practical
-- for a public listing card. Short RA descriptions are kept close to verbatim.
--
-- price_from/ticket_url: where RA's page shows no "offers" (no public ticket
-- price listed), price_from is left null and ticket_url points at the RA
-- event page itself (ra.co is the actual source to check for door price /
-- ticket status) -- consistent with how prior pulls (ra-2529033, ra-2539083,
-- ra-2533789 etc.) handled the same situation. No "no price shown"-type
-- commentary goes in the public `note` field -- that's an internal-note-only
-- observation per the note-leak fix from earlier today
-- (update_2026-09-18_fix-public-note-leaks.sql).
--
-- venue_city_raw is taken from the actual street address RA shows, not from
-- RA's own addressRegion field -- RA labels every Detroit-metro event
-- "Detroit" as its region regardless of the real city (e.g. Hamtramck,
-- Royal Oak), so the street address is the more accurate source.
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, status
) values

('ra-2538753', 'D.N/A',
 'Dancing + Non-alcoholic party returns to The Outer Limits Lounge, just outside Hamtramck. So.Bar''s non-alcoholic menu, with residents kittyqueef:3 and Aidel (Doll''s Night co-founder).',
 'nightlife', 'Outer Limits Lounge', '5507 Caniff St', 'Hamtramck',
 '2026-09-24', '2026-09-25', '8:00 PM–12:00 AM', false, null,
 'https://ra.co/events/2538753',
 'https://images.ra.co/d068d0c61caa0300aff2b7f58d2c4777f0100501.jpg',
 'Resident Advisor', 'approved'),

('ra-2541282', 'ELIXIR: Dr. Disko Dust, Phunhouse',
 'Cosmic disco, acid house, Detroit electro, and techno at Northern Lights Lounge with Dr. Disko Dust and DJ Phunhouse.',
 'nightlife', 'Northern Lights Lounge', '660 W. Baltimore Street', 'Detroit',
 '2026-09-24', '2026-09-25', '8:00 PM–12:00 AM', false, null,
 'https://ra.co/events/2541282',
 'https://images.ra.co/131bc1ce6dcd95e4bdb812132492b5006a146cfd.jpg',
 'Resident Advisor', 'approved'),

('ra-2485304', 'Hector Romero does TV',
 'New York house music veteran Hector Romero (Def Mix) headlines, with Boston''s Susan Esthera, Detroit''s sillygirlcarmen, and Detroit favorite Bruce Bailey. Soulful and Afro house all night at TV Lounge.',
 'nightlife', 'TV Lounge', '2548 Grand River Avenue', 'Detroit',
 '2026-09-25', '2026-09-26', '9:00 PM–2:00 AM', false, 17.25,
 'https://ra.co/events/2485304',
 'https://images.ra.co/c1315ba628a5b74849c368216228ac744358236d.jpg',
 'Resident Advisor', 'approved'),

('ra-2504230', 'Sanctuary: Descent',
 'Three connected queer-focused clubs and ten hours of techno, house, and hypnotic grooves across multiple rooms for the autumn equinox. Sliding-scale advance pricing from $10 (Community Access) up to $50 (Supporter); full price at the door is $40.',
 'nightlife', 'Menjo''s', '928 W. McNichols Rd', 'Detroit',
 '2026-09-26', '2026-09-27', '10:00 PM–8:00 AM', false, 10.00,
 'https://ra.co/events/2504230',
 'https://images.ra.co/c8801797d1dc1eba54059e2964785b9d11ea5529.png',
 'Resident Advisor', 'approved'),

('ra-2467520', 'SHDW (Mutual Rytm) & Redax (Urban Pulse) Extended Sets',
 'Urban Pulse x Mutual Rytm 3-year anniversary show at Tangent Gallery. SHDW (Mutual Rytm) and Redax (Urban Pulse) both playing extended sets, 9PM-4AM.',
 'nightlife', 'Tangent Gallery', '715 E Milwaukee St', 'Detroit',
 '2026-09-26', '2026-09-27', '9:00 PM–4:00 AM', false, 34.50,
 'https://ra.co/events/2467520',
 'https://images.ra.co/93a7c9ba95fabad1702a614adad458c6d01aea57.jpg',
 'Resident Advisor', 'approved'),

('ra-2525286', 'JUDY',
 'Long-running house party from Rimarkable and LADYMONIX celebrating Detroit house and disco. This month''s guest: YASMEENAH, founder of Minneapolis''s UNBOTHERED and a member of Detroit''s Blueprint crew.',
 'nightlife', 'Northern Lights Lounge', '660 W. Baltimore Street', 'Detroit',
 '2026-09-26', '2026-09-27', '9:00 PM–2:00 AM', false, 20.00,
 'https://ra.co/events/2525286',
 'https://images.ra.co/117723f860bf4d749f4493300a5eaf9c5297a390.jpg',
 'Resident Advisor', 'approved'),

('ra-2501200', 'Eddie Fowlkes',
 'Eddie Fowlkes with JMT at TV Lounge. Doors at 9pm, 21+.',
 'nightlife', 'TV Lounge', '2548 Grand River Avenue', 'Detroit',
 '2026-09-26', '2026-09-27', '9:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2501200',
 'https://images.ra.co/fd9c8370876fa2d76f4216159d605b742e7c08e5.jpg',
 'Resident Advisor', 'approved'),

('ra-2535563', 'Detroit Grit: Terrence Dixon',
 'Detroit Grit, featuring Terrence Dixon, Cody Hammer, madeera, and Brent Shay.',
 'nightlife', 'Spkrbox', '200 Grand River Ave', 'Detroit',
 '2026-09-26', '2026-09-27', '10:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2535563',
 'https://images.ra.co/34fe9449863f4d9bfbf86625be51ff12006cbba0.jpg',
 'Resident Advisor', 'approved'),

('ra-2534882', 'Afterlite: Open Air',
 'Open-air house event in Greektown, featuring ARCS and DYNODA.',
 'nightlife', 'Exodus Rooftop', '529 Monroe St', 'Detroit',
 '2026-09-26', '2026-09-27', '10:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2534882',
 'https://images.ra.co/73d8b9b997c7d4a4f4060055eb811beb3c4f79ac.jpg',
 'Resident Advisor', 'approved'),

('ra-2528185', 'Freakuency',
 'Freakuency returns to Pronto Lounge with DJ Anti, 10PM-2AM.',
 'nightlife', 'Pronto Royal Oak', '608 Washington Ave.', 'Royal Oak',
 '2026-09-26', '2026-09-27', '8:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2528185',
 null,
 'Resident Advisor', 'approved')

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
  image_url = excluded.image_url;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-20_ra-manual-pull-7.sql')
on conflict (filename) do nothing;
