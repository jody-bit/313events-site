-- Manual MotorCity Wine pull, 2026-09-14 (Jody sent an Instagram post
-- screenshot from MotorCity Wine's own account: "would like to add this to
-- the database too for motor city wine coming up sept 20th"). One-time,
-- human-transcribed single event, same spirit as this project's other
-- Instagram-sourced manual pulls (see update_2026-09-13_parisbar-instagram-
-- flyers.sql) — no Instagram scraping, just the one screenshot Jody
-- provided, read by hand.
--
-- IMAGE: the flyer graphic was cropped out of Jody's full-screen screenshot
-- (Instagram's own chrome trimmed away) and uploaded through this site's own
-- existing flyer-upload pipeline (api/upload-image.js -> Supabase Storage
-- bucket "event-flyers"), so image_url below is a real, permanently-hosted
-- 313.events asset, not a hotlink back to Instagram's own CDN.
--
-- TICKET_URL: no ticket link — this is a free, no-cover patio hang, not a
-- ticketed show. Points at the actual Instagram post itself (a real,
-- working link back to the source), same "link back rather than invent
-- one" principle as every other Instagram-sourced pull this project has
-- done.
--
-- WHAT THE POST ACTUALLY SAYS: "Third Sundays on the Patio" is a recurring
-- DJ patio series MotorCity Wine has run this season, with a rotating cast
-- ("Hi-Five Four": John Arnold, Joshua Adams, Justin Kruse, Todd Weston).
-- The caption is explicit that Sept 20 is the LAST one of the season
-- ("close out our final Sunday September 20th"), with each of the four
-- playing a 30-minute solo set before all joining together as "4-orces"
-- (a b2b2b2b set) for a final hour. Food truck: Ciao Bella. 3-8 PM.
--
-- CATEGORY: 'nightlife' — a DJ-driven patio series, matching this project's
-- existing music/nightlife split ('music' reserved for live bands,
-- 'nightlife' for DJ/dance-oriented programming).
--
-- VENUE: MotorCity Wine already exists as a venue (Corktown neighborhood,
-- migration_002) — venue_name_raw matches its existing casing exactly so
-- the venue_id backfill below actually links it.

insert into events (
  external_id, title, description, category, venue_name_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  image_url, source, note, status
) values

('mcw-third-sundays-hi-five-four-2026-09-20', 'Third Sundays on the Patio: Hi-Five Four (Season Finale)',
 'MotorCity Wine''s "Third Sundays on the Patio" DJ series closes out its season with the Hi-Five Four — John Arnold, Joshua Adams, Justin Kruse, and Todd Weston each spinning a 30-minute patio set, then joining together as "4-orces" for a final b2b2b2b hour. Food truck: Ciao Bella.',
 'nightlife', 'MotorCity Wine', null,
 '2026-09-20', '2026-09-20', '3:00 PM–8:00 PM', true, null,
 'https://www.instagram.com/p/Dc3_0-vNRYz/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/39cccab0-34ae-4cbc-af17-2593d113c0a8.jpg',
 'Manual', 'Season finale of a recurring monthly series, per the post''s own caption.', 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  ticket_url = excluded.ticket_url,
  image_url = excluded.image_url,
  note = excluded.note;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-14_motorcity-wine-hi-five-four.sql')
on conflict (filename) do nothing;
