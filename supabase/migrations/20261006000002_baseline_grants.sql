-- 20261006000002_baseline_grants.sql
--
-- LEGACY PRODUCTION BASELINE — NOT AN ENDORSEMENT.
--
-- Production's public tables (and the events_public view) grant FULL privileges
-- (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) to
-- anon, authenticated and service_role. They got that from the Supabase default
-- privileges of the era when the production project was created. Projects
-- created later (e.g. 313events-staging) default to far fewer privileges, so
-- the baseline must state the grants explicitly or a rebuilt database does not
-- behave like production (service_role could not even write).
--
-- Row Level Security is the ONLY thing limiting what anon can do with these
-- grants. That is too broad (for example, the events SELECT policy is row-level
-- only, so approved rows expose every column, and TRUNCATE is not governed by
-- RLS). SZ-01 is the planned, reviewed change that tightens this: it will be a
-- LATER migration, applied to staging first. Do not tighten here; this file
-- exists so staging reproduces production exactly BEFORE that change.
--
-- Read from production's relacl on 2026-10-06 (metadata only): every table and
-- the view carry {postgres, anon, authenticated, service_role} = arwdDxtm.

grant all on table
  categories, editorial_article_events, editorial_articles, event_source_identities,
  events, feed_sources, healthchecks, neighborhoods, organizers, schema_migrations,
  source_runs, venues
to anon, authenticated, service_role;

grant all on table events_public to anon, authenticated, service_role;

-- The trigger function is executable by everyone and the roles (PostgreSQL default).
grant execute on function set_updated_at() to public, anon, authenticated, service_role;

-- Schema usage, as in production.
grant usage on schema public to anon, authenticated, service_role;
