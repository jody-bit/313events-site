-- Fix: internal research/process notes leaking into the PUBLIC `note`
-- column (rendered directly on the live event page -- event-template.html
-- / calendar.html / index.html / map.html all print it verbatim). Caught
-- by Jody 2026-09-18 on ra-2532512 ("SECRET SETS") -- text like "No
-- description or real photo on RA's own page (image field null; og:image
-- falls back to RA's generic site logo, not used here)" was live on the
-- public event page.
--
-- This is the same root-cause bug migration_029_internal_note.sql already
-- fixed once ("a mistake this project has now made twice") by adding the
-- admin-only internal_note column -- but several rows written before that
-- convention was consistently followed still had the old-style internal
-- commentary sitting in `note`. This sweeps the live table for every row
-- matching that pattern (16 found via a keyword sweep of all non-null
-- `note` values) and, per row:
--   - moves the original text to internal_note (admin-only, never public)
--     so nothing is lost, only unpublished;
--   - either clears `note` (when it carried no genuine visitor-facing
--     caveat) or rewrites it to just the genuine caveat, stripped of the
--     internal sourcing/reasoning language.
--
-- internal_note is only ever set here if it was previously null, so this
-- can't clobber anything already there.

update events set
  internal_note = coalesce(internal_note, note),
  note = null
where external_id in (
  'ra-2532512',              -- SECRET SETS: "no description/real photo on RA's own page..."
  'ra-2529033',              -- Club 1BD: "No RA ticket price shown on the source page."
  'ra-2533789',              -- RIDDIM RESTAURANT: same
  'ra-2539083',              -- G.E.D.: same + "likely door/cash entry"
  'ig-DdExe5YlWTt',          -- Cheater Slicks: internal reasoning resolving a flyer/caption time conflict
  'posh-amplify-dont-cross-the-street',   -- editorial flag ("flag if the misspelling matters for SEO") -- never public
  'posh-amplify-friday-the-13th-29'       -- internal ambiguity note about which name is correct
);

update events set
  internal_note = coalesce(internal_note, note),
  note = 'Ticket link goes to this event''s Instagram post -- the RA link is in that post''s bio.'
where external_id = 'ig-DdO7rQ9BOtF';

update events set
  internal_note = coalesce(internal_note, note),
  note = 'Today''s official opening was delayed to noon (from a scheduled 11 AM) due to storm/wind delays. The fine arts fair itself opens later today, at 2:00 PM, running to 9:00 PM.'
where external_id = 'artsbeatseats-2026-fri';

update events set
  internal_note = coalesce(internal_note, note),
  note = 'The fine arts fair itself closes earlier on Labor Day: 5:00 PM, not 9:00 PM.'
where external_id = 'artsbeatseats-2026-mon';

update events set
  internal_note = coalesce(internal_note, note),
  note = 'The fine arts fair itself closes earlier than the main festival on these two days: 9:00 PM, not 11:00 PM.'
where external_id = 'artsbeatseats-2026-sat-sun';

update events set
  internal_note = coalesce(internal_note, note),
  note = 'No exact street address published for this event.'
where external_id = 'dallyinthealley-2026';

update events set
  internal_note = coalesce(internal_note, note),
  note = 'No exact street address published for this event -- general location is Nine Mile Rd, Ferndale.'
where external_id = 'ferndalediy-2026';

update events set
  internal_note = coalesce(internal_note, note),
  note = 'Runs overnight from Sept 12 into Sept 13.'
where external_id = 'ra-2520438';

update events set
  internal_note = coalesce(internal_note, note),
  note = 'Runs from Sept 12 into the evening of Sept 13.'
where external_id = 'ra-2524263';

update events set
  internal_note = coalesce(internal_note, note),
  note = 'Venue name not yet confirmed -- address shown is as listed by the event source.'
where external_id = 'ra-2524313';

insert into schema_migrations (filename) values ('update_2026-09-18_fix-public-note-leaks.sql')
on conflict (filename) do nothing;
