-- 20261006000003_sz01_public_access_boundary.sql
--
-- SZ-01 — one public/private data-access boundary (Engineering Readiness
-- Review SZ-01, TD-03, guardrail G-6).
--
-- DEFECT (confirmed on production 2026-10-06 with counts only, no values read):
-- anon and authenticated hold table-level SELECT on `events`, and the only
-- row policy is "status = approved". So every approved row returns EVERY
-- column to an anonymous client: 7 approved rows expose submitter_email and
-- submitter_org_name, 76 expose an internal_note. Approval makes a row
-- public; it must not make its contact details and operations notes public.
-- The same legacy grants also give anon INSERT/UPDATE/DELETE/TRUNCATE (RLS
-- blocks most of it, but TRUNCATE and TRIGGER are not governed by RLS, and
-- the INSERT policy is an unused path around /api/submit).
--
-- 2026-10-06 FINDING: `events.note` (in the public view and, until now, public)
-- held internal commentary on ~300 approved events; it is private.
--
-- DESIGN: an explicit allowlist, enforced by grants, not by hoping every
-- page selects the right columns.
--   * anon / authenticated may SELECT only the listed `events` columns.
--     Columns added later are private until deliberately listed here.
--   * anon / authenticated get no INSERT/UPDATE/DELETE/TRUNCATE anywhere.
--     Submissions go through /api/submit and /api/submit-feed, which use the
--     service role; nothing in the repository writes with the anon key.
--   * Internal tables (event_source_identities, feed_sources, healthchecks,
--     schema_migrations, source_runs) are unreachable by anon/authenticated.
--     RLS-enabled with no policy is correct for them; no policy is added.
--   * Tables that are intentionally public keep table-level SELECT
--     (categories, neighborhoods, organizers, venues, editorial_articles,
--     editorial_article_events) — their rows are public by policy. Their
--     operational columns (venues.zip_code / neighborhood_confidence /
--     neighborhood_source; editorial_articles.feed_url / match_type /
--     admin_dismissed) are low sensitivity and are recorded as a residual,
--     to be narrowed with the same pattern if wanted.
--   * events_public becomes security_invoker. It was owner-rights, which
--     bypassed RLS silently. As invoker it can return only what the caller's
--     own grants allow, so adding a private column to the view later fails
--     for anon instead of leaking. Its columns and WHERE clause are unchanged.
--   * service_role is untouched: ingestion, Admin and every cron keep full access.
--   * Default privileges for future public tables/functions no longer open
--     them to anon/authenticated (a new table, such as organizer-management
--     tokens, starts private).
--   * set_updated_at() gets a fixed search_path and is no longer executable
--     by anon/authenticated (it is a trigger function; triggers run it
--     regardless). Independent and trivial, so it rides along.
--
-- Run staging first; production only with Product Owner approval.

-- 1. Remove the legacy blanket grants for the two client-facing roles.
revoke all on table
  categories, editorial_article_events, editorial_articles, event_source_identities,
  events, events_public, feed_sources, healthchecks, neighborhoods, organizers,
  schema_migrations, source_runs, venues
from anon, authenticated;

-- 2. Public reads: intentionally public tables and the public view.
grant select on table
  categories, editorial_article_events, editorial_articles, neighborhoods,
  organizers, venues, events_public
to anon, authenticated;

-- 3. events: the public column allowlist. `note` is deliberately NOT in it.
--    Everything else (note, submitter_email,
--    submitter_org_name, internal_note, organizer_id, feed_source_id,
--    external_id, created_at, followup_*, neighborhood_*, description_source,
--    link_check_*, is_recurring, is_all_day, no_fixed_venue) stays private.
grant select (
  id, title, description, image_url,
  start_date, end_date, time_display,
  category, venue_id, venue_name_raw, venue_address_raw, venue_city_raw,
  is_free, price_from, ticket_url, event_url, ticket_status, is_clothing_optional,
  source, status, updated_at
) on table events to anon, authenticated;

-- 4. The anonymous write paths are unused (server-side service role only).
--    The insert grants are gone above; the two INSERT policies are also made
--    unsatisfiable. They are neutralised, not dropped: this project does not
--    drop what it can disable, and a policy that can never pass cannot be
--    revived by a stray grant. (A later cleanup may drop them.)
alter policy "public submit pending events" on events with check (false);
alter policy "public submit pending feed sources" on feed_sources with check (false);

-- 5. The public view: runs with the caller's rights and no longer exposes
--    `note`. `note` is free text that staff and research sessions filled with
--    editorial commentary ("included per Jody's request ..."); it is NOT public
--    data (BUG-011, 2026-10-06). The column stays in the view, always NULL,
--    so a page cached from before the BUG-011 hotfix that still selects it keeps
--    working (it just receives nothing). Replaced in place; nothing is dropped.
create or replace view events_public as
select e.id, e.title, e.description, e.image_url, e.start_date, e.end_date, e.time_display,
       e.category, e.is_free, e.price_from, e.source,
       null::text as note,
       e.ticket_url, e.event_url, e.venue_id,
       coalesce(v.name, e.venue_name_raw) as venue_name,
       coalesce(v.city, e.venue_city_raw) as venue_city,
       n.name as neighborhood,
       e.is_clothing_optional, e.ticket_status
from events e
left join venues v on v.id = e.venue_id
left join neighborhoods n on n.id = v.neighborhood_id
where e.status = 'approved'::event_status;
alter view events_public set (security_invoker = true);

-- 6. Future public objects start private.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- 7. set_updated_at: immutable search_path; trigger functions are not RPC.
alter function set_updated_at() set search_path = '';
revoke execute on function set_updated_at() from public, anon, authenticated;
