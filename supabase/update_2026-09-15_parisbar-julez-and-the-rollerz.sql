-- Julez and The Rollerz @ Paris Bar, 2026-09-15. Jody sent the Instagram
-- post (instagram.com/p/DcMvYQdDn16/, @parisbardetroit) and said "we gotta
-- get this in for paris bar on friday" — the show itself is Thursday 9/17,
-- two days out at the time of this file, so timely.
--
-- Same manual-transcription approach as this project's other Paris Bar
-- Instagram pulls (see update_2026-09-13_parisbar-instagram-flyers.sql):
-- no scraping, just the one screenshot Jody provided, read by hand.
-- venue_name_raw='Paris Bar' already has a linked venues row (see
-- update_2026-09-13_paris-bar-rename.sql), so the backfill below picks it
-- up automatically.
--
-- TICKET_URL: caption says "Pre sale tickets are now live! Available in bio
-- above" — no direct purchase link was visible in the screenshot itself, so
-- (same principle as this project's other Instagram pulls) ticket_url
-- points at the real Instagram post rather than a guessed link. Confirmed
-- via web search this is a real routed tour date (Apple Music / Bandsintown
-- concert listing lists the same venue, address, and 9/17/2026 date), but
-- no independently-confirmed direct ticket vendor URL was found either —
-- left as the Instagram post link rather than guessing at a Bandsintown/
-- DICE URL that wasn't actually verified.
--
-- IMAGE: the flyer graphic was cropped from Jody's screenshot (Instagram
-- chrome trimmed away) but NOT YET uploaded to Supabase Storage — this
-- session doesn't have a working network path to the live
-- api/upload-image.js endpoint (same restriction noted elsewhere this
-- week). image_url is left null here; see chat for the cropped image file
-- and how to attach it.
--
-- Idempotent: external_id is the Instagram shortcode ("ig-" prefix), same
-- pattern as every other manual Instagram pull here.

insert into events (
  external_id, title, description, category, venue_name_raw,
  start_date, end_date, time_display, is_free, price_from,
  ticket_url, source, note, status
) values

('ig-DcMvYQdDn16', 'Julez and The Rollerz w/ Dear Darkness, Paradise Day, and Gerber and The Babies',
 'All-female glam rock pop group Julez and The Rollerz (L.A.) bring their Dirty Little Rock ''N'' Roller Tour to Paris Bar for their first-ever Detroit show — a chaotic, charming set of catchy pop-rock riffs. With local support from Dear Darkness, Paradise Day, and Gerber and The Babies.',
 'music', 'Paris Bar',
 '2026-09-17', '2026-09-17', 'Doors 8:00 PM', false, 15.00,
 'https://www.instagram.com/p/DcMvYQdDn16/',
 'Manual', 'Image not yet attached — see cropped flyer sent in chat; upload it through the usual flyer path and set image_url once hosted.', 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  price_from = excluded.price_from,
  ticket_url = excluded.ticket_url,
  note = excluded.note;

-- Same generic name-match backfill as every other Paris Bar file here.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;
