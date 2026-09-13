-- Backfill events.venue_id for every event whose venue_name_raw matches an
-- existing venues.name — the "load-bearing gap" flagged in FOUNDATIONAL_ITEMS.md
-- §4/§5, DISCOVERY_PHASE1_AUDIT.md §1/§2, and AUDIT_AND_ARCHITECTURE.md §D/§G:
-- every cron and the seed data have only ever written venue_name_raw as free
-- text, so events.venue_id has sat unpopulated (1 row out of 1492, confirmed
-- live 2026-09-13) even though 71 of your 83 venues already carry a real
-- neighborhood_id from migration_002/005. That neighborhood data has been
-- unreachable from the event side purely because of this missing join.
--
-- Scope, confirmed live before writing this: 83 venues, all with distinct
-- names (zero case-insensitive collisions — checked first, see below).
-- Of 1492 events, 171 distinct venue_name_raw values; 81 of those match an
-- existing venue by name (case/whitespace-insensitive), covering 729 events.
-- The other 90 distinct names (763 events — mostly wider-region Ticketmaster
-- venues like Blind Pig, Black Box, The Magic Bag, Royal Oak Music Theatre)
-- don't exist in `venues` at all yet and are NOT touched by this patch —
-- that's a separate, larger research task (new venues need real sourced
-- addresses/cities before they can be created, same rigor as the original
-- 83), tracked separately rather than guessed at here.
--
-- Match is case/whitespace-insensitive (lower(trim(...))) because that's
-- exactly the normalization that produced the "81 distinct matches" count
-- above — confirmed zero venue-side collisions under that same
-- normalization, so it's a safe, deterministic 1:1 join, not a fuzzy guess.
--
-- Idempotent and safe to re-run: only touches rows where venue_id is
-- currently null, so running this twice (or after future backfills) never
-- overwrites a value that's already set — same convention as every other
-- SQL patch in this project.
--
-- Verify-before-write: the two SELECTs below are informational (safe to
-- run alone first) — the actual UPDATE is the third statement.

-- 1. Sanity check: confirm zero venue-name collisions before trusting the join.
--    Expect 0 rows.
select lower(trim(name)) as normalized_name, count(*)
from venues
group by lower(trim(name))
having count(*) > 1;

-- 2. Preview: how many events this will touch, and how many are already set.
--    Expect not_yet_linked ~= 729 (may drift slightly if new events have
--    landed since 2026-09-13), already_linked = whatever's already set.
select
  count(*) filter (where e.venue_id is null) as not_yet_linked,
  count(*) filter (where e.venue_id is not null) as already_linked
from events e
join venues v on lower(trim(e.venue_name_raw)) = lower(trim(v.name));

-- 3. The actual backfill.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;
