-- Duplicate-events cleanup, batch 2, 2026-09-17 (Jody: "do a full smoke on
-- redundant events - i think there may be a few"). This batch handles the
-- largest single duplicate pattern found in that sweep: VisitDetroit's own
-- feed independently re-syndicates the same real-world events (mostly
-- Detroit Red Wings/Tigers/Lions home games and touring concerts at Pine
-- Knob, Little Caesars Arena, Comerica Park, Ford Field, and Meadow Brook)
-- that cron-ticketmaster.js already pulls in -- there's no cross-source
-- dedup between those two crons today, so every one of these games/shows
-- was showing up twice on the site.
--
-- 41 pairs confirmed same real-world event: same venue_id + same
-- start_date, title similarity above threshold (most are an exact or
-- near-exact title match; a handful are Ticketmaster's fuller tour-name
-- title -- e.g. "BABYMETAL WORLD TOUR 2026" -- vs VisitDetroit's shorter
-- artist-only title -- e.g. "BABYMETAL" -- confirmed as the same show by
-- venue+date, not just wording). Sports matchups spot-checked earlier in
-- this sweep (a Tigers game) confirmed Ticketmaster and VisitDetroit format
-- times differently for the identical game (a single showtime vs an
-- open/close window), so time_display was intentionally NOT used as a
-- matching signal here -- only cross-source + venue + date + title.
--
-- Keeping the Ticketmaster-sourced row in every pair (it carries the real
-- ticket_url/affiliate link and, for sports, the actual TM event id;
-- VisitDetroit's listings are informational only, no working checkout
-- link), rejecting the VisitDetroit-sourced row.
--
-- Pairs (date | venue | kept Ticketmaster title -- rejected VisitDetroit id):
--   2026-09-15 | Pine Knob Music Theatre | $uicideboy$ Present Grey Day Tour 2026 W. Destroy Lonely & More -- f0f4d908-5938-4b04-99c1-0a6aa9de93cf
--   2026-09-17 | Meadow Brook Amphitheatre | Indigo Girls & Linda Perry -- 9d902fe5-0467-43dc-803d-8abe411f493c
--   2026-09-18 | Pine Knob Music Theatre | BABYMETAL WORLD TOUR 2026 -- 20f53f2e-790f-4251-8dc5-61941b26d09d
--   2026-09-18 | Andiamo Celebrity Showroom | Marshall Charloff & The Purple Xperience -- d2d6d56c-e4bc-4e5b-bbdc-94a283db9e43
--   2026-09-19 | Pine Knob Music Theatre | "The Hayley Williams Show" -- e50825c7-2dd2-47f6-be85-33acddb5e92e
--   2026-09-21 | Comerica Park | Detroit Tigers vs. Washington Nationals -- 20b0878e-3755-4764-b415-c0dd14b4d0e2
--   2026-09-22 | Comerica Park | Detroit Tigers vs. Washington Nationals -- ba2a580b-f543-4f62-8f4a-b4961d1c5bbf
--   2026-09-23 | Comerica Park | Detroit Tigers vs. Washington Nationals -- 1b1b3ad6-866a-403c-a8dd-2050a4d16b22
--   2026-09-23 | Pine Knob Music Theatre | Logic & G-Eazy: The Endless Summer Tour Part II -- 34efee68-49f5-410f-b3a0-f0c529b45ada
--   2026-09-24 | Little Caesars Arena | Detroit Red Wings vs. Buffalo Sabres -- d82c271c-0530-4581-81fe-4ade7381f191
--   2026-09-24 | Pine Knob Music Theatre | Brooks & Dunn: Neon Moon Tour 2026 -- da72a0a9-10bc-4dab-8601-f8b0b766dd9e
--   2026-09-24 | Meadow Brook Amphitheatre | Caamp -- fad4df02-fb36-4184-8323-6c4b45e80583
--   2026-09-25 | Comerica Park | Detroit Tigers vs. Pittsburgh Pirates -- ebec9fd6-6eb9-4191-9689-9cf6ecf1e331
--   2026-09-26 | Comerica Park | Detroit Tigers vs. Pittsburgh Pirates -- 155b3cb6-25cf-4a68-9549-b8eaa5f57b8a
--   2026-09-26 | Little Caesars Arena | Detroit Red Wings vs. Columbus Blue Jackets -- ebbbed97-3dae-4d93-bb7c-d61a454f37bf
--   2026-09-26 | Pine Knob Music Theatre | Bryson Tiller Presents: The Neo Trapsoul Tour -- 174277d1-fb5a-494c-ab38-e9c459d70dad
--   2026-09-27 | Ford Field | Detroit Lions vs. New York Jets -- a9c4a5bc-b762-4e6e-ab3a-6305cc1c96bf
--   2026-09-27 | Comerica Park | Detroit Tigers vs. Pittsburgh Pirates -- db305804-1f90-4359-a1db-5200973c599e
--   2026-09-27 | Pine Knob Music Theatre | Staind: Break The Cycle 25th Anniversary Tour -- 28122d1a-513e-4138-9370-4517c4a06e6f
--   2026-10-01 | Little Caesars Arena | Doja Cat - Tour Ma Vie World Tour -- dc80079d-00d6-4153-81c1-f427e70440a0
--   2026-10-02 | Little Caesars Arena | Detroit Red Wings vs. New York Rangers -- d262490e-976b-412c-8805-58780dc5ca28
--   2026-10-03 | Pine Knob Music Theatre | Dan + Shay: The Young Tour -- ca46bf3f-f543-4a11-aef4-d2edc2bafab9
--   2026-10-04 | Little Caesars Arena | Detroit Red Wings vs. Winnipeg Jets -- 099a6b2e-f612-4a99-80b4-3be57bebb54f
--   2026-10-06 | Little Caesars Arena | Detroit Red Wings vs. Ottawa Senators -- 7293a35f-ad36-4f54-b209-15a774bb732a
--   2026-10-09 | Little Caesars Arena | Detroit Red Wings vs. Seattle Kraken -- 9b1a4bf4-9de1-4642-bc15-1838622c34df
--   2026-10-13 | Little Caesars Arena | Detroit Red Wings vs. New Jersey Devils -- 00a1ce98-dace-496f-a128-43f9737109a1
--   2026-10-15 | Little Caesars Arena | Detroit Red Wings vs. Philadelphia Flyers -- 9cbf9f7c-1d7c-4369-a541-d2884b63a9ac
--   2026-10-17 | Little Caesars Arena | Detroit Red Wings vs. San Jose Sharks -- bafebf46-9e36-4847-8d4e-72f552527964
--   2026-10-25 | Ford Field | Detroit Lions vs. Green Bay Packers -- edba7499-a763-467e-bb16-91485ea52ddc
--   2026-10-29 | Little Caesars Arena | Detroit Red Wings vs. Chicago Blackhawks -- c5bff85e-b5ef-4742-a24e-9291729ebc13
--   2026-10-31 | Little Caesars Arena | Detroit Red Wings vs. St. Louis Blues -- c127a406-35a9-4b9f-920d-6e5fd71371c1
--   2026-11-01 | Ford Field | Detroit Lions vs. Minnesota Vikings -- a332061d-a406-470d-aa9d-876f23cf128f
--   2026-11-01 | Little Caesars Arena | MANÁ: VIVIR SIN AIRE TOUR -- 0bb4c3e1-6aa2-4c04-aac5-f83f74c1c065
--   2026-11-05 | Little Caesars Arena | Detroit Red Wings vs. Vegas Golden Knights -- b7b41d05-d4f7-47c6-b917-686d282b1ac0
--   2026-11-18 | Little Caesars Arena | Detroit Red Wings vs. Boston Bruins -- e532c0d4-5942-41b5-94d5-33a988859f2f
--   2026-11-21 | Little Caesars Arena | Detroit Red Wings vs. New York Islanders -- a92b92d1-961b-4cde-af89-268fa6f0821f
--   2026-11-22 | Ford Field | Detroit Lions vs. Tampa Bay Buccaneers -- a0c59add-c452-40fe-9a5c-d2adc278e04b
--   2026-11-25 | Little Caesars Arena | Detroit Red Wings vs. Vancouver Canucks -- 44233150-fc77-4bac-bad5-3c4f3a551ba0
--   2026-11-26 | Ford Field | Detroit Lions vs. Chicago Bears -- fa6601e5-ddfb-448f-a8ec-ed53806e20b5
--   2026-11-28 | Little Caesars Arena | Detroit Red Wings vs. Nashville Predators -- d9e19274-617f-40a3-b470-00fb954eacb7
--   2026-12-01 | Little Caesars Arena | Detroit Red Wings vs. Calgary Flames -- 51042241-bf7b-4e8f-bd24-1005713f0871
--
-- This is a large batch of live-data changes -- flagging clearly to Jody
-- before/alongside this file rather than just silently running it.
update events
set status = 'rejected',
    internal_note = 'Duplicate of the Ticketmaster-sourced row for the same event (same venue + date). VisitDetroit''s feed independently re-syndicates games/shows already pulled by cron-ticketmaster.js; no cross-source dedup exists between those two crons today. Rejected in favor of the Ticketmaster row, which carries the real affiliate ticket_url. See update_2026-09-17_dedupe-batch2-tm-vs-visitdetroit.sql header for the full paired list.'
where id in (
  'f0f4d908-5938-4b04-99c1-0a6aa9de93cf',
  '9d902fe5-0467-43dc-803d-8abe411f493c',
  '20f53f2e-790f-4251-8dc5-61941b26d09d',
  'd2d6d56c-e4bc-4e5b-bbdc-94a283db9e43',
  'e50825c7-2dd2-47f6-be85-33acddb5e92e',
  '20b0878e-3755-4764-b415-c0dd14b4d0e2',
  'ba2a580b-f543-4f62-8f4a-b4961d1c5bbf',
  '1b1b3ad6-866a-403c-a8dd-2050a4d16b22',
  '34efee68-49f5-410f-b3a0-f0c529b45ada',
  'd82c271c-0530-4581-81fe-4ade7381f191',
  'da72a0a9-10bc-4dab-8601-f8b0b766dd9e',
  'fad4df02-fb36-4184-8323-6c4b45e80583',
  'ebec9fd6-6eb9-4191-9689-9cf6ecf1e331',
  '155b3cb6-25cf-4a68-9549-b8eaa5f57b8a',
  'ebbbed97-3dae-4d93-bb7c-d61a454f37bf',
  '174277d1-fb5a-494c-ab38-e9c459d70dad',
  'a9c4a5bc-b762-4e6e-ab3a-6305cc1c96bf',
  'db305804-1f90-4359-a1db-5200973c599e',
  '28122d1a-513e-4138-9370-4517c4a06e6f',
  'dc80079d-00d6-4153-81c1-f427e70440a0',
  'd262490e-976b-412c-8805-58780dc5ca28',
  'ca46bf3f-f543-4a11-aef4-d2edc2bafab9',
  '099a6b2e-f612-4a99-80b4-3be57bebb54f',
  '7293a35f-ad36-4f54-b209-15a774bb732a',
  '9b1a4bf4-9de1-4642-bc15-1838622c34df',
  '00a1ce98-dace-496f-a128-43f9737109a1',
  '9cbf9f7c-1d7c-4369-a541-d2884b63a9ac',
  'bafebf46-9e36-4847-8d4e-72f552527964',
  'edba7499-a763-467e-bb16-91485ea52ddc',
  'c5bff85e-b5ef-4742-a24e-9291729ebc13',
  'c127a406-35a9-4b9f-920d-6e5fd71371c1',
  'a332061d-a406-470d-aa9d-876f23cf128f',
  '0bb4c3e1-6aa2-4c04-aac5-f83f74c1c065',
  'b7b41d05-d4f7-47c6-b917-686d282b1ac0',
  'e532c0d4-5942-41b5-94d5-33a988859f2f',
  'a92b92d1-961b-4cde-af89-268fa6f0821f',
  'a0c59add-c452-40fe-9a5c-d2adc278e04b',
  '44233150-fc77-4bac-bad5-3c4f3a551ba0',
  'fa6601e5-ddfb-448f-a8ec-ed53806e20b5',
  'd9e19274-617f-40a3-b470-00fb954eacb7',
  '51042241-bf7b-4e8f-bd24-1005713f0871'
)
and status = 'approved';

insert into schema_migrations (filename) values ('update_2026-09-17_dedupe-batch2-tm-vs-visitdetroit.sql')
on conflict (filename) do nothing;
