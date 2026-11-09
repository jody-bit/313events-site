-- EVENT DATE SEMANTICS: ROLLBACK (PROPOSED, NOT EXECUTED).
-- Only safe while no page selects the new columns (revert that PR first).
-- Wrap in begin/commit: the view is briefly absent inside the transaction only.
-- CREATE OR REPLACE VIEW cannot drop columns, so the view must be dropped and recreated.
begin;
drop view if exists public.events_public;
create view public.events_public as
select
  e.id, e.title, e.description, e.image_url, e.start_date, e.end_date, e.time_display,
  e.category, e.is_free, e.price_from, e.source,
  null::text as note,
  e.ticket_url, e.event_url, e.venue_id,
  coalesce(v.name, e.venue_name_raw) as venue_name,
  coalesce(v.city, e.venue_city_raw) as venue_city,
  n.name as neighborhood,
  e.is_clothing_optional, e.ticket_status
from public.events e
left join public.venues v on v.id = e.venue_id
left join public.neighborhoods n on n.id = v.neighborhood_id
where e.status = 'approved';
grant select on public.events_public to anon, authenticated;
alter table public.events drop constraint if exists events_recurring_needs_dates;
alter table public.events drop column if exists recurrence_evidence, drop column if exists occurrence_dates, drop column if exists date_semantics;
delete from public.schema_migrations where filename = '2026-10-13_event_date_semantics.sql';
commit;
