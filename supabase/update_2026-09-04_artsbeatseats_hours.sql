-- Arts, Beats & Eats: split into per-day-group rows so each day shows its
-- own correct hours — same fix, same reasoning, as
-- update_2026-09-04_mistatefair_hours.sql (see that file's header).
--
-- Festival hours (freep.com's 2026-09-03 storm-delay coverage +
-- artsbeatseats.com):
--   Friday, Sep 4:               Noon - 11:00 PM (delayed from a scheduled
--                                 11 AM due to storm/wind delays)
--   Saturday-Sunday, Sep 5-6:    11:00 AM - 11:00 PM
--   Monday, Sep 7 (Labor Day):   11:00 AM - 9:00 PM
--
-- 3 distinct hours blocks this time (Friday, Sat/Sun, and Monday all
-- differ), so 3 rows — one per block, same "group consecutive days that
-- share identical hours" rule as the state fair split, not literally one
-- row per calendar day.
--
-- The fine arts fair's own separate, slightly different sub-schedule
-- (2-9 PM Friday, 11 AM-9 PM Sat-Sun, 11 AM-5 PM Monday) stays out of
-- time_display for the same reason noted before — two different schedules
-- for two different things doesn't fit one time string — and is repeated
-- in each row's note instead.
--
-- Deletes the old single spanning row ('artsbeatseats-2026') first — see
-- seed_2026-09-04_more_annual_events.sql, which no longer seeds it.
--
-- Idempotent: safe to re-run.

delete from events where external_id = 'artsbeatseats-2026';

insert into events (
  external_id, title, description, category,
  venue_name_raw, venue_address_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  source, note, status
) values

('artsbeatseats-2026-fri', 'Arts, Beats & Eats',
 'Four-day Labor Day weekend street festival in downtown Royal Oak combining live music on multiple stages, a juried fine art show, and food/beverage vendors.',
 'fest', 'Downtown Royal Oak', null, 'Royal Oak',
 '2026-09-04', '2026-09-04', 'Noon–11:00 PM', false, 15,
 'https://www.showpass.com/2026abe/',
 'visitdetroit.com / showpass.com / clickondetroit.com (researched 2026-09-04)',
 'Official festival site (artsbeatseats.com) wasn''t directly fetchable this session (redirect loop) — price/dates cross-checked via its Showpass ticketing page and ClickOnDetroit''s 2026 coverage instead. Today''s official opening was delayed to noon (from a scheduled 11 AM) due to storm/wind delays — freep.com, 2026-09-03. The fine arts fair itself opens later today, at 2:00 PM, running to 9:00 PM.', 'approved'),

('artsbeatseats-2026-sat-sun', 'Arts, Beats & Eats',
 'Four-day Labor Day weekend street festival in downtown Royal Oak combining live music on multiple stages, a juried fine art show, and food/beverage vendors.',
 'fest', 'Downtown Royal Oak', null, 'Royal Oak',
 '2026-09-05', '2026-09-06', '11:00 AM–11:00 PM', false, 15,
 'https://www.showpass.com/2026abe/',
 'visitdetroit.com / showpass.com / clickondetroit.com (researched 2026-09-04)',
 'Official festival site (artsbeatseats.com) wasn''t directly fetchable this session (redirect loop) — price/dates cross-checked via its Showpass ticketing page and ClickOnDetroit''s 2026 coverage instead. The fine arts fair itself closes earlier than the main festival on these two days: 9:00 PM, not 11:00 PM.', 'approved'),

('artsbeatseats-2026-mon', 'Arts, Beats & Eats',
 'Four-day Labor Day weekend street festival in downtown Royal Oak combining live music on multiple stages, a juried fine art show, and food/beverage vendors.',
 'fest', 'Downtown Royal Oak', null, 'Royal Oak',
 '2026-09-07', '2026-09-07', '11:00 AM–9:00 PM (Labor Day)', false, 15,
 'https://www.showpass.com/2026abe/',
 'visitdetroit.com / showpass.com / clickondetroit.com (researched 2026-09-04)',
 'Official festival site (artsbeatseats.com) wasn''t directly fetchable this session (redirect loop) — price/dates cross-checked via its Showpass ticketing page and ClickOnDetroit''s 2026 coverage instead. The fine arts fair itself closes earlier on Labor Day: 5:00 PM, not 9:00 PM.', 'approved')

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
