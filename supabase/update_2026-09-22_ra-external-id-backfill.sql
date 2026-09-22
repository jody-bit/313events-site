-- One-time RA external_id backfill, 2026-09-22
--
-- Added while reconciling a discrepancy in the daily RA acquisition
-- workflow's "known RA IDs" inventory (see the Product Owner's
-- 2026-09-22 "RA DAILY WORKFLOW CORRECTION" task). This is the safe
-- backfill flagged but deliberately NOT performed by
-- update_2026-09-22_ra-sync-1.sql's own header comment: 16 existing
-- events are real-world duplicates of current RA listings, imported
-- earlier (likely a manual/curated batch, before this project settled on
-- "ra-<id>" as the RA external_id convention) without an "ra-<id>"
-- external_id. Because their external_id doesn't match that pattern, they
-- are invisible to every future RA external_id diff and get re-flagged as
-- "new" on every run, forever, until backfilled.
--
-- 15 of those 16 are backfilled here. Each WHERE clause targets the exact
-- internal `id` (primary key) already resolved for that specific row by
-- an earlier, careful title-based content match --
-- supabase/archive/update_2026-09-12_followup_desc_addr_ticket_batch_B.sql
-- (and, for Lucky Rabbit, supabase/archive/update_2026-09-16_undo-lucky-
-- rabbit-mixup.sql) -- cross-checked against
-- update_2026-09-22_ra-sync-1.sql's own title/venue/date dup table. Using
-- the internal id, not a title/venue/date WHERE match, is the strongest
-- available identity evidence: it's not a fresh guess, it's the same row
-- another agent already pinned down by content research. The extra
-- `and external_id is null` guard makes every statement idempotent and
-- a strict no-op if a row's external_id somehow already changed --  this
-- never overwrites a populated external_id, and running this file twice
-- (or against a database where it was already applied) changes nothing
-- the second time.
--
-- EXCLUDED, on purpose: ra-2485347 "A Dub Supreme" (MotorCity Wine,
-- 2026-09-27). Unlike the other 15 (one-off dated events), this is a
-- recurring weekly night whose existing DB row appears to actually be
-- owned by cron-motorcitywine.js's own iCal ingestion, which mints its
-- own deterministic external_id ("mcw-ical-<date>-<hash>"), not an
-- "ra-<id>" -- see api/cron-motorcitywine.js. Setting external_id =
-- 'ra-2485347' on the old null-external_id row here would not
-- necessarily be wrong, but it also would not resolve the real
-- underlying question (whether cron-motorcitywine.js has already since
-- created its own separate "mcw-ical-..." row for the same 2026-09-27
-- date, which would make this event a genuine duplicate under TWO
-- different external_ids regardless of what this file does). That is a
-- distinct, pre-existing data-quality question -- not a safe, mechanical,
-- single-source-of-truth match like the other 15 -- so it is deliberately
-- left out of this backfill and flagged for Jody's direct review instead
-- of guessed at here. Per the "do not mix uncertain matches into the
-- backfill" instruction.
--
-- This file only ever touches events.external_id on these 15 specific,
-- already-identified rows. It does not touch title, description, dates,
-- venue fields, status, or any other moderator-editable column, and it
-- inserts no new rows.

update events set external_id = 'ra-2407740'  where id = '62b45628-2650-44df-9a6c-b02ea91cf123' and external_id is null; -- Wonkyween @ Elektricity, 2026-10-24
update events set external_id = 'ra-2461128'  where id = '0464bc64-819d-4d80-8c49-449a83647183' and external_id is null; -- Choptober: Devils Night Edition @ Elektricity, 2026-10-30
update events set external_id = 'ra-2462567'  where id = '915467ae-512f-42dd-82d0-071578f5bfcf' and external_id is null; -- Lucky Rabbit @ Venue TBA (secret loft), 2026-10-30
update events set external_id = 'ra-2469970'  where id = '9ea14d04-75ac-4d7d-9f59-d726a0dc7634' and external_id is null; -- Paxahau presents: Restricted @ Russell Industrial Center, 2026-10-16
update events set external_id = 'ra-2470800'  where id = '7a3b4a63-bdef-47f1-bc7a-102a6d1ff79d' and external_id is null; -- Anime Rave: Halloween Edition @ Elektricity, 2026-10-23
update events set external_id = 'ra-2474825'  where id = '7cc52aaf-f406-41f6-bc7d-8cfeef02a15f' and external_id is null; -- Samhain XXVI Weekend @ Tangent Gallery, 2026-10-30
update events set external_id = 'ra-2474832'  where id = 'f3b0ee4e-4767-4d8a-b176-a83f350ba0af' and external_id is null; -- I.T. presents Beyond @ Tangent Gallery, 2026-10-30
update events set external_id = 'ra-2474836'  where id = '4987adf7-5add-4f98-94c6-d6fd9d4d1f02' and external_id is null; -- Samhain XXVI @ Tangent Gallery, 2026-10-31
update events set external_id = 'ra-2479785'  where id = '14ed9842-caec-4fda-8e05-8cb9bd47e156' and external_id is null; -- Yheti & Toadface: Sleight of Sound Tour @ Elektricity, 2026-10-03
update events set external_id = 'ra-2484799'  where id = '126f6fab-4a08-4f00-a4b2-2c77de17bd9c' and external_id is null; -- Paxahau presents: WESTEND @ Russell Industrial Center, 2026-10-10
update events set external_id = 'ra-2487837'  where id = 'b8f1c6eb-efb1-4294-9503-d8c8c37e330e' and external_id is null; -- The Occasional Thursday Party w/ London Elektricity @ Marble Bar, 2026-10-08
update events set external_id = 'ra-2487990'  where id = '3d8d80ec-b706-47c8-b7a1-c8946f69e177' and external_id is null; -- The Occasional Thursday Party w/ DJ Craze + Friends @ Marble Bar, 2026-10-29
update events set external_id = 'ra-2495966'  where id = '341ce047-74ce-4189-96b5-6faa5e1018ec' and external_id is null; -- SICKICK @ Elektricity, 2026-10-09
update events set external_id = 'ra-2495975'  where id = 'a500f51a-7d17-4ce7-bf11-caee0e2c0f28' and external_id is null; -- TSU NAMI: Limerence Tour (360° DJ Experience) @ Elektricity, 2026-10-16
update events set external_id = 'ra-2496077'  where id = '4bba1709-90ea-4e9b-9aa9-9239e4d1a8b7' and external_id is null; -- Paxahau presents: Walker & Royce @ Lincoln Factory, 2026-10-17

insert into schema_migrations (filename) values ('update_2026-09-22_ra-external-id-backfill.sql')
on conflict (filename) do nothing;
