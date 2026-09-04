-- Hamtramck 2026 Annual Events — hand-entered from the City of Hamtramck's
-- own "Hamtramck Annual Events 2026" flyer (PDF uploaded by the user,
-- 2026-08-23). Every title, date, and description below is transcribed
-- directly from that document — nothing here is guessed or invented.
--
-- The flyer's own footnote applies to all of these: "All dates are subject
-- to change." Events marked with an asterisk on the flyer (the recurring
-- Night Bazaar) are run by the City of Hamtramck itself.
--
-- ticket_url is left NULL except where a specific, real, verified source
-- was confirmed — the Labor Day Festival's own site, hamtownfest.com,
-- verified live during this session as the 46th Annual Hamtramck Labor Day
-- Festival's official page, dates matching (Sept 5-7, 2026). No other
-- confirmed dedicated site was found for the rest of this list, and none
-- were guessed. Safe to add more as they're confirmed — see the "note"
-- field on rows without one for what to go looking for.
--
-- Idempotent: safe to re-run. external_id makes every row a stable upsert
-- target instead of a duplicate on a second run.

insert into events (
  external_id, title, description, category, venue_name_raw,
  start_date, end_date, is_free, ticket_url, source, note, status
) values

('hamtramck-2026-paczki-run', 'Paçzki Run',
 'Annual community 5k walk/run cultural celebration.', 'family',
 'City-Wide (Hamtramck)', '2026-02-14', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-paczki-day', 'Paçzki Day',
 'Fat Tuesday cultural celebration.', 'food',
 'New Palace Bakery / Srodek''s, Hamtramck', '2026-02-17', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-blowout', 'Hamtramck Blowout',
 'Local music festival across 20+ venues.', 'music',
 'City-Wide (Hamtramck) — 20+ venues', '2026-03-05', '2026-03-07', false, null,
 'City of Hamtramck (2026 Annual Events flyer)', 'Needs its own confirmed ticket/info link — not the same site as the Labor Day Festival''s hamtownfest.com.', 'approved'),

('hamtramck-2026-earth-week', 'HPC Earth Week',
 'Outdoor family events focused on sustainability.', 'family',
 'Veterans Park, Hamtramck', '2026-04-22', '2026-04-26', true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-strawberry-festival', 'Strawberry Festival',
 'Polish celebration with desserts, live music, and games.', 'fest',
 'St. Florian, Hamtramck', '2026-05-02', '2026-05-03', false, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-spring-cleanup', 'Spring Cleanup',
 'Community city-wide street, park, and sidewalk clean up. Run by the City of Hamtramck.', 'family',
 'City Hall, Hamtramck', '2026-05-02', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-health-hike', 'Health Hike',
 '5k walk/run promoting healthy living and drug-free schools.', 'family',
 'Start at City Hall, Hamtramck', '2026-05-16', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-eid-festival', 'Eid Festival',
 'Family Eid al-Fitr celebration with food and rides.', 'fest',
 'Keyworth Stadium, Hamtramck', '2026-05-28', '2026-05-31', false, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-night-bazaar-jun', 'Hamtramck Night Bazaar',
 'Market with food & local vendors. Run by the City of Hamtramck.', 'food',
 '10037 Joseph Campau, Hamtramck', '2026-06-06', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-juneteenth', 'Hamtramck Stadium Juneteenth Celebration',
 'Community ballgame celebrating the Hamtramck Historic Stadium.', 'family',
 'Hamtramck Stadium', '2026-06-19', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-night-bazaar-jul', 'Hamtramck Night Bazaar',
 'Market with food & local vendors. Run by the City of Hamtramck.', 'food',
 '10037 Joseph Campau, Hamtramck', '2026-07-11', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-night-bazaar-aug', 'Hamtramck Night Bazaar',
 'Market with food & local vendors. Run by the City of Hamtramck.', 'food',
 '10037 Joseph Campau, Hamtramck', '2026-08-01', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-labor-day-festival', 'Hamtramck Labor Day Festival',
 '46th annual free festival along Joseph Campau: two stages of live music, carnival rides, food vendors, wrestling, and the city''s homemade-wheeled-boat yacht races, wrapping up with the Hamtramck Labor Day Parade on Monday. Runs noon-10pm each day.', 'fest',
 'Joseph Campau, Hamtramck', '2026-09-05', '2026-09-07', true,
 'https://hamtownfest.com', 'City of Hamtramck (2026 Annual Events flyer; description enriched 2026-09-04 from a Jody-provided writeup)',
 'ticket_url verified live: hamtownfest.com is the festival''s own official site, dates confirmed matching (Sept 5-7, 2026). Admission is free per that site. Hours (noon-10pm) per the 2026-09-04 writeup — spot-check against hamtownfest.com closer to the date.', 'approved'),

('hamtramck-2026-night-bazaar-sep', 'Hamtramck Night Bazaar',
 'Market with food & local vendors. Run by the City of Hamtramck.', 'food',
 '10037 Joseph Campau, Hamtramck', '2026-09-12', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-night-bazaar-oct', 'Hamtramck Night Bazaar',
 'Market with food & local vendors. Run by the City of Hamtramck.', 'food',
 '10037 Joseph Campau, Hamtramck', '2026-10-03', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved'),

('hamtramck-2026-neighborhood-arts-festival', 'Neighborhood Arts Festival',
 'Volunteer-run arts festival in venues city wide.', 'visual',
 'City-Wide (Hamtramck) — multiple venues', '2026-10-03', null, true, null,
 'City of Hamtramck (2026 Annual Events flyer)', null, 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  is_free = excluded.is_free,
  ticket_url = excluded.ticket_url,
  note = excluded.note;
