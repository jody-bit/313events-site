-- Manual Resident Advisor pull, 2026-09-13 (Jody: "take a look at the RA
-- feed now and let's add"). Per this project's own established policy —
-- see api/cron-halo.js's header ("RA scraping remains off limits per its
-- Terms of Use") — there is no automated crawler here and never will be.
-- This is a one-time, human-driven pull: a live browser session against
-- ra.co/events/us/detroit, reading the same Next.js/Apollo data the page
-- itself renders from (not a bot hitting an API), transcribed by hand into
-- this file the same way the Hamtramck city flyer and the original RA seed
-- batch (see seed.sql) were. Re-running this same exercise later is a
-- manual "let's add" ask each time, never a schedule.
--
-- WHAT'S DIFFERENT FROM THE ORIGINAL RA SEED BATCH (see seed.sql, and the
-- "Texture"/event.html gap this fixed on 2026-09-13): that batch never
-- captured a real per-event URL at all, which is exactly what left those
-- rows as dead ends on event.html until the Resident-Advisor fallback link
-- was added. This time, ra.co's own page data included each event's real
-- permalink (ra.co/events/<id>) and its flyer image where one exists — both
-- captured below as ticket_url/image_url, so these rows get a working
-- "Tickets & info" button and a real flyer from day one, no fallback
-- needed.
--
-- SCOPE: every event ra.co/events/us/detroit had loaded at pull time,
-- spanning Sept 12-19, 2026 — this is whatever the page's own default view
-- surfaced, not an exhaustive listing (RA paginates/virtualizes further out
-- than this). Excluded: one event explicitly marked "[CANCELLED]" in its
-- own title (Moondog Cafe's Fire Music Green-House, Sept 14 — publishing a
-- cancelled event as live would be actively wrong, not just incomplete),
-- and two events (thrg pres. ... at Marble Bar, DJ Mandy at Elektricity,
-- both Sept 18) that turned out to already exist in the database from an
-- earlier pass — see the UPDATE below, which instead backfills real flyer
-- images onto those two existing rows now that RA's data has them.
--
-- Two events (Solstice Pool Party, BandaTon day party) carry an unusually
-- long RA-listed span (27-31 hours, starting the day before this pull) —
-- flagged with a note rather than presented as a clean single-day time
-- range, since that's genuinely what the source says and guessing a
-- tidier-looking range would be fabricating precision that isn't there.
--
-- category: 'nightlife' for all rows, same as every other Resident-Advisor-
-- sourced row already in this database — RA's own catalog is nightlife/
-- electronic-music focused, and nothing here gave a confident signal to
-- deviate from that project-wide convention for any single row.
-- venue_city_raw: left unset (Detroit default) — matches how these same
-- venue names already appear elsewhere in this database; not something
-- this pass re-litigates.
--
-- Idempotent: external_id makes every row a stable upsert target, same
-- pattern as every cron file here.

insert into events (
  external_id, title, description, category, venue_name_raw,
  start_date, end_date, time_display, is_free, ticket_url, image_url,
  source, note, status
) values

('ra-2532339', 'TEQUILA SUNSET: LATIN DAY PARTY (SWDEJAY & DJ IZA)', null, 'nightlife', 'Big Pink',
 '2026-09-13', '2026-09-13', '6:00 PM–10:00 PM', false, 'https://ra.co/events/2532339',
 'https://images.ra.co/681d0b9891ecb9bcfe460875e6eee39101548448.jpg', 'Resident Advisor', null, 'approved'),

('ra-2524599', 'The Art of Noise 9/13: AnJelic, Bill Harris, Novalés', null, 'nightlife', 'Moondog Cafe',
 '2026-09-13', '2026-09-13', '4:00 PM–6:00 PM', false, 'https://ra.co/events/2524599',
 'https://images.ra.co/e61aac1c46f206910e421a152dfd04cbe122d8bb.jpg', 'Resident Advisor', null, 'approved'),

('ra-2524313', 'SUNDANCE', 'A beloved annual tradition, SUNDANCE returns to close out summer with a full day of food, community and soulful rare grooves on a top-tier hi-fi sound system.', 'nightlife', 'TBA - The American Riad | 920 Euclid',
 '2026-09-13', '2026-09-13', '3:00 PM–10:00 PM', false, 'https://ra.co/events/2524313',
 'https://images.ra.co/793f6b44a06b9dd4f99adccdd81f9951bed086b1.png', 'Resident Advisor', 'Venue name not yet confirmed -- address shown is as listed by the event source.', 'approved'),

('ra-2532601', 'Sanctified Sundays Season Finale', null, 'nightlife', 'Third Street Bar',
 '2026-09-13', '2026-09-13', '4:00 PM–10:30 PM', false, 'https://ra.co/events/2532601',
 'https://images.ra.co/6e6e3512dc8054a3af3c9952f6cefa74293a1a17.jpg', 'Resident Advisor', null, 'approved'),

('ra-2535436', 'Foggy Sundays', null, 'nightlife', 'Spkrbox',
 '2026-09-13', '2026-09-14', '10:00 PM–2:00 AM', false, 'https://ra.co/events/2535436',
 'https://images.ra.co/2af4a4feef0d2e149fc4c9e6425150f9c99150a0.jpg', 'Resident Advisor', null, 'approved'),

('ra-2524263', 'Solstice Pool Party', null, 'nightlife', 'Belcrest Pool Midtown',
 '2026-09-12', '2026-09-13', null, false, 'https://ra.co/events/2524263',
 'https://images.ra.co/3fb1386c76d793639d19847cbc9a3f7601f8fc16.png', 'Resident Advisor', 'Runs from Sept 12 into the evening of Sept 13.', 'approved'),

('ra-2520438', 'BandaTon day party', null, 'nightlife', 'Venue TBA (Detroit)',
 '2026-09-12', '2026-09-13', null, false, 'https://ra.co/events/2520438',
 null, 'Resident Advisor', 'Runs overnight from Sept 12 into Sept 13.', 'approved'),

('ra-2535903', 'Música', null, 'nightlife', 'Spkrbox',
 '2026-09-14', '2026-09-15', '10:00 PM–2:00 AM', false, 'https://ra.co/events/2535903',
 'https://images.ra.co/652a7d32e242df0e17d201384ed2542c69c53fcd.jpg', 'Resident Advisor', null, 'approved'),

('ra-2535904', 'Bang Box', null, 'nightlife', 'Spkrbox',
 '2026-09-15', '2026-09-16', '10:00 PM–2:00 AM', false, 'https://ra.co/events/2535904',
 'https://images.ra.co/c9be342ca74e53eb70740039171ab891813bb67f.jpg', 'Resident Advisor', null, 'approved'),

('ra-2536130', 'ELIXIR THURS: DR. Disko Dust, AIDEL', null, 'nightlife', 'Northern Lights Lounge',
 '2026-09-17', '2026-09-18', '8:00 PM–12:00 AM', false, 'https://ra.co/events/2536130',
 'https://images.ra.co/991a81b832b88517082ad37b38889f683f213b0a.png', 'Resident Advisor', null, 'approved'),

('ra-2533716', 'Flavors (staff appreciation night)', null, 'nightlife', 'Spkrbox',
 '2026-09-17', '2026-09-18', '10:00 PM–2:00 AM', false, 'https://ra.co/events/2533716',
 'https://images.ra.co/75d6cd799e224d27b18079a3d5c4fc9763a71b28.png', 'Resident Advisor', null, 'approved'),

('ra-2532237', 'SWAG: A Jerk Era Party (Hip-Hop Music)', null, 'nightlife', 'Big Pink',
 '2026-09-18', '2026-09-19', '10:00 PM–2:00 AM', false, 'https://ra.co/events/2532237',
 'https://images.ra.co/f6adf3d12bb5f31a5b5289a616abd5945cfd28a3.jpg', 'Resident Advisor', null, 'approved'),

('ra-2530518', 'Sleep Olympics 4 Year Anniversary w/ K''Alexi Shelby, DJ Cent, Body Mechanic', null, 'nightlife', 'Venue TBA (Detroit)',
 '2026-09-18', '2026-09-19', '10:00 PM–6:00 AM', false, 'https://ra.co/events/2530518',
 'https://images.ra.co/aede9af31529fccd9db9dedf5a0c4b4c56c145f9.jpg', 'Resident Advisor', null, 'approved'),

('ra-2516034', '3.1.3', null, 'nightlife', 'Andy Arts',
 '2026-09-18', '2026-09-19', null, false, 'https://ra.co/events/2516034',
 'https://images.ra.co/3ef41471815033c858e81cdbc861eee2f31629ba.png', 'Resident Advisor', 'Runs overnight from Sept 18 into Sept 19.', 'approved'),

('ra-2520480', 'CORRUPTION: Remix Wars', null, 'nightlife', 'Tangent Gallery',
 '2026-09-18', '2026-09-19', '8:00 PM–2:00 AM', false, 'https://ra.co/events/2520480',
 'https://images.ra.co/fa45dca1c702aff7f74bbc9103c4217c5cb57ca3.jpg', 'Resident Advisor', null, 'approved'),

('ra-2529208', 'SHAKE DOWN', null, 'nightlife', 'Roar Brewery Bar & Patio',
 '2026-09-18', '2026-09-18', '8:00 PM–Late', false, 'https://ra.co/events/2529208',
 'https://images.ra.co/8793a9c1e7242d040a1ced5608f1957571e6b295.jpg', 'Resident Advisor', null, 'approved'),

('ra-2521156', 'Atonement wsg Colliding Pins', null, 'nightlife', 'The Strays',
 '2026-09-18', '2026-09-19', '8:00 PM–2:00 AM', false, 'https://ra.co/events/2521156',
 'https://images.ra.co/52744f64d7e179425b740978e9381cc60fee8b30.jpg', 'Resident Advisor', null, 'approved')

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

-- Backfill flyer images onto two events that turned out to already exist in
-- the database (same title/venue/date as this pull, found via a title
-- search before inserting anything, to avoid a straight duplicate) — RA's
-- data has flyers for both now; the existing rows didn't.
update events set image_url = 'https://images.ra.co/3840009cd19c0f2e28b8efb4c5c5ee4269bc0b38.jpg'
where id = '5d1f3c14-593f-4581-abea-d598386a8f80' and image_url is null; -- thrg pres. ... — Marble Bar

update events set image_url = 'https://images.ra.co/f301057b22c044641c4243ec979e7527bf90420c.png'
where id = '3113d4d0-2760-4736-a31a-399df383314d' and image_url is null; -- DJ Mandy: Fall Tour 2026 — Elektricity

-- Same generic name-match backfill as every other new-events file here —
-- only touches venue_id is null rows, safe to re-run. Links whichever of
-- these venue names (Big Pink, Spkrbox, Third Street Bar, etc.) already
-- have a `venues` row.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;
