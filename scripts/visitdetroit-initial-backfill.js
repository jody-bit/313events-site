// scripts/visitdetroit-initial-backfill.js
//
// ONE-TIME, deliberate initial cleanup for EXISTING future VisitDetroit
// rows (2026-09-28), run once by hand after deploying (a) the corrected
// detroitParts()/deriveDateTimeFields() time-parsing fix and (b) the new
// generic dead-link self-healing framework. Combines the two repairs Jody
// asked for into one command so there's exactly one thing to run and one
// combined report to read:
//
//   1. scripts/visitdetroit-time-backfill.js's repairVisitDetroitTimes()
//      -- corrects start_date/end_date/time_display for existing rows
//      written under the old, wrong 5-hour-shifted time parsing, matched
//      to fresh Algolia data by external_id with a title-match identity
//      sanity check.
//   2. scripts/visitdetroit-dead-link-repair.js's
//      repairVisitDetroitDeadLinks() (already built for ongoing drift,
//      reused here unmodified) -- live-checks + repairs/flags stale
//      ticket_url values against the site's old-shape ->
//      /events/<slug>/ URL migration, with same-title revalidation before
//      accepting any replacement URL.
//
// Neither step creates rows, deletes rows, or touches recurrence -- see
// each script's own header comment for its exact scope and safety
// guarantees.
//
// NOT wired into the Admin Auto-Repair button, on purpose -- see that
// button's Step 6 comment in api/admin-events.js. This script IS the
// "initial systemic cleanup" Jody asked to keep separate from it; the
// button's own dead-link step (kept exactly as-is) only ever handles
// ongoing drift after this one-time pass has run.
//
// Usage:
//   node scripts/visitdetroit-initial-backfill.js            (writes repairs)
//   node scripts/visitdetroit-initial-backfill.js --dry-run  (reports only)

const { repairVisitDetroitTimes } = require("./visitdetroit-time-backfill");
const { repairVisitDetroitDeadLinks } = require("./visitdetroit-dead-link-repair");

async function runVisitDetroitInitialBackfill({
  dryRun = false,
  logger = console,
  repairTimesFn = repairVisitDetroitTimes,
  repairLinksFn = repairVisitDetroitDeadLinks,
} = {}) {
  logger.log(`Step 1/2: VisitDetroit start/end-time backfill ${dryRun ? "(dry run) " : ""}...`);
  const timeCounts = await repairTimesFn({ dryRun, logger });
  logger.log(timeCounts);

  logger.log(`\nStep 2/2: VisitDetroit dead-link repair ${dryRun ? "(dry run) " : ""}...`);
  const linkCounts = await repairLinksFn({ dryRun, logger });
  logger.log(linkCounts);

  return { timeCounts, linkCounts };
}

module.exports = { runVisitDetroitInitialBackfill };

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  runVisitDetroitInitialBackfill({ dryRun })
    .then(({ timeCounts, linkCounts }) => {
      console.log("\nVisitDetroit initial backfill complete.");
      console.log("Times:", timeCounts);
      console.log("Links:", linkCounts);
    })
    .catch((err) => {
      console.error("VisitDetroit initial backfill failed:", err);
      process.exitCode = 1;
    });
}
