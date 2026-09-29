"use strict";

// api/_lib/ics-location.js
//
// Per-VEVENT LOCATION parsing for multi-venue ICS feeds (Phase 6 shared
// infrastructure, 2026-09-29 -- "VEVENT LOCATION -> normalize -> venue
// resolver -> canonical venue when confidently matched -> honest raw
// venue/location when unmatched"). Pure text parsing only -- no network,
// no database -- so it's independently unit-testable and reusable by
// whatever adapter eventually needs it (this project's own cron-feeds.js
// today; WP 6.4's Tribe tenant batch and WP 6.8's CivicPlus adapter will
// both need the exact same grammars later, not a second copy of them).
//
// By the time a caller has a VEVENT's `location` string in hand (e.g.
// cron-feeds.js's own parseIcsEvents), ICS backslash-escaping
// (unescapeIcsText) and HTML-entity decoding have typically already run
// once upstream -- but a LOCATION property can ALSO contain literal HTML
// MARKUP (observed live: a CivicPlus municipal calendar dumping raw
// rich-text `<p>`/`<span>`/`<a href>` tags directly into LOCATION for some
// categories), which is not ICS escaping or an HTML entity and survives
// both of those steps untouched. This module strips that markup itself
// (defensively re-decoding entities too, in case a caller hasn't already),
// so a caller can pass either an already-decoded string or raw ICS text
// safely.
//
// Two real, confirmed LOCATION grammars observed live (2026-09-29), plus a
// third real, confirmed shape that is NOT a grammar this module should
// ever try to force-parse:
//
//   1. Tribe/The Events Calendar (WordPress plugin; e.g. Windsor Symphony
//      Orchestra's own feed): comma-separated,
//      "Venue, Street, City, Region, Postal[, Country]" -- e.g.
//      "The Capitol Theatre, 121 University Ave. W., Windsor, ON, N9A 5P4, Canada".
//   2. CivicPlus/CivicEngage municipal calendars, "clean" category (e.g.
//      Royal Oak's own "Farmers Market" category): dash-separated,
//      "Venue - Street  City State Zip" -- note TWO+ spaces between the
//      street and the city, the only structural delimiter this shape has
//      (no commas at all) -- e.g.
//      "Royal Oak Farmers Market - 316 E 11 Mile Road  Royal Oak MI 48067".
//   3. CivicPlus, "free text" category (e.g. Royal Oak's own "Downtown
//      Events" category): editor-entered prose with embedded HTML markup,
//      not a structured venue string at all -- e.g.
//      "<p>Meet at Pronto/Five 15: 600 S Washington Ave, Royal Oak, MI
//      48067</p> -   Royal Oak MI 48067". This is real, useful location
//      information a human wrote -- but it is NOT confidently decomposable
//      into a venue name/address/city without guessing, so this module
//      deliberately does not try. Forcing a "venue name" guess out of
//      prose like this is exactly the kind of invented structure this
//      project's "never guess" convention (see api/_lib/venue-lookup.js's
//      own header) forbids.
//
// parseIcsLocation(raw) -> one of:
//   { status: "blank" }
//     LOCATION missing/empty, or reduces to nothing once markup is
//     stripped (e.g. a LOCATION that was pure markup with no real text).
//     Caller's job: fall back to "Venue TBA" -- never the feed
//     organization's own name (see cron-feeds.js's own per-event
//     resolution wiring).
//   { status: "parsed", candidateName, candidateAddress, candidateCity,
//     candidateRegion, candidatePostal, candidateCountry }
//     The text matched one of the two recognized structured grammars
//     above. Caller's job: resolve the candidate against the canonical
//     venues table (see venue-lookup.js's resolveVenueFromCandidate) --
//     this module never touches the database itself.
//   { status: "unparseable", rawText }
//     Real, non-blank text that matched neither grammar. `rawText` is the
//     SANITIZED (HTML/entities stripped, whitespace collapsed) text --
//     never the untouched markup, and never invented structure. Caller's
//     job: preserve rawText as the event's own honest raw location signal
//     -- never "Venue TBA" (there WAS a real signal here) and never the
//     feed organization's name (that would misattribute a specific,
//     real-but-unparsed location to the feed's own umbrella org).

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(str) {
  return str.replace(/<[^>]*>/g, " ");
}

// Strips markup/entities but deliberately does NOT collapse internal
// whitespace runs -- CivicPlus's "clean" grammar (shape 2 above) uses
// exactly two-or-more consecutive spaces as its own address/city
// delimiter (there are no commas in that shape at all), so collapsing
// whitespace before the structured-grammar check would destroy the one
// signal that makes it parseable. Only the final "unparseable" fallback
// text (see collapseWhitespace below) collapses whitespace, for
// readability once no structure is being extracted from it.
function lightlyClean(raw) {
  return decodeHtmlEntities(stripHtmlTags(raw));
}

function collapseWhitespace(str) {
  return str.replace(/\s+/g, " ").trim();
}

// Requires a 2-letter region code as its confidence anchor (the one real
// fixture this was built against uses "ON") -- deliberately narrow, same
// "never guess" posture as every extractor elsewhere in this project; a
// feed spelling out a full region name falls through to "unparseable"
// (safe and honest) rather than this grammar mismatching it.
const TRIBE_LOCATION_RE =
  /^(.+?),\s*(.+?),\s*([^,]+),\s*([A-Za-z]{2}),\s*([A-Za-z0-9 -]+?)(?:,\s*(.+))?$/;

// Requires: <name> - <digit-led street> <2+ spaces> <city words> <2-letter
// state> <5-digit zip[-4]>. The double-space and the digit-led street are
// what make this confidently distinguishable from ordinary prose
// containing a stray " - ".
const CIVICPLUS_LOCATION_RE =
  /^(.+?)\s+-\s+(\d+[^,]*?)\s{2,}([A-Za-z .'-]+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;

function parseIcsLocation(raw) {
  if (typeof raw !== "string") return { status: "blank" };
  const cleaned = lightlyClean(raw).trim();
  if (!cleaned) return { status: "blank" };

  const tribe = TRIBE_LOCATION_RE.exec(cleaned);
  if (tribe) {
    return {
      status: "parsed",
      candidateName: tribe[1].trim(),
      candidateAddress: tribe[2].trim(),
      candidateCity: tribe[3].trim(),
      candidateRegion: tribe[4].trim(),
      candidatePostal: tribe[5].trim(),
      candidateCountry: tribe[6] ? tribe[6].trim() : null,
    };
  }

  const civicplus = CIVICPLUS_LOCATION_RE.exec(cleaned);
  if (civicplus) {
    return {
      status: "parsed",
      candidateName: civicplus[1].trim(),
      candidateAddress: civicplus[2].trim(),
      candidateCity: civicplus[3].trim(),
      candidateRegion: civicplus[4].trim(),
      candidatePostal: civicplus[5].trim(),
      candidateCountry: null,
    };
  }

  return { status: "unparseable", rawText: collapseWhitespace(cleaned) };
}

module.exports = { parseIcsLocation, decodeHtmlEntities, stripHtmlTags, collapseWhitespace };
