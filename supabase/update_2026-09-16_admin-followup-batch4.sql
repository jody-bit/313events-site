-- Follow-up queue pass, 2026-09-16 — from the admin.html PDF Jody sent.
-- All matches below are by event id (not title-text), same lesson as the
-- Dracula quote-match miss earlier this week — no risk of a silent 0-row
-- update from a smart-quote/typography mismatch.
--
-- Every id/URL/address here was verified live: Grave Rave's venue and
-- Texture x2's ticket links came from their real ra.co event pages
-- (fetched directly, not guessed), and Detroit Shipping Company's address
-- is ra.co's own listed address for the venue (474 Peterboro St — RA's
-- page has it as "PETEBORO", corrected to the real Detroit street name).

-- ---------------------------------------------------------------------
-- 1. Grave Rave's venue turned out NOT to be a secret after all — RA's own
--    event page names it outright: Detroit Shipping Company, 474 Peterboro
--    St. Add the venue (doesn't exist yet) and link the event to it, plus
--    its real ticket link. This fully resolves Grave Rave — no dismiss
--    needed.
insert into venues (name, address, city)
values ('Detroit Shipping Company', '474 Peterboro St', 'Detroit')
on conflict (lower(name), lower(city)) do update set address = excluded.address
where venues.address is null;

update events
set venue_id = (select id from venues where lower(name) = lower('Detroit Shipping Company') and lower(city) = lower('Detroit')),
    ticket_url = 'https://ra.co/events/2512641'
where id = '36fb66fb-6b14-4112-b262-bdb4653a5234'; -- Grave Rave

-- ---------------------------------------------------------------------
-- 2. Texture (9/19) and Texture — TBA (9/25): both genuinely still
--    "Venue TBA" on RA's own pages (checked live) — that part of the gap
--    is real and permanent, not a parsing miss. But both had a findable,
--    real ticket link that just never got captured; filling those in.
update events set ticket_url = 'https://ra.co/events/2460932'
where id = 'aa086cb4-3217-4cb3-97d0-0910245114a5'; -- Texture, 9/19

update events set ticket_url = 'https://ra.co/events/2486512'
where id = 'cf16c1be-1d97-4c17-9794-8b7527da9410'; -- Texture — TBA, 9/25

-- ---------------------------------------------------------------------
-- 3. Sleep Olympics 4 Year Anniversary: had a ticket link already, just no
--    description. Paraphrased from RA's own listing (not copy-pasted).
update events
set description = 'Sleep Olympics'' 4-year anniversary party — celebrating four years and 38 events of Chicago- and Detroit-style house and techno, with K''Alexi Shelby, DJ Cent, and Body Mechanic on the lineup. Venue TBA, revealed to ticket holders.'
where id = '36612a08-1a08-4f7d-b5b2-8e9f47cc3969';

-- ---------------------------------------------------------------------
-- 4. Dismiss the follow-up flag on the ones above once their only
--    remaining gap is the venue address — and RA's own event pages
--    confirm that's intentional (venue withheld until ticket purchase),
--    not a parsing failure. Also dismissing Wazzup Detroit!, the
--    Distinctively Detroit bus tour flagged earlier this week — it visits
--    six stops across the city by design, so "one venue address" was
--    never going to be a real field for it either.
update events
set followup_dismissed = true,
    followup_dismissed_note = 'Secret-venue nightlife event — RA lists the venue as TBA by design, revealed only to ticket holders. Not a parsing gap.',
    followup_dismissed_at = now()
where id in (
  '36612a08-1a08-4f7d-b5b2-8e9f47cc3969', -- Sleep Olympics
  'aa086cb4-3217-4cb3-97d0-0910245114a5', -- Texture, 9/19
  'cf16c1be-1d97-4c17-9794-8b7527da9410'  -- Texture — TBA, 9/25
);

update events
set followup_dismissed = true,
    followup_dismissed_note = 'Multi-stop bus tour (Distinctively Detroit) — no single venue address applies by design.',
    followup_dismissed_at = now()
where id = '863cfbda-30b4-42f6-8cc9-db336c3c20ed'; -- Wazzup Detroit!

insert into schema_migrations (filename) values ('update_2026-09-16_admin-followup-batch4.sql')
on conflict (filename) do nothing;
