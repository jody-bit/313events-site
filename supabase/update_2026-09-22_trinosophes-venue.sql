-- Adds/repairs the curated venues row for Trinosophes, 2026-09-22 --
-- closes the historical-data gap found while investigating the Product
-- Owner's report of ~9 production Trinosophes events flagged VENUE
-- ADDRESS/CITY in Needs Follow-up despite Trinosophes already having its
-- own page.
--
-- No committed migration or seed file anywhere in this repository's
-- history ever created a `venues` row for Trinosophes at all (checked:
-- no `insert into venues` mentioning it anywhere under supabase/, seed.sql
-- included) -- unlike every other fixed-venue single-source cron (Outer
-- Limits Lounge, Popps Packing, Rent Free Haus, GottaGacha), each of which
-- has one on record. cron-trinosophes.js's own resolveVenueId() call
-- (api/_lib/venue-lookup.js) was independently verified correct by direct
-- test (test/venue-lookup.test.js, test/cron-trinosophes-runlog.test.js,
-- added 2026-09-22) -- no matching/normalization defect found. This
-- migration supplies the missing canonical row those tests already proved
-- the connector is ready to match against, the same shared layer every
-- other source relies on.
--
-- Address/city: '1464 Gratiot Ave', 'Detroit' -- not a new lookup, per the
-- Product Owner's explicit instruction not to run another discovery pass.
-- This exact address was already independently confirmed and used 12+
-- times in this project's own history, in
-- supabase/archive/update_2026-09-12_followup_desc_addr_ticket_batch_B.sql
-- (direct per-event venue_address_raw/venue_city_raw patches, researched
-- 2026-09-12) -- reused here verbatim.
--
-- Idempotent, same ON CONFLICT target as every other venue file here
-- (venues_name_city_key: unique index on (lower(name), lower(city))):
-- creates the row if it doesn't exist; if it already exists (the Product
-- Owner's own account of the live admin panel says it does) but address is
-- blank or different, repairs it to the canonical value above. Never
-- creates a duplicate venue -- that's exactly what the ON CONFLICT target
-- prevents -- and never touches any other venue's row or any other column
-- on this one.
--
-- Deliberately does NOT include this project's usual accompanying
-- `update events set venue_id = ... where venue_id is null` backfill step
-- (see update_2026-09-13_popps-packing-venue.sql / update_2026-09-20_
-- rentfreehaus-venue.sql / update_2026-09-22_gottagacha-venue.sql for that
-- pattern) -- the Product Owner explicitly asked that this migration not
-- modify event rows directly. It also isn't needed: every existing
-- Trinosophes event row already gets `venue_id` resent on every normal
-- cron-trinosophes.js run (it's part of every upserted row's payload, and
-- PostgREST's `resolution=merge-duplicates` upsert sets every column
-- present in that payload for a matching external_id -- the same
-- mechanism this project's WP 0.17 status-lookup fix relies on to avoid
-- clobbering moderation status). Once this row exists, any currently-
-- upcoming Trinosophes event still listed on trinosophes.com/Events picks
-- up the correct venue_id automatically on the very next scheduled run --
-- no separate backfill required.
--
-- NOT YET RUN AGAINST PRODUCTION. Claude's execution environments cannot
-- reach the 313.events Supabase production database directly (DEBT-002,
-- see BACKLOG.md). Prepared for Jody to run by hand in the Supabase SQL
-- Editor, same workflow as update_2026-09-22_gottagacha-venue.sql.

insert into venues (name, address, city) values
('Trinosophes', '1464 Gratiot Ave', 'Detroit')
on conflict (lower(name), lower(city)) do update set
  address = excluded.address;

insert into schema_migrations (filename) values ('update_2026-09-22_trinosophes-venue.sql')
on conflict (filename) do nothing;
