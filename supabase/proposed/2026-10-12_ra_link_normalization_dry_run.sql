-- RA LINK NORMALIZATION: DRY-RUN. SELECT statements only, writes nothing.
-- Companion to 2026-10-12_ra_link_normalization.sql (the guarded UPDATE, not executed).
--
-- Contract: event_url = https://ra.co/events/<id>; ticket_url = a real ticketing
-- destination or NULL. Scope: source = 'Resident Advisor' AND external_id ~ '^ra-[0-9]+$'
-- (the numeric id comes only from the record's own external_id). Mixed-source labels
-- ("Paxahau / Resident Advisor", ...) and RA rows without a numeric external_id are out of scope.
--
-- Run each numbered block on its own (each repeats the same classification CTE).

-- ===== 1. SUMMARY ==========================================================
with ra as (
  select e.id, e.external_id, e.event_url, e.ticket_url, regexp_replace(e.external_id,'^ra-','') as rid
  from public.events e
  where e.source = 'Resident Advisor' and e.external_id ~ '^ra-[0-9]+$'
), c as (
  select ra.*,
    case
      when nullif(btrim(event_url),'') is null then 'blank'
      when event_url ~* ('^https?://(www\.)?ra\.co/events/' || rid || '/?([?#].*)?$') then 'same_ra'
      when event_url ~* '^https?://(www\.)?ra\.co/' then 'other_ra'
      when event_url ~* '^https?://[^/?#]+/?$' then 'generic'
      else 'specific_other' end as ev,
    case
      when nullif(btrim(ticket_url),'') is null then 'blank'
      when ticket_url ~* ('^https?://(www\.)?ra\.co/events/' || rid || '/?([?#].*)?$') then 'same_ra'
      when ticket_url ~* '^https?://(www\.)?ra\.co/' then 'other_ra'
      else 'genuine' end as tk
  from ra
), a as (
  select c.*,
    (ev = 'other_ra' or tk = 'other_ra' or (tk = 'same_ra' and ev = 'specific_other')) as is_exception,
    ev = 'blank'   as is_fill,
    ev = 'generic' as is_replace,
    tk = 'same_ra' as wants_clear
  from c
)
select
  count(*)                                                                                     as total_matched,
  count(*) filter (where not is_exception and is_fill)                                         as event_url_fills,
  count(*) filter (where not is_exception and is_replace)                                      as generic_link_replacements,
  count(*) filter (where not is_exception and wants_clear)                                     as ticket_url_corrections,
  count(*) filter (where not is_exception and not is_fill and not is_replace and not wants_clear) as unchanged,
  count(*) filter (where is_exception)                                                         as exceptions_manual_review,
  count(*) filter (where not is_exception and (is_fill or is_replace or wants_clear))          as rows_that_would_change
from a;

-- ===== 2. EXCEPTIONS (whole row held, nothing written) =====================
with ra as (
  select e.id, e.external_id, e.title, e.start_date, e.status, e.event_url, e.ticket_url, regexp_replace(e.external_id,'^ra-','') as rid
  from public.events e
  where e.source = 'Resident Advisor' and e.external_id ~ '^ra-[0-9]+$'
), c as (
  select ra.*,
    case
      when nullif(btrim(event_url),'') is null then 'blank'
      when event_url ~* ('^https?://(www\.)?ra\.co/events/' || rid || '/?([?#].*)?$') then 'same_ra'
      when event_url ~* '^https?://(www\.)?ra\.co/' then 'other_ra'
      when event_url ~* '^https?://[^/?#]+/?$' then 'generic'
      else 'specific_other' end as ev,
    case
      when nullif(btrim(ticket_url),'') is null then 'blank'
      when ticket_url ~* ('^https?://(www\.)?ra\.co/events/' || rid || '/?([?#].*)?$') then 'same_ra'
      when ticket_url ~* '^https?://(www\.)?ra\.co/' then 'other_ra'
      else 'genuine' end as tk
  from ra
)
select id, external_id, title, start_date, status, event_url, ticket_url, ev, tk,
  case when ev = 'other_ra' then 'event_url is a different RA page'
       when tk = 'other_ra' then 'ticket_url is a different RA page'
       else 'ticket_url is the RA page but event_url holds another specific link' end as reason
from c
where ev = 'other_ra' or tk = 'other_ra' or (tk = 'same_ra' and ev = 'specific_other')
order by start_date, id;

-- ===== 3. BEFORE / AFTER SAMPLES (up to 5 per action) ======================
with ra as (
  select e.id, e.external_id, e.title, e.start_date, e.status, e.event_url, e.ticket_url, regexp_replace(e.external_id,'^ra-','') as rid
  from public.events e
  where e.source = 'Resident Advisor' and e.external_id ~ '^ra-[0-9]+$'
), c as (
  select ra.*, 'https://ra.co/events/' || rid as target,
    case
      when nullif(btrim(event_url),'') is null then 'blank'
      when event_url ~* ('^https?://(www\.)?ra\.co/events/' || rid || '/?([?#].*)?$') then 'same_ra'
      when event_url ~* '^https?://(www\.)?ra\.co/' then 'other_ra'
      when event_url ~* '^https?://[^/?#]+/?$' then 'generic'
      else 'specific_other' end as ev,
    case
      when nullif(btrim(ticket_url),'') is null then 'blank'
      when ticket_url ~* ('^https?://(www\.)?ra\.co/events/' || rid || '/?([?#].*)?$') then 'same_ra'
      when ticket_url ~* '^https?://(www\.)?ra\.co/' then 'other_ra'
      else 'genuine' end as tk
  from ra
), a as (
  select c.*,
    (ev = 'other_ra' or tk = 'other_ra' or (tk = 'same_ra' and ev = 'specific_other')) as is_exception
  from c
), s as (
  select a.*,
    case when ev = 'blank' then 'fill' when ev = 'generic' then 'replace_generic' end as ev_action,
    (tk = 'same_ra') as clear_ticket,
    row_number() over (partition by (case when ev = 'blank' then 'fill' when ev = 'generic' then 'replace_generic' else 'none' end), (tk = 'same_ra') order by start_date, id) as rn
  from a where not is_exception and (ev in ('blank','generic') or tk = 'same_ra')
)
select id, external_id, status, start_date,
  event_url as before_event_url,
  case when ev_action is not null then target else event_url end as after_event_url,
  ticket_url as before_ticket_url,
  case when clear_ticket then null else ticket_url end as after_ticket_url,
  coalesce(ev_action, 'keep_event_url') || case when clear_ticket then ' + clear_ticket' else '' end as action
from s where rn <= 5 order by action, start_date, id;

-- ===== 4. THE TWO HELD ROWS: preview of 2026-10-12_ra_link_normalization_exceptions.sql ==========
-- Identity evidence shown per row. "provenance_records_own_url" = the row's internal_note says RA's
-- listing url for THIS id; "foreign_row_*" = the event that the foreign ticket_url actually belongs to.
select
  e.external_id, e.title, e.start_date, e.status, e.venue_name_raw,
  e.event_url                                                         as before_event_url,
  'https://ra.co/events/' || regexp_replace(e.external_id, '^ra-', '') as after_event_url,
  e.ticket_url                                                        as before_ticket_url,
  null::text                                                          as after_ticket_url,
  position(('ra_url=https://ra.co/events/' || regexp_replace(e.external_id, '^ra-', '') || ' ') in coalesce(e.internal_note, '')) > 0 as provenance_records_own_url,
  f.external_id as foreign_row_external_id, f.title as foreign_row_title, f.start_date as foreign_row_start_date
from public.events e
join (values
  ('ra-2552946', 'House À La Mode', 'https://ra.co/events/2545734'),
  ('ra-2553785', 'Industry Sunday', 'https://ra.co/events/2554757')
) as v(ext, title, foreign_ticket)
  on e.external_id = v.ext and e.title = v.title and e.ticket_url = v.foreign_ticket
left join public.events f on f.external_id = 'ra-' || regexp_replace(e.ticket_url, '^.*/events/', '') and f.source = 'Resident Advisor'
where e.source = 'Resident Advisor' and nullif(btrim(e.event_url), '') is null
order by e.external_id;
