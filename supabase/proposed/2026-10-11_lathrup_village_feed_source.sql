-- PROPOSED, NOT APPLIED. City of Lathrup Village ICS feed (Apptegy / Thrillshare).
-- Blocked until (1) a verified official contact_email is supplied (column is NOT NULL;
-- none invented), (2) Jody approves, and (3) the open decisions in the dry-run report
-- (status routing for events with no venue, all-day DTEND handling) are settled.
-- Inserted as pending_review so api/cron-feeds.js (which polls status='approved' only)
-- does NOT poll it until a human approves the row in admin.html.
--
-- Feed URL: the thread's first URL (empty filter_ids/section_ids) returned zero events;
-- use the populated export URL confirmed by Jody (REPLACE_WITH_CONFIRMED_URL).

insert into feed_sources
  (venue_name, contact_email, website, feed_url, feed_format, default_category, notes, status, location_per_event)
values (
  'City of Lathrup Village',
  'REPLACE_WITH_VERIFIED_OFFICIAL_EMAIL',
  'https://www.lathrupvillage.org/events/',
  'REPLACE_WITH_CONFIRMED_URL',
  'ics',
  'community',
  'Apptegy/Thrillshare iCalendar export. Floating local times (no TZID/Z) read as America/Detroit wall clock. Feed has no LOCATION for most events and no images. Added after dry run 2026-10-11 (26 events, 0 errors).',
  'pending_review',
  true
);
