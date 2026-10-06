-- PROPOSED — NOT APPLIED TO PRODUCTION (BUG-008). Do not move into
-- supabase/migrations/ until the Product Owner approves applying it to
-- production. Apply to STAGING first as the first real exercise of the release flow.
--
-- Production's event_category enum has no 'gaming', so any write using it is
-- rejected by the database (GottaGacha: 10 failed runs). Adding an enum value
-- cannot be undone and must run alone (not in the same transaction as any use
-- of the new value). Content equals migration_036 + migration_037.
alter type event_category add value if not exists 'gaming';
