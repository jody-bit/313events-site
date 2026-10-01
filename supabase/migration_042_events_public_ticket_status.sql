-- Migration 042: expose ticket_status through events_public
--
-- Context: 2026-10-01, Needs Follow-up remaining-gap product pass, extending
-- the visitor-facing ticket-status fallback note (door / RSVP / free /
-- registration-required -- see migration_030/041_ticket_status*.sql and
-- event-template.html's ticketStatusNoteHtml()) from the event detail page
-- out to the list-card views on index.html, calendar.html, and map.html.
--
-- calendar.html and map.html query the raw `events` table directly, so
-- ticket_status is already visible to them with no schema change needed.
-- index.html is the one surface that reads through the events_public view
-- (an explicit-column-list view, not select * -- see migration_025's own
-- security note on why), so ticket_status has to be added here before
-- index.html's query can select it; without this migration, deploying the
-- updated index.html first would break its event fetch with a PostgREST
-- "column does not exist" error.
--
-- IMPORTANT (same constraint migration_034 documented): CREATE OR REPLACE
-- VIEW will not let you insert a new column in the middle of the select
-- list without Postgres reading it as a rename of whatever column now
-- lands in that ordinal position. A new column is only safe to add at the
-- very end of the list. Full column list copied from migration_034, plus
-- the one new line.
--
-- IF NOT EXISTS / CREATE OR REPLACE make this safe to re-run regardless.

create or replace view events_public as
select
  e.id,
  e.title,
  e.description,
  e.image_url,
  e.start_date,
  e.end_date,
  e.time_display,
  e.category,
  e.is_free,
  e.price_from,
  e.source,
  e.note,
  e.ticket_url,
  e.event_url,
  e.venue_id,
  coalesce(v.name, e.venue_name_raw) as venue_name,
  coalesce(v.city, e.venue_city_raw) as venue_city,
  n.name as neighborhood,
  e.is_clothing_optional,
  e.ticket_status
from events e
left join venues v on v.id = e.venue_id
left join neighborhoods n on n.id = v.neighborhood_id
where e.status = 'approved';

grant select on events_public to anon, authenticated;

insert into schema_migrations (filename) values ('migration_042_events_public_ticket_status.sql')
on conflict (filename) do nothing;
