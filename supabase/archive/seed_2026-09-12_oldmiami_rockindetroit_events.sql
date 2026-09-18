-- Manually-added events for The Old Miami (3930 Cass Ave., Detroit) — added
-- 2026-09-12 at Jody's request ("crawl this" -> rockindetroit.com/venue/
-- old-miami/), as an immediate one-time seed to get today's 5 listed shows
-- live right away, ahead of api/cron-oldmiami.js (this same session's new
-- recurring cron, not yet deployed) taking over automatically.
--
-- external_id uses the SAME scheme the cron uses (`oldmiami-<slug>`), so
-- once that cron is deployed and runs, it upserts these exact rows instead
-- of creating duplicates.
--
-- venue_name_raw is "The Old Miami" (WITH "The") to match this project's
-- one existing row for this venue ("What's So Funny About Detroit?",
-- 2026-08-27), rather than rockindetroit.com's own spelling ("Old Miami",
-- no "The") — confirmed via a live query before writing this that the
-- existing row already uses "The Old Miami", so this matches it exactly
-- rather than splitting the same real venue into two venue_name_raw groups.
--
-- Pricing ($5 cover) and band lineups are exactly as published on each
-- event's own rockindetroit.com page, fetched 2026-09-12. None of these
-- pages publish an end time, so time_display is start-time-only for all
-- five — an honest gap in the source, not a scraping miss.
--
-- Idempotent: safe to re-run — external_id makes every row a stable upsert
-- target instead of a duplicate on a second run (same convention as
-- seed_2026-09-04_manual_events.sql / seed_2026-09-12_amplify_hamtramck_posh_events.sql).

insert into events (
  external_id, title, description, category,
  venue_name_raw, venue_address_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  source, note, status
) values

('oldmiami-vlads-skeletal-circus-everyday-ghost-gerber-babies',
 'Vlad''s Skeletal Circus + Everyday Ghost + Gerber Babies',
 'Live music: Vlad''s Skeletal Circus, Everyday Ghost, Gerber Babies',
 'music', 'The Old Miami', '3930 Cass Ave.', 'Detroit',
 '2026-09-11', null, '9:00 PM', false, 5,
 'https://rockindetroit.com/events/vlads-skeletal-circus-everyday-ghost-gerber-babies/',
 'Rock In Detroit (rockindetroit.com/venue/old-miami, researched 2026-09-12)', null, 'approved'),

('oldmiami-dally-day', 'Dally Day',
 'Live music: Ficus, Cherry Drop, The Amino Acids, The Hourlies',
 'music', 'The Old Miami', '3930 Cass Ave.', 'Detroit',
 '2026-09-12', null, '2:00 PM', false, 5,
 'https://rockindetroit.com/events/dally-day/',
 'Rock In Detroit (rockindetroit.com/venue/old-miami, researched 2026-09-12)',
 'Page also lists a fuller "Additional Event Information" lineup: Smokin Moses/Angie Hartley and the Boys/Winds of Neptune/Ficus/Cherry Drop/Amino Acids/Hourlies/HAF Life', 'approved'),

('oldmiami-jenns-apartment-danny-vanzandt-nathans-patience',
 'Jenn''s Apartment + Danny VanZandt + Nathan''s Patience',
 'Live music: Jenns Apartment, Danny VanZandt, Nathan''s Patience',
 'music', 'The Old Miami', '3930 Cass Ave.', 'Detroit',
 '2026-09-18', null, '9:00 PM', false, 5,
 'https://rockindetroit.com/events/jenns-apartment-danny-vanzandt-nathans-patience/',
 'Rock In Detroit (rockindetroit.com/venue/old-miami, researched 2026-09-12)', null, 'approved'),

('oldmiami-nuke-the-nightshift-st-thomas-boys-academy-choking-susan',
 'Nuke & The Nightshift + St Thomas Boys Academy + Choking Susan',
 'Live music: Nuke & The Nightshift, St Thomas Boys Academy, Choking Susan',
 'music', 'The Old Miami', '3930 Cass Ave.', 'Detroit',
 '2026-09-26', null, '9:00 PM', false, 5,
 'https://rockindetroit.com/events/nuke-the-nightshift-st-thomas-boys-academy-choking-susan/',
 'Rock In Detroit (rockindetroit.com/venue/old-miami, researched 2026-09-12)', null, 'approved'),

('oldmiami-static-factory-super-horndog-burning-time',
 'Static Factory + Super Horndog + Burning Time',
 'Live music: Static Factory, Super Horndog, Burning Time',
 'music', 'The Old Miami', '3930 Cass Ave.', 'Detroit',
 '2026-10-02', null, '9:00 PM', false, 5,
 'https://rockindetroit.com/events/static-factory-super-horndog-burning-time/',
 'Rock In Detroit (rockindetroit.com/venue/old-miami, researched 2026-09-12)', null, 'approved')

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
  note = excluded.note;
