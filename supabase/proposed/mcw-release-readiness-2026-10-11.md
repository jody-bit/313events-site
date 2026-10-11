# MotorCity Wine: release readiness (2026-10-11)

Status: PROPOSAL ONLY. Nothing here has run, been merged, deployed or enabled. PR #69 is draft.

## Evidence (report-only, authoritative calendar saved 2026-10-11, 69 stored rows exported by SELECT)
- 59 of 59 upcoming stored rows match the calendar exactly; 0 ambiguous, 0 duplicates, 0 collisions,
  0 stored rows missing or cancelled in the window, 0 moved instances in the window.
- Migration files: `2026-10-11_mcw_stable_identity.sql` (preview + guarded apply, external_id only)
  and `2026-10-11_mcw_stable_identity_rollback.sql`. Both are commented out where they write.

## The nine newly discovered events (not stored; would publish as approved once the cron runs)
2026-10-11 Dhaba Indian Kitchen; 2026-12-03 Tropicalia with David A-P and Guests; 2026-12-04 Russ Macklem
Quartet; 2026-12-05 Lafear Trio; 2026-12-06 Maybe Tonight with DJ Lady Monix; 2026-12-06 Dawat Persian
food pop-up; 2026-12-07 Kusina Filipino food pop-up; 2026-12-07 Monday is The New Monday; 2026-12-09 Tango Night.
Eight are the window extending past 2026-12-02; one is today's event. Nothing is unpublished or cancelled.

## Connector change (PR #69, this branch)
- `api/cron-motorcitywine.js` now writes `mcw-uid-<sha1(UID)[0..12]>-<original instance date>` (same function as the
  migration mapping). Title, description handling, venue, category, ticket_url and the status lookup are unchanged.
- Migration guard: before writing, it reads (SELECT) stored `mcw-*` rows from today on. If any still use legacy ids
  that this run would re-create under stable ids, it writes nothing, logs `blocked` ("Id migration pending: N") and
  returns 409. A failed lookup also stops the run. This makes the order below self-enforcing: the old-id rows can
  never be duplicated, even if the cron is restored too early.

## Verified (no production access; real handler, fake database, the 2026-10-11 authoritative calendar)
- Database in the post-migration state (59 rows under the new ids): the connector wrote all 59 migration ids
  (59 of 59), plus the 9 new events (68 upserted), and the guard passed.
- Database in the pre-migration state (59 rows under the old ids): blocked, 409, zero writes, "Id migration pending: 59".
- Regression tests (`test/mcw-connector-stable-id.test.js`): recurring series, rename, cancelled instance,
  rescheduled occurrence, repeat ingestion, preserved status/description/source link, guard, guard failure, and
  migration/rollback file consistency. Full suite passes.

## Verified deployment sequence (each step needs its own approval)
1. Merge #69 to main. This DEPLOYS TO PRODUCTION. The cron stays held, so the connector does not run.
2. Run `2026-10-11_mcw_stable_identity.sql` step 1 (preview): expect 59 rows, `target_exists` false for all.
3. Run step 2 (apply) in a transaction: expect `UPDATE 59`, then COMMIT. Anything else: ROLLBACK.
4. Re-run the report-only reconciliation (expect 59 already stable, 0 to adopt).
5. Decide separately on restoring the MotorCity Wine cron (revert/re-add its entry in `vercel.json`, a second
   production deploy). The 9 new events publish on the first run.

## Rollback
- Before step 3, nothing has changed. After step 3: run `2026-10-11_mcw_stable_identity_rollback.sql`
  (expect `UPDATE 59`) and revert the #69 merge; do both, because the old connector writes the old ids.
- If the cron was restored and ran: new-id rows created by it for the 9 new events are ordinary rows; they can be
  left or removed by id. Nothing else changes.

## Remaining launch blockers
1. Approval to merge #69 (production deploy), then approval to run the migration, then the cron decision.
2. Moved-instance handling is proven in tests only; the current window has no moved instances.
3. The cron is still held (commit c9d8319).
