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

## Remaining launch blockers
1. The connector still writes the OLD ids (`api/cron-motorcitywine.js` does not use `mcw-identity.js`).
   Running the migration and then the old connector would recreate every row under the old id: duplicates.
   The connector change (use the stable id, adopt via the planner) must ship with or before the migration,
   and the cron must stay held until both are done. Not built yet: it needs your approval.
2. Moved-instance handling is proven in tests only; the current window has no moved instances.
3. Merging #69 deploys to production (every merge to main does). Needs your explicit approval.
4. The cron is still held (commit c9d8319); restoring it is a separate decision. The 9 events above publish then.
5. Order of operations to approve: connector change merged and deployed (cron still held) -> migration
   run in a transaction (expect UPDATE 59) -> re-run the reconciliation report (expect 0 changes) -> restore cron.
