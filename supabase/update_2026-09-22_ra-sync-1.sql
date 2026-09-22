-- RA Detroit sync — 2026-09-22
-- Walked full RA Detroit listing (131 unique event ids across 7 pages via "Load more").
-- Diffed against existing ra-* external_ids in Supabase: 86 ids not yet in the DB.
-- RA re-blocked (403/DataDome challenge) after 22 of the capped 30 pulls completed this run —
-- stopped immediately per instructions rather than retrying. The remaining ~64 new ids
-- (including 8 never attempted this run) will resurface naturally in tomorrow's diff.
--
-- Of the 22 pulled, 16 turned out to be real-world duplicates of events already in the DB
-- under a different/NULL external_id (source "Resident Advisor", "Resident Advisor / Marble Bar",
-- or "Paxahau / Resident Advisor") — apparently from an earlier manual import that didn't set
-- external_id. Because their external_id isn't "ra-<id>", they don't show up in the external_id
-- diff and will keep getting re-flagged as "new" by every future run until backfilled. Flagging
-- this to Jody separately; not something this run can safely fix (would need to match/backfill
-- external_id on those existing rows, which is a one-time manual/curated task, not a daily-sync one).
--
-- Skipped as duplicates (title/venue/date match against an existing row):
--   ra-2407740  Wonkyween                                   dup of existing "Wonkyween" @ Elektricity 2026-10-24
--   ra-2461128  Choptober: Devils Night Edition              dup of existing "Choptober: Devils Night Edition" @ Elektricity 2026-10-30
--   ra-2462567  Lucky Rabbit                                 dup of existing "Lucky Rabbit" @ Venue TBA (secret loft) 2026-10-30
--   ra-2469970  Restricted                                   dup of existing "Paxahau presents: Restricted" @ Russell Industrial Center 2026-10-16
--   ra-2470800  Anime Rave: Halloween Edition                 dup of existing "Anime Rave: Halloween Edition" @ Elektricity 2026-10-23
--   ra-2474825  Samhain XXVI Weekend                         dup of existing "Samhain XXVI Weekend" @ Tangent Gallery 2026-10-30
--   ra-2474832  I.T. presents Beyond                         dup of existing "I.T. presents Beyond" @ Tangent Gallery 2026-10-30
--   ra-2474836  Samhain XXVI                                 dup of existing "Samhain XXVI" @ Tangent Gallery 2026-10-31
--   ra-2479785  Yheti & Toadface: Sleight of Sound Tour       dup of existing "Yheti & Toadface: Sleight of Sound Tour" @ Elektricity 2026-10-03
--   ra-2484799  Westend                                      dup of existing "Paxahau presents: WESTEND" @ Russell Industrial Center 2026-10-10
--   ra-2485347  A Dub Supreme                                dup of existing "A Dub Supreme" @ MotorCity Wine 2026-09-27 (same recurring pattern as the 2026-09-20 case)
--   ra-2487837  The Occasional Thursday Party w/ London Elektricity   dup of existing entry @ Marble Bar 2026-10-08
--   ra-2487990  The Occasional Thursday Party w/ DJ Craze + Friends   dup of existing entry @ Marble Bar 2026-10-29
--   ra-2495966  Sickick                                      dup of existing "SICKICK" @ Elektricity 2026-10-09
--   ra-2495975  Tsu Nami: Limerence Tour (360° DJ Experience) dup of existing "TSU NAMI: Limerence Tour" @ Elektricity 2026-10-16
--   ra-2496077  Walker & Royce                                dup of existing "Paxahau presents: Walker & Royce" @ Lincoln Factory 2026-10-17
--
-- Genuinely new, inserted (6):
--   ra-2461133  RIOT: The Machine World Tour                  @ Elektricity, Pontiac — 2026-12-12
--   ra-2464396  Detroits Inferno IV (night 1)                 @ Elektricity, Pontiac — 2027-04-09
--   ra-2466618  Detroits Inferno IV (night 2)                 @ Elektricity, Pontiac — 2027-04-10
--   ra-2466647  100% Live Techno – All Hardware Sets / Movement Opening Party  @ Venue TBA — 2027-05-28
--   ra-2479791  Whales: Dangerous Waters Tour                 @ Elektricity, Pontiac — 2026-11-21
--   ra-2500122  Steller                                       @ Elektricity, Pontiac — 2026-11-14
--
-- No [CANCELLED]-prefixed titles encountered.

insert into events (external_id, title, description, category, venue_name_raw, venue_address_raw, venue_city_raw, start_date, end_date, time_display, is_free, price_from, ticket_url, image_url, source, note, status) values
('ra-2461133', 'RIOT: The Machine World Tour', 'RIOT: The Machine World Tour plays Elektricity in Pontiac. Doors at 9pm, 18+.', 'nightlife', 'Elektricity', '15 South Saginaw Street', 'Pontiac', '2026-12-12', '2026-12-13', '9:00 PM–2:00 AM', false, null, 'https://ra.co/events/2461133', 'https://images.ra.co/4dc17dd530ddabe44b827c729b0bac137d06890f.png', 'Resident Advisor', null, 'approved'),
('ra-2464396', 'Detroits Inferno IV', 'Exodus & Riddim NYC present Detroits Inferno IV, a two-night event at Elektricity in Pontiac (night one). Lineup TBA. Doors at 7pm, 18+.', 'nightlife', 'Elektricity', '15 South Saginaw Street', 'Pontiac', '2027-04-09', '2027-04-10', '7:00 PM–2:00 AM', false, null, 'https://ra.co/events/2464396', 'https://images.ra.co/812b1eba183485f23219623797be67ef2ec29777.jpg', 'Resident Advisor', null, 'approved'),
('ra-2466618', 'Detroits Inferno IV', 'Exodus & Riddim NYC present Detroits Inferno IV, a two-night event at Elektricity in Pontiac (night two). Lineup TBA. Doors at 7pm, 18+.', 'nightlife', 'Elektricity', '15 South Saginaw Street', 'Pontiac', '2027-04-10', '2027-04-11', '7:00 PM–2:00 AM', false, null, 'https://ra.co/events/2466618', 'https://images.ra.co/b12ad43e78ff27f814bce31e838b3d60d9d098c9.jpg', 'Resident Advisor', null, 'approved'),
('ra-2466647', '100% Live Techno – All Hardware Sets / Movement Opening Party', 'Detroit''s Movement Festival Weekend opening party: an all-live hardware techno showcase built on synthesizers and drum machines rather than curated DJ sets, on a VOID sound system. Lineup TBA.', 'nightlife', 'Location TBA', null, null, '2027-05-28', '2027-05-29', '9:00 PM–6:00 AM', false, null, 'https://ra.co/events/2466647', 'https://images.ra.co/7a40b29fedd962c58ebc86bf5363c7db440aebf0.jpg', 'Resident Advisor', 'Venue location not yet announced by the event.', 'approved'),
('ra-2479791', 'Whales: Dangerous Waters Tour', 'Whales: Dangerous Waters Tour plays Elektricity in Pontiac. Doors at 9pm, 18+.', 'nightlife', 'Elektricity', '15 South Saginaw Street', 'Pontiac', '2026-11-21', '2026-11-22', '9:00 PM–2:00 AM', false, null, 'https://ra.co/events/2479791', 'https://images.ra.co/1131e36e0ae008d473fb0d3c3362ccc98a9d68f9.png', 'Resident Advisor', null, 'approved'),
('ra-2500122', 'Steller', 'Steller plays Elektricity in Pontiac. Doors at 9pm, 18+.', 'nightlife', 'Elektricity', '15 South Saginaw Street', 'Pontiac', '2026-11-14', '2026-11-15', '9:00 PM–2:00 AM', false, null, 'https://ra.co/events/2500122', 'https://images.ra.co/f4c612307b9381aa373888bd8c487e95dd7531df.png', 'Resident Advisor', null, 'approved')
on conflict (external_id) do update set title=excluded.title, description=excluded.description, category=excluded.category, venue_name_raw=excluded.venue_name_raw, venue_address_raw=excluded.venue_address_raw, venue_city_raw=excluded.venue_city_raw, start_date=excluded.start_date, end_date=excluded.end_date, time_display=excluded.time_display, is_free=excluded.is_free, price_from=excluded.price_from, ticket_url=excluded.ticket_url, image_url=excluded.image_url, note=excluded.note;

update events e set venue_id = v.id from venues v where lower(trim(e.venue_name_raw)) = lower(trim(v.name)) and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-22_ra-sync-1.sql') on conflict (filename) do nothing;
