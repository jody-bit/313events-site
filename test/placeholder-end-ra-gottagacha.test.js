// test/placeholder-end-ra-gottagacha.test.js
//
// Same narrow rule as #250 (VisitDetroit) and #257 (generic ICS): an end
// time of exactly 23:59 is an end-of-day filler, not a stated end, so it is
// dropped and only the start is shown. A real end (including 23:58) is kept.
// Covers the Resident Advisor field derivation (scripts/ra-sync.js) and the
// GottaGacha connector (api/cron-gottagacha.js). Connector code only.
//
// Run: node test/placeholder-end-ra-gottagacha.test.js
"use strict";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-key";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();

const { deriveTimeDisplayAndEndDate } = require(`${REPO_DIR}/scripts/ra-sync.js`);
const gg = require(`${REPO_DIR}/api/cron-gottagacha.js`);

function ggEvent(startTime, endTime) {
  return {
    id: "5bcbabc3-35d4-40de-90bc-26ed9ef959c8", title: "TCG Tuesday", description: "Casual play night.",
    eventDate: "2026-10-06", startTime, endTime, recurrenceType: "weekly", location: "Gotta Gacha",
  };
}

// RA
assert.strictEqual(deriveTimeDisplayAndEndDate("2026-12-12T19:00:00-05:00", "2026-12-12T23:59:00-05:00").timeDisplay, "7:00 PM", "RA 23:59 end dropped");
assert.strictEqual(deriveTimeDisplayAndEndDate("2026-12-12T19:00:00-05:00", "2026-12-12T22:00:00-05:00").timeDisplay, "7:00 PM–10:00 PM", "RA real end kept");
assert.strictEqual(deriveTimeDisplayAndEndDate("2026-12-12T19:00:00-05:00", "2026-12-12T23:58:00-05:00").timeDisplay, "7:00 PM–11:58 PM", "RA 23:58 kept");
const overnight = deriveTimeDisplayAndEndDate("2026-12-12T22:00:00-05:00", "2026-12-13T02:00:00-05:00");
assert.strictEqual(overnight.timeDisplay, "10:00 PM–2:00 AM", "RA overnight end kept");
assert.strictEqual(overnight.endDate, "2026-12-13", "RA end_date untouched");
console.log("PASS: RA 23:59 filler end dropped; real ends and end_date untouched");

// GottaGacha
assert.strictEqual(gg.parseEvent(ggEvent("19:00:00", "23:59:00")).time_display, "7:00 PM", "GG 23:59 end dropped");
assert.strictEqual(gg.parseEvent(ggEvent("19:00:00", "21:00:00")).time_display, "7:00 PM – 9:00 PM", "GG real end kept");
assert.strictEqual(gg.parseEvent(ggEvent("19:00:00", "23:58:00")).time_display, "7:00 PM – 11:58 PM", "GG 23:58 kept");
console.log("PASS: GottaGacha 23:59 filler end dropped; real ends kept");
