-- RA LINK NORMALIZATION: ROLLBACK (PROPOSED, NOT EXECUTED).
-- Restores the original event_url / ticket_url from the backup table, only for rows whose CURRENT
-- values are still exactly what the migration wrote (a row edited since is left alone).
update public.events e
set event_url  = b.event_url,
    ticket_url = b.ticket_url
from public.ra_link_normalization_backup_20261012 b
where e.id = b.id
  and e.event_url  is not distinct from b.new_event_url
  and e.ticket_url is not distinct from b.new_ticket_url;
-- After the change is accepted, the backup can be dropped:
-- drop table public.ra_link_normalization_backup_20261012;
