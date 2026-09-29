-- Migration 043: feed_sources.location_per_event
--
-- Context: api/cron-feeds.js's icsEventsToRows() has always assumed one
-- feed = one venue (migration_008's own v1 scope), forcing every event a
-- feed produces to feedSource.venue_name regardless of what that VEVENT's
-- own LOCATION property actually says. FEED_SUBMISSIONS.md flagged this
-- as a known v1 limitation. Verified blocked feeds (Tourism Windsor
-- Essex, Downtown Windsor BIA, Windsor Symphony Orchestra, Eastern Market
-- Partnership, CivicPlus municipal calendars) are themselves aggregators
-- or organizations, not single venues -- substituting their own name as
-- every event's venue would be actively wrong, not just imprecise.
--
-- This adds the smallest possible switch: a feed_source explicitly opted
-- into per-event venue resolution (see api/_lib/ics-location.js and
-- cron-feeds.js's resolveIcsEventVenue) instead of the legacy
-- one-venue-per-feed behavior. Defaults to false for every existing row,
-- so every currently-approved feed (Trinosophes-style single-venue feeds)
-- keeps its exact current behavior, unchanged -- this column only ever
-- turns a new capability ON for a feed an admin has explicitly reviewed
-- and flagged as an aggregator, never silently changes anything already
-- live. Set by hand in admin.html/api/admin-feeds.js at onboarding time
-- (or via a direct PATCH), never inferred automatically from a feed's own
-- content -- same "a human decides, the system never guesses" posture as
-- every other trust-tier decision in this project.
--
-- Run this once in Supabase's SQL Editor; safe to re-run (IF NOT EXISTS
-- throughout, same convention as every migration before this one).

alter table feed_sources
  add column if not exists location_per_event boolean not null default false;

comment on column feed_sources.location_per_event is
  'When true, api/cron-feeds.js resolves each VEVENT''s own LOCATION into that event''s venue (see api/_lib/ics-location.js) instead of forcing feedSource.venue_name onto every row. Set only by an admin reviewing the feed at onboarding time -- never inferred automatically. Default false preserves the original one-feed-one-venue behavior for every existing feed.';
