-- PROPOSED, NOT APPLIED. Do not run without Jody's approval.
-- Companion to the all-day DTEND fix in api/cron-feeds.js (RFC 5545: a VALUE=DATE DTEND is exclusive).
-- Rows ingested before the fix stored DTEND as the last day. Scope measured read-only on production
-- 2026-10-11: 28 rows (Royal Oak 14, Tourism Windsor Essex 13, Madison Heights 1); 9 one-day events show
-- as two days, 19 multi-day events run one day too long. 14 are upcoming.
-- NOTE: after the fix deploys, the daily api/cron-feeds.js upsert corrects every row whose event is still
-- in its feed. This script is only needed for rows no longer in a feed (past or removed events).

-- 1. Preview (read-only)
select id, source, title, start_date, end_date as old_end_date,
       case when end_date - 1 > start_date then end_date - 1 end as new_end_date, status
from events
where feed_source_id is not null and is_all_day and end_date is not null
order by source, start_date;

-- 2. Apply (only after review)
-- update events
--    set end_date = case when end_date - 1 > start_date then end_date - 1 end
--  where feed_source_id is not null and is_all_day and end_date is not null;
