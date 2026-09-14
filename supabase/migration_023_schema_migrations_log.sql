-- Migration 023: schema_migrations tracking
--
-- Context: Jody, 2026-09-14 — "growing pains from more sources" was one of
-- the explicit reasons given for wanting a scalable database plan. By this
-- file, supabase/ holds 22 numbered migrations plus ~28 dated seed/update
-- files (patches for specific data-quality fixes, manual pulls, venue
-- corrections) — every one of them meant to be pasted into Supabase's SQL
-- Editor by hand, with no record anywhere of which ones actually got run.
-- That's already hard to keep straight from this codebase alone; it only
-- gets harder as more sources/venues/neighborhoods keep landing the same
-- way (see today's own two cemetery-district files). This migration adds a
-- minimal ledger so "has this already been applied?" has a real answer
-- instead of relying on memory or git history.
--
-- Deliberately NOT a heavyweight migration framework (no down-migrations, no
-- checksums, no CLI) — this project's whole workflow is "Claude writes a
-- .sql file, Jody pastes it into the SQL Editor herself," and every file
-- already follows a strict IF NOT EXISTS / ON CONFLICT DO NOTHING /
-- idempotent-safe-to-rerun convention. A ledger table that matches that same
-- low-ceremony spirit is what's actually useful here: one row per file,
-- written once, safe to re-run.
--
-- GOING FORWARD: every NEW migration/update file should end with a line
-- recording itself, e.g.:
--   insert into schema_migrations (filename) values ('migration_024_whatever.sql')
--   on conflict (filename) do nothing;
-- (see the bottom of this exact file, and every migration/update file
-- created after this one, for the pattern.) Older files are NOT being
-- retroactively edited to add this — see the one-time backfill below
-- instead, which records everything already known to exist as of today.

create table if not exists schema_migrations (
  filename    text primary key,
  applied_at  timestamptz not null default now(),
  note        text   -- optional free-text, e.g. "backfilled 2026-09-14, actual run date unknown"
);

alter table schema_migrations enable row level security;
-- No public policies at all — this is purely an internal bookkeeping table
-- for Jody/Claude's own use via the SQL Editor (service-role/owner
-- context), never queried by the public site or the anon key.

-- ---------------------------------------------------------------------------
-- One-time backfill: every migration/seed/update file that already existed
-- in the repo as of 2026-09-14, in the order they were created. Real
-- "applied" timestamps aren't recoverable at this point, so these are all
-- backfilled with note='backfilled...' rather than pretending to know the
-- exact original run time — same "don't guess/fabricate" convention this
-- whole project already holds itself to elsewhere.
-- ---------------------------------------------------------------------------
insert into schema_migrations (filename, note) values
  ('schema.sql', 'backfilled 2026-09-14 — the original baseline, predates this ledger'),
  ('seed.sql', 'backfilled 2026-09-14'),
  ('migration_002_neighborhoods_and_organizers.sql', 'backfilled 2026-09-14'),
  ('migration_003_fix_external_id_index.sql', 'backfilled 2026-09-14'),
  ('migration_004_source_registry.sql', 'backfilled 2026-09-14'),
  ('migration_005_neighborhood_confidence.sql', 'backfilled 2026-09-14'),
  ('migration_006_venue_city_raw.sql', 'backfilled 2026-09-14'),
  ('migration_007_sports_category.sql', 'backfilled 2026-09-14'),
  ('migration_008_feed_sources.sql', 'backfilled 2026-09-14'),
  ('migration_009a_grant_insert.sql', 'backfilled 2026-09-14'),
  ('migration_009b_community_category.sql', 'backfilled 2026-09-14'),
  ('migration_010_neighborhood_review_2026-08-27.sql', 'backfilled 2026-09-14'),
  ('migration_011_editorial_articles.sql', 'backfilled 2026-09-14'),
  ('migration_012_fix_editorial_articles_unique_index.sql', 'backfilled 2026-09-14'),
  ('migration_013_event_flyers_bucket.sql', 'backfilled 2026-09-14'),
  ('migration_014_fix_raw_24h_time_display.sql', 'backfilled 2026-09-14'),
  ('migration_015_cleanup_unmatched_editorial_articles.sql', 'backfilled 2026-09-14'),
  ('migration_016_editorial_articles_admin_review.sql', 'backfilled 2026-09-14'),
  ('migration_017_clear_inverted_end_dates.sql', 'backfilled 2026-09-14'),
  ('migration_018_vendor_category.sql', 'backfilled 2026-09-14'),
  ('migration_019_healthchecks.sql', 'backfilled 2026-09-14'),
  ('migration_020_venue_address_raw.sql', 'backfilled 2026-09-14'),
  ('migration_021_editorial_article_events.sql', 'backfilled 2026-09-14'),
  ('migration_022_event_url.sql', 'backfilled 2026-09-14'),
  ('seed_2026-09-04_manual_events.sql', 'backfilled 2026-09-14'),
  ('seed_2026-09-04_more_annual_events.sql', 'backfilled 2026-09-14'),
  ('seed_2026-09-04_planetanttheatre_manual_pull.sql', 'backfilled 2026-09-14'),
  ('seed_hamtramck_2026_annual_events.sql', 'backfilled 2026-09-14'),
  ('seed_lexus_velodrome_adult_skate_night.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-04_approve_std_313electronics.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-04_artsbeatseats_hours.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-04_dedupe_common_events.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-04_dedupe_detroitjazzfest.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-04_dedupe_mojo_brookzz.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-04_detroitjazzfest_hours.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-04_dismiss_stale_editorial.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-04_mistatefair_hours.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-05_fillmore_detroit_young_thug_dedupe.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-05_hamtramck_labor_day_time.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-05_ticketmaster_descriptions_batch2.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-05_ticketmaster_descriptions_batch3.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-05_ticketmaster_descriptions_batch4.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-05_ticketmaster_descriptions_trial_batch.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-13_backfill_venue_id_matched_venues.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-13_new_venues_from_ticketmaster_longtail.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-13_paris-bar-rename.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-13_parisbar-instagram-flyers.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-13_popps-packing-venue.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-13_resident-advisor-manual-pull.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-13_venue-mismatch-fixes.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-13_visitdetroit-manual-pull.sql', 'backfilled 2026-09-14'),
  ('update_2026-09-14_eastside-historic-cemetery-district.sql', 'backfilled 2026-09-14 — includes its same-day Part 2 addendum')
on conflict (filename) do nothing;

insert into schema_migrations (filename) values ('migration_023_schema_migrations_log.sql')
on conflict (filename) do nothing;
