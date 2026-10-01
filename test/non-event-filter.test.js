// test/non-event-filter.test.js — api/_lib/non-event-filter.js's
// isLikelyNotARealEvent() (2026-10-01, Needs Follow-up remaining-gap
// product pass).
//
// Uses the two real, confirmed, live cases that motivated this filter:
// The Congregation's own "CLOSED FOR PRIVATE EVENT" feed entry, and
// Ticketmaster's "<Artist> - Suite Rental" corporate-box upsell listings
// (8 confirmed live 2026-10-01) — plus guards proving this stays narrow
// rather than broadening into a guess.
//
// Run: node test/non-event-filter.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function fresh() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/non-event-filter.js`)];
  return require(`${REPO_DIR}/api/_lib/non-event-filter.js`);
}

function run() {
  const { isLikelyNotARealEvent } = fresh();

  // --- The two real, confirmed cases ---
  assert.strictEqual(isLikelyNotARealEvent({ title: "CLOSED FOR PRIVATE EVENT" }), true);
  assert.strictEqual(isLikelyNotARealEvent({ title: "The Chicks - Suite Rental" }), true);
  assert.strictEqual(isLikelyNotARealEvent({ title: "Leanne Morgan - Suite Rental" }), true);
  console.log("PASS: both real confirmed cases (CLOSED FOR PRIVATE EVENT, <Artist> - Suite Rental) are detected");

  // --- Case-insensitive, whole-phrase match ---
  assert.strictEqual(isLikelyNotARealEvent({ title: "closed for private event" }), true);
  assert.strictEqual(isLikelyNotARealEvent({ title: "Some Show - suite rental" }), true);
  console.log("PASS: matching is case-insensitive");

  // --- Never a guess: ordinary real events, including ones that share a
  // word with the patterns, are never falsely flagged. ---
  assert.strictEqual(isLikelyNotARealEvent({ title: "Live Jazz Night" }), false);
  assert.strictEqual(isLikelyNotARealEvent({ title: "The Rental Space Presents: Open Mic" }), false);
  assert.strictEqual(isLikelyNotARealEvent({ title: "Private Event Planning Workshop" }), false);
  assert.strictEqual(isLikelyNotARealEvent({ title: "Suite Life Album Release Party" }), false);
  console.log("PASS: ordinary real events sharing a word with the patterns are never falsely flagged");

  // --- Malformed/missing input never throws, defaults to the safe false ---
  assert.strictEqual(isLikelyNotARealEvent({}), false);
  assert.strictEqual(isLikelyNotARealEvent({ title: null }), false);
  assert.strictEqual(isLikelyNotARealEvent(), false);
  console.log("PASS: malformed/missing input never throws, defaults to the safe false");

  console.log("\nnon-event-filter.test.js: all assertions passed");
}

run();
