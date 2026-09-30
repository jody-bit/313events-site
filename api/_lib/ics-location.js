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

// 2026-09-30 root-cause fix (self-healing/enrichment pivot -- see
// NEEDS_FOLLOWUP_ROOT_CAUSE.md): the original TRIBE_LOCATION_RE anchored
// its confidence entirely on a strict 2-letter region code as the 4th
// comma-separated segment. That anchor is real (Windsor Symphony
// Orchestra's own feed does use "ON"), but two OTHER live, currently-
// registered Tribe/Events-Calendar feeds use the exact same "Venue,
// Street, City, ...[, Country]" grammar with a region field shaped
// differently, confirmed against real production LOCATION values:
//   - Downtown Windsor BIA: spells the region out in full ("Ontario"),
//     never abbreviates it.
//   - Eastern Market Partnership: omits the region token ENTIRELY --
//     "<Venue>, <Street>, <City>, <Zip>, <Country>", four trailing fields
//     worth of structure, not five.
// Same grammar family, not a new/different shape -- fixed by relaxing how
// the region/postal/country tail is recognized, not by adding a second
// regex. Confirmed downstream (resolveIcsEventVenue in cron-feeds.js):
// region/postal/country are NEVER used past this module -- only
// candidateName/candidateAddress/candidateCity ever reach canonical venue
// resolution or the venue_address_raw/venue_city_raw columns -- so
// getting those three right is what actually matters; region/postal/
// country are kept only because callers/tests already read them.
//
// New confidence anchor, replacing "region must be exactly 2 letters": at
// least one trailing (post-city) segment must look like a real postal/zip
// code (US 5-digit, or Canadian letter-digit-letter[ ]digit-letter-digit)
// OR a bare 2-letter region code. Requiring name + street + city PLUS a
// postal-shaped or region-shaped trailing token is at least as strong a
// signal of genuine structured venue data as the old check -- still a
// closed, specific pattern, never a guess.
const US_ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;
// Deliberately no leading \b -- a real Downtown Windsor BIA LOCATION
// glues the city name directly onto the postal code with no space
// ("WindN9A 5S8", i.e. the source feed's own "Windsor" + "N9A 5S8" with
// the space dropped), which would never satisfy a leading word boundary.
// The pattern itself (letter-digit-letter, optional space,
// digit-letter-digit) is specific enough not to false-positive on
// ordinary prose even without a boundary anchor.
const CA_POSTAL_RE = /[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d/;
const REGION_CODE_RE = /^[A-Za-z]{2}$/;

function looksLikePostal(segment) {
  return US_ZIP_RE.test(segment) || CA_POSTAL_RE.test(segment);
}

// Best-effort split of whatever trails name/street/city into
// region/postal/country. Never fails the overall parse on its own -- by
// the time this runs, the anchor in tryTribeGrammar has already confirmed
// real structure is present; this only decides which trailing field is
// which, and downstream code never depends on getting that exactly right
// (see header comment above).
function classifyTrailingSegments(rest) {
  if (rest.length >= 3) {
    // Original, most common shape: region, postal, country in that order
    // (e.g. "ON, N9A 5P4, Canada") -- same field assignment as the
    // original regex.
    return { region: rest[0], postal: rest[1], country: rest[rest.length - 1] };
  }
  if (rest.length === 2) {
    const [a, b] = rest;
    if (looksLikePostal(a) && !looksLikePostal(b)) return { region: null, postal: a, country: b };
    if (looksLikePostal(b) && !looksLikePostal(a)) return { region: a, postal: b, country: null };
    return { region: a, postal: b, country: null };
  }
  if (rest.length === 1) {
    return looksLikePostal(rest[0])
      ? { region: null, postal: rest[0], country: null }
      : { region: rest[0], postal: null, country: null };
  }
  return { region: null, postal: null, country: null };
}

// Positional split, not a single greedy regex -- lets name/street/city
// stay simple, required, non-empty fields regardless of how many (if any)
// trailing region/postal/country fields follow, and however they're
// spelled.
function tryTribeGrammar(cleaned) {
  const segments = cleaned.split(",").map((s) => s.trim());
  if (segments.length < 4) return null; // need name, street, city, + at least one trailing field to anchor on
  const [name, address, city, ...rest] = segments;
  if (!name || !address || !city) return null;
  const trailing = rest.filter((s) => s.length > 0);
  if (!trailing.length) return null;
  const hasAnchor = trailing.some((s) => looksLikePostal(s) || REGION_CODE_RE.test(s));
  if (!hasAnchor) return null; // real structure unconfirmed -- fall through to unparseable, never guess
  const { region, postal, country } = classifyTrailingSegments(trailing);
  return {
    status: "parsed",
    candidateName: name,
    candidateAddress: address,
    candidateCity: city,
    candidateRegion: region,
    candidatePostal: postal,
    candidateCountry: country,
  };
}

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

  const tribe = tryTribeGrammar(cleaned);
  if (tribe) return tribe;

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
