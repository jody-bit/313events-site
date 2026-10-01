-- Resolves the pending_review flag left on "The Poisoner" in
-- update_2026-10-01_marygrove-udm-mcnichols-corridor-events.sql. That row
-- was left unconfirmed because press coverage of this touring play's other
-- 6 stops never named Detroit. Jody then supplied the show's own tour page
-- directly (uncommonproductions.com/the-poisoner), which settles it:
-- Detroit is real, confirmed stop #7 -- explicitly called "the final stop
-- of our 7-city tour" on the show's own Eventbrite multi-date listing
-- (eventbrite.com/e/the-poisoner-tickets-1992447287472), which also
-- confirms the venue the original CSV already had right: Marygrove
-- Theatre, 8425 West McNichols Road, Detroit, MI 48221 (venue row already
-- exists from the companion migration -- no venue change needed here).
--
-- It's 3 performances, not 1 -- Oct 29, 30, and 31, all 7:30 PM -- so this
-- supersedes the single Oct-29-only row with one row per night, same
-- one-row-per-date convention as every other multi-night/multi-day source
-- in this project (e.g. Freak Fest's per-venue-per-day rows). The original
-- external_id is kept for the Oct 29 show (now updated to approved) so
-- nothing orphans; Oct 30 and Oct 31 are new rows.
--
-- OUT-OF-SCOPE NOTE (read before adding anything from the other 6 stops):
-- the other 6 tour stops (Bethlehem PA, Pittsburgh PA, Kenosha WI, Madison
-- WI, De Pere WI, Kalamazoo MI) are all well outside this project's
-- documented 75-miles-from-Detroit's-border service area (SERVICE_AREA.md)
-- -- Kalamazoo, the closest of the six, is already explicitly listed there
-- as "just outside" at 117.6 mi, and the rest are much farther. None of
-- them are added here; this file is Detroit-only, matching what "the
-- Detroit orbit" means as already defined in this project.

insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, internal_note, status
) values

('fb-2281799372573388-the-poisoner',
 'The Poisoner (Play)',
 'Neo-noir thriller play inspired by the Flint water crisis, at Marygrove Theatre -- the final stop of this show''s 7-city national tour.',
 'theatre', 'Marygrove Theatre', '8425 W. McNichols Rd', 'Detroit',
 '2026-10-29', null, '7:30 PM', false, null,
 'https://www.eventbrite.com/e/the-poisoner-tickets-1992447287472',
 null,
 'Manual', null,
 'Confirmed via the show''s own tour page (uncommonproductions.com/the-poisoner) and its Eventbrite multi-date listing, both fetched directly 2026-10-01 -- Detroit (Marygrove Theatre) is genuinely stop #7 of 7, described on the show''s own site as "the final stop of our 7-city tour." Supersedes this row''s earlier pending_review state (sourcing could not confirm Detroit independently at the time). Students/seniors get $5 off with code FIVEOFF per Eventbrite; no base price shown on the page, so price_from is still left null rather than guessed.',
 'approved'),

('fb-2281799372573388-the-poisoner-oct30',
 'The Poisoner (Play)',
 'Neo-noir thriller play inspired by the Flint water crisis, at Marygrove Theatre -- the final stop of this show''s 7-city national tour.',
 'theatre', 'Marygrove Theatre', '8425 W. McNichols Rd', 'Detroit',
 '2026-10-30', null, '7:30 PM', false, null,
 'https://www.eventbrite.com/e/the-poisoner-tickets-1992447287472',
 null,
 'Manual', null,
 'Second of 3 Detroit performances (Oct 29/30/31), all confirmed via the same Eventbrite multi-date listing -- see the Oct 29 row''s note for full sourcing.',
 'approved'),

('fb-2281799372573388-the-poisoner-oct31',
 'The Poisoner (Play)',
 'Neo-noir thriller play inspired by the Flint water crisis, at Marygrove Theatre -- the final stop of this show''s 7-city national tour.',
 'theatre', 'Marygrove Theatre', '8425 W. McNichols Rd', 'Detroit',
 '2026-10-31', null, '7:30 PM', false, null,
 'https://www.eventbrite.com/e/the-poisoner-tickets-1992447287472',
 null,
 'Manual', null,
 'Third of 3 Detroit performances (Oct 29/30/31), all confirmed via the same Eventbrite multi-date listing -- see the Oct 29 row''s note for full sourcing.',
 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  venue_address_raw = excluded.venue_address_raw,
  venue_city_raw = excluded.venue_city_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  is_free = excluded.is_free,
  price_from = excluded.price_from,
  ticket_url = excluded.ticket_url,
  note = excluded.note,
  internal_note = excluded.internal_note,
  status = excluded.status;

-- Backfill venue_id -- the venues row already exists from the companion
-- migration, so this is a harmless no-op for Oct 29 (already linked) and
-- does the real work for the two new Oct 30/31 rows.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null
  and lower(v.name) = lower('Marygrove Theatre');

insert into schema_migrations (filename) values ('update_2026-10-01_the-poisoner-detroit-confirmed.sql')
on conflict (filename) do nothing;
