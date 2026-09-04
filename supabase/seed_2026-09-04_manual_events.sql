-- Manually-researched one-off events, added 2026-09-04 at Jody's request:
--   1) Michigan Renaissance Festival (michrenfest.com) — seven themed
--      weekends, Aug 22-Oct 4, 2026, Holly, MI.
--   2) "FILM l Nicolas Uncaged 11" at Ant Hall (crowdwork.com), Sept 11, 2026.
--
-- REQUIRES migration_020_venue_address_raw.sql to have already been run —
-- these rows use venue_address_raw, which doesn't exist on the events table
-- until that migration runs (same column the admin panel's "Street address"
-- field hit "Could not find the 'venue_address_raw' column" on before that
-- migration was applied). Run migration_020 first if you haven't already.
--
-- Idempotent: safe to re-run. external_id makes every row a stable upsert
-- target instead of a duplicate on a second run — same convention as
-- seed_hamtramck_2026_annual_events.sql.
--
-- ---------------------------------------------------------------------------
-- MICHIGAN RENAISSANCE FESTIVAL — sourcing notes
-- ---------------------------------------------------------------------------
-- Venue, hours, and overall date range confirmed live from the festival's own
-- site (michrenfest.com homepage + /faq/, fetched 2026-09-04):
--   "Open Weekends Aug 22 - Oct 4, 2026 plus Labor Day, September 7 and
--   Festival Friday, October 2" · "9AM-7PM (Rain or Shine)" ·
--   "12600 Dixie Hwy., Holly, MI 48442" · ticket page:
--   https://www.etix.com/ticket/v/18452/michigan-renaissance-festival
--
-- The site names seven weekend themes in order (Pirates & Pups, Highland
-- Games, Viking Invasion, Wonders of the World, Shamrocks & Shenanigans,
-- Harvest Huzzah, Sweet Endings) but does not publish per-weekend dates as
-- structured/parseable data — no scraper was built for that reason (nothing
-- to reliably parse). The exact calendar dates below are DERIVED, not
-- guessed: the festival's own stated pattern is a run of consecutive
-- Saturday/Sunday weekends from Aug 22 (a Saturday) through Oct 4 (a Sunday),
-- with two named bonus days folded into that sequence — Labor Day Monday
-- (Sept 7) and "Festival Friday" (Oct 2). A secondary source
-- (rawdetroit.org, fetched 2026-09-04) independently confirmed the one
-- checkable data point — "Viking Invasion runs September 5, 6, and 7" —
-- which lines up exactly with weekend #3 in this derived sequence (3rd
-- theme in the site's own list = 3rd weekend = Sept 5-7), cross-validating
-- the method for the other six. Day-of-week for every date below was
-- verified with `date -d`, not assumed.
--
-- Ticket price ($29.95 adult general admission) is rawdetroit.org's stated
-- 2026 figure — the official site's own /faq/ page defers to a separate
-- "tickets page" for pricing rather than stating a number itself, so this is
-- a secondary-source figure, not the festival's own — spot-check before
-- relying on it for anything price-sensitive.
--
-- venue_name_raw uses "Michigan Renaissance Festival Grounds" (the site
-- itself refers to the grounds as "HollyGrove") rather than repeating the
-- festival's own name as its venue, so the event card's "at ______" reads
-- sensibly.

insert into events (
  external_id, title, description, category,
  venue_name_raw, venue_address_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  source, note, status
) values

('renfest-2026-w1-pirates-pups', 'Michigan Renaissance Festival — Pirates & Pups Weekend',
 'Themed weekend of the annual Renaissance festival: jousting, artisan marketplace, and pirate-and-pooch festivities (dogs welcome this weekend — see the festival''s own dog rules).',
 'fest', 'Michigan Renaissance Festival Grounds', '12600 Dixie Hwy', 'Holly',
 '2026-08-22', '2026-08-23', '9:00 AM–7:00 PM', false, 29.95,
 'https://www.etix.com/ticket/v/18452/michigan-renaissance-festival',
 'Michigan Renaissance Festival (michrenfest.com, researched 2026-09-04)', null, 'approved'),

('renfest-2026-w2-highland-games', 'Michigan Renaissance Festival — Highland Games Weekend',
 'Themed weekend of the annual Renaissance festival, celebrating Scottish/Highland culture alongside the usual jousting and artisan marketplace.',
 'fest', 'Michigan Renaissance Festival Grounds', '12600 Dixie Hwy', 'Holly',
 '2026-08-29', '2026-08-30', '9:00 AM–7:00 PM', false, 29.95,
 'https://www.etix.com/ticket/v/18452/michigan-renaissance-festival',
 'Michigan Renaissance Festival (michrenfest.com, researched 2026-09-04)',
 'Named "Highland Games" on the festival''s own site nav; a secondary source (rawdetroit.org) called it "Highland Fling" — spot-check current naming closer to the date.', 'approved'),

('renfest-2026-w3-viking-invasion', 'Michigan Renaissance Festival — Viking Invasion Weekend (Labor Day)',
 'Themed weekend of the annual Renaissance festival, extended through Labor Day Monday, with a Viking-invasion theme alongside the usual jousting and artisan marketplace.',
 'fest', 'Michigan Renaissance Festival Grounds', '12600 Dixie Hwy', 'Holly',
 '2026-09-05', '2026-09-07', '9:00 AM–7:00 PM', false, 29.95,
 'https://www.etix.com/ticket/v/18452/michigan-renaissance-festival',
 'Michigan Renaissance Festival (michrenfest.com, researched 2026-09-04)',
 'The one weekend with independently-confirmed exact dates (rawdetroit.org: "September 5, 6, and 7").', 'approved'),

('renfest-2026-w4-wonders-of-the-world', 'Michigan Renaissance Festival — Wonders of the World Weekend',
 'Themed weekend of the annual Renaissance festival, celebrating world cultures alongside the usual jousting and artisan marketplace.',
 'fest', 'Michigan Renaissance Festival Grounds', '12600 Dixie Hwy', 'Holly',
 '2026-09-12', '2026-09-13', '9:00 AM–7:00 PM', false, 29.95,
 'https://www.etix.com/ticket/v/18452/michigan-renaissance-festival',
 'Michigan Renaissance Festival (michrenfest.com, researched 2026-09-04)', null, 'approved'),

('renfest-2026-w5-shamrocks-shenanigans', 'Michigan Renaissance Festival — Shamrocks & Shenanigans Weekend',
 'Themed weekend of the annual Renaissance festival, with an Irish-flavored theme alongside the usual jousting and artisan marketplace.',
 'fest', 'Michigan Renaissance Festival Grounds', '12600 Dixie Hwy', 'Holly',
 '2026-09-19', '2026-09-20', '9:00 AM–7:00 PM', false, 29.95,
 'https://www.etix.com/ticket/v/18452/michigan-renaissance-festival',
 'Michigan Renaissance Festival (michrenfest.com, researched 2026-09-04)', null, 'approved'),

('renfest-2026-w6-harvest-huzzah', 'Michigan Renaissance Festival — Harvest Huzzah Weekend',
 'Themed weekend of the annual Renaissance festival, with a harvest-season theme alongside the usual jousting and artisan marketplace.',
 'fest', 'Michigan Renaissance Festival Grounds', '12600 Dixie Hwy', 'Holly',
 '2026-09-26', '2026-09-27', '9:00 AM–7:00 PM', false, 29.95,
 'https://www.etix.com/ticket/v/18452/michigan-renaissance-festival',
 'Michigan Renaissance Festival (michrenfest.com, researched 2026-09-04)', null, 'approved'),

('renfest-2026-w7-sweet-endings', 'Michigan Renaissance Festival — Sweet Endings Weekend (Festival Friday)',
 'Final themed weekend of the annual Renaissance festival, extended through "Festival Friday," alongside the usual jousting and artisan marketplace.',
 'fest', 'Michigan Renaissance Festival Grounds', '12600 Dixie Hwy', 'Holly',
 '2026-10-02', '2026-10-04', '9:00 AM–7:00 PM', false, 29.95,
 'https://www.etix.com/ticket/v/18452/michigan-renaissance-festival',
 'Michigan Renaissance Festival (michrenfest.com, researched 2026-09-04)',
 '"Festival Friday" (Oct 2) is a bonus day the site adds onto the final weekend, per its own stated schedule.', 'approved'),

-- ---------------------------------------------------------------------------
-- ANT HALL — "FILM l Nicolas Uncaged 11" — sourced from crowdwork.com
-- (the event's own ticketing page), fetched 2026-09-04.
-- ---------------------------------------------------------------------------
('crowdwork-film-nicolas-uncaged-11', 'FILM l Nicolas Uncaged 11',
 'Planet Ant Theatre''s Y2K-themed Nicolas Cage double-feature night, with period-appropriate dress or Cage cosplay encouraged alongside era-specific music and drink specials.',
 'film', 'Ant Hall', '2320 Caniff', 'Hamtramck',
 '2026-09-11', null, '8:00 PM', false, 32.85,
 'https://www.crowdwork.com/e/film-l-nicolas-uncaged-11',
 'crowdwork.com (event''s own ticketing page, researched 2026-09-04)',
 'Ticket price includes fees per the ticketing page ($32.85 all-in).', 'approved')

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
