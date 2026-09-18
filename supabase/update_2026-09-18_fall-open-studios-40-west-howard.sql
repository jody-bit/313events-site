-- Manual event submission, 2026-09-18 (Jody, via Facebook event link:
-- https://facebook.com/events/s/2nd-annual-fall-open-studios-a/2236314620490132/,
-- plus flyer + screenshots of the event's own Facebook page). "add this
-- event".
--
-- image_url is intentionally left null here -- the flyer upload got
-- blocked by the cloud sandbox's network proxy (curl to 313.events gets a
-- 403 from the egress proxy, same issue hit earlier this session with the
-- Bikini Kill photo), so Jody is running the upload herself from her own
-- Terminal. A follow-up file sets image_url once that URL comes back.
--
-- description only covers the flyer's own "What to expect" intro --
-- Jody said she has more screenshots to add (the full participating-
-- studios directory continues past what's been sent so far, at least
-- through a 3rd floor and probably a 4th). A follow-up file will append
-- the full studio roster to this row's description once that's in hand,
-- rather than insert a partial/guessed-at list now.
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('fb-2236314620490132', '2nd Annual Fall Open Studios at 40 West Howard',
 'Please join us for our 2nd Annual Fall Open Studios at 40 West Howard! Visitors will get to see the creative spaces of 40 West Howard, a historic automobile factory converted into artist studios and small-business spaces across 4 floors -- contemporary sculpture, woodworking, ceramics, painting, screen printing, fiber art, jewelry, and more. Most studios will have work on display for sale, with pieces for all budgets. Free to attend, with select studios offering refreshments and snacks. ADA accessible: wheelchair ramp at the north entrance, elevator attendant assisting between floors. Hosted by 40 West Howard Artists Guild and 3 others.',
 'visual', '40 West Howard', '40 W Howard St', 'Pontiac',
 '2026-10-10', null, '1:00 PM–7:00 PM', true, null,
 'https://facebook.com/events/s/2nd-annual-fall-open-studios-a/2236314620490132/',
 null,
 'Manual', 'Full participating-studios directory pending -- Jody has more screenshots to add.', 'approved')

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

insert into schema_migrations (filename) values ('update_2026-09-18_fall-open-studios-40-west-howard.sql')
on conflict (filename) do nothing;
