-- Canonical Garden Bowl venue, 2026-09-22
--
-- Added while implementing Big Time Bingo (recurring Monday bingo night at
-- Garden Bowl, hosted by Mayor Darlington) — see api/cron-bigtimebingo.js
-- and api/_lib/bigtimebingo-occurrences.js. Garden Bowl had NO canonical
-- `venues` row before this file (confirmed: no match for "garden bowl" or
-- "gardenbowl" anywhere in supabase/seed.sql or any migration/update file,
-- and a fresh production-shaped grep across this repo's own SQL history
-- turns up nothing — the only prior venues from this same Woodward Ave
-- building complex are "The Majestic Theatre" and "The Magic Stick", added
-- separately in supabase/archive/update_2026-09-15_admin-followup-batch2.sql).
--
-- ADDRESS: the Product Owner flagged a genuine discrepancy between the
-- supplied Big Time Bingo poster (prints "4120 Woodward Ave, Detroit") and
-- earlier external research ("4140 Woodward Ave"). Resolved by direct
-- inspection, not by guessing:
--   1. This repo's own prior research (update_2026-09-15_admin-followup-
--      batch2.sql) already split this same building by room: "The Magic
--      Stick" = 4120 Woodward Ave, "The Majestic Theatre" = 4140 Woodward
--      Ave — both careful, sourced entries, not a single blanket number for
--      the whole complex.
--   2. Garden Bowl is its own distinct room in the same complex (bowling
--      alley + Sgt. Pepperoni's pizzeria), not the Magic Stick or the
--      Majestic Theatre, so neither existing number can just be assumed for
--      it without checking Garden Bowl's own listing.
--   3. Live-checked 2026-09-22: majesticdetroit.com/garden-bowl's own page
--      carries a page-specific address block (`<h3 class="venue_address">
--      Address</h3>`) reading exactly "4140 Woodward Ave, Detroit, MI
--      48201" — the venue's own current, authoritative, page-specific
--      address for Garden Bowl itself, not a generic sitewide footer value.
-- Conclusion: 4140 Woodward Ave, Detroit — matching the venue's own live
-- listing for this specific room. The poster's printed "4120" is kept as
-- source evidence in api/_lib/bigtimebingo-occurrences.js's header comment,
-- but is not used as the canonical address: it conflicts with the venue's
-- own current self-reported listing, and this file's job is to record the
-- correct canonical address, not merely transcribe the poster.
--
-- Same idempotent create-if-missing / repair-if-blank pattern as every
-- other canonical-venue file in this project (see
-- update_2026-09-22_trinosophes-venue.sql, update_2026-09-22_gottagacha-
-- venue.sql, update_2026-09-20_rentfreehaus-venue.sql): never creates a
-- duplicate row, never overwrites an address that's already populated with
-- something else, never touches any other venue's data. Does not modify
-- event rows directly — cron-bigtimebingo.js's own merge-duplicates upsert
-- (same mechanism proven for Trinosophes) lets existing/future Big Time
-- Bingo rows pick up venue_id on their own next normal run, no separate
-- backfill needed here.
--
-- NOT YET RUN AGAINST PRODUCTION as of this commit — prepared for Jody to
-- run by hand in the Supabase SQL Editor, same as every other canonical-
-- venue file in this project.

insert into venues (name, address, city) values
('Garden Bowl', '4140 Woodward Ave', 'Detroit')
on conflict (lower(name), lower(city)) do update set
  address = excluded.address;

insert into schema_migrations (filename) values ('update_2026-09-22_gardenbowl-venue.sql')
on conflict (filename) do nothing;
