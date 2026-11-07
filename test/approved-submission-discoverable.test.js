// test/approved-submission-discoverable.test.js
//
// P1 2026-10-28: "Full Moon Hallowpalooza" (approved Venue Submission, Red Door, clothing optional,
// venue_id and venue_city_raw both NULL) was reported as not discoverable. Production data and this
// code do NOT exclude it; this test pins that down so an approved submission can never silently drop
// out of discovery because it has no linked venue, no city, or a declared clothing-optional flag.
//
// Run: node test/approved-submission-discoverable.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { Discovery: D } = require(`${REPO_DIR}/discovery.js`);

const CTX = { now: new Date("2026-10-28T20:00:00Z") };
// Shaped like index.html's mapSupabaseRow() output for the production events_public row:
// city undefined (venue_city is NULL), venueId null, neighborhood null, clothingOptional true.
const FULL_MOON = {
  id: "75fab9b3-d34e-46a2-b600-3c37e563e541", date: "2026-11-07", endDate: undefined,
  title: "Full Moon Hallowpalooza", venue: "Red Door", city: undefined, venueId: null,
  cat: "nightlife", time: "7:00 PM", free: false, source: "Venue Submission",
  clothingOptional: true, neighborhood: null,
};
const st = (patch) => D.change(D.defaults(), patch);
const no = (s, msg) => assert.strictEqual(D.matches(FULL_MOON, s, CTX), false, msg);
const yes = (s, msg) => assert.strictEqual(D.matches(FULL_MOON, s, CTX), true, msg);

yes(st({}), "default state");
yes(st({ when: { mode: "all" } }), "all upcoming");
yes(st({ when: { mode: "dates", from: "2026-11-07", to: "2026-11-07" } }), "its own day");
no(st({ when: { mode: "dates", from: "2026-11-08", to: "2026-11-08" } }), "negative control: another day excludes it");
yes(st({ when: { mode: "dates", from: "2026-11-01", to: "2026-11-30" } }), "its month");
yes(st({ q: "hallowpalooza" }), "search by title");
yes(st({ q: "full moon" }), "search by words in the title");
yes(st({ q: "red door" }), "search by venue");
yes(st({ q: "venue submission" }), "search by source");
yes(st({ what: { only: "nightlife" } }), "its category");
no(st({ what: { only: "music" } }), "negative control: another category does exclude it");
yes(st({ where: { place: "Detroit", radius: "orbit" } }), "Detroit Orbit place filter (null city defaults to Detroit)");
yes(st({ where: { place: "Detroit", radius: 25 } }), "25 mile radius");
yes(st({ feature: { add: "clothing_optional" } }), "declared clothing-optional feature");
assert.ok(D.featuresOf(FULL_MOON, CTX).includes("clothing_optional"), "carries the clothing-optional label");
assert.strictEqual(D.matches(Object.assign({}, FULL_MOON, { clothingOptional: false }), st({ feature: { add: "clothing_optional" } }), CTX), false,
  "negative control: the feature filter narrows only when chosen");

// No default surface query may filter on clothing, city or venue linkage.
const html = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");
const q = html.match(/const url = `\$\{SUPABASE_URL\}\/rest\/v1\/events_public\?[^`]*`/);
assert.ok(q, "index.html events_public query not found");
assert.ok(!/clothing|venue_city=|venue_id=(not|is)|city=/.test(q[0].replace(/select=[^&`]*/, "")),
  "the homepage event query filters on dates only, never on clothing, city or venue linkage");

console.log("approved-submission-discoverable: ok");
