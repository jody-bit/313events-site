-- Manual event submission, 2026-09-20 (Jody, via a screenshot of a
-- "Liquid Dancehall" Instagram/Facebook post -- the flyer itself, not a
-- post link, so there's no source URL to attach as ticket_url/event_url).
--
-- Verified before adding: no existing event or venue in the DB matched
-- "Numa Crew"/"Liquid Dancehall" or the 215 W Nine Mile Rd address (direct
-- Supabase query, 2026-09-20). The address on the flyer -- 215 W. Nine
-- Mile Rd, Ferndale, MI -- was cross-checked against a plain web search;
-- it's a real, existing event/hospitality venue called "215 West" (aka
-- "215 West Ferndale"), not a venue already in this project's venues
-- table, so venue_name_raw/address/city are set directly on the row with
-- no venues insert, same as every other not-yet-curated venue here.
--
-- No ticket/event link is set -- nothing on the flyer or in what Jody
-- sent shows one. If Jody has the actual Instagram/Facebook post link,
-- that should be added as event_url in a follow-up update.
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, internal_note, status
) values

('liquiddancehall-numacrew-2026-10-03', 'Liquid Dancehall Presents: Numa Crew with Joebig',
 'Liquid Dancehall presents Numa Crew (Florence, IT -- Numa Recordings/System Music) with Joebig. 21+.',
 'nightlife', '215 West', '215 W Nine Mile Rd', 'Ferndale',
 '2026-10-03', '2026-10-04', '8:00 PM', false, null,
 null,
 null,
 'Manual', null,
 'Sourced from a screenshot of Liquid Dancehall''s Instagram/Facebook post, not the post itself -- no post URL available to set as event_url/ticket_url. No price shown on the flyer.',
 'approved')

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
  note = excluded.note,
  internal_note = excluded.internal_note;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-20_liquid-dancehall-numa-crew.sql')
on conflict (filename) do nothing;
