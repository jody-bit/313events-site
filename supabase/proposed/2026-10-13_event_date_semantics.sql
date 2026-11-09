-- EVENT DATE SEMANTICS (issue #48): PROPOSED, NOT EXECUTED. Needs owner SQL approval.
-- Adds the approved model: one canonical row + date_semantics + explicit occurrence_dates.
-- Purely additive: every existing row stays NULL (= legacy range behaviour) until classified.
-- Ship order: (1) apply this; (2) merge the PR that adds the columns to each page's select list
-- (the current PR deliberately does NOT select them: PostgREST rejects unknown columns).
-- Reception rule: an opening reception is its own `single` row; the exhibition it opens is `continuous`.

alter table public.events
  add column if not exists date_semantics text
    check (date_semantics is null or date_semantics in ('single', 'continuous', 'recurring')),
  add column if not exists occurrence_dates date[],
  add column if not exists recurrence_evidence jsonb;

alter table public.events drop constraint if exists events_recurring_needs_dates;
alter table public.events add constraint events_recurring_needs_dates
  check (date_semantics is distinct from 'recurring' or coalesce(array_length(occurrence_dates, 1), 0) > 0) not valid;
-- NOT VALID: new/updated rows are checked, existing rows are not rescanned (all are NULL today).

comment on column public.events.date_semantics is
  'single = start_date only; continuous = every day start..end; recurring = only occurrence_dates; NULL = unclassified legacy range (issue #48). A date range alone never implies recurrence.';
comment on column public.events.occurrence_dates is 'Explicit dates for date_semantics=recurring. Evidence only; never inferred.';
comment on column public.events.recurrence_evidence is 'Where the occurrence dates came from (source text / URL / date checked). Evidence only.';

-- Expose the two read fields to the public view. New columns go at the END
-- (CREATE OR REPLACE VIEW cannot reorder); everything else is the live definition
-- (checked via pg_get_viewdef on 2026-10-13, including note = NULL).
create or replace view public.events_public as
select
  e.id, e.title, e.description, e.image_url, e.start_date, e.end_date, e.time_display,
  e.category, e.is_free, e.price_from, e.source,
  null::text as note,
  e.ticket_url, e.event_url, e.venue_id,
  coalesce(v.name, e.venue_name_raw) as venue_name,
  coalesce(v.city, e.venue_city_raw) as venue_city,
  n.name as neighborhood,
  e.is_clothing_optional, e.ticket_status,
  e.date_semantics, e.occurrence_dates
from public.events e
left join public.venues v on v.id = e.venue_id
left join public.neighborhoods n on n.id = v.neighborhood_id
where e.status = 'approved';

grant select on public.events_public to anon, authenticated;

insert into public.schema_migrations (filename) values ('2026-10-13_event_date_semantics.sql')
on conflict (filename) do nothing;
