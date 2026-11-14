// test/connector-free-not-hardcoded-false.test.js
//
// Ten connectors wrote is_free:false on every event, which says "paid" when the source states no price, and (with
// merge-duplicates) resets a reviewer-set FREE on the next run. They no longer send is_free; a stored value stands and
// a new row gets the column default (false). Source-stated FREE connectors (eventbrite, localist, lagerhouse, oldmiami,
// planetant, antonartcenter, bagley meetings) are untouched.
//
// Run: node test/connector-free-not-hardcoded-false.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
for (const f of ["ticketmaster", "halo", "dossin", "redford-theatre", "trinosophes", "cinema-detroit", "detroittraining", "gottagacha", "outerlimitslounge", "visitdetroit"]) {
  const src = fs.readFileSync(`${REPO_DIR}/api/cron-${f}.js`, "utf8");
  assert.ok(!/^\s*is_free:\s*false\b/m.test(src), `cron-${f}.js still hard-codes is_free:false`);
}
console.log("PASS: ten connectors no longer hard-code is_free:false");
