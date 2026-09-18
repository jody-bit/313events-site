-- Manual Resident Advisor pull, 2026-09-18 (Jody: "also we need to run a RA
-- crawl"). Same policy as every prior RA file in this folder -- see
-- api/cron-halo.js's own comment ("RA scraping remains off limits per its
-- Terms of Use") -- no automated crawler, a human-driven live browser
-- session against ra.co/events/us/detroit, one event confirmed via its own
-- JSON-LD at a time.
--
-- SCOPE: scanned the Detroit listing from today (9/18) through Sat 9/26 and
-- cross-checked every candidate title against the live database first, to
-- avoid re-confirming anything already pulled by the 9/16/9/17 passes or
-- picked up by another source under a different name (several -- Hector
-- Romero does TV, SHDW & Redax, Sanctuary: Descent, D.N/A, Foggy Sunday(s),
-- SWEAT, 12 Hour Party's earlier date -- were already present). That left
-- roughly 28 genuinely new candidates spanning 9/18 through 9/26.
--
-- This pull only got ONE of those 28 fully detail-confirmed
-- (MAD presents: The Big One) before ra.co's own DataDome bot-detection
-- challenged this browser session -- and this time the challenge didn't
-- clear on retry or on navigating back to the plain listing page, unlike
-- 9/15's pull where it eventually let a fresh session back in. Per the
-- no-automated-crawler policy, the remaining ~27 candidates are NOT being
-- inserted from the listing page's summary text alone (title/venue/date
-- only, no individually-confirmed JSON-LD) -- that would mean guessing at
-- times, addresses, and descriptions this project has always pulled
-- straight from each event's own structured data. Reporting the full
-- candidate list back to Jody separately rather than insert unconfirmed
-- rows; a follow-up pass can pick them up once ra.co stops challenging
-- this session (or Jody can approve inserting from listing-page data only,
-- with the understanding it's a lower-confidence source than the usual
-- per-page JSON-LD pull).
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('ra-2523066', 'MAD presents: The Big One',
 'An unforgettable night of music, cosplay, and culture -- ten musicians, a cosplay contest with cash prizes, and vendors, hosted by promoter Robert Paulus at Detroit Shipping Company.',
 'nightlife', 'Detroit Shipping Company', '474 Peteboro St', 'Detroit',
 '2026-09-19', '2026-09-20', '8:00 PM–3:00 AM', false, 17.25,
 'https://ra.co/events/2523066',
 'https://images.ra.co/36aab41316476679b4dc80382aefa2e7f95bfd71.jpg',
 'Resident Advisor', null, 'approved')

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
  image_url = excluded.image_url,
  note = excluded.note;

-- Same generic name-match backfill as every other new-events file here --
-- only touches venue_id is null rows, safe to re-run.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-18_ra-manual-pull-4.sql')
on conflict (filename) do nothing;
