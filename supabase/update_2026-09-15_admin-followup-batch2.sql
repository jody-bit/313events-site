-- Admin "Needs Follow-Up" queue cleanup, round 2 — 2026-09-15. Jody uploaded a
-- fresh PDF export of admin.html's follow-up queue (70 items) and asked to
-- get them updated. Cross-checking against this project's own history first
-- turned up something important:
--
--   THE ROOT CAUSE OF MOST "VENUE ADDRESS/CITY" GAPS: every prior venue fix
--   in this project (Paris Bar rename, Elmwood Cemetery, Cranbrook, the RA
--   manual pulls, etc.) only ever set the *venues* table's address/city, or
--   patched one specific event row directly — nothing ever did a generic
--   backfill copying venues.address/city down onto events.venue_address_raw
--   /venue_city_raw for EVERY event already linked by venue_id. But
--   admin.html's "Needs Follow-Up" check reads venue_address_raw/
--   venue_city_raw directly off the event row (see api/admin-events.js) —
--   it does not join through venues. So a venue could have a perfectly
--   good address on file (Elmwood Cemetery has had one since migration on
--   9/14) and every event at that venue would still show up here forever,
--   because nothing had ever copied it down. Section 0 below is that
--   missing generic backfill — it alone should clear most of the "venue
--   address/city" flags in this queue, both today's and any future ones,
--   for any venue that has an address on file.
--
--   ALSO WORTH FLAGGING: this queue still shows ~13 rows (SUNDANCE,
--   Sanctified Sundays, Tequila Sunset, Bang Box, Elixir Thurs, Flavors,
--   Shake Down, SWAG, Corruption: Remix Wars, Atonement wsg Colliding
--   Pins, the Redford Theatre times, and the 3 Ticketmaster descriptions)
--   that were ALREADY fixed in update_2026-09-14_admin-followup-cleanup.sql
--   — that file is still sitting unrun. Please run that file too (order
--   doesn't matter relative to this one, both are is-null-guarded and safe
--   to run in either order / re-run).
--
-- Safe to re-run: every UPDATE below is guarded so it only fills an actual
-- gap, same convention as this project's other admin-cleanup passes.

-- ---------------------------------------------------------------------------
-- 0) THE GENERIC FIX — copy venues.address/city down onto every event
--    that's already linked (venue_id) to a venue with an address on file,
--    but whose own venue_address_raw/venue_city_raw is still blank. Run
--    this LAST in this file (after section 1 adds/updates venue rows and
--    the venue_id backfill below re-links anything newly matched) so it
--    picks up everything section 1 just added. Re-runnable indefinitely —
--    going forward, this is the one query that should be re-run any time
--    a venue's address gets filled in, instead of hand-patching event rows.
-- ---------------------------------------------------------------------------

-- (defined here for reference; actually executed at the bottom of this file
-- as step 4, after venues are upserted and venue_id is re-linked)

-- ---------------------------------------------------------------------------
-- 1) VENUES — add/confirm real addresses for venues this queue references
--    that didn't have one on file yet. Same upsert idiom as the Cranbrook
--    Art Museum venue insert (update_2026-09-14_cranbrook-anna-sui-events.sql).
--    Sources: Yelp, each venue's own site, or (for the RA nightlife venues)
--    the same addresses already verified and applied per-event in
--    update_2026-09-14_admin-followup-cleanup.sql — recorded here on the
--    venues row itself so future events at these venues resolve
--    automatically instead of needing another one-off patch.
-- ---------------------------------------------------------------------------

insert into venues (name, address, city) values
  ('Spkrbox', '200 E Grand River Ave', 'Detroit'),
  ('Northern Lights Lounge', '660 W Baltimore Ave', 'Detroit'),
  ('Andy Arts', '3000 Fenkell St', 'Detroit'),
  ('Tangent Gallery', '715 E Milwaukee St', 'Detroit'),
  ('The Strays', '8850 Joseph Campau Ave', 'Hamtramck'),
  ('Big Pink', '6440 Wight St', 'Detroit'),
  ('Roar Brewery Bar & Patio', '666 Selden St', 'Detroit'),
  ('MotorCity Wine', '1949 Michigan Ave', 'Detroit'),
  ('Comerica Park', '2100 Woodward Ave', 'Detroit'),
  ('Aretha Franklin Cafe', '350 Madison St', 'Detroit'),
  ('Redford Theatre', '17360 Lahser Rd', 'Detroit'),
  ('Fox Theatre', '2211 Woodward Ave', 'Detroit'),
  ('Hilberry Gateway', '4715 Cass Ave', 'Detroit'),
  ('Ford Field Park', '22051 Cherry Hill St', 'Dearborn'),
  ('Macomb Community College Sport & Expo Center', '14500 E 12 Mile Rd', 'Warren'),
  ('The Magic Stick', '4120 Woodward Ave', 'Detroit'),
  ('The Majestic Theatre', '4140 Woodward Ave', 'Detroit')
on conflict (lower(name), lower(city)) do update set
  address = excluded.address;
-- NOTE: Spkrbox / Northern Lights Lounge / Andy Arts / Tangent Gallery /
-- The Strays / Big Pink / Roar Brewery Bar & Patio / MotorCity Wine /
-- Comerica Park / Redford Theatre / Fox Theatre already existed as venues
-- rows (most since the original seed) with no address — this fills it in.
-- Aretha Franklin Cafe / Hilberry Gateway / Ford Field Park / Macomb
-- Community College Sport & Expo Center / The Magic Stick / The Majestic
-- Theatre are new rows.
--
-- Aretha Franklin Cafe = Aretha's Jazz Café inside Music Hall Center for
-- the Performing Arts (confirmed via Yelp) — not at Eastern Market as its
-- name might suggest.

-- ---------------------------------------------------------------------------
-- 2) EVENTS WHOSE venue_name_raw ITSELF IS A PLACEHOLDER ("TBA", "Venue TBA
--    (Paxahau)") — the generic backfill in step 4 can't help these because
--    the raw name doesn't match any real venue row. Fixed directly, venue
--    name + address + city together, matched by (title, start_date).
-- ---------------------------------------------------------------------------

-- Detroit Tigers home games — Comerica Park, 6 instances across two
-- opponents (Washington Nationals 9/21-23, Pittsburgh Pirates 9/25-27).
update events set venue_name_raw = 'Comerica Park', venue_address_raw = '2100 Woodward Ave', venue_city_raw = 'Detroit'
where title = 'Detroit Tigers vs Washington Nationals'
  and start_date in ('2026-09-21', '2026-09-22', '2026-09-23')
  and (venue_address_raw is null or venue_city_raw is null);

update events set venue_name_raw = 'Comerica Park', venue_address_raw = '2100 Woodward Ave', venue_city_raw = 'Detroit'
where title = 'Detroit Tigers vs Pittsburgh Pirates'
  and start_date in ('2026-09-25', '2026-09-26', '2026-09-27')
  and (venue_address_raw is null or venue_city_raw is null);

-- Paxahau shows — "Venue TBA (Paxahau)" resolved against paxahau.com's own
-- event pages (cross-checked against AXS where available) 2026-09-15.
update events set venue_name_raw = 'The Majestic Theatre', venue_address_raw = '4140 Woodward Ave', venue_city_raw = 'Detroit'
where title = 'Channel Tres — The Enigma Tour' and start_date = '2026-09-18'
  and (venue_address_raw is null or venue_city_raw is null);

update events set venue_name_raw = 'The Magic Stick', venue_address_raw = '4120 Woodward Ave', venue_city_raw = 'Detroit'
where title = 'Sam Alfred — USA Tour' and start_date = '2026-10-02'
  and (venue_address_raw is null or venue_city_raw is null);

update events set venue_name_raw = 'The Magic Stick', venue_address_raw = '4120 Woodward Ave', venue_city_raw = 'Detroit'
where title = 'MPH — Detroit, Forever' and start_date = '2026-10-16'
  and (venue_address_raw is null or venue_city_raw is null);

update events set venue_name_raw = 'The Magic Stick', venue_address_raw = '4120 Woodward Ave', venue_city_raw = 'Detroit'
where title = 'Paxahau presents: ACRAZE' and start_date = '2026-10-23'
  and (venue_address_raw is null or venue_city_raw is null);

update events set venue_name_raw = 'The Magic Stick', venue_address_raw = '4120 Woodward Ave', venue_city_raw = 'Detroit'
where title = 'Devault x Fallon' and start_date = '2026-10-30'
  and (venue_address_raw is null or venue_city_raw is null);
-- Note: 4 of these 5 land at The Magic Stick — Paxahau runs a regular
-- room there, and each was confirmed independently on paxahau.com (not
-- assumed from the others matching), so this isn't a copy/paste artifact.

-- Elmwood Alight — VisitDetroit lists "Venue: TBA" but this is Elmwood
-- Historic Cemetery's own after-dark lantern/light event (confirmed via
-- elmwoodhistoriccemetery.org and its Eventbrite listing). Also fills the
-- missing start time: our record's date (10/1) is night one of a 3-night
-- run (10/1-10/3); Eventbrite gives Thursday 10/1 gates at 7:30 PM
-- specifically (Fri/Sat run 7:00 PM instead — different from this date).
update events set venue_name_raw = 'Elmwood Cemetery', venue_address_raw = '1200 Elmwood Street', venue_city_raw = 'Detroit',
    time_display = 'Gates open 7:30 PM, last entry 9:30 PM, closes 10:00 PM'
where title = 'Elmwood Alight' and start_date = '2026-10-01'
  and (venue_address_raw is null or venue_city_raw is null or time_display is null or time_display = '');

-- ---------------------------------------------------------------------------
-- 3) START TIMES — verified against each event's own organizer/venue page.
-- ---------------------------------------------------------------------------

update events set time_display = '7:00 PM'
where title = 'The Thorn at the Fox Theatre' and start_date = '2026-10-09'
  and (time_display is null or time_display = '');

update events set time_display = '6:00 PM–11:00 PM'
where title = 'DIY Street Fair' and start_date = '2026-09-25'
  and (time_display is null or time_display = '');

update events set time_display = '7:00 PM–9:30 PM (general admission; sensory-friendly trail 5:30–6:30 PM; 18+ "Witching Hour" 10:00–11:00 PM)'
where title = 'Dearborn Haunted Trail' and start_date = '2026-10-16'
  and (time_display is null or time_display = '');

update events set time_display = 'Regular museum hours, 9:30 AM–5:00 PM (included with admission)'
where title = 'Artemis Adventure with LEGO® Bricks' and start_date = '2026-10-18'
  and (time_display is null or time_display = '');

update events set time_display = 'Regular museum hours (closed Mon–Tue; Wed 11 AM–5 PM; Thu 11 AM–8 PM, free; Fri–Sun 11 AM–5 PM)'
where title = 'The World of Anna Sui' and start_date = '2026-10-21'
  and (time_display is null or time_display = '');

update events set time_display = '11:00 AM'
where title = '3.1.3' and start_date = '2026-09-18'
  and (time_display is null or time_display = '');

-- ---------------------------------------------------------------------------
-- 4) DESCRIPTIONS — real, sourced RA.co series details. Several of these
--    (Bang Box, Elixir Thurs, Flavors, Corruption, Atonement) are recurring
--    nights; RA has a confirmed listing for the same series on a different
--    calendar date, giving real genre/vibe/promoter info, but NOT a
--    confirmed lineup for this specific date beyond what's already in our
--    own scraped title. Descriptions below stick to what's actually
--    verified — no invented DJ names or genres beyond that.
-- ---------------------------------------------------------------------------

update events set description = 'A recurring techno and house night at Spkrbox, presented by SPKRBOX Presents. 21+.'
where title = 'Bang Box' and start_date = '2026-09-15' and (description is null or description = '');

update events set description = 'Northern Lights Lounge''s recurring Thursday ELIXIR night — sets typically build from a downtempo hour into acid, cosmic disco, disco, and techno, described by RA as a laid-back, no-pretense 21+ crowd. This edition features DR. Disko Dust and AIDEL.'
where title = 'ELIXIR THURS: DR. Disko Dust, AIDEL' and start_date = '2026-09-17' and (description is null or description = '');

update events set description = 'Spkrbox''s recurring FLAVORS night, presented by SPKRBOX Presents — this edition is a staff appreciation night. 21+.'
where title = 'Flavors (staff appreciation night)' and start_date = '2026-09-17' and (description is null or description = '');

update events set description = 'Sonotex Collective''s spatial-sound festival at Andy Arts, running 11 AM–11 PM across three stages (performance, fixed media, and installation). Lineup includes Bccording, Pod Blotz, Taqsim, Billy Mark, Jared Talaga, Joo Won Park, Leith Campbell, Sophiyah E., Sterling Toles, Venusloc, and weather citizen. Experimental/spatial audio, $30–$50.'
where title = '3.1.3' and start_date = '2026-09-18' and (description is null or description = '');

update events set description = 'Tangent Gallery''s recurring EBM/industrial night from promoter Defiled Industrial — "come clean, leave corrupted." This edition, Remix Wars, is 18+.'
where title = 'CORRUPTION: Remix Wars' and start_date = '2026-09-18' and (description is null or description = '');

update events set description = 'The Strays'' recurring Atonement series, hosted by Nick Burgess, spotlighting long-form sets across techno, industrial, EBM, wave, post-punk, acid house, and electro. This edition is with Colliding Pins.'
where title = 'Atonement wsg Colliding Pins' and start_date = '2026-09-18' and (description is null or description = '');

update events set description = 'A recurring late-2000s/early-2010s hip-hop throwback party at Big Pink. 18+.'
where title = 'SWAG: A Jerk Era Party (Hip-Hop Music)' and start_date = '2026-09-18' and (description is null or description = '');

update events set description = 'A classic screwball comedy from 1980: three overworked, underappreciated office employees (Jane Fonda, Lily Tomlin, Dolly Parton) turn the tables on their sexist, egotistical boss.', ticket_url = 'https://redfordtheatre.com/events/'
where title = '9 to 5' and start_date = '2026-09-25'
  and (description is null or description = '' or ticket_url is null or ticket_url = '');

-- ---------------------------------------------------------------------------
-- 5) The generic backfill from step 0 — now that step 1 has upserted venue
--    addresses and step 2's direct fixes are in, re-link venue_id for
--    anything newly matched, then copy address/city down onto every event
--    row that's missing it. Re-run this pair any time a venue gets a new
--    address on file instead of hand-patching individual events.
-- ---------------------------------------------------------------------------

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

update events e
set venue_address_raw = v.address,
    venue_city_raw = coalesce(nullif(trim(v.city), ''), e.venue_city_raw)
from venues v
where e.venue_id = v.id
  and v.address is not null and trim(v.address) <> ''
  and (e.venue_address_raw is null or trim(e.venue_address_raw) = ''
       or e.venue_city_raw is null or trim(e.venue_city_raw) = '');

insert into schema_migrations (filename) values ('update_2026-09-15_admin-followup-batch2.sql')
on conflict (filename) do nothing;

-- ---------------------------------------------------------------------------
-- WHAT'S DELIBERATELY NOT IN HERE
-- ---------------------------------------------------------------------------
--
-- GENUINELY UNDISCLOSED VENUES (no SQL — same reasoning as
-- update_2026-09-14_admin-followup-cleanup.sql, RA has a real "secret
-- location" feature for exactly this): Sleep Olympics 4 Year Anniversary
-- (9/18), Texture (9/19), Texture — TBA (9/25), Lucky Rabbit (10/30, RA
-- calls it "The Private Loft Party" on its own Eventbrite listing), Grave
-- Rave (10/31).
--
-- SHAKE DOWN (Roar Brewery Bar & Patio, 9/18) — still missing a
-- description. Roar's own event calendar is an embedded Google Calendar
-- that isn't readable by automated fetch, and no RA/social listing for
-- this specific date was found. Address is now covered (section 1/5).
--
-- Wazzup Detroit! (9/19) — VisitDetroit's own page shows this is a moving
-- bus/walking tour ("Distinctively Detroit Tours" visiting several Detroit
-- landmarks), not a fixed venue — "TBA" may be correct as-is rather than a
-- data gap. Didn't find a specific departure address to use as the venue
-- address; worth a direct check with the tour operator if a street
-- address is really needed here.
--
-- Detroit Legacy Weekend (9/17), Fall into Wellness - Fall Equinox (9/16),
-- Adult Art Camp! (9/30), Hallowe'en in Greenfield Village (10/1), One
-- Monkey Don't Stop No Show (10/2), The Old Man and The Old Moon (10/16),
-- Bonadeo Farms (9/25) — start time genuinely not found from an accessible
-- official source (some pages blocked automated fetches). Flagging instead
-- of guessing.
--
-- DATE MISMATCHES WORTH DOUBLE-CHECKING — our record's date doesn't match
-- what the organizer currently publishes, so no time was written against
-- what might be the wrong date:
--   - Banana Ball: our record says 9/17; 313 Presents/AXS say 9/18-19
--     (Sat 9/19 start time 7:00 PM per AXS, if that turns out to be the
--     real date).
--   - Detroit Black Film Festival: our record says 9/22; Visit Detroit
--     says 9/24-27.
--   - Metro Detroit Women's Expo: our record says 10/1; the expo's own
--     site (kohlerexpo.com) says 10/2-4, at 14500 E 12 Mile Rd, Warren
--     (Fri/Sat 10 AM-6 PM, Sun 11 AM-4 PM) — Macomb Community College
--     Sport & Expo Center's address is in section 1 above regardless,
--     since that part isn't in doubt.
--   - Detroit Legacy Weekend: our record says 9/17; a Fox 2 Detroit piece
--     says 9/18-20.
-- Worth a quick check of whichever feed (VisitDetroit) sourced these
-- before trusting either date.
