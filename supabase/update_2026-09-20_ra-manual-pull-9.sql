-- RA pull batch 3 of ~10, 2026-09-20 (continuing pull-7/pull-8).
--
-- ra-2527768 (Numa Crew, this batch's 10th ID) is intentionally skipped
-- here -- it's already handled by update_2026-09-20_numa-crew-ra-merge.sql
-- (retires the earlier manual liquiddancehall-numacrew-2026-10-03 row and
-- inserts this exact canonical row). Adding it again here would just
-- re-run the same upsert harmlessly, but it belongs with that merge file,
-- not this pull batch.
--
-- ra-2504603 is a second, later date (Oct 2, with a different live
-- performance slot) of the same "House of Tarot" exhibition as ra-2504589
-- from pull-8 (Oct 1) -- not a duplicate, RA lists each date of the
-- month-long exhibition as its own event.
--
-- Two Magic Stick shows in this batch (ra-2529041, and ra-2529036 from
-- pull-8) both have a startDate hour that doesn't match their own written
-- description ("9pm-2am" in the text vs. a 09:00/morning hour in the
-- structured date field) -- a source-side RA data quirk on that venue's
-- listings, not a guess on our part. time_display below uses the explicit
-- text description's stated hours, which is the more reliable of the two.
--
-- ra-2537086's RA page has no venue field filled in ("TBA"), but the event
-- title itself names the venue ("@Obedient Missionary") -- that's RA's own
-- real data, just in a different field than usual, so it's used as
-- venue_name_raw. No street address is available for it anywhere on the
-- page, so venue_address_raw is left null.
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('ra-2504603', 'The House of Tarot (Live: Dominant Hand)',
 'The House of Tarot immersive exhibition at MAD Arts continues -- large-scale installations, projection mapping, sculpture, and interactive environments built around tarot archetypes. This date features a live performance by Dominant Hand, 8-9 PM.',
 'visual', 'MAD Arts', '560 Custer Street', 'Detroit',
 '2026-10-02', '2026-10-02', '6:00 PM–10:00 PM', false, 11.50,
 'https://ra.co/events/2504603',
 'https://images.ra.co/cf92e12c1ee18987da333af8ac2a2ec385e4b5dc.jpg',
 'Resident Advisor', null, 'approved'),

('ra-2512107', 'Valentino Khan',
 'Valentino Khan (producer/DJ blending house, trap, bass, and hardstyle) plays Lincoln Factory.',
 'nightlife', 'Lincoln Factory', '1331 Holden Street', 'Detroit',
 '2026-10-02', '2026-10-03', '9:00 PM–4:00 AM', false, 28.75,
 'https://ra.co/events/2512107',
 'https://images.ra.co/6330067a683666d6ebe0379bed8136ee82e5c115.png',
 'Resident Advisor', null, 'approved'),

('ra-2537086', 'CHECKER "I Really Do Believe" Album Release Party',
 'Detroit garage-rock duo CHECKER celebrates their new album with support from The Scarlettes, plus Detroit house selections by DJ Faith G and Auntie Chanel.',
 'music', 'Obedient Missionary', null, 'Detroit',
 '2026-10-02', '2026-10-03', '8:00 PM–2:00 AM', false, 11.50,
 'https://ra.co/events/2537086',
 'https://images.ra.co/2758ebbfa42b54370eb04657630ded3b843e5d76.png',
 'Resident Advisor', null, 'approved'),

('ra-2529041', 'Sam Alfred',
 'Magic Stick + Paxahau present Sam Alfred. 18+.',
 'nightlife', 'Magic Stick', '4120-4140 Woodward Avenue', 'Detroit',
 '2026-10-02', '2026-10-03', '9:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2529041',
 'https://images.ra.co/e9bf562dc9d6e6d11d04deb64eb341b8c42e1804.png',
 'Resident Advisor', null, 'approved'),

('ra-2536184', 'TOP2BTTM: FullBodyDurag b2b we1sman All Night',
 'FullBodyDurag and T2B''s WE1SMAN play a full-length b2b set -- ghettotech, footwork, techno, and more.',
 'nightlife', 'The Eagle of Detroit', '950 West McNichols', 'Detroit',
 '2026-10-02', '2026-10-03', '11:00 PM–4:00 AM', false, 10.00,
 'https://ra.co/events/2536184',
 null,
 'Resident Advisor', null, 'approved'),

('ra-2495960', 'Niiko x Swae',
 'Niiko x Swae play Elektricity in Pontiac. Doors at 9pm, 18+.',
 'nightlife', 'Elektricity', '15 South Saginaw Street', 'Pontiac',
 '2026-10-02', '2026-10-03', '9:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2495960',
 'https://images.ra.co/cb03f39e955eada129bd187ffbf7186363b4c02f.png',
 'Resident Advisor', null, 'approved'),

('ra-2530003', 'Detroit Alternative Rock: SugarFang + Sandbox + Evergreen',
 'Three Detroit-area alt-rock/punk bands at Trixie''s Bar -- Ah, Yes Mothership (6:30), Evergreen (7:00), Sandbox (8:00), and SugarFang (9:00). 21+, $10 cover.',
 'music', 'Trixie''s Bar', '2656 Carpenter', 'Hamtramck',
 '2026-10-02', '2026-10-02', '6:00 PM–10:00 PM', false, 10.00,
 'https://ra.co/events/2530003',
 null,
 'Resident Advisor', null, 'approved'),

('ra-2528110', 'Sombras',
 'A night of dark, ritualistic techno at Tangent Gallery celebrating Detroit''s techno lineage. Costumes encouraged; no phones on the dance floor.',
 'nightlife', 'Tangent Gallery', '715 E Milwaukee St', 'Detroit',
 '2026-10-03', '2026-10-04', '9:00 PM–3:00 AM', false, 17.25,
 'https://ra.co/events/2528110',
 'https://images.ra.co/4a26a9d980ffa59c1d44ee480572f743798105a3.png',
 'Resident Advisor', null, 'approved'),

('ra-2537189', 'Lezzing Out: Munches & Monsters Burlesque',
 'Detroit''s lesbian burlesque show returns to The High Dive -- a lineup of burlesque performers, hosts, a DJ set, costume contest, and games.',
 'theatre', 'The High Dive', '11474 Joseph Campau Ave', 'Hamtramck',
 '2026-10-03', '2026-10-04', '8:00 PM–2:00 AM', false, 10.00,
 'https://ra.co/events/2537189',
 'https://images.ra.co/3113ddfeb5e4e6c3123bd45a2519ecb11934c140.png',
 'Resident Advisor', 'Sliding-scale pricing, $10-$30.', 'approved')

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

insert into schema_migrations (filename) values ('update_2026-09-20_ra-manual-pull-9.sql')
on conflict (filename) do nothing;
