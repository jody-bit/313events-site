-- Follow-up queue pass, 2026-09-16 (batch 5) — the 3 remaining "missing
-- venue address/city" flags after re-checking the live admin queue. All
-- matches below are by event id, same lesson as the Dracula quote-match
-- miss and batch4's own note about it.
--
-- This batch grew out of Jody asking why the system doesn't just map a
-- known venue automatically when it recognizes one (using Paris Bar as the
-- example) plus her "let robots find the information" directive. Paris
-- Bar itself turned out to already be fixed and working (verified live,
-- zero Paris Bar events currently flagged) -- these 3 are the real
-- remaining gaps, and each is a different kind of gap:

-- ---------------------------------------------------------------------
-- 1. Elmwood Alight: the venue was never a mystery -- it's Elmwood
--    Cemetery, named right in the event's own description ("illuminating
--    Detroit's historic Elmwood Cemetery"). A venues row for Elmwood
--    Cemetery already exists (added for the Trolley Tour / Fall Tree Walk
--    events) with a real address. The gap here wasn't missing data, it
--    was that visitdetroit's own address parser came back empty for this
--    listing, so venue_name_raw was never set for the matcher to work
--    with in the first place. Backfilling it the same way those other
--    Elmwood events are already stored (raw fields + venue_id both set).
update events
set venue_name_raw = 'Elmwood Cemetery',
    venue_address_raw = '1200 Elmwood Street',
    venue_city_raw = 'Detroit',
    venue_id = '6d45d20f-c8d1-40ee-9be9-840ccbb20042'
where id = '3360668a-f69b-4766-8217-79020bc1f683'; -- Elmwood Alight

-- ---------------------------------------------------------------------
-- 2. Detroit Legacy Weekend: genuinely not a single-address event -- it's
--    a citywide, 3-day "Legacy Loop" tour across many participating
--    businesses (confirmed by its own description). No venues row and no
--    venue_id, since it isn't one place. Filling in what's actually true
--    (it's a Detroit event) rather than inventing a fake street address
--    just to clear the flag.
update events
set venue_name_raw = 'Multiple Locations (Greektown Plaza kickoff)',
    venue_city_raw = 'Detroit'
where id = '3edb44c9-1d4e-4a0e-8ebd-948d6d152d81'; -- Detroit Legacy Weekend

-- ---------------------------------------------------------------------
-- 3. Lucky Rabbit: already correctly linked to its own "secret loft"
--    venue row (venue_id set) -- the address is blank because RA's own
--    listing genuinely withholds it until ticket purchase, same
--    intentional-secrecy pattern as the RA nightlife events dismissed in
--    batch4. Not a parsing gap, so dismissing rather than faking an
--    address.
update events
set followup_dismissed = true,
    followup_dismissed_note = 'Secret-venue nightlife event -- address is withheld by design until ticket purchase, same as the other RA secret-venue shows. Not a parsing gap.',
    followup_dismissed_at = now()
where id = '915467ae-512f-42dd-82d0-071578f5bfcf'; -- Lucky Rabbit

insert into schema_migrations (filename) values ('update_2026-09-16_venue-followup-batch5.sql')
on conflict (filename) do nothing;
