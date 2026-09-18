-- Manual Packard Art Collective venue + event pull, 2026-09-14 (Jody sent an
-- Instagram screenshot of the "Detroit Freak Parade" flyer from
-- @packardarthouse and said: "we need to create a new venue - Packard Art
-- House - 7032 E Ferry St, Detroit, MI 48211").
--
-- NAME DISCREPANCY: Jody wrote "Packard Art House," but the flyer itself and
-- https://community.metrotimes.com/location/packard-art-collective-30822862
-- (confirmed via WebFetch) both give the real name as "Packard Art
-- Collective" — likely just carried over from the Instagram handle
-- "packardarthouse". Using the Metro Times-confirmed name below; flagging
-- this here rather than silently picking one.
--
-- ADDRESS: 7032 E Ferry St, Detroit, MI 48211 — matches both Jody's message
-- and the Metro Times venue listing exactly.
--
-- NEIGHBORHOOD: left unset on purpose. Multiple searches (Metro Times'
-- own listing, general zip-code lookups) turned up no single, confidently-
-- sourced neighborhood name for this address — it's near the North End /
-- Arden Park area but nothing authoritative enough to commit to. Same
-- "leave unconfirmed rather than guess" posture this project already used
-- for Menjo's (migration_005).
--
-- EVENT — Detroit Freak Parade, Sat 2026-09-26 (verified via
-- `date -d 2026-09-26 +%A` = Saturday, matching the flyer). Doors 4:00 PM,
-- music 5:00 PM, $15 admission, BYOB/lawn chairs/coolers encouraged per the
-- flyer. Two stages: full lineup folded into the description since there's
-- no clean single "headliner" — this is a multi-band, multi-vendor backyard
-- fest, so category='fest' (Festivals & Parades), same logic as other
-- multi-act/vendor-market events on this site.
--
-- IMAGE: flyer graphic cropped out of Jody's full-screen screenshot and
-- uploaded through this site's own /api/upload-image pipeline (Supabase
-- Storage bucket "event-flyers") — a real, permanently-hosted 313.events
-- asset, not a hotlink to Instagram's CDN. Same technique as the MotorCity
-- Wine pull (update_2026-09-14_motorcity-wine-hi-five-four.sql).
--
-- TICKET_URL: no separate ticket link exists — points at the actual
-- Instagram post (instagram.com/p/DdPw4IHNGMj/) as the source of record,
-- same "link back rather than invent one" principle as prior manual pulls.

insert into venues (name, address, city, zip_code)
values ('Packard Art Collective', '7032 E Ferry St', 'Detroit', '48211')
on conflict (lower(name), lower(city)) do update set
  address = excluded.address,
  zip_code = excluded.zip_code;

insert into events (
  external_id, title, description, category, venue_name_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  image_url, source, note, status
) values

('packard-art-collective-detroit-freak-parade-2026-09-26', 'Detroit Freak Parade',
 'A backyard art & music fest at Packard Art Collective with two stages running side by side. Inside stage: Rose St. Germaine, Blood Rune Sigil, The Velvet Snakes, Mazinga, Teknokrat, Supreme Mystic, Cherry Drop. Outside stage: Amalgam Jam Band, Pepper & the Heavy Boys, Dunamis, Coyote Man, Birds Cage, Glass Chimera, Twin Freaks, The Cult of Spaceskull. Art vendors include Logan Belz, Michelle Thibodeau, Herandeye, Jade Love, Claire Minneboo, Vincent Minneboo, Leona Minneboo, Kailyn Lewis, Sadowski and Son, and more. BYOB, lawn chairs, and coolers encouraged.',
 'fest', 'Packard Art Collective', 'Detroit',
 '2026-09-26', '2026-09-26', 'Doors 4:00 PM, music at 5:00 PM', false, 15.00,
 'https://www.instagram.com/p/DdPw4IHNGMj/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/97ff9d1f-694c-4968-9392-81c92fed1cd6.jpg',
 'Manual', 'Two-stage backyard fest with an art vendor market, per the flyer.', 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
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

insert into schema_migrations (filename) values ('update_2026-09-14_packard-art-collective.sql')
on conflict (filename) do nothing;
