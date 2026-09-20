-- Follow-up to update_2026-09-20_liquid-dancehall-numa-crew.sql: Jody
-- sent the actual ra.co link today (ra.co/events/2527768) for this same
-- show. Confirmed via that page's own JSON-LD it's the identical event
-- (title, venue, date, time all match the manually-entered row) -- not a
-- duplicate booking, just the same show now with a real RA source.
--
-- Rather than leave two rows for one event (the manual one AND a future
-- RA-pull row once this shows up in a routine pull), this retires the
-- manual row (status -> rejected, same "reject the superseded duplicate"
-- pattern as update_2026-09-17_dedupe-batch1.sql) and inserts the
-- canonical ra-2527768 row with RA's fuller data: full description
-- (including the $25 door price mentioned in RA's own text, room/menu
-- credits), exact end time (RA's JSON-LD gives 20:00-02:00, not just a
-- start time), and RA's own current ticket price ($16.80, first release
-- tier) as price_from/ticket_url.
--
-- venue_address_raw/venue_city_raw are NOT taken from RA's own JSON-LD
-- here -- RA's page only has "TBA - 215 West" / region "Detroit" with no
-- street address, less precise than the real address already confirmed
-- via web search in the prior file (215 W Nine Mile Rd, Ferndale).
update events
set status = 'rejected',
    internal_note = coalesce(internal_note, '') || case when internal_note is not null then ' ' else '' end
      || 'Superseded 2026-09-20 by ra-2527768 once Jody sent the real ra.co link for this same show -- see that row instead.'
where external_id = 'liquiddancehall-numacrew-2026-10-03';

insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, status
) values

('ra-2527768', 'Liquid Dancehall presents Numa Crew',
 'Liquid Dancehall presents NUMA CREW (Florence, IT / Numa Recordings / System Music) -- hot off their set from Infrasound, Italy''s finest export. With JoeBig. 21+. Door price $25. Special menu from Cain You Taste It. Room transformation by Andrew Dall''Olmo.',
 'nightlife', '215 West', '215 W Nine Mile Rd', 'Ferndale',
 '2026-10-03', '2026-10-04', '8:00 PM–2:00 AM', false, 16.80,
 'https://ra.co/events/2527768',
 null,
 'Resident Advisor', 'approved')

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
  ticket_url = excluded.ticket_url;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-20_numa-crew-ra-merge.sql')
on conflict (filename) do nothing;
