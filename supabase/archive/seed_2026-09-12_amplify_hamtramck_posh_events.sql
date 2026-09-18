-- Manually-added events for Amplify (2932 Caniff Ave, Hamtramck, MI 48212) —
-- added 2026-09-12 at Jody's request, after the venue's promoter asked
-- whether their Posh.vip group page (posh.vip/g/amplify-music) could be
-- pulled in automatically.
--
-- IT COULD NOT BE: posh.vip is a client-rendered (Next.js) SPA with no
-- JSON-LD, no __NEXT_DATA__ event payload, no exposed API/XHR call, and no
-- iCalendar/RSS export anywhere on the page — confirmed by inspecting
-- network requests, page source, and DOM anchor structure on 2026-09-12.
-- These 9 event occurrences (8 distinct events; Cleaning Crew Roll Call
-- runs two consecutive nights) were instead extracted by hand, one event
-- page at a time, from https://posh.vip/g/amplify-music and each event's
-- own /e/<slug> detail page, same day. All times/descriptions/addresses
-- below are exactly as published on those pages except where a [NOTE]
-- below an entry flags an inconsistency or gap in the source itself.
--
-- Venue is new to 313.events (Amplify only opened/rebranded in Nov 2026
-- per its own "Grand Opening" listing) — not yet in the `venues` table, so
-- venue_name_raw/venue_address_raw/venue_city_raw are used exactly like
-- every other free-text-venue source in this project (see
-- migration_006_venue_city_raw.sql / migration_020_venue_address_raw.sql).
--
-- Category: 'nightlife' for all nine — every listing is a DJ/live-music
-- club night at a "Multi Genre" venue (per Amplify's own posh.vip bio),
-- consistent with how this project already categorizes TV Lounge/Spkrbox/
-- Marble Bar-type venues.
--
-- Pricing: NOT published on any of these Posh pages (only "Get the app for
-- instant ticket access" — no price shown without the Posh app). Rather
-- than guess, is_free is honestly set to false (these are Posh-ticketed,
-- not RSVP-free) and price_from is left NULL. ticket_url points at each
-- event's own posh.vip page, which is where a visitor actually books/RSVPs
-- — there is no separate "event page" distinct from that, so event_url is
-- left NULL to avoid a duplicate link (see migration_022_event_url.sql's
-- own "suppressed when identical" convention).
--
-- Idempotent: safe to re-run — external_id makes every row a stable upsert
-- target instead of a duplicate on a second run (same convention as
-- seed_2026-09-04_manual_events.sql).

insert into events (
  external_id, title, description, category,
  venue_name_raw, venue_address_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, ticket_url,
  source, note, status
) values

('posh-amplify-cleaning-crew-roll-call-2026-09-23', 'Cleaning Crew Roll Call',
 'Pizza, open decks, and the crew coming together to spruce up Amplify. First of two consecutive roll-call nights (also Sep 24).',
 'nightlife', 'Amplify', '2932 Caniff Ave', 'Hamtramck',
 '2026-09-23', null, '6:00 PM–8:00 PM', false, null,
 'https://posh.vip/e/cleaning-crew-roll-call-2026-9-24-0-0',
 'Amplify (posh.vip/g/amplify-music, researched 2026-09-12)',
 'Posh lists this as one listing covering both Sep 23 and Sep 24 ("More Dates"); split into two rows here (one per date), same pattern this project already uses for other multi-date single listings.', 'approved'),

('posh-amplify-cleaning-crew-roll-call-2026-09-24', 'Cleaning Crew Roll Call',
 'Pizza, open decks, and the crew coming together to spruce up Amplify. Second of two consecutive roll-call nights (also Sep 23).',
 'nightlife', 'Amplify', '2932 Caniff Ave', 'Hamtramck',
 '2026-09-24', null, '6:00 PM–8:00 PM', false, null,
 'https://posh.vip/e/cleaning-crew-roll-call-2026-9-24-0-0',
 'Amplify (posh.vip/g/amplify-music, researched 2026-09-12)',
 'Posh lists this as one listing covering both Sep 23 and Sep 24 ("More Dates"); split into two rows here (one per date), same pattern this project already uses for other multi-date single listings.', 'approved'),

('posh-amplify-dont-cross-the-street', 'Don''t Cross The Street',
 'Bizarre''s (of D12) album release event for "Don''t Cross The Street." Hip hop/rap lineup; Bizarre performs live at 1:00 AM.',
 'nightlife', 'Amplify', '2932 Caniff Ave', 'Hamtramck',
 '2026-10-24', null, '8:00 PM–2:00 AM', false, null,
 'https://posh.vip/e/dont-cross-the-street',
 'Amplify (posh.vip/g/amplify-music, researched 2026-09-12)',
 'Source page spells it "Bizzare''s album drop" — corrected to the artist''s actual name (Bizarre, of D12) here; flag if the misspelling matters for search/SEO matching.', 'approved'),

('posh-amplify-phright-night-2', 'Phright Night',
 'Halloween event with phonk artist Ryan Celsius bringing unique visuals and sound. Costumes encouraged. Lineup: TomKillsJerry, ENOKALYPSE, Ryan Celsius, Kiefergr33n, Rowles Royce.',
 'nightlife', 'Amplify', '2932 Caniff Ave', 'Hamtramck',
 '2026-10-31', null, '7:00 PM–2:00 AM', false, null,
 'https://posh.vip/e/phright-night-2',
 'Amplify (posh.vip/g/amplify-music, researched 2026-09-12)', null, 'approved'),

('posh-amplify-4evr-yung', '4evr Yung',
 'Celebrating 4evr Yung staying forever young.',
 'nightlife', 'Amplify', '2932 Caniff Ave', 'Hamtramck',
 '2026-11-06', null, '7:00 PM–2:00 AM', false, null,
 'https://posh.vip/e/4evr-yung',
 'Amplify (posh.vip/g/amplify-music, researched 2026-09-12)',
 'Posh listing itself is thin on detail beyond the title/tagline above — no lineup or genre info published as of 2026-09-12.', 'approved'),

('posh-amplify-trnt-1', 'TRNT',
 'Get TRNT up! Live bands, vocals, and DJs, presented by BlankCheckProject.',
 'nightlife', 'Amplify', '2932 Caniff Ave', 'Hamtramck',
 '2026-11-07', null, '7:00 PM–2:00 AM', false, null,
 'https://posh.vip/e/trnt-1',
 'Amplify (posh.vip/g/amplify-music, researched 2026-09-12)',
 'Flyer image on the Posh listing still says "event details coming soon" in several spots as of 2026-09-12 — re-check closer to the date, description may firm up.', 'approved'),

('posh-amplify-friday-the-13th-29', 'Friday The 13th',
 'EDM night — dubstep, DNB, and riddim — plus a birthday celebration. Doors at 7:00 PM, music at 8:00 PM. Lineup: ST4MM3NA, Solarus, H-Deezy, Nebvla, Devon Rexx B2B Navigtr, and ZTJ.',
 'nightlife', 'Amplify', '2932 Caniff Ave', 'Hamtramck',
 '2026-11-13', null, '7:00 PM–2:00 AM', false, null,
 'https://posh.vip/e/friday-the-13th-29',
 'Amplify (posh.vip/g/amplify-music, researched 2026-09-12)',
 'Birthday name is inconsistent between the flyer image ("Rachel''s 33rd Birthday Bash") and the page''s own written description ("RayCheezy''s 33rd Birthday!") — likely the same person under a nickname, but not confirmable from the listing alone; description above deliberately omits the name rather than guess which is right.', 'approved'),

('posh-amplify-inkless', 'Inkless',
 'Hard rock night with Inkless & friends. Inkless is a Detroit-based rock band (Andy Boyer, Luke Daniels, Josh Rodriguez, Cardi DeMonaco) with a sound in the vein of Foo Fighters, Alice In Chains, The Cult, and Stone Temple Pilots.',
 'nightlife', 'Amplify', '2932 Caniff Ave', 'Hamtramck',
 '2026-11-21', null, '7:00 PM–12:00 AM', false, null,
 'https://posh.vip/e/inkless',
 'Amplify (posh.vip/g/amplify-music, researched 2026-09-12)', null, 'approved'),

('posh-amplify-grand-opening', 'Amplify Grand Opening',
 'Grand Opening celebration of Amplify under new ownership by Maggie and Zack, continuing the venue''s ~50-year run as a Hamtramck music venue under a new multi-genre format. 21+.',
 'nightlife', 'Amplify', '2932 Caniff Ave', 'Hamtramck',
 '2026-11-25', null, '7:00 PM–2:00 AM', false, null,
 'https://posh.vip/e/amplify-grand-opening',
 'Amplify (posh.vip/g/amplify-music, researched 2026-09-12)', null, 'approved')

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
