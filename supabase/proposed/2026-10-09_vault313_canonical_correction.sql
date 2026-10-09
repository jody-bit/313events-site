-- PROPOSED, NOT APPLIED. Issue #49 (Admin Hardening: venue knowledge).
-- The Vault 313: correct its canonical venue record and link its events.
-- Product Owner, 2026-10-09: "verify the canonical record is The Vault 313,
-- 16940 Hamilton Avenue, Highland Park, MI 48203 ... prepare the correction
-- using RA and Eventbrite evidence. DO NOT apply it to production."
--
-- WHAT PRODUCTION HOLDS (read-only, 2026-10-09 ~14:45 UTC)
--   venues cb82e661-793b-44dc-af75-f50587436e8a
--     name "Vault313 (Highland Park)", address NULL, city "Detroit" (the
--     column default, not a fact), zip_code NULL. One linked event.
--   events
--     c1f7587f-1f85-4c03-be78-0f111b23b693  "Vault313 (Highland Park)", 16940 Hamilton Ave, Highland Park,
--        Resident Advisor (no external_id), 2026-10-10, linked to cb82e661.
--     5388ef4e-85ec-458b-b70f-c7d12d6a0d9f  "The Vault 313", 16940 Hamilton Ave, Highland Park,
--        Resident Advisor ra-2514324, 2026-10-10, not linked. Very probably the SAME RA
--        listing as c1f7587f (same source, same date, same place): a duplicate pair for
--        the duplicate review, not resolved here.
--     27ea6431-b906-4f9c-b3e8-dd9a062da62d  "The Vault 313", 16940 Hamilton Ave, Highland Park,
--        Venue Submission, 2026-09-05 (past), not linked.
--     4e1b5171-cbef-4804-8f35-69d1d12ccd8f  "TBA - The Vault 313 (16940 Hamilton)", no address/city,
--        Resident Advisor ra-2546144 "NIGHT MARKET", 2026-10-17. RA marks the venue TBA.
--        LEFT ALONE: a TBA name never inherits a fixed address (#49); whether this event
--        is at the Vault is a Product Owner decision.
--   Because events_public shows a linked venue's city ahead of the event's own
--   (COALESCE(v.city, venue_city_raw)), c1f7587f is listed publicly in DETROIT
--   although every source says Highland Park.
--
-- EVIDENCE (independent sources; each source counted once)
--   1. Resident Advisor: 16940 Hamilton Ave, Highland Park (3 rows, ONE source).
--   2. Venue Submission (the venue's own submission): 16940 Hamilton Ave, Highland Park.
--   3. Eventbrite (external, two organiser listings checked 2026-10-09; no Eventbrite
--      rows exist in our database): "The Vault 313, 16940 Hamilton Ave, Highland Park,
--      MI 48203" -- eventbrite.com/e/blowedbingotm-tickets-1989051412318 and
--      eventbrite.com/e/femtronica-music-arts-festival-2026-tickets-1980737063878.
--   ZIP 48203 is stated by Eventbrite only; it is Highland Park's ZIP.
--   venue-knowledge (api/_lib/venue-knowledge.js) on production data:
--     "the vault 313"            -> learned (RA + Venue Submission agree)
--     "vault313 (highland park)" -> canonical_conflict (record says Detroit, events say Highland Park)
--
-- THE CORRECTION (one transaction; each statement re-checks what it read, so a
-- record that changed since 2026-10-09 is left alone and the counts show it)
begin;

-- 1. The canonical record: name as the venue and Eventbrite state it, its street,
--    its city, its ZIP. venues_name_city_key (lower(name), lower(city)) has no
--    other "The Vault 313" row in Highland Park, so this cannot collide.
update venues
   set name = 'The Vault 313',
       address = '16940 Hamilton Ave',
       city = 'Highland Park',
       zip_code = '48203'
 where id = 'cb82e661-793b-44dc-af75-f50587436e8a'
   and name = 'Vault313 (Highland Park)'
   and address is null
   and city = 'Detroit';
-- expect: UPDATE 1

-- 2. Link the two events that name the venue exactly and state the same street
--    and city. Only venue_id changes; their own fields already agree.
update events
   set venue_id = 'cb82e661-793b-44dc-af75-f50587436e8a'
 where id in ('5388ef4e-85ec-458b-b70f-c7d12d6a0d9f', '27ea6431-b906-4f9c-b3e8-dd9a062da62d')
   and venue_id is null
   and venue_name_raw = 'The Vault 313'
   and venue_address_raw = '16940 Hamilton Ave'
   and venue_city_raw = 'Highland Park';
-- expect: UPDATE 2

-- Verify before committing: one venue, three linked events, all Highland Park.
select v.id, v.name, v.address, v.city, v.zip_code,
       (select count(*) from events e where e.venue_id = v.id) as linked
  from venues v where v.id = 'cb82e661-793b-44dc-af75-f50587436e8a';
-- expect: The Vault 313 | 16940 Hamilton Ave | Highland Park | 48203 | 3
select count(*) as vault_records from venues where lower(name) like '%vault%313%' or lower(name) like '%vault313%';
-- expect: 1 (no duplicate venue created)

commit;

-- NOT DONE HERE (Product Owner decisions):
--   - 4e1b5171 "TBA - The Vault 313 (16940 Hamilton)": RA says TBA. Link it only if
--     the PO decides the TBA is the Vault.
--   - c1f7587f / 5388ef4e: probable duplicate RA rows of one event -> duplicate review.
--   - No status changes. No event address/city changes.
--
-- ROLLBACK (if needed):
--   update venues set name='Vault313 (Highland Park)', address=null, city='Detroit', zip_code=null
--    where id='cb82e661-793b-44dc-af75-f50587436e8a';
--   update events set venue_id=null
--    where id in ('5388ef4e-85ec-458b-b70f-c7d12d6a0d9f','27ea6431-b906-4f9c-b3e8-dd9a062da62d');
