-- RA LINK NORMALIZATION: THE TWO HELD ROWS (PROPOSED, NOT EXECUTED).
-- Separate, separately guarded operation. Run only after the owner has confirmed on ra.co that
--   ra-2552946 is "House À La Mode"  and  ra-2553785 is "Industry Sunday".
-- (The Resident Advisor site could not be reached from the review environment, so that
--  confirmation has NOT been made by the preparing session.)
--
-- Each row currently has event_url NULL and a ticket_url pointing at a DIFFERENT RA event
-- (ra-2545734 "HAREBRAINED..." and ra-2554757 "Foggy Sunday", which exist as their own rows).
-- This sets event_url to the row's OWN RA page and clears that foreign RA ticket_url. Nothing else.
--
-- Guards: exact external_id + exact title + exact foreign ticket_url + event_url still NULL +
-- the row's own internal_note provenance records RA's url for that same id. All-or-nothing: unless
-- exactly both rows match (or neither, on a re-run) the whole operation aborts. Same backup table and rollback as the main migration (the rollback script
-- already covers these rows). Idempotent: a second run plans 0 rows.

begin;

create table if not exists public.ra_link_normalization_backup_20261012 (
  id            uuid primary key,
  external_id   text not null,
  event_url     text,
  ticket_url    text,
  new_event_url text,
  new_ticket_url text,
  fingerprint   text not null,
  backed_up_at  timestamptz not null default now()
);
alter table public.ra_link_normalization_backup_20261012 enable row level security;

create temp table _ra_exc_plan on commit drop as
select e.id, e.external_id, e.event_url, e.ticket_url,
       md5(concat_ws('|', e.status::text, e.title, e.description, e.start_date::text, e.end_date::text,
                     e.time_display, e.source, e.external_id)) as fingerprint,
       'https://ra.co/events/' || regexp_replace(e.external_id, '^ra-', '') as new_event_url,
       null::text as new_ticket_url
from public.events e
join (values
  ('ra-2552946', 'House À La Mode', 'https://ra.co/events/2545734'),
  ('ra-2553785', 'Industry Sunday', 'https://ra.co/events/2554757')
) as v(ext, title, foreign_ticket)
  on e.external_id = v.ext and e.title = v.title and e.ticket_url = v.foreign_ticket
where e.source = 'Resident Advisor'
  and nullif(btrim(e.event_url), '') is null
  and position(('ra_url=https://ra.co/events/' || regexp_replace(e.external_id, '^ra-', '') || ' ') in coalesce(e.internal_note, '')) > 0;

do $$
declare n integer;
begin
  select count(*) into n from _ra_exc_plan;
  raise notice 'RA exception resolution plan: % rows', n;
  if n not in (0, 2) then
    raise exception 'RA exception resolution aborted: plan has % rows, expected 0 or 2', n;
  end if;
end $$;

insert into public.ra_link_normalization_backup_20261012
  (id, external_id, event_url, ticket_url, new_event_url, new_ticket_url, fingerprint)
select id, external_id, event_url, ticket_url, new_event_url, new_ticket_url, fingerprint
from _ra_exc_plan
on conflict (id) do nothing;

update public.events e
set event_url  = p.new_event_url,
    ticket_url = p.new_ticket_url
from _ra_exc_plan p
where e.id = p.id
  and e.source = 'Resident Advisor'
  and e.external_id = p.external_id
  and e.event_url  is not distinct from p.event_url
  and e.ticket_url is not distinct from p.ticket_url;

commit;
