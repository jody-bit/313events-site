-- PROPOSED (not applied anywhere in production). Supabase advisor ERROR: security_definer_view on public.events_public.
-- Production drift: the view has no reloptions (owner rights, postgres). Staging already has security_invoker=true, as
-- migrations/20261006000003_sz01_public_access_boundary.sql intended.
--
-- Why this is safe (read-only checks; production 2026-10-18 and again 2026-11-17/18):
--   * production events has the RLS policy "public read approved events" (status = 'approved') for role public (anon AND
--     authenticated); venues and neighborhoods have "using (true)" read policies. RLS is NOT changed by this file.
--   * anon already holds column-level SELECT on every events/venues/neighborhoods column the view reads (including
--     date_semantics and occurrence_dates), so an invoker view returns the same rows and columns for anon:
--     production 2026-11-17: owner-rights view 5229 rows = approved 5229; same body as anon (rolled back) 5229.
--   * `authenticated` holds column grants on every events column the view reads EXCEPT date_semantics and occurrence_dates
--     (production and staging identical). Under an invoker view a signed-in caller would get 42501 permission denied
--     (reproduced on staging as role authenticated, 2026-11-18). No signed-in caller exists in the repo (anon key only).
--     Step 1 below closes exactly that gap and nothing else: two column grants, the same two anon already has.
--   * Rehearsal on STAGING in a rolled-back transaction (2026-11-18; nothing persisted): before the grant, authenticated
--     reading events_public fails 42501; after step 1, authenticated reads 482 rows = approved 482, the same as the owner
--     count, and sees 0 non-approved events. Rolled back; staging grants unchanged afterwards.
--
-- Interaction with the time-confidence change: that migration also replaces events_public. `create or replace view` keeps
-- reloptions, but a drop + create loses them (e.g. proposed/2026-10-13_event_date_semantics_rollback.sql). Whoever lands
-- second must keep `security_invoker = true` (re-run step 2).
--
-- Order: grant first, then invoker, in ONE transaction. Needs Jody's exact GO for production; no code change.
begin;
  -- 1. authenticated may read the two columns the view exposes that it lacks. Column-level only; no table-level grant,
  --    no other column, no RLS change, no new role. anon is unchanged (already has both).
  grant select (date_semantics, occurrence_dates) on public.events to authenticated;
  -- 2. run the view with the caller's rights.
  alter view public.events_public set (security_invoker = true);
commit;

-- Verify (read-only), after commit:
--   select reloptions from pg_class where oid = 'public.events_public'::regclass;       -- {security_invoker=true}
--   begin; set local role anon; select count(*) from public.events_public; rollback;   -- must equal the pre-change count (5229 on 2026-11-17)
--   begin; set local role authenticated; select count(*) from public.events_public;
--          select count(*) from public.events where status <> 'approved'; rollback;     -- first = same count as anon; second = 0
--   select has_column_privilege('authenticated','public.events','date_semantics','SELECT'), has_column_privilege('authenticated','public.events','occurrence_dates','SELECT');  -- true,true
--   re-run get_advisors(security): security_definer_view must be gone.
--
-- Rollback (restores owner rights and the grants exactly), in ONE transaction:
--   begin;
--     alter view public.events_public set (security_invoker = false);
--     revoke select (date_semantics, occurrence_dates) on public.events from authenticated;
--   commit;
