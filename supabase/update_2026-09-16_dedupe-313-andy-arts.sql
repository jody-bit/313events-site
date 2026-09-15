-- Found while reviewing the backlog after this week's RA pull work: two
-- live, public rows for the same show at Andy Arts on 2026-09-18 — same
-- venue_id, same address, same date. "Three.One.Three" (id 643536cf...) is
-- an old, thin stub from 2026-08-23 (generic description, no image,
-- ticket_url just points at the venue's homepage, and still carries a
-- leftover "Confirm venue location" note). "3.1.3" (id 8bb45811...,
-- external_id ra-2516034) is the fuller row from the 2026-09-13 RA pull —
-- real Sonotex Collective description/lineup/price, a real RA ticket link,
-- and a flyer image. Keeping the richer row, hiding the stub duplicate the
-- same reversible way the admin panel's own "Live events" takedown tool
-- does (status -> rejected, undo via Restore in admin.html's Recently
-- Hidden list) rather than deleting it outright.
update events
set status = 'rejected'
where id = '643536cf-9479-4e3e-b8de-744feb9cbdac' -- "Three.One.Three" — duplicate of 3.1.3 (8bb45811-3235-4787-95d0-9b219a019725)
  and status = 'approved';

insert into schema_migrations (filename) values ('update_2026-09-16_dedupe-313-andy-arts.sql')
on conflict (filename) do nothing;
