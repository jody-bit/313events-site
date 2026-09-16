-- Manual Paris Bar (Detroit) pull, 2026-09-16 (Jody sent two more Instagram
-- flyer screenshots from the parisbardetroit account: "IN THE PINES — Summer
-- Tour" and the "Lost Legion" show). Same convention as this session's
-- earlier Paris Bar batch (see update_2026-09-13_parisbar-instagram-flyers.sql)
-- and the same human-transcribed, no-scraping approach used for every manual
-- source in this project.
--
-- IMAGES: both flyers were cropped down to just the flyer graphic and
-- uploaded through this site's own existing flyer-upload pipeline
-- (api/upload-image.js -> Supabase Storage bucket "event-flyers"), same as
-- every other manual pull here — image_url below is a real, permanently
-- hosted 313.events asset, not a hotlink back to Instagram's own CDN.
--
-- TICKET_URL: neither post had a direct ticket-purchase link visible in the
-- screenshot, so ticket_url points at the Instagram post itself — same
-- fallback principle used throughout this project rather than guessing at a
-- purchase link.
--
-- Idempotent: external_id (the Instagram shortcode, prefixed "ig-") makes
-- each row a stable upsert target, same pattern as every other manual/cron
-- file here.

insert into events (
  external_id, title, description, category, venue_name_raw,
  start_date, end_date, time_display, is_recurring, is_free, price_from,
  ticket_url, image_url, source, note, status
) values

('ig-DcDCtwnutQS', 'IN THE PINES — Summer Tour w/ MRKT, The Velvet Snakes',
 'IN THE PINES brings their Summer Tour to Paris Bar, with support from MRKT and The Velvet Snakes.',
 'music', 'Paris Bar',
 '2026-09-19', '2026-09-19', '7:00 PM', false, false, 15.00,
 'https://www.instagram.com/p/DcDCtwnutQS/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/0d50e476-677b-4e5b-8dae-e5b4c43c29a5.jpg',
 'Manual', null, 'approved'),

('ig-DdUNDidxeYK', 'Lost Legion w/ Orphan, State, N2 Submission ft. The Impaler',
 'Lost Legion headlines Paris Bar with support from Orphan, State, and N2 Submission featuring The Impaler. DJ Amado spins. Flyer art by @distort_detroit, with artwork borrowed from Aubrey Beardsley and Nathan (Lost Legion LP). 21+.',
 'music', 'Paris Bar',
 '2026-09-18', '2026-09-18', 'Doors @ 8:00 PM', false, false, 15.00,
 'https://www.instagram.com/p/DdUNDidxeYK/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/209798cc-4cf9-4e17-bf7e-2d61436d7540.jpg',
 'Manual', '21+ show.', 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  is_recurring = excluded.is_recurring,
  price_from = excluded.price_from,
  ticket_url = excluded.ticket_url,
  image_url = excluded.image_url,
  note = excluded.note;

-- Same generic name-match backfill as every other new-events file here --
-- only touches venue_id is null rows, safe to re-run. Paris Bar already has
-- a venues row, so this should link both rows above straight away.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;
