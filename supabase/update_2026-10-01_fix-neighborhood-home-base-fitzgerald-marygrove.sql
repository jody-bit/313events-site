-- Fixes a confirmed production bug found during live verification of the
-- Bagley/Explore Neighborhoods work (see the "do not see Bagley on the
-- live site" investigation, 2026-10-01).
--
-- ROOT CAUSE: update_2026-10-01_bagley-venues-and-boundary.sql wrote
-- "Neighborhood Home Base" with
--   neighborhood_id = (select id from neighborhoods where lower(name) = lower('Fitzgerald'))
-- but production's actual neighborhoods row for this area is named
-- "Fitzgerald-Marygrove", not "Fitzgerald" (confirmed directly: `select id,
-- name from neighborhoods where name ilike '%fitzgerald%'` returned exactly
-- one row, named "Fitzgerald-Marygrove"; "Fitzgerald" alone does not exist
-- as a row in this table). The subquery silently matched nothing and wrote
-- neighborhood_id = null instead of erroring -- the same silent-null
-- failure mode, just triggered by a name assumption rather than a typo.
-- "Fitzgerald" only exists as a label in index.html's separate, static
-- DETROIT_LOCATIONS list (used for location search/autocomplete) and in
-- NEIGHBORHOOD_PHOTOS' lookup keys (used only to pick a card photo) --
-- neither of those drives the Explore Neighborhoods rail or
-- events_public's `neighborhood` column, both of which read the real
-- neighborhoods.name value directly. Confirmed via a live pg_get_viewdef()
-- read of events_public (byte-identical to migration_025, no drift) and a
-- direct neighborhoods table query -- not assumed.
--
-- THIS DOES NOT TOUCH BAGLEY ITSELF. Bagley's own row/boundary/assignment
-- was independently verified correct during the same investigation
-- (Bagley Elementary School -> Bagley, exactly as intended). Bagley not
-- appearing on the live rail is separately confirmed to be the top-10
-- rail limit working as designed (19 neighborhoods currently have >=1
-- upcoming event; Bagley's 1 ranks 19th) -- not a bug, and not touched by
-- this file.
--
-- Idempotent update, not a reinsert -- the venues row already exists and
-- is otherwise correct (name/address/zip/website all fine); only
-- neighborhood_id and the source note needed correcting.
update venues
set
  neighborhood_id = (select id from neighborhoods where lower(name) = lower('Fitzgerald-Marygrove')),
  neighborhood_source = 'Model D Media (modeldmedia.com), "HomeBase community center opening in Detroit''s Livernois-McNichols district" -- places this address in the Fitzgerald/Fitzgerald-Marygrove area; corroborated by this project''s own existing Fitzgerald-Marygrove area_note and by Bagley''s own stated southern boundary running along the same stretch of McNichols. Corrected 2026-10-01: the original migration''s lookup used "Fitzgerald", but production''s actual row is named "Fitzgerald-Marygrove" -- confirmed directly against the neighborhoods table, not assumed.'
where lower(name) = lower('Neighborhood Home Base')
  and lower(city) = lower('Detroit');

-- Sanity check this migration can assert for itself: the row now has a
-- real neighborhood_id, not null. If this returns 0 rows, something about
-- the match above didn't take -- worth noticing immediately rather than
-- assuming success.
do $$
declare
  fixed_count integer;
begin
  select count(*) into fixed_count
  from venues
  where lower(name) = lower('Neighborhood Home Base')
    and lower(city) = lower('Detroit')
    and neighborhood_id is not null;
  if fixed_count = 0 then
    raise exception 'Fix did not take: Neighborhood Home Base still has neighborhood_id = null. Check that a neighborhoods row named exactly "Fitzgerald-Marygrove" (case-insensitive) exists.';
  end if;
end $$;

insert into schema_migrations (filename) values ('update_2026-10-01_fix-neighborhood-home-base-fitzgerald-marygrove.sql')
on conflict (filename) do nothing;
