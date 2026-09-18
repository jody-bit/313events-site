-- Detroit Jazz Festival: split into per-day-group rows so each day shows
-- its own correct hours — same fix, same reasoning, as
-- update_2026-09-04_mistatefair_hours.sql (see that file's header).
--
-- Hours (detroitjazzfest.org/faq/, Fox 2 Detroit, The Perna Team):
--   Friday, Sep 4:                    5:30 PM - 11:00 PM
--   Saturday-Sunday, Sep 5-6:         12:30 PM - 11:00 PM
--   Monday, Sep 7 (Labor Day):        12:30 PM - 8:00 PM
--
-- 3 distinct hours blocks (Friday, Sat/Sun, and Monday all differ), so 3
-- rows — one per block.
--
-- Deletes the old single spanning row ('detroitjazzfest-2026') first — see
-- seed_2026-09-04_more_annual_events.sql, which no longer seeds it.
--
-- Idempotent: safe to re-run.

delete from events where external_id = 'detroitjazzfest-2026';

insert into events (
  external_id, title, description, category,
  venue_name_raw, venue_address_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  source, note, status
) values

('detroitjazzfest-2026-fri', 'Detroit Jazz Festival',
 'Annual free four-day jazz festival on Hart Plaza featuring national and international artists across multiple outdoor stages, plus additional shows at the Gretchen C. Valade Jazz Center and Wayne State University.',
 'music', 'Hart Plaza', null, 'Detroit',
 '2026-09-04', '2026-09-04', '5:30–11:00 PM', true, null,
 'https://www.detroitjazzfest.org',
 'Detroit Jazz Festival Foundation (detroitjazzfest.org, researched 2026-09-04)',
 'VIP concert packages are ticketed separately (detroitjazzfest.org/vip-experience-packages/) — main-stage admission itself is free.', 'approved'),

('detroitjazzfest-2026-sat-sun', 'Detroit Jazz Festival',
 'Annual free four-day jazz festival on Hart Plaza featuring national and international artists across multiple outdoor stages, plus additional shows at the Gretchen C. Valade Jazz Center and Wayne State University.',
 'music', 'Hart Plaza', null, 'Detroit',
 '2026-09-05', '2026-09-06', '12:30–11:00 PM', true, null,
 'https://www.detroitjazzfest.org',
 'Detroit Jazz Festival Foundation (detroitjazzfest.org, researched 2026-09-04)',
 'VIP concert packages are ticketed separately (detroitjazzfest.org/vip-experience-packages/) — main-stage admission itself is free.', 'approved'),

('detroitjazzfest-2026-mon', 'Detroit Jazz Festival',
 'Annual free four-day jazz festival on Hart Plaza featuring national and international artists across multiple outdoor stages, plus additional shows at the Gretchen C. Valade Jazz Center and Wayne State University.',
 'music', 'Hart Plaza', null, 'Detroit',
 '2026-09-07', '2026-09-07', '12:30–8:00 PM (Labor Day)', true, null,
 'https://www.detroitjazzfest.org',
 'Detroit Jazz Festival Foundation (detroitjazzfest.org, researched 2026-09-04)',
 'VIP concert packages are ticketed separately (detroitjazzfest.org/vip-experience-packages/) — main-stage admission itself is free.', 'approved')

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
