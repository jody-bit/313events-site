// test/mobile-event.test.js — api/_lib/mobile-event.js's
// isLikelyNoFixedVenue() (2026-09-28, Needs Follow-up self-healing pass 2)
// + its integration into api/cron-visitdetroit.js's row construction.
//
// Uses the REAL VisitDetroit eventCategories/title for the two events that
// surfaced this gap (Christmas Cookie Coach Tour, The Original Detroit
// Christmas Bakery Bus Tour -- both carry "Tours" in their real
// eventCategories, fetched live 2026-09-28), plus generic cases proving
// this is not VisitDetroit-specific and never guesses.
//
// Run: node test/mobile-event.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshMobileEvent() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/mobile-event.js`)];
  return require(`${REPO_DIR}/api/_lib/mobile-event.js`);
}

function run() {
  const { isLikelyNoFixedVenue } = freshMobileEvent();

  // --- The two real events, real category data ---
  assert.strictEqual(
    isLikelyNoFixedVenue({ title: "Christmas Cookie Coach Tour", sourceCategories: ["Food & Drink", "Holiday & Seasonal", "Tours"] }),
    true
  );
  assert.strictEqual(
    isLikelyNoFixedVenue({ title: "The Original Detroit Christmas Bakery Bus Tour", sourceCategories: ["Food & Drink", "Holiday & Seasonal", "Tours"] }),
    true
  );
  console.log("PASS: both real VisitDetroit tour events (real eventCategories incl. \"Tours\") are detected");

  // --- Category signal is case-insensitive and whitespace-tolerant ---
  assert.strictEqual(isLikelyNoFixedVenue({ title: "Whatever", sourceCategories: [" tours "] }), true);
  assert.strictEqual(isLikelyNoFixedVenue({ title: "Whatever", sourceCategories: ["TOURS"] }), true);
  console.log("PASS: category match is case/whitespace-insensitive");

  // --- Generic title-keyword fallback, for sources with no structured
  // category signal at all -- proves this is NOT VisitDetroit-specific ---
  assert.strictEqual(isLikelyNoFixedVenue({ title: "Downtown Pub Crawl", sourceCategories: null }), true);
  assert.strictEqual(isLikelyNoFixedVenue({ title: "Detroit Food Tour Experience" }), true);
  assert.strictEqual(isLikelyNoFixedVenue({ title: "Annual Holiday Parade" }), true);
  console.log("PASS: generic title-keyword fallback works with no category data at all (source-agnostic)");

  // --- Never a guess: an ordinary fixed-venue event is NOT flagged ---
  assert.strictEqual(isLikelyNoFixedVenue({ title: "Live Jazz Night", sourceCategories: ["Music & Concerts"] }), false);
  assert.strictEqual(isLikelyNoFixedVenue({ title: "Cookie Decorating Class", sourceCategories: ["Food & Drink"] }), false);
  // "Tour de Detroit" is a real bike RACE with a fixed start/finish venue --
  // deliberately not matched by the narrow keyword list (no bare "tour").
  assert.strictEqual(isLikelyNoFixedVenue({ title: "Tour de Detroit", sourceCategories: ["Sports & Recreation"] }), false);
  console.log("PASS: ordinary fixed-venue events, and the Tour de Detroit edge case, are never falsely flagged");

  // --- Malformed/missing input never throws, defaults to false ---
  assert.strictEqual(isLikelyNoFixedVenue({}), false);
  assert.strictEqual(isLikelyNoFixedVenue({ title: null, sourceCategories: undefined }), false);
  assert.strictEqual(isLikelyNoFixedVenue(), false);
  console.log("PASS: malformed/missing input never throws, defaults to the safe false");

  console.log("\nmobile-event.test.js: all assertions passed");
}

run();
