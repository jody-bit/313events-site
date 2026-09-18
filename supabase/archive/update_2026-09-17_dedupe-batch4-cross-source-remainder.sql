-- Duplicate-events cleanup, batch 4, 2026-09-17. The remaining one-off
-- cross-source pairs plus one same-source VisitDetroit-internal exact
-- duplicate, all resolved individually by comparing which row actually
-- has a real, working ticket link and the fuller description -- rather
-- than a blanket source preference. A couple of these flip what a
-- title-only guess would suggest, once the actual ticket_url is checked:
--
--  - Karl Reed and friends: VisitDetroit's own row has an image + longer
--    description than the Manual row (whose "ticket" link was itself
--    just a visitdetroit.com URL) -- keeping VisitDetroit.
--  - Festival of Darkness 2026: VisitDetroit's row has a real
--    description/image/ticket link; the "Redford Theatre"-sourced row
--    has none of that (empty description, no ticket link) -- keeping
--    VisitDetroit over the venue-attributed row.
--  - Detroit Harvest Fest: keeping the Detroit Riverfront Conservancy row
--    since its ticket_url is a real Showpass checkout link (VisitDetroit's
--    is just its own informational page) -- but VisitDetroit's
--    description/image are better, so those get pulled in via this same
--    file's enrichment-style update.
--  - Ivy Lab: the Resident Advisor row surprisingly has no ticket_url at
--    all (an older/thinner entry) while Ticketmaster's does -- keeping
--    Ticketmaster, reversing the assumption that RA is always the
--    richer row for club shows.
--  - Hiroshima: both rows have a real ticket link, so keeping
--    Ticketmaster (its own affiliate link) but correcting its title to
--    the fuller "Wednesday Night Jazz Series: Hiroshima" from the
--    Community Calendar row, since that's real, useful context to keep.
--  - Warren Zeiders / Olivia O'Brien (both at El Club): keeping Dice over
--    Ticketmaster -- Dice's ticket_url points at the venue's own site
--    (elclubdetroit.com) and its title/description are fuller; El Club
--    shows are typically sold through Dice as the primary platform.
--  - Rush (two separate dates, 8/26 and 8/28), The Coney, and Voice of
--    Whitney: keeping Ticketmaster in all three -- its row has the real
--    affiliate ticket link and, for Voice of Whitney, the more complete/
--    correct title ("...Whitney Houston...") vs. the Manual row's.

-- Title correction on the surviving Hiroshima row, pulling in the fuller
-- series name from the Community Calendar row before that row is rejected.
update events set title = 'Wednesday Night Jazz Series: Hiroshima'
where id = '90953eeb-81ac-4991-90e5-539cae5e1689';

update events
set status = 'rejected',
    internal_note = 'Duplicate of the surviving row for the same real event -- kept whichever row had a working ticket link and/or the more complete description. See update_2026-09-17_dedupe-batch4-cross-source-remainder.sql header for per-pair reasoning.'
where id in (
  'ab3dbe29-a5ee-4af3-8279-0c7a6dad7767', -- Karl Reed and friends (Manual) -- kept VisitDetroit
  'd0773f02-8270-4d9f-a003-8475a50ba283', -- Festival of Darkness 2026 (Redford Theatre) -- kept VisitDetroit
  'abab9034-7692-4dcb-85cf-74a359492ed3', -- Detroit Harvest Fest (VisitDetroit) -- kept Detroit Riverfront Conservancy
  'cff7bf5d-0e0c-4d45-9ac5-5f104dd2a8b0', -- Rush 8/26 (Manual) -- kept Ticketmaster
  'd1c70416-3e36-45a5-9a6d-5d81e76fb9cd', -- Rush 8/28 (Manual) -- kept Ticketmaster
  'bcae6786-454a-4e95-9fe5-3f4906498ad0', -- Ivy Lab: A Farewell Tour (Resident Advisor, no ticket_url) -- kept Ticketmaster
  'a9ef3a5b-b378-4ce5-8c9c-9daaa0dfd7cf', -- Wednesday Night Jazz Series: Hiroshima (Community Calendar) -- kept Ticketmaster (title merged in above)
  '92d92539-a92f-4be4-85ec-2ec3264611ad', -- The Coney Detroit (Manual) -- kept Ticketmaster
  'f0907190-96d3-4ad8-b883-ef67fdc1fcf5', -- Warren Zeiders (Ticketmaster) -- kept Dice
  'a189d289-2f09-4275-926a-4accaabd56e7', -- The Voice of Whitney (Manual) -- kept Ticketmaster
  '6bd91590-926d-4a8e-a6ae-8d15be7e42aa', -- Olivia O'Brien (Ticketmaster) -- kept Dice
  '13267756-2712-4116-82ec-9bfdaf2e0672'  -- Celebrating the Music of the Minneapolis Sound... (VisitDetroit, shorter description) -- kept the other VisitDetroit row
)
and status = 'approved';

insert into schema_migrations (filename) values ('update_2026-09-17_dedupe-batch4-cross-source-remainder.sql')
on conflict (filename) do nothing;
