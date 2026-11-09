-- RA link correction: READ-ONLY PREVIEW. SELECT statements only.
-- Not applied, not executed by the session that wrote it. Run by hand in the
-- Supabase SQL editor (read-only) to see exactly which rows a later, separately
-- approved correction would touch. Nothing here writes.
--
-- Rule (Product Owner, 2026-10-12): event_url = https://ra.co/events/<id>;
-- ticket_url = an actual ticketing destination, otherwise NULL; a valid stored
-- link is never replaced by a generic or unrelated one.

-- 1. RA rows whose event_url is NOT RA's own event page (the "inappropriate
--    event_url" set). Proposed value comes from external_id alone.
select
  id,
  external_id,
  title,
  start_date,
  status,
  event_url                                             as current_event_url,
  ticket_url                                            as current_ticket_url,
  'https://ra.co/events/' || regexp_replace(external_id, '^ra-', '') as proposed_event_url,
  case
    when event_url !~* '^https?://[^/]+/?$'            then 'not a ra.co event page'
    else 'bare homepage (generic)'
  end                                                   as reason
from events
where source = 'Resident Advisor'
  and external_id ~ '^ra-[0-9]+$'
  and event_url is not null
  and event_url !~* ('^https://(www\.)?ra\.co/events/' || regexp_replace(external_id, '^ra-', '') || '([/?#].*)?$')
order by start_date, id;

-- 2. RA rows where an RA page was stored in ticket_url (the earlier 79007baa
--    behavior): proposed correction moves it to event_url and leaves
--    ticket_url NULL. NOT empty in production (checked 2026-10-12: 198 of 245
--    RA rows), because the earlier ra-sync path already wrote the ra.co page
--    into ticket_url. Public buttons keep working for these rows either way;
--    moving them is a separate, separately approved data correction.
select
  id, external_id, title, start_date, status,
  event_url  as current_event_url,
  ticket_url as current_ticket_url,
  'https://ra.co/events/' || regexp_replace(external_id, '^ra-', '') as proposed_event_url
from events
where source = 'Resident Advisor'
  and external_id ~ '^ra-[0-9]+$'
  and ticket_url ~* '^https?://(www\.)?ra\.co/'
order by start_date, id;

-- 3. RA rows with no event_url at all (blank-fill candidates).
select count(*) as ra_rows_without_event_url
from events
where source = 'Resident Advisor'
  and external_id ~ '^ra-[0-9]+$'
  and event_url is null;
