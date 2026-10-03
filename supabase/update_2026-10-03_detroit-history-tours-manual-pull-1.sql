-- Detroit History Tours (detroithistorytours.com) -- first manual pull,
-- 2026-10-03. Jody asked whether we had this source; confirmed via
-- WebFetch we did not (grepped the whole repo, zero hits). Logged as an
-- automated-cron candidate in INGESTION_BACKLOG.md the same day; this is
-- the one-time manual batch of its current public schedule.
--
-- Source shape: Squarespace site, no calendar widget/JSON-LD/RSS/ICS. A
-- dedicated "Calendar of Tours and Events" page (/new-page) lists each
-- scheduled tour instance as plain text (date, time range, tour name,
-- link to its /shop product page); the product pages themselves carry
-- the price, full description, and meeting/departure location, but NOT
-- per-date availability (the same product page is linked from every date
-- that tour runs). robots.txt was not checked -- the fetch tool in this
-- session refused that URL on its own provenance grounds (same refusal
-- hit for mbmcmichigan.org's robots.txt in this session). Worth checking
-- before building a scraper: two other Squarespace venues already found
-- by this project (Senate Theater, Coriander Kitchen Farm) turned out to
-- block AI crawlers by name in robots.txt.
--
-- Pulled all 26 future instances listed on the calendar page as of
-- 2026-10-03 (today), covering 6 distinct recurring tour products through
-- Nov 28, 2026. The one past instance on that page (Fri Oct 2) is
-- excluded. Each dated/timed instance is its own row -- same convention
-- this project already uses for RA's month-long exhibitions (see e.g.
-- update_2026-09-20_ra-manual-pull-9.sql's own header) -- since every
-- instance is independently bookable, not a single multi-day event.
--
-- Category: none of the 15 values is a perfect fit for a guided history
-- tour; 'museum' ("Museums & History") is the closest honest match and is
-- used for all 6 products here, including the hockey-themed one (it's a
-- history tour about hockey, not a live sporting event, so 'sports' would
-- mischaracterize it).
--
-- Meeting/departure location, not a venue in the usual sense: 4 of the 6
-- tours depart from "The Detroit History Club" itself (3103 Commor St,
-- Hamtramck, MI 48212, exactly as the source states it -- not corrected
-- for a possible street-name typo, per this project's never-invent rule).
-- The walking tours instead meet at a public landmark (GM Plaza
-- Promenade / Renaissance Center; the Greektown People Mover station, no
-- street address stated anywhere for the station itself, so
-- venue_address_raw is left null there rather than guessed from the
-- nearby parking garage's address).
--
-- One source-data wrinkle, flagged rather than silently resolved: the
-- Oct 28 Dastardly Detroit instance's start time reads "6:00M" on the
-- calendar page (a truncated character, almost certainly "6:00PM" --
-- every other evening instance of this same tour starts at 6:00 PM).
-- Treated as 6:00 PM here; flag to Jody since this is a correction of an
-- apparent source typo, not a verbatim read.
--
-- Second wrinkle, genuinely unresolved and left to Jody rather than
-- guessed: the "Big 3" Architecture Tour's own product page carries a
-- "sold out, next available Mar 14, 2026" notice that contradicts this
-- same page's Nov 28, 2026 listing on the site's own calendar. Included
-- here (the calendar page is the more authoritative scheduling source),
-- but with a visitor-facing note recommending a direct availability
-- check -- see that row below.
--
-- Duplicate check: same limitation as the mbmcmichigan.org pull earlier
-- today -- this sandbox's direct Supabase read attempt was refused by the
-- fetch tool's URL-provenance guard, and egress to supabase.co is blocked
-- outright from here anyway (documented elsewhere in this repo). Risk is
-- low -- brand-new source/venue, never tracked before -- but Jody should
-- eyeball for an existing near-duplicate before running this.
--
-- status is 'approved', matching this project's manual-pull convention;
-- change to 'pending_review' before running if you'd rather vet this
-- brand-new source's first batch before it goes live.
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('dht-historically-haunted-bus-2026-10-03-1400', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-03', '2026-10-03', '2:00 PM–5:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-03-1800', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-03', '2026-10-03', '6:00 PM–9:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-dastardly-walking-2026-10-04-1500', 'Dastardly Detroit: A Spooky Downtown Walking Tour',
 '90-minute downtown walking tour covering Detroit''s darker history -- phantom ships, mass graves, urban legends, and Prohibition-era scoundrels. About 1.5 miles, ends at Grand Circus Park.',
 'museum', 'GM Plaza Promenade (Renaissance Center)', '300 Atwater St', 'Detroit',
 '2026-10-04', '2026-10-04', '3:00 PM–4:30 PM', false, 31.00,
 'https://www.detroithistorytours.com/shop/dastardly-detroit-a-spooky-downtown-history-walking-tour',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/64df69d13ea5cc0a93adef86/1790694859073/983px-Cholera_bacteria_SEM-3.jpg?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-dastardly-walking-2026-10-08-1900', 'Dastardly Detroit: A Spooky Downtown Walking Tour',
 '90-minute downtown walking tour covering Detroit''s darker history -- phantom ships, mass graves, urban legends, and Prohibition-era scoundrels. About 1.5 miles, ends at Grand Circus Park.',
 'museum', 'GM Plaza Promenade (Renaissance Center)', '300 Atwater St', 'Detroit',
 '2026-10-08', '2026-10-08', '7:00 PM–8:30 PM', false, 31.00,
 'https://www.detroithistorytours.com/shop/dastardly-detroit-a-spooky-downtown-history-walking-tour',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/64df69d13ea5cc0a93adef86/1790694859073/983px-Cholera_bacteria_SEM-3.jpg?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-09-1800', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-09', '2026-10-09', '6:00 PM–9:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-10-1400', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-10', '2026-10-10', '2:00 PM–5:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-10-1800', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-10', '2026-10-10', '6:00 PM–9:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-dastardly-walking-2026-10-16-1800', 'Dastardly Detroit: A Spooky Downtown Walking Tour',
 '90-minute downtown walking tour covering Detroit''s darker history -- phantom ships, mass graves, urban legends, and Prohibition-era scoundrels. About 1.5 miles, ends at Grand Circus Park.',
 'museum', 'GM Plaza Promenade (Renaissance Center)', '300 Atwater St', 'Detroit',
 '2026-10-16', '2026-10-16', '6:00 PM–7:30 PM', false, 31.00,
 'https://www.detroithistorytours.com/shop/dastardly-detroit-a-spooky-downtown-history-walking-tour',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/64df69d13ea5cc0a93adef86/1790694859073/983px-Cholera_bacteria_SEM-3.jpg?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-16-1800', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-16', '2026-10-16', '6:00 PM–9:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-17-1400', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-17', '2026-10-17', '2:00 PM–5:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-17-1800', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-17', '2026-10-17', '6:00 PM–9:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-dastardly-walking-2026-10-18-1300', 'Dastardly Detroit: A Spooky Downtown Walking Tour',
 '90-minute downtown walking tour covering Detroit''s darker history -- phantom ships, mass graves, urban legends, and Prohibition-era scoundrels. About 1.5 miles, ends at Grand Circus Park.',
 'museum', 'GM Plaza Promenade (Renaissance Center)', '300 Atwater St', 'Detroit',
 '2026-10-18', '2026-10-18', '1:00 PM–2:30 PM', false, 31.00,
 'https://www.detroithistorytours.com/shop/dastardly-detroit-a-spooky-downtown-history-walking-tour',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/64df69d13ea5cc0a93adef86/1790694859073/983px-Cholera_bacteria_SEM-3.jpg?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-18-1400', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-18', '2026-10-18', '2:00 PM–5:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-22-1800', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-22', '2026-10-22', '6:00 PM–9:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-dastardly-walking-2026-10-23-1800', 'Dastardly Detroit: A Spooky Downtown Walking Tour',
 '90-minute downtown walking tour covering Detroit''s darker history -- phantom ships, mass graves, urban legends, and Prohibition-era scoundrels. About 1.5 miles, ends at Grand Circus Park.',
 'museum', 'GM Plaza Promenade (Renaissance Center)', '300 Atwater St', 'Detroit',
 '2026-10-23', '2026-10-23', '6:00 PM–7:30 PM', false, 31.00,
 'https://www.detroithistorytours.com/shop/dastardly-detroit-a-spooky-downtown-history-walking-tour',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/64df69d13ea5cc0a93adef86/1790694859073/983px-Cholera_bacteria_SEM-3.jpg?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-23-1800', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-23', '2026-10-23', '6:00 PM–9:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-dastardly-walking-2026-10-24-1000', 'Dastardly Detroit: A Spooky Downtown Walking Tour',
 '90-minute downtown walking tour covering Detroit''s darker history -- phantom ships, mass graves, urban legends, and Prohibition-era scoundrels. About 1.5 miles, ends at Grand Circus Park.',
 'museum', 'GM Plaza Promenade (Renaissance Center)', '300 Atwater St', 'Detroit',
 '2026-10-24', '2026-10-24', '10:00 AM–11:30 AM', false, 31.00,
 'https://www.detroithistorytours.com/shop/dastardly-detroit-a-spooky-downtown-history-walking-tour',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/64df69d13ea5cc0a93adef86/1790694859073/983px-Cholera_bacteria_SEM-3.jpg?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-24-1800', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-24', '2026-10-24', '6:00 PM–9:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-25-1400', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-25', '2026-10-25', '2:00 PM–5:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-dastardly-walking-2026-10-28-1800', 'Dastardly Detroit: A Spooky Downtown Walking Tour',
 '90-minute downtown walking tour covering Detroit''s darker history -- phantom ships, mass graves, urban legends, and Prohibition-era scoundrels. About 1.5 miles, ends at Grand Circus Park.',
 'museum', 'GM Plaza Promenade (Renaissance Center)', '300 Atwater St', 'Detroit',
 '2026-10-28', '2026-10-28', '6:00 PM–7:30 PM', false, 31.00,
 'https://www.detroithistorytours.com/shop/dastardly-detroit-a-spooky-downtown-history-walking-tour',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/64df69d13ea5cc0a93adef86/1790694859073/983px-Cholera_bacteria_SEM-3.jpg?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-29-1800', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-29', '2026-10-29', '6:00 PM–9:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-historically-haunted-bus-2026-10-30-1800', 'Historically Haunted Detroit: The Dark Side of History Bus Tour',
 'Three-hour Halloween-season bus tour exploring Detroit''s maritime ghost stories and supernatural legends, with a historic-bar refreshment stop. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-10-30', '2026-10-30', '6:00 PM–9:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/8p73cr7jumsu9cf7ndm7ebdb037zxq',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/62f3c0070e27641305b921dc/1790346157600/westcott-1880.jpg.webp?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-pucks-ponds-hockey-bus-2026-11-28-1000', 'Pucks, Ponds, and the Past: A Tour of Detroit''s Hockey History',
 'Bus tour tracing Detroit''s hockey history from frozen-pond games to the Red Wings'' Stanley Cup era, including the Winged Wheel''s origins. 21+.',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-11-28', '2026-11-28', '10:00 AM–1:00 PM', false, 59.00,
 'https://www.detroithistorytours.com/shop/pucks-ponds-and-the-past-a-tour-of-detroits-hockey-history',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/692b12e380600a01dce3b278/1790950338840/DHTHockeyTour.png?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-people-mover-walking-2026-11-28-1000', 'Art, History, and Oddities of The Detroit People Mover',
 '1.5-hour walking tour of the Detroit People Mover''s art, history, and trivia across its 2.9-mile downtown loop. Meets outside the Greektown station turnstiles; includes nearly a mile of walking with stairs.',
 'museum', 'Greektown People Mover Station', null, 'Detroit',
 '2026-11-28', '2026-11-28', '10:00 AM–11:30 AM', false, 33.00,
 'https://www.detroithistorytours.com/shop/art-history-and-oddities-of-the-detroit-people-mover',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/5972b6a9bebafb60f0d2946d/1717592333681/unnamed.jpg?format=1500w',
 'Detroit History Tours', null, 'approved'),

('dht-big3-architecture-bus-2026-11-28-1400', 'Detroit''s "Big 3" Architecture Tour',
 '3.5-hour bus tour with guided interior access to Michigan Central Station, the Fisher Building, and the Guardian Building, with two guides and private-coach transport.',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-11-28', '2026-11-28', '2:00 PM–5:30 PM', false, 79.75,
 'https://www.detroithistorytours.com/shop/detroits-big-3-architecture-tour',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/67eeb706dfd8146435aa802b/1772819172013/Detroit%E2%80%99s+%E2%80%9CBig+3%E2%80%9D+Architecture+Tour+%2811+x+11+in%29.jpg?format=1500w',
 'Detroit History Tours', 'Confirm availability directly with Detroit History Tours before planning around this date.', 'approved'),

('dht-felonies-misdemeanors-bus-2026-11-28-1830', 'Felonies and Misdemeanors: The Detroit Cops and Mobsters Bus Tour',
 'Bus tour of Detroit''s criminal underworld -- Prohibition, the Purple Gang, mob families, and early-1900s extortion rackets -- alongside the police history that pursued them. 21+ (adult content/language).',
 'museum', 'The Detroit History Club', '3103 Commor St', 'Hamtramck',
 '2026-11-28', '2026-11-28', '6:30 PM–9:30 PM', false, 51.00,
 'https://www.detroithistorytours.com/shop/felonies-and-misdemeanors-the-detroit-cops-and-mobsters-tour-friday-june-30th-615-pm-1130-pm',
 'http://static1.squarespace.com/static/548664ade4b03c2484c7d64d/54866562e4b09e4ef646b3a1/5859b3be6b8f5b07464f8277/1718898279269/33753.preview.jpg?format=1500w',
 'Detroit History Tours', null, 'approved')

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
  image_url = excluded.image_url,
  note = excluded.note;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-10-03_detroit-history-tours-manual-pull-1.sql')
on conflict (filename) do nothing;
