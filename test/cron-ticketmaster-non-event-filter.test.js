// test/cron-ticketmaster-non-event-filter.test.js
//
// Regression guard for the 2026-10-01 fix wiring
// api/_lib/non-event-filter.js's isLikelyNotARealEvent() into
// api/cron-ticketmaster.js's shapeForDb() (Needs Follow-up remaining-gap
// product pass). Confirmed real, live case: Ticketmaster's Discovery API
// returns a separate "<Artist> - Suite Rental" listing alongside the real
// underlying concert (8 confirmed live 2026-10-01) — a corporate-box
// upsell add-on, not a standalone public event — and this file had no
// prior mechanism to exclude it.
//
// shapeForDb() is exposed as a named export (alongside the file's default
// Vercel handler export) specifically for this direct unit test — see
// that export's own comment in api/cron-ticketmaster.js.
//
// Run: node test/cron-ticketmaster-non-event-filter.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function fresh() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-ticketmaster.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/non-event-filter.js`)];
  return require(`${REPO_DIR}/api/cron-ticketmaster.js`);
}

// Minimal real-shaped Discovery API event — just enough fields for
// shapeForDb() to run its full path (category mapping, venue, dates).
function tmEvent({ name, segment = "Music", genre = "Rock" }) {
  return {
    id: "tm-" + Math.random().toString(36).slice(2),
    name,
    classifications: [{ segment: { name: segment }, genre: { name: genre } }],
    dates: { start: { localDate: "2026-10-12", localTime: "19:00:00" }, status: { code: "onsale" } },
    url: "https://www.ticketmaster.com/event/example",
    images: [],
    _embedded: {
      venues: [{ name: "Example Arena", city: { name: "Detroit" }, address: { line1: "123 Main St" } }],
    },
  };
}

function run() {
  const { shapeForDb } = fresh();

  const venueMap = new Map();

  // --- 1. A real "<Artist> - Suite Rental" listing (the confirmed live
  //     shape) must be filtered out entirely — shapeForDb returns null,
  //     same as its existing `!cat` early-return convention. ---
  {
    const row = shapeForDb(tmEvent({ name: "The Chicks - Suite Rental" }), venueMap);
    assert.strictEqual(row, null, "a Suite Rental listing must be filtered out (returns null)");
  }
  console.log("PASS: a real \"<Artist> - Suite Rental\" listing is filtered out");

  // --- 2. An ordinary real concert must still shape normally — this
  //     filter must not swallow real events. ---
  {
    const row = shapeForDb(tmEvent({ name: "The Chicks" }), venueMap);
    assert.ok(row, "an ordinary real concert must still produce a row");
    assert.strictEqual(row.title, "The Chicks");
  }
  console.log("PASS: an ordinary real concert is unaffected");

  console.log("\ncron-ticketmaster-non-event-filter.test.js: all assertions passed");
}

run();
