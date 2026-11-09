-- PROPOSED, NOT APPLIED. Do not run without Jody's approval.
-- Companion to the all-day DTEND fix in api/cron-feeds.js (RFC 5545: a VALUE=DATE DTEND is exclusive).
--
-- SCOPE (narrowed 2026-10-11 per Jody's decision):
--   * Only the 13 Tourism Windsor Essex rows whose raw feed was verified authoritatively
--     (Tribe UID end timestamps + descriptions): Tribe/Thrillshare DTEND is exclusive.
--   * Only status = 'approved'. Rejected rows are never rewritten.
--   * Only upcoming rows (last day on/after today, America/Detroit). Past rows are left alone.
--   * The 15 CivicPlus rows (Royal Oak 14, Madison Heights 1) are EXCLUDED: their convention is
--     unverified, and the code fix is gated away from CivicPlus feeds until proven from raw ICS.
-- After the fix deploys, the daily api/cron-feeds.js upsert also corrects any of these rows still in the feed.

-- 1. Before/after preview (read-only)
select id, source, title, start_date, end_date as old_end_date,
       case when end_date - 1 > start_date then end_date - 1 end as new_end_date, status
from events
where id in (
  '9fb32cb0-87f0-4d62-adc9-d4e5f27f8283','377464b3-10aa-4263-9c6c-e464f389dfce','caf6a7a4-024c-4fdf-8ee8-f6eb2b30e08b',
  'bdc08941-3bda-4a43-b755-6dca31caf4b8','3e9c2673-7066-4090-9643-378abca88eb3','5ce70d9f-2b68-4246-a589-2d8b3b9e110b',
  '0273a480-63ea-45cd-bec7-6aa981672e7a','6362b630-07c4-40b6-bfd9-b3e85842148c','f46fa267-6623-40f3-a3c2-4c506180e4a1',
  '98a180eb-2973-46e3-b281-10695b57dcd1','03e4b0d3-a285-48db-8aaf-7a5e19048e63','de09170d-5ec3-4871-8655-a4a2b617b851',
  'fd09228b-f894-4b44-858f-2f0d5e2c2c17')
  and is_all_day and end_date is not null
  and status = 'approved'
  and coalesce(end_date - 1, start_date) >= (now() at time zone 'America/Detroit')::date
order by start_date;

-- 2. Apply (only after review; same WHERE as the preview)
-- update events
--    set end_date = case when end_date - 1 > start_date then end_date - 1 end
--  where id in ( <same 13 ids as above> )
--    and is_all_day and end_date is not null and status = 'approved'
--    and coalesce(end_date - 1, start_date) >= (now() at time zone 'America/Detroit')::date;
