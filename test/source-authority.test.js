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
const { TIERS, classifySourceTier, domainPlausiblyOwnedByName } = require(`${REPO_DIR}/api/_lib/source-authority.js`);

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

// ===========================================================================
// domainPlausiblyOwnedByName -- 2026-10-01 hardening. Real production
// fixtures: discoverAuthoritativeDescription genuinely matched these two
// events' own title and date (see external-discovery.test.js #16), but
// their SOURCE TIER was wrongly primary_authoritative because the
// description call site asserted matchedOn:"venue" unconditionally. This
// is the generalized check that replaces that assertion -- not a per-
// domain denylist (Product Owner, 2026-10-01: "do not solve authority
// primarily by growing an endless aggregator denylist").
// ===========================================================================

// 7. Discotech served Jive Turkeys' event accurately, but discotech.me
//    carries no fragment of "TV Lounge" -- it is not that venue's domain.
assert.strictEqual(domainPlausiblyOwnedByName("https://app.discotech.me/events/38273665-jive-turkeys", "TV Lounge"), false);
console.log("PASS: domainPlausiblyOwnedByName rejects discotech.me for TV Lounge (real Jive Turkeys mistier)");

// 8. Techno Beats Cloud served Ø[Phase]'s event accurately, but
//    technobeatscloud.com carries no fragment of "Lincoln Factory".
assert.strictEqual(domainPlausiblyOwnedByName("https://technobeatscloud.com/en/events/event/phase", "Lincoln Factory"), false);
console.log("PASS: domainPlausiblyOwnedByName rejects technobeatscloud.com for Lincoln Factory (real Ø[Phase] mistier)");

// 9. A domain that genuinely carries the venue's own name passes --
//    proves the check isn't just "always false," and protects the three
//    legitimately-tiered venue-owned domains from this same production
//    batch (Big Pink, Marble Bar, Northern Lights Lounge).
assert.strictEqual(domainPlausiblyOwnedByName("https://bigpinklovesyou.com", "Big Pink"), true);
assert.strictEqual(domainPlausiblyOwnedByName("https://themarblebar.com/events", "Marble Bar"), true);
assert.strictEqual(domainPlausiblyOwnedByName("https://www.northernlightslounge.com/music", "Northern Lights Lounge"), true);
console.log("PASS: domainPlausiblyOwnedByName accepts a domain that genuinely carries the venue's own name");

// 10. ma.to was the "primary_authoritative" source for THREE different,
//     unrelated venues in the same real production batch -- it must fail
//     the check against every one of them, proving this isn't a
//     coincidence specific to one domain/venue pairing.
assert.strictEqual(domainPlausiblyOwnedByName("https://ma.to/event/hiphop-night-big-pink-03-oct-2026", "Big Pink"), false);
assert.strictEqual(domainPlausiblyOwnedByName("https://ma.to/event/marble-bar-11-year-anniversary-03-oct-2026", "Marble Bar"), false);
assert.strictEqual(domainPlausiblyOwnedByName("https://ma.to/event/realms-of-techno-spkrbox-06-aug-2026", "Spkrbox"), false);
console.log("PASS: domainPlausiblyOwnedByName rejects ma.to for every venue it was wrongly tiered as -- not a per-domain special case");

// 11. Current State / The High Dive positive control -- Product Owner,
//     2026-10-01: "an important positive pattern... preserve that
//     behavior." community.metrotimes.com genuinely fails
//     domainPlausiblyOwnedByName against "The High Dive" (it's Metro
//     Times' own directory, not the venue's site) -- but this function is
//     deliberately NEVER consulted by the venue-discovery call site
//     (scripts/generic-metadata-enrichment.js's venue-knowledge branch),
//     which keeps asserting matchedOn:"venue" unconditionally exactly as
//     it did before this fix, because that search IS a true venue-
//     identity search. This assertion exists so that check staying
//     unchanged is a deliberate, tested fact, not an accident of scope.
assert.strictEqual(domainPlausiblyOwnedByName("https://community.metrotimes.com/location/the-high-dive-18870035", "The High Dive"), false);
assert.strictEqual(
  classifySourceTier({ url: "https://community.metrotimes.com/location/the-high-dive-18870035", matchedOn: "venue" }),
  TIERS.PRIMARY_AUTHORITATIVE,
  "the venue-discovery call site's own matchedOn:'venue' is untouched by this fix -- Current State's real production tier must not change"
);
console.log("PASS: Current State / The High Dive positive control -- venue-discovery's unconditional matchedOn:'venue' is preserved unchanged");

console.log("\nAll source-authority.js tests passed.");
