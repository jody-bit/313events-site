-- Database-wide duplicate sweep, requested by Jody 2026-09-04 ("we need to
-- run a database wide check for dupes and combine them").
--
-- How this list was built: live-queried every approved/pending_review event
-- (1,429 rows) via the Supabase REST API and grouped by normalized title +
-- exact start_date. A naive "same title within N days" match throws a LOT
-- of false positives on this site — "A Christmas Carol" at Meadow Brook
-- Theatre legitimately has 9 rows because it's a 9-performance run, same
-- for "Toledo Mud Hens vs [team]" (a multi-game series), "Frozen touring",
-- etc. Matching on the EXACT same date instead of a date window filters
-- almost all of that out, since two different performances of the same
-- show essentially never land on the literal same calendar date in this
-- data. is_recurring rows are excluded entirely for the same reason.
--
-- What's left after that filter is one dominant, genuine pattern: a show
-- entered by hand (source='Manual', mostly at the Fox Theatre — someone
-- was clearly keeping the Fox's calendar current manually) that the
-- Ticketmaster affiliate cron later ALSO picked up independently, plus a
-- handful of the same thing with Dice/19hz.info/Resident Advisor instead
-- of Manual. 21 such pairs, all same title + same exact date + one row
-- from an external ticketing/listings source. Kept the external source's
-- row in every case (real ticket_url, external_id an idempotent cron
-- upsert manages going forward, and for Ticketmaster specifically, the
-- affiliate-wrapped link — see api/cron-ticketmaster.js) and delete the
-- weaker/manual duplicate. None of the 21 rows being deleted have any
-- editorial_article_events press links (checked live before writing this),
-- so there's nothing to re-point first, unlike the Jazz Festival case.
--
-- Left OUT of this auto-delete list, for manual review instead:
--   'Mojo Brookzz — Outta Pocket Tour' (2026-09-11, Fox Theatre) has THREE
--   rows: one Manual and TWO Ticketmaster (different external_ids). That's
--   not a clean "keep the one automated row" case — could be an early/late
--   showtime pair on Ticketmaster's own side, or a genuine TM-side dupe.
--   Check ticket_url/time_display on both TM rows before deciding which
--   (if either) to drop.
--
-- The Detroit Jazz Festival cluster (8 rows) is handled separately in
-- update_2026-09-04_dedupe_detroitjazzfest.sql, since 3 of its rows had
-- press articles that needed re-pointing first.
--
-- This is a one-time sweep of TODAY's data, not a standing fix — the
-- underlying gap (nothing checks a new manual entry against what
-- Ticketmaster's cron already has, or vice versa) still exists, so new
-- Manual-vs-Ticketmaster duplicates can appear again. Worth a proper
-- admin-side duplicate-review tool as a follow-up if this keeps recurring;
-- for now, re-running the same query that built this list (grouping
-- approved/pending events by normalized title + exact start_date) is the
-- repeatable way to check again later.
--
-- Idempotent: safe to re-run (deleting already-deleted ids is a no-op).

delete from events where id in (
  'd96113d3-e3ea-4045-8ed1-460245b74431', -- All Star Comedy Festival, 2026-10-17, Manual (kept: Ticketmaster)
  'dd93ca1e-79bc-49ed-b6f2-4323f438494d', -- Arrows in Action, 2026-09-24, Dice (kept: Ticketmaster)
  '71c04192-5dc1-45e0-a5e3-a1042dfce3ff', -- Assala Nasri, 2026-10-31, Manual (kept: Ticketmaster)
  '3ebab2b0-e4d1-47d7-82c3-aabd68a60ac3', -- Beck — Ride Lonesome Tour, 2026-10-12, Manual (kept: Ticketmaster)
  '7f6802c5-b549-47e3-89f6-217539dc0242', -- Brand New, 2026-10-06, Manual (kept: Ticketmaster)
  '2ae320e7-b4c4-4915-9b93-3816a72d8b99', -- Danny Elfman, 2026-09-09, Manual (kept: Ticketmaster)
  'f7783b03-67b2-4925-8cd0-8c402535f754', -- Fall Frenzy, 2026-10-04, Manual (kept: Ticketmaster)
  'db456f7d-17a4-42c9-8ac8-f6601b0a5b33', -- Gorillaz — The Mountain Tour, 2026-10-07, 19hz.info (kept: Ticketmaster)
  'e2a3555a-69e0-44e7-b8ab-e8fcc387fa71', -- Jim Gaffigan — Everything Is Wonderful!, 2026-09-18, Manual (kept: Ticketmaster)
  '166031a8-1c4a-4327-b974-08144816b4c8', -- Jim Gaffigan — Everything Is Wonderful!, 2026-09-19, Manual (kept: Ticketmaster)
  '9b5d9452-c778-4d8c-b77d-a420226f5d39', -- Jo Koy — Koy Meets World Tour, 2026-10-24, Manual (kept: Ticketmaster)
  'cd6999d7-35e1-44c1-a71f-af902b25bd89', -- Leanne Morgan — The Time of Our Lives Tour, 2026-10-15, Manual (kept: Ticketmaster)
  '3dd78e52-582e-450c-8404-661f722b8fcc', -- Leanne Morgan — The Time of Our Lives Tour, 2026-10-16, Manual (kept: Ticketmaster)
  '642c6232-374e-40a9-9d67-8f66b01808e6', -- Lily Allen Performs West End Girl, 2026-09-12, Manual (kept: Ticketmaster)
  '889acf43-755f-4724-84b5-4650db85699d', -- Malcolm Todd — Do That Again Tour, 2026-10-01, Manual (kept: Ticketmaster)
  '64dc6102-c1c4-4886-9a09-036936c15dba', -- Mietze Conte, 2026-09-04, Dice (kept: Ticketmaster)
  '0a80e207-cd1c-4ad7-9ce3-1c6f14f36b1f', -- oskar med k, 2026-09-11, Resident Advisor (kept: Ticketmaster)
  '1b1c4fb8-7471-442d-9c39-a4ad1f94227c', -- Ray LaMontagne — Trouble 20th Anniversary Tour, 2026-09-20, Manual (kept: Ticketmaster)
  '060dda81-7af5-4937-86a3-d23bde65e675', -- Stella Cole, 2026-09-03, Manual (kept: Ticketmaster)
  '3f3874e0-e075-4a69-96a8-58d2ebb56b96', -- The Chicks — Taking the Long Way, 2026-09-30, Manual (kept: Ticketmaster)
  'c47a1391-1511-42ad-8c29-64b33864b64d'  -- Undertale: The Determination Symphony World Tour, 2026-10-08, Manual (kept: Ticketmaster)
);
