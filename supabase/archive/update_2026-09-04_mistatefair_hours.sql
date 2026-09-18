-- Michigan State Fair: split into per-day-group rows so each day shows its
-- own correct hours, requested by Jody 2026-09-04 (originally this file set
-- a single time_display string covering the whole run, e.g. "11:00 AM–8:00
-- PM Thu & Fri, 10:00 AM–8:00 PM Sat–Mon" — Jody: that's wrong, a visitor
-- looking at Saturday shouldn't have to read past Thursday's hours first;
-- every day should show just its own hours).
--
-- Hours (michiganstatefairllc.com/dailyschedule):
--   Thursday & Friday (Sep 3-4):      11:00 AM - 8:00 PM
--   Saturday-Monday (Sep 5-7):        10:00 AM - 8:00 PM
-- (Entrance/box office closes 7:00 PM nightly both halves — noted, not put
-- in time_display.)
--
-- Grouped into 2 rows (not 5) since Thu/Fri share identical hours and so do
-- Sat/Sun/Mon — one row per distinct hours block, not literally one row per
-- calendar day. index.html/calendar.html already show a multi-day row's
-- card on every date it spans (expandDateRange()) with a "Through ___"
-- note, so a 2-day or 3-day block still reads as one continuous listing on
-- each of the days it covers; it just no longer mixes in another block's
-- unrelated hours.
--
-- Deletes the old single spanning row ('mistatefair-2026') first — see
-- seed_2026-09-04_more_annual_events.sql, which no longer seeds it, to
-- avoid this ever coming back on a re-run of that file.
--
-- Idempotent: safe to re-run (delete is a no-op the 2nd+ time; the inserts
-- upsert on their own external_id).

delete from events where external_id = 'mistatefair-2026';

insert into events (
  external_id, title, description, category,
  venue_name_raw, venue_address_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  source, note, status
) values

('mistatefair-2026-thu-fri', 'Michigan State Fair',
 'Five-day Labor Day weekend state fair at the Vibe Credit Union Showplace in Novi, featuring carnival rides, agricultural exhibits, and family entertainment.',
 'fest', 'Vibe Credit Union Showplace', '46100 Grand River Ave', 'Novi',
 '2026-09-03', '2026-09-04', '11:00 AM–8:00 PM', false, 10,
 'https://michiganstatefairllc.ticketspice.com/michigan-state-fair-2026',
 'Michigan State Fair LLC (michiganstatefairllc.com, researched 2026-09-04)',
 'price_from is base "Fair Admission" ($10); an "Ultimate Admission" tier ($42, includes rides/shows) also exists. Entrance and box office close at 7:00 PM nightly, even though the fair itself runs until 8:00 PM.', 'approved'),

('mistatefair-2026-sat-mon', 'Michigan State Fair',
 'Five-day Labor Day weekend state fair at the Vibe Credit Union Showplace in Novi, featuring carnival rides, agricultural exhibits, and family entertainment.',
 'fest', 'Vibe Credit Union Showplace', '46100 Grand River Ave', 'Novi',
 '2026-09-05', '2026-09-07', '10:00 AM–8:00 PM', false, 10,
 'https://michiganstatefairllc.ticketspice.com/michigan-state-fair-2026',
 'Michigan State Fair LLC (michiganstatefairllc.com, researched 2026-09-04)',
 'price_from is base "Fair Admission" ($10); an "Ultimate Admission" tier ($42, includes rides/shows) also exists. Entrance and box office close at 7:00 PM nightly, even though the fair itself runs until 8:00 PM.', 'approved')

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
