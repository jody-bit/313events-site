"use strict";

// api/_lib/non-event-filter.js
//
// Shared, source-agnostic "is this actually a real, attendable public
// event, or a non-event artifact a source's own calendar/catalog system
// happens to publish" filter -- 2026-10-01, Needs Follow-up remaining-gap
// product pass (Jody: "if an event says 'closed to the public' ... that
// should be skipped all together -- we don't want that listing in the
// site AT ALL").
//
// Two real, confirmed cases, from two completely unrelated sources --
// confirming this is a real cross-source category of problem, not one
// feed's quirk:
//   1. The Congregation's own ICS feed publishes a literal "CLOSED FOR
//      PRIVATE EVENT" entry on its calendar, fully populated (venue, time,
//      everything) -- marking the venue unavailable for a private rental
//      that day, not an event the public can attend.
//   2. Ticketmaster's Discovery API returns a separate "<Artist> - Suite
//      Rental" listing alongside the real underlying concert -- a
//      corporate-box upsell add-on bundled with the show, not a
//      standalone public event of its own.
//
// Deliberately narrow, title-only, exact-phrase matching -- same "never
// guess" posture as api/_lib/mobile-event.js. A broad keyword here risks
// hiding a REAL event (e.g. a band literally named "Cancelled", a venue
// called "The Rental Space"), which is worse than leaving one junk
// listing up for a day -- so this only grows when a new case is confirmed
// live the same way these two were, never from a guessed pattern.
const TITLE_PATTERNS = [
  /\bclosed for private event\b/i,
  /\bsuite rental\b/i,
];

function isLikelyNotARealEvent({ title } = {}) {
  if (typeof title !== "string" || !title) return false;
  return TITLE_PATTERNS.some((re) => re.test(title));
}

module.exports = { isLikelyNotARealEvent, TITLE_PATTERNS };
