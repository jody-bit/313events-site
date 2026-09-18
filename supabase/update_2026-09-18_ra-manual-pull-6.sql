-- Manual Resident Advisor pull, 2026-09-18 part 3 -- the last 9 candidates
-- from "I do want you to add what you can from RA for all of the events
-- and then try recrawling again" (see update_2026-09-18_ra-manual-pull-5.sql
-- for the 20 confirmed live that session before ra.co's DataDome
-- bot-detection blocked the browser session again). Rather than keep
-- retrying a blocked live session, Jody browser-printed each of these 9
-- event pages to PDF and uploaded them; this file was built from that
-- source instead of live JSON-LD, same one-event-at-a-time /
-- no-summary-text-guessing discipline as every other RA file here.
--
-- image_url is null for all 9 -- the printed PDFs don't carry the
-- images.ra.co asset URL the way live JSON-LD does, so nothing is
-- guessed here; can be backfilled later from the live pages once ra.co
-- stops challenging the session.
--
-- venue_city_raw corrected against each page's own street address, not
-- RA's own region text: Elektricity is Pontiac, The High Dive is
-- Hamtramck (both already-seen patterns from prior pulls). Ashley Street
-- Social's page prints no city at all, but G.E.D.'s own description says
-- "Washtenaw County" -- 336 S. Ashley Street is in Ann Arbor, so
-- venue_city_raw is set to Ann Arbor rather than left as Detroit.
--
-- price_from is only set from a real dollar figure shown on the page:
-- G.E.D. and RIDDIM RESTAURANT showed no RA Tickets box at all in the
-- printed PDF (door/cash entry, price unknown) so price_from is left
-- null rather than guessed, same for Club 1BD (ticket price wasn't
-- captured in that page's extraction either, already noted in pull-5's
-- session). LATIN NIGHT has a real $0.00 "free entry, first come first
-- served" tier alongside a $23 guaranteed-admission tier, so is_free is
-- true with price_from 0.00, and the paid option is called out in the
-- description.
--
-- 12 Hour Party (ra-2532522) is a distinct 9/25 recurrence from the
-- 8/29 edition already in the database -- its own RA event id, separate
-- row.
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('ra-2526339', 'Hottie''s World',
 'HOTTIE''S WORLD! is a global club music experience focused on showcasing femme DJs in Detroit and beyond. Lineup: Problematic Black Hottie, Anka The Siren, Moon-Pi, Club Ghetto Tech. 21+.',
 'nightlife', 'Northern Lights Lounge', '660 W. Baltimore Street', 'Detroit',
 '2026-09-25', '2026-09-26', '10:00 PM–2:00 AM', false, 11.50,
 'https://ra.co/events/2526339',
 null,
 'Resident Advisor', null, 'approved'),

('ra-2538279', 'NICE TIME',
 'Portage Garage Sounds brings LLORA (Dallas, recently relocated to NYC, first Detroit show) alongside PGS family Shigeto, Charles Trees, and Kenjiro for a night of house and acid at Tangent Gallery. $5 before midnight, more after. 21+.',
 'nightlife', 'Tangent Gallery', '715 E Milwaukee St', 'Detroit',
 '2026-09-25', '2026-09-26', '10:00 PM–4:00 AM', false, 5.00,
 'https://ra.co/events/2538279',
 null,
 'Resident Advisor', null, 'approved'),

('ra-2539083', 'G.E.D.: Ghettotech, Electro and DrumN''Bass',
 'G.E.D. is a multi-genre sampler series -- one set from each genre by a local DJ/producer/hardware artist -- ghettotech, electro, and drum & bass, for the Washtenaw County heads. Lineup: Evan Oswald, pat2dope b2b Juan Micheal OG, Knifehouse.',
 'nightlife', 'Ashley Street Social', '336 S. Ashley Street', 'Ann Arbor',
 '2026-09-25', '2026-09-26', '8:00 PM–12:30 AM', false, null,
 'https://ra.co/events/2539083',
 null,
 'Resident Advisor', 'No RA ticket price shown on the source page -- likely door/cash entry.', 'approved'),

('ra-2533789', 'RIDDIM RESTAURANT',
 'Bass-heavy dubstep at Elektricity -- Melt (CA), Master Nyne, Gooberz, Briddimboi, and The General. Doors at 9pm. 18+.',
 'nightlife', 'Elektricity', '15 S. Saginaw St', 'Pontiac',
 '2026-09-25', '2026-09-26', '9:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2533789',
 null,
 'Resident Advisor', 'No RA ticket price shown on the source page.', 'approved'),

('ra-2529033', 'Club 1BD',
 'Club 1BD showcases POC talent at Magic Stick with hip-hop, R&B, Jersey Club, and house -- "a unique vision of what club life should be." Dress code: orange and yellow. 18+.',
 'nightlife', 'Magic Stick', '4120-4140 Woodward Avenue', 'Detroit',
 '2026-09-25', '2026-09-26', '9:00 PM–2:00 AM', false, null,
 'https://ra.co/events/2529033',
 null,
 'Resident Advisor', 'No RA ticket price shown on the source page.', 'approved'),

('ra-2533991', 'LATIN NIGHT: DJ IZA & SWDJEY (BAD BUNNY VIBES)',
 'Big Pink''s Latin Night with SWDEJAY and DJ IZA -- baile funk and reggaeton, Bad Bunny vibes. Free entry (first come, first served), or $23 guaranteed admission. 21+.',
 'nightlife', 'Big Pink', '6440 Wight St', 'Detroit',
 '2026-09-26', '2026-09-27', '10:00 PM–2:00 AM', true, 0.00,
 'https://ra.co/events/2533991',
 null,
 'Resident Advisor', null, 'approved'),

('ra-2525346', 'DJ Rozwell - Detroit',
 'KXD presents DJ Rozwell at The High Dive -- drum & bass and jungle from XXHARDBIT3S, DJ Rozwell, Typ4, DJ Girl, and Seanni B. 21+.',
 'nightlife', 'The High Dive', '11474 Joseph Campau Ave', 'Hamtramck',
 '2026-09-25', '2026-09-26', '8:00 PM–2:00 AM', false, 10.00,
 'https://ra.co/events/2525346',
 null,
 'Resident Advisor', null, 'approved'),

('ra-2517135', 'Ms. Nina with SWDEJAY and Psy-Chick',
 'Lincoln Factory hosts Ms Nina (ES) with SWDEJAY and Psy-Chick.',
 'nightlife', 'Lincoln Factory', '1331 Holden Street', 'Detroit',
 '2026-09-25', '2026-09-26', '10:00 PM–4:00 AM', false, 17.25,
 'https://ra.co/events/2517135',
 null,
 'Resident Advisor', null, 'approved'),

('ra-2532522', '12 Hour Party',
 'Holden Trumbull Ventures'' 12 Hour Party returns to Marble Bar for an overnight session, lineup TBD -- a separate 9/25 recurrence from the 8/29 edition already in the database.',
 'nightlife', 'Marble Bar', '1501 Holden St', 'Detroit',
 '2026-09-25', '2026-09-26', '9:00 PM–9:00 AM', false, 17.25,
 'https://ra.co/events/2532522',
 null,
 'Resident Advisor', null, 'approved')

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
  note = excluded.note;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-18_ra-manual-pull-6.sql')
on conflict (filename) do nothing;
