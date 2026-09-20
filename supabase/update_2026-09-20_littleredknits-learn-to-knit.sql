-- Manual event submission, 2026-09-20 (Jody, via table-tent cards
-- photographed at Little Red Knits' booth -- "Learn to Crochet with
-- Gianna" and "Learn to Knit with Erin," plus a separate "Sip & Stitch"
-- card, neither carrying a date on the card itself, just a QR code to
-- sign up).
--
-- Verified before adding: no existing event or venue in the DB matched
-- "Little Red Knits," "Rust Belt Market," "Sip & Stitch," "knit," or
-- "crochet" (direct Supabase query, 2026-09-20).
--
-- Real dates came from littleredknits.com/events/ (their own events
-- listing), not from guessing off the cards:
--   - Two "Learn to Knit -- Level 1" sessions on 10/11/26 (12-2pm and
--     3-5pm), each its own ticketed listing -- these are the two rows
--     below.
--   - "September Sip & Stitch" is TODAY, 2026-09-20, 12-2pm, free --
--     NOT added here. By the time this file is reviewed/run it's
--     already happened or is already underway, so adding it now has no
--     visitor value; it's also a monthly recurring thing and no October
--     date is posted on their site yet. Add the next confirmed instance
--     once it's live on their events page instead of guessing a date a
--     month out.
--   - "Learn to Crochet with Gianna" (the other card Jody photographed)
--     has NO currently-scheduled instance on their events page -- the
--     only crochet listing found was a past one (March 29, 2026,
--     already gone). Not added; add it once a real upcoming date is
--     posted.
--
-- category = 'training' (Classes & Training, migration_031) -- exact
-- fit, same category cron-detroittraining.js's events use.
--
-- Venue: Rust Belt Market is not yet a curated venues-table row, so
-- venue_name_raw/address/city are set directly on each event, same
-- pattern as every other not-yet-curated venue in this project.
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('littleredknits-learntoknit-2026-10-11-1200', 'Learn to Knit -- Level 1 (Little Red Knits)',
 'Discover the fundamentals of knitting in a welcoming, small-group class led by instructor Erin. In this 2 hour workshop, you''ll learn the essentials in a fun, relaxed setting while building the skills and confidence to continue your knitting journey. All materials (yarn and needles) are provided and yours to keep. No prior experience required.',
 'training', 'Rust Belt Market', '22801 Woodward Ave', 'Ferndale',
 '2026-10-11', '2026-10-11', '12:00 PM–2:00 PM', false, 70.00,
 'https://littleredknits.com/etn/learn-to-knit-level-1-10-11-26-1200-200pm/',
 null,
 'Manual', null, 'approved'),

('littleredknits-learntoknit-2026-10-11-1500', 'Learn to Knit -- Level 1 (Little Red Knits)',
 'Discover the fundamentals of knitting in a welcoming, small-group class led by instructor Erin. In this 2 hour workshop, you''ll learn the essentials in a fun, relaxed setting while building the skills and confidence to continue your knitting journey. All materials (yarn and needles) are provided and yours to keep. No prior experience required.',
 'training', 'Rust Belt Market', '22801 Woodward Ave', 'Ferndale',
 '2026-10-11', '2026-10-11', '3:00 PM–5:00 PM', false, 70.00,
 'https://littleredknits.com/etn/learn-to-knit-level-1-10-11-26-300pm-500pm/',
 null,
 'Manual', null, 'approved')

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

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-20_littleredknits-learn-to-knit.sql')
on conflict (filename) do nothing;
