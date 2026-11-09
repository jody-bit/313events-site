# Staging reference data, 2026-10-10 (Homepage V2 Preview verification)

**Scope: staging only** (Supabase `efxjdlogohcggpuftivm`). Production (`afvyfjfqukptnfmgshzn`) was
queried read-only (SELECT) and never written. Preview is NOT connected to production.

## Why
Homepage V2 hides *Explore Neighborhoods* when no event has a neighborhood, and *On the Radar* when
no upcoming event has a press article. Staging held 16 seed events with no venues and 0 editorial
rows, so both sections were correctly hidden. Product Owner decision (2026-10-10): approve minimal,
real, production-derived reference data in staging; do not connect Preview to production.

## What staging holds now (production-derived, found in place)
- 72 events copied by id from production (65 approved with a venue, plus 7 approved or rejected
  rows without a venue that Radar articles or fixtures point at); 22 neighborhoods have 1-4
  upcoming events each (rule observed: every event a Radar article points at, plus up to three
  upcoming events per neighborhood). Counts shown on the cards are counts of what is in staging,
  not production totals (production, e.g. Fitzgerald-Marygrove 36).
- 17 `editorial_articles` and 19 `editorial_article_events` (the production articles whose events
  are current or upcoming; 10 with thumbnails). Titles, URLs, outlets and thumbnail URLs unchanged.
- Venues and neighborhoods came from the earlier SZ-15 sanitized reference and were not changed.

## Verification against production (read-only)
73 staging events compared with production by id on title, description, category, dates, time,
price, ticket/event URLs, image, source, external id and status:
68 identical; 4 identical except `venue_id` (Saturday Market and Detroit Fall Beer Festival at
Eastern Market, The Thorn at the Fox Theatre, Devil's Night Film Festival at Venue TBA), which point
at the same-named staging seed venue because `venues_name_city_key` forbids a second row with the
same name and city; 1 (`TBA`, Detroit Historical Society) is a staging test fixture, not a copy.
Copied rows carry no staging markers. No credentials, submitter emails, internal notes or
follow-up fields were copied.

## This session's own writes (net zero)
Before discovering the data above was already present, this session inserted 27 events and 7
venues from production, then removed exactly those rows by id (events 0033874b..42d73954 list in
the session record; venues TSDMAAC (Catacombs), Detroit Historical Museum, Neighborhood Home Base,
Detroit Opera House, TSDMAAC CRYPT, Music Hall Center, MGM Grand Detroit Event Center). Final
state was re-queried after the cleanup.

## Known differences from production (do not "fix" without approval)
- Staging seed neighborhood `Fitzgerald` exists beside production's `Fitzgerald-Marygrove`
  (both present in staging; the page uses the latter).
- Seed venues `Majestic Theatre` (no neighborhood) collides by name with a production Midtown
  venue, so its single production event was not copied.
- The seed events (`STG ...`) still appear in What's Happening on the Preview. They are fixtures,
  not copied records, and were left alone.

## Reverse
`rollback_reference_data_2026-10-10.sql` (staging only): deletes all editorial rows and every event
outside the 31 listed seed ids. Venues and neighborhoods are left in place.
