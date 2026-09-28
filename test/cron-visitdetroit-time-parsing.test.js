// test/cron-visitdetroit-time-parsing.test.js — VisitDetroit five-hour
// time-shift bug fix (2026-09-28, Needs Follow-up self-healing pass 2).
//
// Regression test using the REAL raw Algolia epoch values for the two
// events that surfaced this bug (fetched live from VisitDetroit's own
// public search-only Algolia index 2026-09-28, cross-checked against the
// live site's own published times at the same time):
//   Christmas Cookie Coach Tour:          real time 1:30 PM – 5:30 PM
//   The Original Detroit Christmas Bakery Bus Tour: real time 8:30 AM – 12:50 PM
// Before the fix, detroitParts() (which applied a real UTC->America/Detroit
// Intl conversion on top of an epoch that VisitDetroit's own backend
// already encodes AS local time) produced exactly the wrong times Admin
// was showing: 8:30 AM–12:30 PM and 3:30 AM–7:50 AM respectively —
// asserted explicitly below as the OLD/WRONG values this fix must no
// longer produce.
//
// Run: node test/cron-visitdetroit-time-parsing.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshVisitDetroit() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-visitdetroit.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/status-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/mobile-event.js`)];
  return require(`${REPO_DIR}/api/cron-visitdetroit.js`);
}

function run() {
  const { detroitParts } = freshVisitDetroit();

  // --- Real raw epochs, fetched live 2026-09-28 ---
  const COOKIE_COACH_START = 1796477400;
  const COOKIE_COACH_END = 1796491800;
  const BAKERY_BUS_START = 1796459400;
  const BAKERY_BUS_END = 1796475000;

  // --- Correct output: matches visitdetroit.com's own published times ---
  {
    const start = detroitParts(COOKIE_COACH_START);
    const end = detroitParts(COOKIE_COACH_END);
    assert.deepStrictEqual(start, { date: "2026-12-05", hour: 13, minute: 30 }, "Cookie Coach Tour start must be 1:30 PM, not 8:30 AM");
    assert.deepStrictEqual(end, { date: "2026-12-05", hour: 17, minute: 30 }, "Cookie Coach Tour end must be 5:30 PM, not 12:30 PM");
  }
  console.log("PASS: Christmas Cookie Coach Tour parses to the authoritative 1:30 PM–5:30 PM, not the old wrong 8:30 AM–12:30 PM");

  {
    const start = detroitParts(BAKERY_BUS_START);
    const end = detroitParts(BAKERY_BUS_END);
    assert.deepStrictEqual(start, { date: "2026-12-05", hour: 8, minute: 30 }, "Bakery Bus Tour start must be 8:30 AM, not 3:30 AM");
    assert.deepStrictEqual(end, { date: "2026-12-05", hour: 12, minute: 50 }, "Bakery Bus Tour end must be 12:50 PM, not 7:50 AM");
  }
  console.log("PASS: The Original Detroit Christmas Bakery Bus Tour parses to the authoritative 8:30 AM–12:50 PM, not the old wrong 3:30 AM–7:50 AM");

  // --- Explicit regression guard: the OLD (wrong) real-UTC-conversion
  // values must never come back out, for either event. ---
  {
    const start = detroitParts(COOKIE_COACH_START);
    assert.notStrictEqual(start.hour, 8, "must not regress to the old wrong Intl-conversion output (8:30 AM)");
  }
  {
    const start = detroitParts(BAKERY_BUS_START);
    assert.notStrictEqual(start.hour, 3, "must not regress to the old wrong Intl-conversion output (3:30 AM)");
  }
  console.log("PASS: old (Intl UTC->America/Detroit conversion) wrong values do not reappear");

  // --- null/undefined handling unchanged ---
  assert.strictEqual(detroitParts(null), null);
  assert.strictEqual(detroitParts(undefined), null);
  assert.deepStrictEqual(detroitParts(0), { date: "1970-01-01", hour: 0, minute: 0 }, "epoch 0 is a valid input, not treated as falsy");
  console.log("PASS: null/undefined/0 handling unchanged");

  // --- A second, independent spot-check: a plain round time (not near a
  // DST boundary or midnight) still parses as a straightforward UTC-digit
  // read, proving this isn't special-cased to only the two known events. ---
  {
    // 2026-07-04 15:00:00 UTC (an arbitrary summer epoch, unrelated to
    // either known event) -- the fix must read the SAME UTC digits
    // regardless of season, since it no longer does any DST-aware
    // conversion at all.
    const epoch = Date.UTC(2026, 6, 4, 15, 0, 0) / 1000;
    assert.deepStrictEqual(detroitParts(epoch), { date: "2026-07-04", hour: 15, minute: 0 });
  }
  console.log("PASS: arbitrary summer epoch reads UTC digits directly, with no DST-dependent branching");

  console.log("\ncron-visitdetroit-time-parsing.test.js: all assertions passed");
}

run();
