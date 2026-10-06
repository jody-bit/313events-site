-- supabase/staging/seed_staging.sql
--
-- SYNTHETIC test data for the STAGING database ONLY. Never run against
-- production. Contains no personal data: no submitter emails or names, and no
-- copy of production events. Dates are relative to today, so it never rots.
--
-- Loaded after the schema exists (see ENVIRONMENTS.md). Safe to re-run: every
-- row uses a fixed external_id/name and is upserted. The 'stg-' prefix on
-- every external_id marks these rows as staging fixtures.
--
-- Covers: venues (incl. same name in two cities, a parent campus, a
-- placeholder row), duplicates across sources, overnight and multi-day
-- events, an all-day event, pending/approved/rejected states, a closure
-- notice (non-event), and deliberately malformed rows for the contract work.
-- Production venue reference data from the SZ-15 snapshot is loaded
-- separately and may replace the "venues" block below.

insert into venues (name, address, city) values
  ('Eastern Market',            null,                 'Detroit'),
  ('The Loft',                  '1 Test St',          'Detroit'),
  ('The Loft',                  '2 Test Ave',         'Ferndale'),
  ('Majestic Theatre',          '4140 Woodward Ave',  'Detroit'),
  ('The Magic Stick',           '4120 Woodward Ave',  'Detroit'),
  ('Garden Bowl',               '4140 Woodward Ave',  'Detroit'),
  ('Fox Theatre',               '2211 Woodward Ave',  'Detroit'),
  ('Venue TBA',                 null,                 'Detroit')
on conflict (lower(name), lower(city)) do nothing;

insert into events (title, category, venue_name_raw, venue_city_raw, start_date, end_date, time_display, is_free, source, external_id, status, description) values
  -- ordinary approved future events
  ('STG Jazz Night',                 'music',     'Fox Theatre',      'Detroit',  current_date + 3,  null,            '8:00 PM',            false, 'Staging', 'stg-jazz-1',       'approved', 'Synthetic fixture.'),
  -- overnight: starts Saturday night, ends after midnight
  ('STG Overnight Party',            'nightlife', 'The Magic Stick',  'Detroit',  current_date + 5,  null,            '9:00 PM–3:00 AM',    false, 'Staging', 'stg-overnight-1',  'approved', 'Overnight, end_date unset.'),
  ('STG Overnight Party (end_date)', 'nightlife', 'The Magic Stick',  'Detroit',  current_date + 6,  current_date + 7,'9:00 PM–3:00 AM',    false, 'Staging', 'stg-overnight-2',  'approved', 'Overnight, end_date next day.'),
  -- multi-day and long-running
  ('STG Weekend Festival',           'fest',      'Eastern Market',   'Detroit',  current_date + 8,  current_date + 10,'Noon–11:00 PM',     true,  'Staging', 'stg-fest-1',       'approved', 'Three-day festival.'),
  ('STG Season-Long Exhibition',     'visual',    'Eastern Market',   'Detroit',  current_date - 30, current_date + 60,'10:00 AM–5:00 PM',  true,  'Staging', 'stg-exhibit-1',    'approved', 'Started a month ago, still running.'),
  ('STG All-Day Market',             'food',      'Eastern Market',   'Detroit',  current_date + 4,  null,            null,                 true,  'Staging', 'stg-allday-1',     'approved', 'All-day event.'),
  -- same event from two sources (duplicate pair)
  ('STG Dup Concert',                'music',     'Majestic Theatre', 'Detroit',  current_date + 12, null,            '7:30 PM',            false, 'Source A', 'stg-dup-a',       'approved', null),
  ('STG Dup Concert',                'music',     'Majestic Theatre', 'Detroit',  current_date + 12, null,            '7:30 PM',            false, 'Source B', 'stg-dup-b',       'approved', 'Longer description from source B.'),
  -- venue identity cases
  ('STG Loft Show (Detroit)',        'music',     'The Loft',         'Detroit',  current_date + 9,  null,            '8:00 PM',            false, 'Staging', 'stg-loft-1',       'approved', null),
  ('STG Loft Show (Ferndale)',       'music',     'The Loft',         'Ferndale', current_date + 9,  null,            '8:00 PM',            false, 'Staging', 'stg-loft-2',       'approved', null),
  ('Eastern Market Shed 3 - STG Family Block Party', 'family', 'Venue TBA', null, current_date + 11, null,           '10:00 AM',           true,  'Staging', 'stg-shed3-1',      'approved', 'Place named only in the title.'),
  ('STG Big Time Bingo (poster says 4120)', 'community', 'Garden Bowl', 'Detroit', current_date + 2, null,           '7:30 PM',            true,  'Staging', 'stg-bingo-1',      'approved', 'Address misprint case.'),
  ('STG Fox Theater Variant',        'theatre',   'Fox Theater',      'Detroit',  current_date + 14, null,            '7:00 PM',            false, 'Staging', 'stg-variant-1',    'approved', 'Theater/Theatre spelling variant.'),
  -- states
  ('STG Pending Submission',         'community', 'The Loft',         'Detroit',  current_date + 15, null,            '6:00 PM',            true,  'Staging', 'stg-pending-1',    'pending_review', null),
  ('STG Rejected Duplicate',         'music',     'Majestic Theatre', 'Detroit',  current_date + 12, null,            '7:30 PM',            false, 'Source C', 'stg-rejected-1',  'rejected', null),
  -- non-event (closure notice)
  ('City Buildings Closed',          'community', 'City Hall',        'Sterling Heights', current_date + 20, null,    null,                 true,  'Staging', 'stg-closure-1',    'approved', null),
  -- malformed / problematic (inputs for the row contract; expected to be rejected or held once it exists)
  ('STG Address As City',            'music',     'Fox Theatre',      '2810 Russell St.', current_date + 7, null,     '8:00 PM',            false, 'Staging', 'stg-bad-city-1',   'approved', null),
  ('.cls-1{fill:#fff;} STG CSS Venue','music',    '.x{color:red} The Fillmore', 'Detroit', current_date + 7, null,   '8:00 PM',            false, 'Staging', 'stg-bad-css-1',    'approved', null),
  ('STG Placeholder Time',           'music',     'Fox Theatre',      'Detroit',  current_date + 7,  null,            'Evening',            false, 'Staging', 'stg-bad-time-1',   'approved', null),
  ('STG End Before Start',           'music',     'Fox Theatre',      'Detroit',  current_date + 10, current_date + 8,'8:00 PM',            false, 'Staging', 'stg-bad-dates-1',  'approved', null)
on conflict (external_id) do update set
  title = excluded.title, start_date = excluded.start_date, end_date = excluded.end_date,
  time_display = excluded.time_display, status = excluded.status, venue_name_raw = excluded.venue_name_raw,
  venue_city_raw = excluded.venue_city_raw, description = excluded.description;

-- A 'held' state does not exist yet (SZ-08); add held fixtures when it does.
-- Source-run provenance fixtures (source_runs) are added with SZ-09.
