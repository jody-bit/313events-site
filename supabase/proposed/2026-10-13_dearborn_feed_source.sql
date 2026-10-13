-- PROPOSED, NOT APPLIED. Do not run without Jody's explicit approval, and not before the release order in
-- /mnt/project-files/ingestion/dearborn-release-dependencies-2026-10-13.md has been followed.
-- City of Dearborn "Website Calendar" (Google Calendar public ICS). One row in feed_sources; nothing else.
--
-- Why status = 'approved': api/cron-feeds.js polls only feed_sources WHERE status = 'approved'. A
-- 'pending_review' row would never be polled. Approving the FEED does not publish events: the `dearborn`
-- policy in api/_lib/feed-publication.js (PR #77) creates every NEW event row as pending_review, skips plain
-- notices, and never overwrites a reviewer's decision. This row is only inert-safe AFTER PR #77 is deployed;
-- before that, a generic feed would publish new rows as 'approved'. Do not insert it first.
--
-- contact_email is NOT NULL and must be a verified address for the city contact: fill it in; the statement
-- is written to fail (invalid enum/cast would not catch it, so the guard below does) until it is replaced.

-- 0. Preview (read-only): expect 0 rows.
select id, venue_name, feed_url, status from feed_sources
where lower(feed_url) = lower('https://calendar.google.com/calendar/ical/websitecalendar%40dearborn.gov/public/basic.ics')
   or venue_name ilike 'city of dearborn';

-- 1. Insert (run in a transaction, then check the returned row, then COMMIT).
begin;
insert into feed_sources
  (venue_name, contact_email, website, feed_url, feed_format, default_category, notes, status, location_per_event)
select
  'City of Dearborn',
  c.contact_email,
  'https://www.dearborn.gov/calendar',
  'https://calendar.google.com/calendar/ical/websitecalendar%40dearborn.gov/public/basic.ics',
  'ics',
  'community',
  'City of Dearborn Website Calendar 2026 (owner websitecalendar@dearborn.gov). Policy "dearborn" (PR #77): notices skipped, all other new events held pending_review. No category or URL in the ICS. The 2026 calendar has 3 events in 2027: replace feed_url with the 2027 calendar before December 2026.',
  'approved',
  true
from (select 'REPLACE_WITH_VERIFIED_CONTACT_EMAIL'::text as contact_email) c
where c.contact_email like '%@%' and c.contact_email <> 'REPLACE_WITH_VERIFIED_CONTACT_EMAIL'
returning id, venue_name, status, location_per_event;
-- Expect exactly 1 row. 0 rows means the placeholder was not replaced. Then: commit;  (or rollback;)

-- Rollback of the feed (events it created stay as pending_review; reject or delete them separately):
--   update feed_sources set status = 'paused' where venue_name = 'City of Dearborn';
