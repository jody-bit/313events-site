-- Manual Resident Advisor pull, 2026-09-15 (Jody: "do a fresh manual
-- Resident Advisor events pull, same process as the 2026-09-13 pull").
-- Same policy as every prior RA file in this folder — see
-- update_2026-09-13_resident-advisor-manual-pull.sql's own header and
-- api/cron-halo.js's ("RA scraping remains off limits per its Terms of
-- Use") — no automated crawler, a human-driven live browser session
-- against ra.co/events/us/detroit only.
--
-- SCOPE / WHY THIS FILE IS SHORTER THAN INTENDED: ra.co's default view at
-- pull time listed 147 upcoming events; cross-checking each visible title
-- against the existing `events` table (by title/venue/date, per Jody's
-- instructions) found that all but one of them were already in the
-- database — many are the exact same rows the 2026-09-13 pull already
-- added (SHAKE DOWN, CORRUPTION: Remix Wars, Sleep Olympics, Atonement wsg
-- Colliding Pins, 3.1.3, etc. — all still upcoming, so still listed), and
-- a few more had been added separately since. That left 12 genuinely new
-- candidate titles. Partway through visiting each one's own event page (to
-- confirm exact time/venue/image — the same one-page-at-a-time approach as
-- every prior pull here), ra.co's bot-detection (DataDome) began serving a
-- challenge page instead of the real event page — first on one event page,
-- then on the listing page itself. That's a live browser being throttled
-- for requesting too many pages in a short span, not a scraper being
-- caught; per this project's own no-scraping policy, the right response is
-- to stop rather than push through it, so only the one event confirmed
-- BEFORE the block hit is included below.
--
-- The other 11 candidate titles found but not yet detail-confirmed (title
-- — venue — ra.co event id — the date shown on the listing page):
--   Alternative School presents: BOUNCE THAT with DJ Assault (below, DONE)
--   HIPHOP NIGHT: DJ KDIRTY + DJ CARTER (HIPHOP CLUB BANGERS) — Big Pink — ra.co/events/2533999 — Sat 19 Sep
--   A BIG A$$ PARTY: shekdash, AK, Disc Jockey George b2b JMT — TV Lounge — ra.co/events/2523930 — Sat 19 Sep
--   FIESTA HOUSE — Marble Bar — ra.co/events/2536892 — Sat 19 Sep
--   Low End Theory — Spkrbox — ra.co/events/2536213 — Wed 16 Sep
--   Nightcap Detroit — Spkrbox — ra.co/events/2536212 — Wed 16 Sep
--   Planet Funk — Spkrbox — ra.co/events/2536211 — Wed 16 Sep (date approximate — not detail-confirmed)
--   Groove Night — Spkrbox — ra.co/events/2536214 — Thu 17 Sep
--   TOP2BTTM presents: OPEN CALL (Sexy Underwear Contest, Drag Performers, + more) — The Eagle of Detroit — ra.co/events/2532529 — Fri 18 Sep
--   Ember — Spkrbox — ra.co/events/2536273 — Fri 18 Sep
--   Interface — Spkrbox (unconfirmed) — ra.co/events/2536271 — Fri 18 Sep
--   SECRET SETS — Lincoln Factory (unconfirmed) — ra.co/events/2532512 — Fri 18 Sep
-- None of these are written below — no fabricated time/image for any of
-- them. Finish this list in a later pass once ra.co stops challenging this
-- browser (later today, or a fresh session tomorrow) — same one-page-at-a-
-- time approach, just resumed rather than redone.
--
-- Day/date cross-check done for the one row below (Jody flagged a past
-- mismatched day/date incident from this source): computed independently
-- rather than trusted from RA's own label — Sept 19, 2026 is in fact a
-- Saturday, matching RA's "Sat, 19 Sep 2026" listing exactly.
--
-- category: 'nightlife', same project-wide convention as every other
-- Resident-Advisor-sourced row (genre tags on RA's own page: Bass, Ghetto
-- Tech).
--
-- Idempotent: external_id makes this a stable upsert target, same pattern
-- as every cron/pull file here.

insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, ticket_url, image_url, source, note, status
) values

('ra-2526468', 'Alternative School presents: BOUNCE THAT with DJ Assault',
 'BOUNCE THAT returns for its fourth iteration, taking over two stages at Northern Lights Lounge with DJ Assault''s bass-heavy, accelerated take on Detroit dance music at the center of the night, alongside DJ Psycho, Ember LaFiamma, Fullbodydurag, and jamea b2b we1sman.',
 'nightlife', 'Northern Lights Lounge', '660 W. Baltimore Street', 'Detroit',
 '2026-09-19', '2026-09-20', '10:00 PM–3:30 AM', false,
 'https://ra.co/events/2526468',
 'https://images.ra.co/169990bf6dcd3f0c9624a1d1135d05b4f282c3e3.jpg',
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
  ticket_url = excluded.ticket_url,
  image_url = excluded.image_url,
  note = excluded.note;

-- Same generic name-match backfill as every other new-events file here —
-- only touches venue_id is null rows, safe to re-run.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;
