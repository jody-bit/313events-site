-- Migration 042: link_check_status / link_checked_at columns, 2026-09-28
-- (Needs Follow-up self-healing pass 2, dead-link false-negative fix).
--
-- Root problem this closes: a non-null ticket_url/event_url was always
-- treated as "healthy" by Needs Follow-up, purely because the DB field
-- wasn't blank -- never because anyone confirmed the URL still resolves.
-- VisitDetroit's Christmas Cookie Coach Tour and The Original Detroit
-- Christmas Bakery Bus Tour both carry a populated ticket_url that 404s on
-- the live site (visitdetroit.com quietly restructured its URL shape from
-- /<slug>/ to /events/<slug>/ sometime after these were ingested; see
-- api/_lib/link-health.js and scripts/visitdetroit-dead-link-repair.js).
-- Neither of those events ever surfaced as broken anywhere in Admin.
--
-- link_check_status records the last confirmed OUTCOME of actually
-- fetching the event's own stored URL (never a guess, never set merely
-- because the field is non-null):
--   'ok'   -- last check got a definitive success (200, or a redirect
--             followed to one) for the CURRENTLY stored URL.
--   'dead' -- last check got a definitive 404/410 for the currently stored
--             URL, AND automatic recovery (see link-health.js) could not
--             confidently find/verify a replacement. This is the only
--             value that makes admin.html surface a new "dead event/ticket
--             link" Needs Follow-up reason -- see classifyMissingFields().
-- NULL (the default -- no ALTER needed to preserve this for every existing
-- row) means "never checked" -- a genuinely unknown, not a healthy, state.
-- Deliberately no 'inconclusive' value stored: a timeout/403/429/5xx check
-- result leaves this column exactly as it already was (see
-- api/_lib/link-health.js's classifyUrlCheck) rather than writing a third
-- state that would need its own Needs Follow-up handling -- an
-- inconclusive check is evidence of nothing and changes nothing.
--
-- A successful automatic repair (dead -> a verified replacement URL found
-- and persisted) sets link_check_status back to 'ok' and updates
-- ticket_url/event_url to the new, revalidated URL in the same write --
-- there is deliberately no third "was dead, now repaired" value to track
-- separately from plain 'ok', since once repaired-and-revalidated the URL
-- is, factually, currently OK.
alter table events add column if not exists link_check_status text;
alter table events add column if not exists link_checked_at timestamptz;

comment on column events.link_check_status is
  'Outcome of the last confirmed live check of this event''s own stored ticket_url/event_url (never inferred from the field merely being non-null): ok (confirmed reachable, possibly after following a redirect) | dead (confirmed 404/410, and automatic recovery could not confidently repair it) | null (never checked, or last check was inconclusive -- timeout/403/429/5xx -- which never overwrites a prior ok/dead value). Set by api/_lib/link-health.js via scripts/visitdetroit-dead-link-repair.js (or any future source-specific repair script reusing the same helper). admin.html''s Needs Follow-up queue treats link_check_status=''dead'' as actionable (a "dead event/ticket link" reason) regardless of whether ticket_url/event_url is populated, since a populated-but-dead link is not healthy.';
comment on column events.link_checked_at is
  'Timestamp of the last live check that produced the current link_check_status value. Null alongside a null link_check_status (never checked).';

insert into schema_migrations (filename) values ('migration_042_link_check_status.sql')
on conflict (filename) do nothing;
