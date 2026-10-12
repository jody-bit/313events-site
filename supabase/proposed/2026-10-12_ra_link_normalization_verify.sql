-- RA LINK NORMALIZATION: POST-MIGRATION VERIFICATION. SELECT only. Run after the migration.
-- Every "should be 0" query must return 0 (the two held rows are expected in check 1 / 2).

-- 1. In-scope rows still lacking an RA event_url (expected: only the held manual-review rows).
select id, external_id, event_url, ticket_url
from public.events
where source = 'Resident Advisor' and external_id ~ '^ra-[0-9]+$'
  and (nullif(btrim(event_url), '') is null or event_url !~* ('^https?://(www\.)?ra\.co/events/' || regexp_replace(external_id, '^ra-', '') || '/?([?#].*)?$'));

-- 2. ticket_url still equal to the row's own RA page (expected 0 rows for non-held records).
select id, external_id, ticket_url
from public.events
where source = 'Resident Advisor' and external_id ~ '^ra-[0-9]+$'
  and ticket_url ~* ('^https?://(www\.)?ra\.co/events/' || regexp_replace(external_id, '^ra-', '') || '/?([?#].*)?$');

-- 3. Genuine ticketing destinations preserved (expected 0 rows: nothing planned as kept has changed).
select b.id, b.external_id, b.ticket_url as before_ticket_url, e.ticket_url as after_ticket_url
from public.ra_link_normalization_backup_20261012 b
join public.events e on e.id = b.id
where b.new_ticket_url is not null and e.ticket_url is distinct from b.new_ticket_url;

-- 4. Nothing but the two link columns changed (expected 0 rows).
select b.id, b.external_id
from public.ra_link_normalization_backup_20261012 b
join public.events e on e.id = b.id
where b.fingerprint is distinct from md5(concat_ws('|', e.status::text, e.title, e.description, e.start_date::text, e.end_date::text, e.time_display, e.source, e.external_id));

-- 5. Non-RA safety is enforced by the UPDATE's own WHERE clause (source = 'Resident Advisor' and a numeric
--    ra- external_id) and pinned by test/ra-link-normalization-migration.test.js; other jobs legitimately
--    update unrelated rows after the run, so a blanket "nothing else changed" query would not be meaningful.

-- 6. Idempotency: rows a re-run would still change (expected 0). Held rows (a DIFFERENT RA page in either
--    column) are excluded, they are never changed by this migration.
select count(*) as rows_a_rerun_would_change
from public.events e
where e.source = 'Resident Advisor' and e.external_id ~ '^ra-[0-9]+$'
  and coalesce(e.event_url, '') !~* '^https?://(www\.)?ra\.co/'
  and coalesce(e.ticket_url, '') !~* ('^https?://(www\.)?ra\.co/events/(?!' || regexp_replace(e.external_id, '^ra-', '') || '(/|\?|#|$))')
  and (nullif(btrim(e.event_url), '') is null or e.event_url ~* '^https?://[^/?#]+/?$');
