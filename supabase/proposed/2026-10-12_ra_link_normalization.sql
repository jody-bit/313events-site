-- RA LINK NORMALIZATION (PROPOSED, NOT EXECUTED). Needs explicit owner approval to run.
-- Part of PR #74 (claude/ra-time-and-link-fix). Preview: 2026-10-12_ra_link_normalization_dry_run.sql.
--
-- Target contract:
--   event_url  = https://ra.co/events/<id>   (RA's own event page)
--   ticket_url = a real ticketing destination, or NULL
--
-- Scope: events.source = 'Resident Advisor' AND external_id ~ '^ra-[0-9]+$'. The numeric id comes
-- only from the record's own external_id. Non-RA events and mixed-source labels are never matched.
--
-- Per row:
--   * event_url blank                      -> set to RA event page (fill)
--   * event_url a bare third-party homepage -> replace with RA event page
--   * ticket_url is the SAME RA page being stored in event_url -> set NULL
--   * genuine ticketing destinations       -> untouched
--   * HELD (whole row skipped, listed for manual review): event_url or ticket_url is a DIFFERENT
--     RA page; or ticket_url is the RA page while event_url holds another specific link.
-- Only event_url / ticket_url are written. Status, title, description, dates, times are untouched
-- (the existing events_set_updated_at trigger bumps updated_at, which cannot be avoided).
--
-- Safety: one transaction; backup table first; plan row-count cap aborts the whole run; the UPDATE
-- re-checks each row's CURRENT event_url / ticket_url (IS NOT DISTINCT FROM the planned "before"),
-- so a concurrent edit makes that row skip instead of being overwritten. Idempotent: after one run
-- the plan is empty, a second run changes nothing.

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
-- RLS on with no policy: unreachable through the public API; service role / SQL editor only.
alter table public.ra_link_normalization_backup_20261012 enable row level security;

create temp table _ra_link_plan on commit drop as
with ra as (
  select e.id, e.external_id, e.event_url, e.ticket_url,
         regexp_replace(e.external_id, '^ra-', '') as rid,
         md5(concat_ws('|', e.status::text, e.title, e.description, e.start_date::text, e.end_date::text,
                       e.time_display, e.source, e.external_id)) as fingerprint
  from public.events e
  where e.source = 'Resident Advisor' and e.external_id ~ '^ra-[0-9]+$'
), c as (
  select ra.*, 'https://ra.co/events/' || rid as target,
    case
      when nullif(btrim(event_url), '') is null then 'blank'
      when event_url ~* ('^https?://(www\.)?ra\.co/events/' || rid || '/?([?#].*)?$') then 'same_ra'
      when event_url ~* '^https?://(www\.)?ra\.co/' then 'other_ra'
      when event_url ~* '^https?://[^/?#]+/?$' then 'generic'
      else 'specific_other' end as ev,
    case
      when nullif(btrim(ticket_url), '') is null then 'blank'
      when ticket_url ~* ('^https?://(www\.)?ra\.co/events/' || rid || '/?([?#].*)?$') then 'same_ra'
      when ticket_url ~* '^https?://(www\.)?ra\.co/' then 'other_ra'
      else 'genuine' end as tk
  from ra
), a as (
  select c.*,
    (ev = 'other_ra' or tk = 'other_ra' or (tk = 'same_ra' and ev = 'specific_other')) as is_exception
  from c
)
select id, external_id, event_url, ticket_url, fingerprint,
       case when ev in ('blank', 'generic') then target else event_url end as new_event_url,
       case when tk = 'same_ra' then null else ticket_url end             as new_ticket_url
from a
where not is_exception and (ev in ('blank', 'generic') or tk = 'same_ra');

do $$
declare n integer;
begin
  select count(*) into n from _ra_link_plan;
  raise notice 'RA link normalization plan: % rows', n;
  if n > 300 then
    raise exception 'RA link normalization aborted: plan has % rows, expected at most 300', n;
  end if;
end $$;

insert into public.ra_link_normalization_backup_20261012
  (id, external_id, event_url, ticket_url, new_event_url, new_ticket_url, fingerprint)
select id, external_id, event_url, ticket_url, new_event_url, new_ticket_url, fingerprint
from _ra_link_plan
on conflict (id) do nothing;

update public.events e
set event_url  = p.new_event_url,
    ticket_url = p.new_ticket_url
from _ra_link_plan p
where e.id = p.id
  and e.source = 'Resident Advisor'
  and e.external_id = p.external_id
  and e.event_url  is not distinct from p.event_url
  and e.ticket_url is not distinct from p.ticket_url;

commit;
