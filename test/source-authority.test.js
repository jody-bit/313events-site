// test/source-authority.test.js — api/_lib/source-authority.js's
// classifySourceTier(): Product Owner decision 4 (RA candidate-recovery
// MVP, 2026-10-01) -- primary_authoritative / secondary_corroborating /
// discovery_only, generic (no Instagram-specific logic).
//
// Plain Node assert, no dependencies.
// Run: node test/source-authority.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { TIERS, classifySourceTier } = require(`${REPO_DIR}/api/_lib/source-authority.js`);

// 1. A venue/organizer-domain match with matchedOn:'venue' is primary.
assert.strictEqual(
  classifySourceTier({ url: "https://tickets.venuepilot.com/e/show", matchedOn: "venue" }),
  TIERS.PRIMARY_AUTHORITATIVE
);
console.log("PASS: a verified venue/organizer-identity match classifies as primary_authoritative");

// 2. matchedOn:'organizer' is treated the same as 'venue' -- both are the
//    event's own official operator, not a participant.
assert.strictEqual(
  classifySourceTier({ url: "https://somepromoter.com/shows/123", matchedOn: "organizer" }),
  TIERS.PRIMARY_AUTHORITATIVE
);
console.log("PASS: matchedOn:'organizer' classifies as primary_authoritative, same as 'venue'");

// 3. matchedOn:'artist' is secondary, even on an otherwise-official domain.
assert.strictEqual(
  classifySourceTier({ url: "https://someartistofficial.com/tour", matchedOn: "artist" }),
  TIERS.SECONDARY_CORROBORATING
);
console.log("PASS: a participating artist's own account classifies as secondary_corroborating");

// 4. A known non-official/aggregator domain is ALWAYS discovery_only, even
//    if the caller claims matchedOn:'venue' -- the domain check wins.
assert.strictEqual(
  classifySourceTier({ url: "https://www.eventbrite.com/e/123", matchedOn: "venue" }),
  TIERS.DISCOVERY_ONLY
);
console.log("PASS: a known aggregator/reseller domain is always discovery_only regardless of matchedOn");

assert.strictEqual(
  classifySourceTier({ url: "https://ra.co/events/123", matchedOn: "venue" }),
  TIERS.DISCOVERY_ONLY
);
console.log("PASS: ra.co itself is never treated as independent corroboration (already excluded upstream, belt-and-suspenders here)");

// 5. No signal at all (no matchedOn) on an otherwise-official domain --
//    conservative default, never upgraded by guessing.
assert.strictEqual(
  classifySourceTier({ url: "https://somevenue.com/calendar" }),
  TIERS.DISCOVERY_ONLY
);
console.log("PASS: an official-looking domain with no matchedOn signal defaults to discovery_only, never guessed upward");

// 6. A missing/unparseable URL is discovery_only, never throws.
assert.strictEqual(classifySourceTier({ url: null, matchedOn: "venue" }), TIERS.DISCOVERY_ONLY);
assert.strictEqual(classifySourceTier({}), TIERS.DISCOVERY_ONLY);
assert.strictEqual(classifySourceTier(), TIERS.DISCOVERY_ONLY);
console.log("PASS: a missing/malformed url never throws, always falls back to discovery_only");

console.log("\nAll source-authority.js tests passed.");
