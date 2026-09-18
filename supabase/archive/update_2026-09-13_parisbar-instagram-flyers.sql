-- Manual Paris Bar (Detroit) pull, 2026-09-13 (Jody sent 8 Instagram flyer
-- screenshots from Paris Bar Detroit's own account and several bands/promoters
-- who posted about shows there — "I would like to make events for all of
-- these screenshots - can you crop the image of the flier to use in the
-- post?"). One-time, human-transcribed batch, same spirit as this same day's
-- Resident Advisor and visitdetroit.com manual pulls: no Instagram scraping
-- of any kind, just the screenshots Jody herself provided, read by hand.
--
-- IMAGES: each screenshot was cropped down to just the flyer graphic itself
-- (Instagram's own chrome — toolbar, comments panel, browser window —
-- trimmed away) and uploaded through this site's own existing flyer-upload
-- pipeline (api/upload-image.js -> Supabase Storage bucket "event-flyers",
-- the same endpoint submit.html's own file picker posts to), so image_url
-- below is a real, permanently-hosted 313.events asset — not a hotlink back
-- to Instagram's own CDN (which expires/blocks hotlinking).
--
-- TICKET_URL: none of these eight posts had a direct ticket-purchase link
-- captured in the screenshot — a couple mention "link in bio" or "tickets
-- available in bio," but a bio link isn't something a screenshot captures
-- and isn't safe to guess at. Rather than fabricate a purchase link or leave
-- visitors with nothing at all, ticket_url points at the actual Instagram
-- post itself (a real, working link back to the source, same "link back
-- rather than invent one" principle as the Resident Advisor fallback button
-- on event.html) — every visitor can open it and find the real ticket link
-- in that account's bio themselves.
--
-- CHEATER SLICKS date/time note: the flyer graphic itself has a hand-drawn
-- "3PM" speech bubble, but the post's own caption text is unambiguous —
-- "$15 | Doors 8 PM | At Paris Bar, Detroit" — so 8 PM is used as the actual
-- doors time, with a note flagging the discrepancy rather than silently
-- picking one and hiding the conflict.
--
-- MICHAEL HUBBARD: this is a gallery exhibit run (Sept 9-30), not a single
-- show — the opening reception itself (Wed Sept 9, 6-10 PM) already passed
-- before this pull (today is Sept 13), so start_date is kept at the exhibit's
-- true start for accuracy, with a note clarifying the reception has already
-- happened and what's actually still ahead is the remaining run through
-- Sept 30.
--
-- INDUSTRY MONDAYS: the caption's own "last monday was a banger" phrasing
-- reads as an established recurring night, not a one-off — marked
-- is_recurring, but only this one dated instance (Sept 14) is captured,
-- since that's the only date this screenshot actually gives.
--
-- category: 'music' for the four live-band shows (Cheater Slicks/Pet
-- Mosquito/TY/Coffer, De Rodillos/Frente Norte/Answer=Chaos/Knotwork, The
-- Gashounds), 'visual' for the Michael Hubbard exhibit, 'nightlife' for the
-- three DJ/dance nights (Dolls Night, Industrial Detroit, Industry Mondays,
-- Hip Hop Night) — matching this project's existing category conventions.
--
-- Idempotent: external_id (the Instagram shortcode, prefixed "ig-") makes
-- every row a stable upsert target, same pattern as every other manual/cron
-- file here. Checked venue_name_raw='Paris Bar' against the events table
-- before writing this — the only existing Paris Bar rows are Mo and Jim's
-- Rock and Roll Trivia (today) and two older Femme Frequency/Haute to Death
-- events, none overlapping these eight.

insert into events (
  external_id, title, description, category, venue_name_raw,
  start_date, end_date, time_display, is_recurring, is_free, price_from,
  ticket_url, image_url, source, note, status
) values

('ig-DdExe5YlWTt', 'Cheater Slicks w/ Pet Mosquito, TY, Coffer',
 'MindReader Productions presents the legendary Cheater Slicks (In The Red Records), live at Paris Bar. Formed in 1987, the 3-piece delivers driving lo-fi damaged garage rock with hints of dark blues — this is their last show of 2026. With support from TY, Pet Mosquito (DIY art-damaged punk), and Coffer.',
 'music', 'Paris Bar',
 '2026-10-03', '2026-10-03', '8:00 PM', false, false, 15.00,
 'https://www.instagram.com/p/DdExe5YlWTt/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/e9833f20-11bc-41a0-9404-2c58b64e65fe.jpg',
 'Manual', 'Caption gives "$15 | Doors 8 PM" — the flyer graphic itself also shows a hand-drawn "3PM" speech bubble; 8 PM (the caption''s explicit doors time) is used here rather than the ambiguous flyer graphic.', 'approved'),

('ig-DdE7AziRMZX', 'Michael Hubbard: "After the Fall I Stay Apart"',
 'A new series of work by artist Michael Hubbard (@meh_ubbard), on view at Paris Bar Detroit September 9th through September 30th.',
 'visual', 'Paris Bar',
 '2026-09-09', '2026-09-30', null, false, false, null,
 'https://www.instagram.com/p/DdE7AziRMZX/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/552945d2-2530-4811-a40c-63b7301ba204.jpg',
 'Manual', 'Opening reception was Wednesday Sept 9, 6-10 PM — already past as of this 2026-09-13 pull. The exhibit itself remains on view through Sept 30.', 'approved'),

('ig-DdKOFeftwGK', 'Dolls Night: PARANORMAL',
 'Detroit''s Halloween party returns for its second year — waking the dead on the dancefloor with Doula (NYC), Joycxi, Tangle Garden, and Venn Diagramm (live). Security and harm-reduction teams present all night. 21+.',
 'nightlife', 'Paris Bar',
 '2026-10-23', '2026-10-23', '9:00 PM–3:00 AM', false, false, 10.00,
 'https://www.instagram.com/p/DdKOFeftwGK/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/82dfabba-dd0c-47ae-b48d-c544b05b3cee.jpg',
 'Manual', '$10 early bird / $15 first release / $20 second release / $30 at the door — $10 (lowest, early-bird) tier used as price_from.', 'approved'),

('ig-DdO7rQ9BOtF', 'Industrial Detroit w/ Mvtant, Pink Stiletto, C.M. Samuels, Mechanatura, Kenjiro',
 'Mvtant and Pink Stiletto bring their brand of EBM and nu dance wave to Detroit from California, with support from locals C.M. Samuels and Mechanatura, and Kenjiro on the decks. This All Saints'' Day showcase is billed as one of Paris Bar''s favorite recurring nights.',
 'nightlife', 'Paris Bar',
 '2026-11-01', '2026-11-01', '7:00 PM', false, false, null,
 'https://www.instagram.com/p/DdO7rQ9BOtF/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/332598f5-883f-435c-8515-25e073b9cb5d.jpg',
 'Manual', 'Post says "Tix on RA, link in bio" — no direct Resident Advisor URL was visible in the screenshot, so ticket_url points at this Instagram post itself rather than a guessed RA link.', 'approved'),

('ig-DdM545jgRxz', 'Industry Mondays: Music by Dominic Jevalon & Angela Baskets',
 'Paris Bar''s recurring Industry Monday night — music by Dominic Jevalon and Angela Baskets, pop-up jewelry by Archangel Archive, and tarot readings by Moonbeam. Goth & romantic theme this week.',
 'nightlife', 'Paris Bar',
 '2026-09-14', '2026-09-14', 'Doors @ 8:00 PM', true, false, null,
 'https://www.instagram.com/p/DdM545jgRxz/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/9c6b8cc6-4db3-4442-8dff-7d75fb25db67.jpg',
 'Manual', 'Caption ("last monday was a banger") implies this is a standing recurring night — only this dated instance (Sept 14) was captured from the screenshot; marked is_recurring accordingly.', 'approved'),

('ig-DcyxRM8RtK2', 'De Rodillos w/ Frente Norte, Answer=Chaos, Knotwork',
 'Hardcore punk from Pittsburgh: De Rodillos, with Frente Norte, Answer=Chaos, and Cleveland''s Knotwork. $10 cover, 21+.',
 'music', 'Paris Bar',
 '2026-10-02', '2026-10-02', '8:00 PM', false, false, 10.00,
 'https://www.instagram.com/p/DcyxRM8RtK2/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/fc3fd6f5-ab8f-426a-aefd-c1b43ac2f477.jpg',
 'Manual', null, 'approved'),

('ig-DdCmQqMPrBb', 'The Gashounds: Record Release & 10-Year Anniversary',
 'The Gashounds celebrate 10 years together with a vinyl release show, joined by DUENDE! and Alison Lewis & String of Ponies. Visuals by Graham Hollister and Jeff Jablonski; late night with DJ Squirtsack.',
 'music', 'Paris Bar',
 '2026-09-25', '2026-09-25', '8:00 PM', false, false, 10.00,
 'https://www.instagram.com/p/DdCmQqMPrBb/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/320b8117-c7c2-4a3d-bf48-b0a34cb5f43b.jpg',
 'Manual', null, 'approved'),

('ig-DdDEevdOO9k', 'Hip Hop Night @ Paris Bar',
 'A full night of hip hop in Detroit, featuring HEYYOMARI, REALM, LARTHEEALIEN, CULT SEX!!!!, and GIRLARCANE.',
 'nightlife', 'Paris Bar',
 '2026-09-27', '2026-09-27', '8:00 PM–2:00 AM', false, false, null,
 'https://www.instagram.com/p/DdDEevdOO9k/',
 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/7186f1eb-c319-4a0f-91ef-3040e65bbc62.jpg',
 'Manual', null, 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  is_recurring = excluded.is_recurring,
  price_from = excluded.price_from,
  ticket_url = excluded.ticket_url,
  image_url = excluded.image_url,
  note = excluded.note;

-- Same generic name-match backfill as every other new-events file here —
-- only touches venue_id is null rows, safe to re-run. "Paris Bar" already
-- has a venues row (renamed from "Paris Bar (Hamtramck)" earlier today —
-- see update_2026-09-13_paris-bar-rename.sql), so this should link all
-- eight rows above straight away.
update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;
