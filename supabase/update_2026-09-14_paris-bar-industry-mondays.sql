-- Paris Bar's "Industry Mondays" — Jody caught the live Sept 14 listing
-- showing internal authoring notes as if they were public copy (an earlier
-- pass had appended something like "Caption ('last monday was a banger')
-- implies this is a standing recurring night — only this dated instance was
-- captured from the screenshot; marked is_recurring accordingly" straight
-- onto the public description field — that's editorial reasoning, not venue
-- copy, and should never have been visitor-facing). Jody's fix, requested
-- 2026-09-14: (1) clean up that one row's public description — she
-- specifically said to KEEP the fun "last monday was a banger" line, just
-- drop the meta-commentary about why it was marked recurring; (2) stop
-- treating this as a one-off and instead generate the actual weekly
-- occurrences (every Monday, now through the end of the year) since it's a
-- standing night, not a single event; (3) since we only know this week's
-- real lineup (Dominic Jevalon & Angela Baskets) and each week's lineup
-- rotates, every future occurrence gets an honest placeholder description
-- rather than fabricated performer names — see FOLLOWUP note below and the
-- weekly Instagram-check scheduled task set up alongside this file.

-- 1) Clean up the existing Sept 14 row's public-facing copy. Matched by
-- (title, start_date) same as this project's other admin-cleanup passes,
-- since admin.html's UI doesn't expose row ids.
update events
set description = 'Paris Bar''s recurring Industry Monday night, featuring music by Dominic Jevalon and Angela Baskets, pop-up jewelry by Archangel Archive, and tarot readings. Paris Bar called last Monday''s edition "a banger" on Instagram.',
    is_recurring = true,
    note = null
where title = 'Industry Mondays: Music by Dominic Jevalon & Angela Baskets'
  and start_date = '2026-09-14';

-- 2) The future weekly occurrences — every Monday from 2026-09-21 through
-- 2026-12-28 (the last Monday on/before year end). Each is a placeholder:
-- real lineup is unknown until confirmed off Paris Bar's Instagram
-- (@parisbardetroit), which is exactly what the accompanying weekly
-- scheduled check is for. `note` carries that caveat for whoever's in
-- admin.html; `description` itself stays honest rather than inventing
-- performer names. ticket_url points at Paris Bar's Instagram as a
-- placeholder "more info" link until a specific post/ticket link exists
-- for that week.
insert into events (
  external_id, title, description, category, venue_name_raw,
  start_date, time_display, is_recurring, ticket_url, source, note, status
)
values
  ('paris-bar-industry-mondays-2026-09-21', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-09-21', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-09-28', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-09-28', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-10-05', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-10-05', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-10-12', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-10-12', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-10-19', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-10-19', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-10-26', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-10-26', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-11-02', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-11-02', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-11-09', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-11-09', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-11-16', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-11-16', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-11-23', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-11-23', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-11-30', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-11-30', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-12-07', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-12-07', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-12-14', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-12-14', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-12-21', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-12-21', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved'),
  ('paris-bar-industry-mondays-2026-12-28', 'Industry Mondays', 'Paris Bar''s weekly Industry Monday night — live music, pop-up jewelry, and tarot readings, with a different lineup each week.', 'nightlife', 'Paris Bar', '2026-12-28', 'Doors 8:00 PM', true, 'https://www.instagram.com/parisbardetroit/', 'Manual', 'FOLLOWUP: lineup not yet confirmed for this date — check @parisbardetroit on Instagram and update title/description/image_url once known.', 'approved')
on conflict (external_id) do nothing;

-- 3) Same venue_id backfill idiom used in this project's other manual-entry
-- migrations (see update_2026-09-14_packard-art-collective.sql).
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-14_paris-bar-industry-mondays.sql')
on conflict (filename) do nothing;
