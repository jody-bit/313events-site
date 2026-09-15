-- Truncate, Julia Govor (Lincoln Factory, 2026-09-19) — fix bad ticket_url,
-- 2026-09-15. Jody: "why are tickets and info on this post not going to
-- Resident Advisor?? https://313.events/event.html?id=ed8e7a74-ba53-4ff2-
-- b660-82274298c042"
--
-- ROOT CAUSE: not a site bug. event.html's rendering is a plain passthrough
-- of events.ticket_url (mapRow(): `ticketUrl: row.ticket_url || undefined`),
-- and its only fallback (sourceSearchUrl(), for Resident Advisor) only ever
-- fires when ticket_url AND event_url are BOTH empty, returning RA's generic
-- Detroit browse page — never thecrofoot.com. So the bad value was written
-- directly into this one row's ticket_url at some point after the original
-- seed.sql insert (which didn't set ticket_url at all for this row) —
-- untraceable in the SQL file history, but definitely bad data, not a code
-- path that produces this URL on its own.
--
-- FIX: the real RA event page, found by live browsing RA's Lincoln Factory
-- club page (ra.co/clubs/232557) for the matching date/lineup:
--   https://ra.co/events/2507381 — "Truncate, Julia Govor" at Lincoln
--   Factory, Fri Sep 19 2026, 22:00–05:00, $20–$35, 21+. Lineup also
--   includes JANSØ, which our title/description don't currently mention —
--   left as-is here since Jody didn't ask for a description rewrite; flag
--   if she wants that added too.
--
-- Safe to re-run: guarded, matches by id.
update events
set
  ticket_url = 'https://ra.co/events/2507381',
  time_display = '10:00 PM–5:00 AM'
where id = 'ed8e7a74-ba53-4ff2-b660-82274298c042'
  and (ticket_url is distinct from 'https://ra.co/events/2507381'
       or time_display is distinct from '10:00 PM–5:00 AM');

insert into schema_migrations (filename) values ('update_2026-09-15_truncate-ra-ticket-fix.sql')
on conflict (filename) do nothing;
