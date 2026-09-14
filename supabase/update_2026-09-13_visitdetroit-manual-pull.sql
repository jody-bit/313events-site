-- Manual visitdetroit.com pull, 2026-09-13 (Jody: "can you do the same thing
-- for visit detroit? https://visitdetroit.com/events/"). Same one-time,
-- human-driven approach as the Resident Advisor pull the same day (see
-- update_2026-09-13_resident-advisor-manual-pull.sql) — visitdetroit.com's
-- own robots.txt (checked live) does not disallow /events/, but there is no
-- automated cron here either; this is a manual "let's add" ask, transcribed
-- by hand from a live browser session, not a scheduled scrape.
--
-- SOURCE: visitdetroit.com/events/'s "Live Music This Weekend" widget, which
-- listed 12 shows at pull time (Sept 13-24, 2026 window). All 12 were
-- checked against the existing events table by title before writing
-- anything here (see below) — 10 of the 12 turned out to already exist,
-- already sourced from Ticketmaster with real ticket_url/venue data of
-- their own. Publishing those again from this pass would either create a
-- flat-out duplicate or overwrite a real Ticketmaster link with a plain
-- visitdetroit.com listing page — worse data, not better — so only the two
-- events with NO existing row are added here:
--
--   * Karl Reed and friends (Sept 17, Aretha Franklin Cafe)
--   * Outdoor Summer Concert: The Dave Hamilton Band (Sept 18, Ford House)
--
-- The 10 excluded as pre-existing duplicates (checked by title, confirmed
-- same date/venue already in the events table, all status=approved):
-- Breaking Benjamin, $uicideboy$ Present Grey Day Tour 2026, Indigo Girls &
-- Linda Perry, Marshall Charloff & The Purple Xperience, Jim Gaffigan:
-- Everything Is Wonderful! (x2 dates), BABYMETAL WORLD TOUR 2026, "The
-- Hayley Williams Show", Ray LaMontagne - Trouble 20th Anniversary Tour,
-- Logic & G-Eazy: The Endless Summer Tour Part II, Brooks & Dunn: Neon Moon
-- Tour 2026 (x2 dates/venues, one is a Toledo show, left untouched).
--
-- ticket_url for both new rows points at the event's own visitdetroit.com
-- permalink (the only link visitdetroit.com itself gives — no Ticketmaster/
-- venue-direct link was present on either page) rather than a guessed venue
-- box-office URL.
--
-- category: 'music' for both — a live band/R&B night and an outdoor concert
-- series, matching this project's existing convention for ticketed live
-- music (as opposed to 'nightlife', reserved for DJ/dance-club events).
--
-- venue_city_raw: left unset (Detroit default) for Karl Reed and friends —
-- Aretha Franklin Cafe's own visitdetroit.com listing gives a Detroit, MI
-- 48212 address. Set explicitly to 'Grosse Pointe Shores' for the Dave
-- Hamilton Band show — Ford House is a real, distinct suburb, not Detroit
-- proper, same reasoning as this project's existing Highland Park/Clarkston-
-- style venue_city_raw usage elsewhere.
--
-- Idempotent: external_id makes each row a stable upsert target, same
-- pattern as every other manual/cron file here.

insert into events (
  external_id, title, description, category, venue_name_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  source, note, status
) values

('vd-karl-reed-and-friends', 'Karl Reed and friends',
 'Come join Karl Reed and friends for a night of R&B music with local artists from Detroit.',
 'music', 'Aretha Franklin Cafe', null,
 '2026-09-17', '2026-09-17', '7:30 PM–10:00 PM', false, 30.00,
 'https://visitdetroit.com/events/karl-reed-and-friends/',
 'Manual', null, 'approved'),

('vd-outdoor-summer-concert-dave-hamilton-band', 'Outdoor Summer Concert: The Dave Hamilton Band',
 'Celebrate the close of the summer season by the water at Ford House with the return of The Dave Hamilton Band, back for their third year as part of the Outdoor Summer Concert Series — a high-energy mix of Motown, funk, soul, rock, and pop along the shores of Lake St. Clair.',
 'music', 'Ford House', 'Grosse Pointe Shores',
 '2026-09-18', '2026-09-18', '7:00 PM–9:00 PM', false, 22.00,
 'https://visitdetroit.com/events/outdoor-summer-concert-the-dave-hamilton-band/',
 'Manual', null, 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  venue_city_raw = excluded.venue_city_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  price_from = excluded.price_from,
  ticket_url = excluded.ticket_url,
  note = excluded.note;

-- Same generic name-match backfill as every other new-events file here —
-- only touches venue_id is null rows, safe to re-run. Aretha Franklin Cafe
-- and Ford House are both new venue names to this pass; if a `venues` row
-- for either doesn't exist yet, this simply matches nothing and venue_id
-- stays null (falls back to venue_name_raw for display, same as any other
-- not-yet-directoried venue).
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;
