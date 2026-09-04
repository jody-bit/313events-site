-- Manually-researched one-off/annual events, added 2026-09-04 at Jody's
-- request ("let's crawl these sites too") — a batch of 16 URLs, researched
-- via WebFetch/WebSearch (parallel research pass, 2026-09-04). This file
-- covers the ones that turned out to be single annual events with solid,
-- confirmed 2026 facts. See the closing chat message for what was
-- deliberately left OUT of this file and why (already covered elsewhere,
-- JS-only aggregators, or already past for this year).
--
-- REQUIRES migration_020_venue_address_raw.sql to already be applied (same
-- venue_address_raw column dependency as seed_2026-09-04_manual_events.sql).
--
-- Idempotent: safe to re-run. external_id makes every row a stable upsert
-- target instead of a duplicate on a second run.
--
-- Per-event sourcing (all researched live 2026-09-04):
--
-- Detroit Jazz Festival (detroitjazzfest.org): dates confirmed on the
-- official site ("September 4-7, 2026"). No exact Hart Plaza street address
-- published on the fetched page — left out rather than guessed.
--
-- Dally in the Alley (dallyinthealley.com/lineup/): the festival's own site
-- only says "the Saturday after Labor Day" — the actual calendar date
-- (2026-09-12) was cross-checked against Wayne State University's official
-- events calendar (events.wayne.edu), not guessed. Exact street address not
-- found on either source — left out.
--
-- Youmacon (youmacon.com): dates and venue address stated directly on the
-- official site. Ticket price is the "Weekend Badge (Early Bird)" tier;
-- prices go up in later tiers — spot-check before relying on $80 specifically.
--
-- Arts, Beats & Eats (visitdetroit.com's page, cross-checked against the
-- festival's own Showpass ticketing page and ClickOnDetroit's 2026 coverage):
-- dates and price confirmed on Showpass; note the festival's own
-- artsbeatseats.com wasn't directly fetchable this session (redirect loop) —
-- spot-check there before the date/price gets stale.
--
-- Michigan State Fair (michiganstatefairllc.com): dates, venue, and pricing
-- tiers stated directly on the official site.
--
-- Eastern Market After Dark (easternmarketafterdark.com): date stated
-- directly on the official site. No single street address given (it's a
-- district-wide event across Shed 2/Dequindre Cut/the market generally) —
-- left out rather than guessed; venue_city_raw covers it.
--
-- Dance City Festival Detroit (dancecityfestival.com): dates and DIA venue
-- address stated directly on the official site's Detroit sub-page. Pricing
-- is a mix of free and ticketed components (showcases start at $0, a
-- master-class pass is $25, a "passport" is $300) — left price_from/is_free
-- both unset rather than picking one misleading number; see the ticket hub
-- at dancecityfestival.com/festival-tickets for the real breakdown.
--
-- Ferndale DIY (ferndalediy.com) + Funky Ferndale Art Fair
-- (funkyferndaleartfair.com): same weekend, literally across the street from
-- each other (DIY on the east side of Woodward on Nine Mile, Funky Ferndale
-- on the west side) — both free, both dates confirmed on their own sites
-- (Funky Ferndale's exact dates cross-checked against a fairsandfestivals.net
-- mirror since its own site gave a vaguer "September" reference). Neither
-- publishes an exact street number — left out, Nine Mile/Woodward intersection
-- captured in venue_name_raw instead.
--
-- Detroit Harvest Fest (detroitriverfront.org): dates, venue, and pricing
-- stated directly on the official overview page.
--
-- Detroit Fall Beer Festival (mibeer.com, the Michigan Brewers Guild's own
-- site): date and pricing stated directly on the official page. No exact
-- Eastern Market street address given on that page (only an embedded map) —
-- left out.
--
-- Devil's Night Film Festival (devilsnight.org) — NOT the "Angels' Night"
-- volunteer patrol program (a common assumption from the name); this is a
-- separate, real, currently-operating multi-day horror/experimental film +
-- arts festival run by Hawk Media LLC. Dates confirmed on the official site;
-- no specific venue name, address, or ticket price/URL was found there —
-- left as Venue TBA rather than guessed. Spot-check before relying on this
-- one; it's the least-documented entry in this batch.

insert into events (
  external_id, title, description, category,
  venue_name_raw, venue_address_raw, venue_city_raw,
  start_date, end_date, is_free, price_from, ticket_url,
  source, note, status
) values

-- Detroit Jazz Festival ('detroitjazzfest-2026') used to be seeded here as
-- ONE row spanning 2026-09-04 through 2026-09-07. Superseded 2026-09-04 by
-- update_2026-09-04_detroitjazzfest_hours.sql, which deletes that single
-- row and replaces it with several day-grouped rows (Friday's hours differ
-- from Sat/Sun's, which differ from Monday's — see that file for the full
-- reasoning, shared with the Michigan State Fair / Arts Beats & Eats split
-- below). Left out of this INSERT entirely (rather than kept here with a
-- stale end_date) so re-running this file can never resurrect the old
-- single-row version and re-collide with the split rows on a shared
-- external_id.

('dallyinthealley-2026', 'Dally in the Alley',
 'Annual free outdoor music and arts street festival in Detroit''s Cass Corridor near Wayne State, with 50+ artists across five stages running 11am-10pm.',
 'fest', 'Cass Corridor / North Cass', null, 'Detroit',
 '2026-09-12', null, true, null,
 'https://www.dallyinthealley.com/lineup/',
 'dallyinthealley.com (researched 2026-09-04)',
 'The festival''s own site only says "the Saturday after Labor Day" — 2026-09-12 cross-checked against Wayne State University''s official events calendar (events.wayne.edu). No exact street address found on either source.', 'approved'),

('youmacon-2026', 'Youmacon',
 'Annual four-day anime and pop-culture convention at Huntington Place in downtown Detroit over Halloween weekend, with gaming, cosplay competitions, concerts, and a vendor marketplace.',
 'fest', 'Huntington Place', '1 Washington Blvd', 'Detroit',
 '2026-10-29', '2026-11-01', false, 80,
 'https://www.showclix.com/event/youmacon-2026',
 'Youmacon (youmacon.com, researched 2026-09-04)',
 'Price is the "Weekend Badge (Early Bird)" tier — later tiers cost more; spot-check closer to the date.', 'approved'),

-- Arts, Beats & Eats ('artsbeatseats-2026') and Michigan State Fair
-- ('mistatefair-2026') were also seeded here as single spanning rows —
-- both superseded 2026-09-04 for the same reason and in the same way as
-- Detroit Jazz Festival above: see update_2026-09-04_artsbeatseats_hours.sql
-- and update_2026-09-04_mistatefair_hours.sql.

('easternmarketafterdark-2026', 'Eastern Market After Dark',
 'Free one-night design and arts festival in Detroit''s Eastern Market during Detroit Month of Design, with installations, vendors, and live entertainment across the district.',
 'fest', 'Eastern Market', null, 'Detroit',
 '2026-09-17', null, true, null,
 'https://easternmarketafterdark.com',
 'Design Core Detroit / Eastern Market Corporation (easternmarketafterdark.com, researched 2026-09-04)', null, 'approved'),

('dancecityfestival-detroit-2026', 'Dance City Festival — Detroit',
 'Multi-city contemporary dance festival bringing choreographer showcases, master classes, and screenings to the Detroit Institute of Arts for a September weekend.',
 'dance', 'Detroit Institute of Arts', '5200 Woodward Ave', 'Detroit',
 '2026-09-18', '2026-09-20', false, null,
 'https://www.dancecityfestival.com/festival-tickets',
 'Dance City Festival (dancecityfestival.com, researched 2026-09-04)',
 'Pricing is a genuine mix — some showcases start at $0, a master-class pass is $25, a full "passport" is $300 — so price_from/is_free were deliberately left unset rather than picking one misleading number. See the ticket hub link for the real breakdown.', 'approved'),

('ferndalediy-2026', 'Ferndale DIY Street Fair',
 'Free annual street fair on East Nine Mile in downtown Ferndale featuring bands, artists, and food vendors, run alongside the neighboring Funky Ferndale Art Fair.',
 'fest', 'East Nine Mile Rd', null, 'Ferndale',
 '2026-09-25', '2026-09-27', true, null,
 'https://www.ferndalediy.com',
 'ferndalediy.com (researched 2026-09-04)', 'No exact street number published — Nine Mile is captured as the location instead.', 'approved'),

('funkyferndaleartfair-2026', 'Funky Ferndale Art Fair',
 'Free juried outdoor fine-art fair featuring roughly 140 artists in painting, sculpture, and wearable art, on Nine Mile Road at Woodward in downtown Ferndale, the same weekend as (and just across the street from) Ferndale DIY.',
 'visual', 'Woodward Ave & Nine Mile', null, 'Ferndale',
 '2026-09-25', '2026-09-27', true, null,
 'https://www.funkyferndaleartfair.com',
 'funkyferndaleartfair.com, dates cross-checked via fairsandfestivals.net (researched 2026-09-04)', null, 'approved'),

('detroitharvestfest-2026', 'Detroit Harvest Fest',
 'Two-day fall festival on Detroit''s riverfront at Ralph Wilson Park with 30+ food trucks, live entertainment, trick-or-treating, and family activities, run by the Detroit Riverfront Conservancy.',
 'fest', 'Ralph C. Wilson Jr. Centennial Park', null, 'Detroit',
 '2026-10-03', '2026-10-04', false, 5,
 'https://www.showpass.com/2026-detroit-harvest-fest/',
 'Detroit Riverfront Conservancy (detroitriverfront.org, researched 2026-09-04)',
 'price_from is the advance-purchase price; door price and a family four-pack are also available. Free for ages 3 and under, 65+, and active military w/ID.', 'approved'),

('detroitfallbeerfest-2026', 'Detroit Fall Beer Festival',
 '17th annual one-day craft beer festival at Eastern Market run by the Michigan Brewers Guild, with tastings from Michigan breweries and tiered general-admission/VIP entry.',
 'food', 'Eastern Market', null, 'Detroit',
 '2026-10-24', null, false, 60,
 'https://www.eventbrite.com/e/michigan-brewers-guild-17th-annual-detroit-fall-beer-festival-tickets-1994607974144',
 'Michigan Brewers Guild (mibeer.com, researched 2026-09-04)',
 'price_from is advance general admission; VIP and day-of pricing run higher.', 'approved'),

('devilsnightfilmfest-2026', 'Devil''s Night Film Festival',
 'Multi-day Halloween-week arts festival in Detroit combining horror and experimental film screenings with live music and immersive performance art, produced by an independent media company.',
 'film', 'Venue TBA', null, 'Detroit',
 '2026-10-28', '2026-10-31', false, null,
 null,
 'Hawk Media LLC (devilsnight.org, researched 2026-09-04)',
 'Least-documented entry in this batch — no specific venue, address, ticket price, or ticket URL was found on the official site. Spot-check before treating this as reliable; not to be confused with Detroit''s "Angels'' Night" volunteer patrol program, a different thing with a similar-sounding name.', 'pending_review')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  venue_address_raw = excluded.venue_address_raw,
  venue_city_raw = excluded.venue_city_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  is_free = excluded.is_free,
  price_from = excluded.price_from,
  ticket_url = excluded.ticket_url,
  note = excluded.note;
