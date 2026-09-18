-- Duplicate-events cleanup, batch 1, 2026-09-17 (Jody: "do a full smoke on
-- redundant events - i think there may be a few"). A full sweep of all 1788
-- approved events (grouped by venue+date, compared by title similarity,
-- cross-checked against time_display and source to rule out false
-- positives like same-title-different-showtime -- UniverSoul Circus,
-- Gerry Dee, and several others turned out to be genuinely different
-- performances on the same date, not duplicates) found roughly 90
-- candidate duplicate pairs. This batch only touches the ones confirmed
-- with high confidence and small blast radius; the larger cross-source
-- (Ticketmaster+VisitDetroit, ~54 pairs) and Ticketmaster package/rental-
-- variant (~36 pairs) patterns are reported separately for a decision
-- before touching that many live rows in one shot.
--
-- ---------------------------------------------------------------------
-- RE-APPLYING A FIX THAT NEVER ACTUALLY RAN: this sweep found
-- 'Elmwood Alight' still duplicated (id 61d83bbe-de9d-449d-ae2b-829086e7941b
-- still status='approved') even though
-- update_2026-09-16_undo-lucky-rabbit-mixup.sql was written and committed
-- days ago specifically to reject this exact row. It was never actually
-- run against the live database -- only committed to the repo. Re-running
-- that same statement now.
update events
set status = 'rejected',
    internal_note = 'Duplicate of the cron-managed Elmwood Alight row (id 3360668a-f69b-4766-8217-79020bc1f683), which already carries the enriched ticket_url/price/image/event_url from this venue submission. Submitter contact preserved here for potential future outreach: mnavoy@elmcem.org, Historic Elmwood Cemetery & Foundation.'
where id = '61d83bbe-de9d-449d-ae2b-829086e7941b'
  and status = 'approved'; -- guard: no-op if this somehow already ran since this sweep read it

-- ---------------------------------------------------------------------
-- RA internal duplicates: three events this project already had (added
-- 2026-08-23, before this project switched to pulling RA's own JSON-LD --
-- see 2026-09-16's notes on that technique) got re-added under RA's real
-- external_id by 2026-09-16/17's more careful pulls, since the old rows
-- had no external_id for the upsert to match against. Rejecting the older,
-- thinner rows (vague time_display like "Evening"/"Day", non-RA or no
-- ticket link) in favor of the newer ones with real ra.co links and times.

-- DJ MANDY: FALL TOUR 2026 -- old row had no ra.co link and "Evening" as
-- its only time; ra-2495956 (added today) has both.
update events
set status = 'rejected',
    internal_note = 'Duplicate of ra-2495956 (DJ MANDY: FALL TOUR 2026), added 2026-09-17 with a real ra.co link and time. This row predates this project pulling RA''s own JSON-LD and had neither.'
where id = '3113d4d0-2760-4736-a31a-399df383314d';

-- Truncate, Julia Govor -- old row was missing JANSØ from the title (RA's
-- own page credits all three); ra-2507381 (added today) has the full
-- lineup. Both point at the same ra.co/events/2507381 link.
update events
set status = 'rejected',
    internal_note = 'Duplicate of ra-2507381 (Truncate - Julia Govor - JANSØ - Lincoln Factory), added 2026-09-17 with the full lineup from RA''s own page (this row was missing JANSØ). Both share the same ra.co/events/2507381 link.'
where id = 'ed8e7a74-ba53-4ff2-b660-82274298c042';

-- CARTOONS & STEREO VOL. 2 -- old row linked to the promoter's own site
-- rather than RA and used a vague "Day" time; ra-2502088 (added today) has
-- RA's own link and a real time window.
update events
set status = 'rejected',
    internal_note = 'Duplicate of ra-2502088 (CARTOONS & STEREO VOL. 2), added 2026-09-17 with a real ra.co link and time window (this row had a generic promoter-site link and "Day" as its only time).'
where id = 'b53f69dd-f59e-4d1d-930a-b43dc6091421';

insert into schema_migrations (filename) values ('update_2026-09-17_dedupe-batch1.sql')
on conflict (filename) do nothing;
