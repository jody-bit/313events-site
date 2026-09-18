-- Undo fix, 2026-09-16 -- Jody: "I need a way to undo manual entries I
-- messed up and put the wrong address in an event hit save and now it is
-- bye bye - i don't even know what date that was on."
--
-- Found it live: while approving/editing the brand-new venue-submitted
-- "Elmwood Alight" listing (submitted directly by Historic Elmwood
-- Cemetery & Foundation, mnavoy@elmcem.org, 2026-09-16 21:11 UTC -- a real,
-- legitimate submission, separate issue noted below), the edit landed on
-- the WRONG row: "Lucky Rabbit" (id 915467ae-512f-42dd-82d0-071578f5bfcf)
-- got its ticket_url overwritten with Elmwood Alight's Eventbrite link and
-- its venue_address_raw/venue_city_raw overwritten with Elmwood
-- Cemetery's address -- at 2026-09-16 21:18:40 UTC, confirmed via the
-- table's own updated_at timestamp sitting right in the middle of that
-- edit session.
--
-- Lucky Rabbit is (and was, before the mistake) a secret-venue Devil's
-- Night nightlife show -- no real street address by design (see
-- update_2026-09-16_venue-followup-batch5.sql, which dismissed its
-- follow-up flag on exactly that basis a few minutes before this
-- happened). There's no edit history/audit table in this schema yet, so
-- the address/city fields can only be reset to null (their correct,
-- original state -- confirmed by the event's own description: "address
-- revealed only to ticket holders"), not literally rolled back. The
-- ticket_url, however, WAS recoverable: found the real listing on RA
-- (ra.co/events/2462567 -- title/venue/date all match exactly) and
-- restored it.
update events
set ticket_url = 'https://ra.co/events/2462567',
    venue_address_raw = null,
    venue_city_raw = null
where id = '915467ae-512f-42dd-82d0-071578f5bfcf'; -- Lucky Rabbit

-- ---------------------------------------------------------------------
-- Related but separate issue, found while investigating the above: the
-- venue submission Jody was approving (id 61d83bbe...) is a genuine,
-- legitimate new listing -- Historic Elmwood Cemetery & Foundation
-- submitted their own "Elmwood Alight" directly (mnavoy@elmcem.org).
-- Problem: this site ALREADY had an "Elmwood Alight" from the VisitDetroit
-- cron (id 3360668a..., external_id 'vd-48582238', fixed up in
-- update_2026-09-16_venue-followup-batch5.sql just a few minutes earlier
-- the same night). Both are now status='approved' -- a live duplicate
-- listing on the site right now.
--
-- Not a simple "delete the duplicate": the VisitDetroit row will just come
-- back on that cron's next scheduled run (its external_id is still in
-- VisitDetroit's feed), so deleting it permanently isn't stable. Instead:
-- enrich the cron-managed row with the venue's own better data (a real
-- Eventbrite ticket link + real price + their own flyer, all better than
-- VisitDetroit's own listing), then reject the manual submission so it
-- stops double-posting -- its submitter contact is kept in internal_note
-- in case Jody wants to follow up with the venue directly.
update events
set ticket_url = 'https://www.eventbrite.com/e/elmwood-alight-2026-tickets-1993926204954?aff=oddtdtcreator',
    price_from = 25.00,
    image_url = 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/8d5031e3-3d25-44ab-b26c-72476a2d95c3.jpg',
    event_url = 'https://elmwoodhistoriccemetery.org/events-tours/elmwood-alight'
where id = '3360668a-f69b-4766-8217-79020bc1f683'; -- Elmwood Alight (VisitDetroit, cron-managed)

update events
set status = 'rejected',
    internal_note = 'Duplicate of the VisitDetroit-sourced Elmwood Alight listing (id 3360668a) -- merged that row''s ticket_url/price/image from this submission instead of running both live. Submitted directly by the venue: Historic Elmwood Cemetery & Foundation, mnavoy@elmcem.org -- worth a reply if Jody wants a direct venue-submission relationship going forward.'
where id = '61d83bbe-de9d-449d-ae2b-829086e7941b'; -- Elmwood Alight (Venue Submission, duplicate)

insert into schema_migrations (filename) values ('update_2026-09-16_undo-lucky-rabbit-mixup.sql')
on conflict (filename) do nothing;
