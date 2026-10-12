-- PROPOSED, NOT EXECUTED. Needs Jody's approval before anything runs.
-- GottaGacha + Shake Some Action WFMU source links (2026-10-12).
-- Evidence: SELECT-only reads of production on 2026-10-12.
--
-- Scope: event_url only on three rows. ticket_url, descriptions, status,
-- venues and every other row are untouched. Each UPDATE only fills a blank
-- event_url (it can never replace a link someone set).

-- ===== BEFORE (preview) ==================================================
-- select id, title, start_date, source, event_url, ticket_url from events
-- where id in ('f8fb2636-0b82-49d6-9386-0186a48ee77c',
--              '9c00d431-1830-4abd-acaa-322a7de716b8',
--              '50d96d41-099f-4f98-b208-7049320fdf93');
--  f8fb2636..  Shake Some Action WFMU Presents: H8 Mile + Diet Smiles  2026-12-11  manual        event_url NULL  ticket_url NULL
--  9c00d431..  PART 2                                                  2026-11-21  GottaGacha    event_url NULL  ticket_url NULL
--  50d96d41..  GFE Tourney                                             2026-11-14  GottaGacha    event_url NULL  ticket_url NULL
--
-- ===== AFTER (what the statements below produce) ==========================
--  f8fb2636..  event_url = https://www.instagram.com/shakesomeactionwfmu/   ticket_url NULL (unchanged)
--  9c00d431..  event_url = https://www.gottagacha.com/events                ticket_url NULL (unchanged)
--  50d96d41..  event_url = https://www.gottagacha.com/events                ticket_url NULL (unchanged)
--
-- Why the two GottaGacha rows are not "fixed" by the next cron run: both were
-- last updated 2026-10-08 15:54 UTC and have not been touched by any of the
-- daily runs since, so the source feed no longer returns them (series ids
-- a9491e78-... and d9d62193-...). They may be dropped or re-issued upstream.
-- This SQL only gives them the official events page; whether they should
-- remain is an editorial call (not deleted here).

update events set event_url = 'https://www.instagram.com/shakesomeactionwfmu/'
where id = 'f8fb2636-0b82-49d6-9386-0186a48ee77c'
  and (event_url is null or btrim(event_url) = '');

update events set event_url = 'https://www.gottagacha.com/events'
where id in ('9c00d431-1830-4abd-acaa-322a7de716b8', '50d96d41-099f-4f98-b208-7049320fdf93')
  and source = 'GottaGacha'
  and (event_url is null or btrim(event_url) = '');

-- NOT included (no verified facts available; see the thread report):
--  * Shake Some Action description (269 chars) is cut off after "Squzz (".
--  * Hi-Fight Circuit #15 (67afc423..) description reads "Mario Kart Monthly".
--  * The canonical GottaGacha venue row does not exist in production
--    (supabase/update_2026-09-22_gottagacha-venue.sql was never run).
