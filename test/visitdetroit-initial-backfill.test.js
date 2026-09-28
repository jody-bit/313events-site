// test/visitdetroit-initial-backfill.test.js —
// scripts/visitdetroit-initial-backfill.js's
// runVisitDetroitInitialBackfill() (2026-09-28, Needs Follow-up
// self-healing pass 2). Confirms the one-time orchestrator runs both
// repairs (time backfill, then dead-link repair) in sequence, passes
// dryRun through to both, isolates one step's failure from the other, and
// returns both steps' counts for the deployment report. Both underlying
// repair functions are injected -- this test is only about the
// orchestration, not re-testing their own internals (see
// test/visitdetroit-time-backfill.test.js and
// test/visitdetroit-dead-link-repair.test.js for those).
//
// Run: node test/visitdetroit-initial-backfill.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function fresh() {
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/visitdetroit-initial-backfill.js`)];
  return require(`${REPO_DIR}/scripts/visitdetroit-initial-backfill.js`);
}

async function run() {
  const { runVisitDetroitInitialBackfill } = fresh();

  // ============================================================
  // 1. Runs both repairs and returns both counts
  // ============================================================
  {
    const calls = [];
    const repairTimesFn = async (opts) => { calls.push(["times", opts.dryRun]); return { repaired: 3 }; };
    const repairLinksFn = async (opts) => { calls.push(["links", opts.dryRun]); return { repaired: 2 }; };
    const { timeCounts, linkCounts } = await runVisitDetroitInitialBackfill({
      dryRun: false,
      logger: { log() {}, error() {}, warn() {} },
      repairTimesFn,
      repairLinksFn,
    });
    assert.deepStrictEqual(timeCounts, { repaired: 3 });
    assert.deepStrictEqual(linkCounts, { repaired: 2 });
    assert.deepStrictEqual(calls, [["times", false], ["links", false]], "times must run before links, both with the same dryRun flag");
  }
  console.log("PASS: runs the time backfill then the dead-link repair, returns both counts");

  // ============================================================
  // 2. dryRun=true is passed through to both underlying repairs
  // ============================================================
  {
    const seenDryRun = [];
    const repairTimesFn = async (opts) => { seenDryRun.push(opts.dryRun); return {}; };
    const repairLinksFn = async (opts) => { seenDryRun.push(opts.dryRun); return {}; };
    await runVisitDetroitInitialBackfill({
      dryRun: true,
      logger: { log() {}, error() {}, warn() {} },
      repairTimesFn,
      repairLinksFn,
    });
    assert.deepStrictEqual(seenDryRun, [true, true]);
  }
  console.log("PASS: --dry-run is passed through to both the time and link repairs");

  // ============================================================
  // 3. A failure in the time-backfill step propagates (never silently
  //    swallowed) rather than proceeding to write links against a
  //    possibly-broken run -- unlike the Admin Auto-Repair button's
  //    per-step try/catch isolation, this one-time script is a single
  //    deliberate run Jody reviews directly, so a real failure should
  //    surface, not be hidden.
  // ============================================================
  {
    const repairTimesFn = async () => { throw new Error("Algolia unreachable"); };
    let linksCalled = false;
    const repairLinksFn = async () => { linksCalled = true; return {}; };
    await assert.rejects(
      () => runVisitDetroitInitialBackfill({ logger: { log() {}, error() {}, warn() {} }, repairTimesFn, repairLinksFn }),
      /Algolia unreachable/
    );
    assert.strictEqual(linksCalled, false, "must not proceed to the link repair after the time backfill throws");
  }
  console.log("PASS: a time-backfill failure propagates and does not proceed to the link repair");

  console.log("\nvisitdetroit-initial-backfill.test.js: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
