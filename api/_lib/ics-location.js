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
//     2026-10-04 (BUG-012): an "unparseable" result may ALSO carry
//     trailingCity (and trailingAddress / trailingRegion / trailingPostal)
//     when the text ends in a recognizable "<City> <ST> <ZIP>" tail --
//     see findTrailingCity below. The status stays "unparseable" on
//     purpose: the text is still not decomposed into a venue NAME, and
//     rawText is still what a caller stores as the honest raw location.
//     The city is simply no longer thrown away with it.
//
// 2026-10-04 (BUG-012): a LOCATION that is only an empty marker ("-",
// "--", an en dash) or only a region ("MI", "ON", "Ontario") states no
// location at all and is "blank", never a venue.

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

// 2026-10-01 (parser generalization pass, following the location_per_event
// config-repair measurement): a recognized FULL region name is its own
// valid anchor too, even with ZERO postal-shaped segment anywhere in the
// trailing fields. Confirmed real, 2026-10-01 production pull: Windsor
// Symphony Orchestra's own LOCATION ("...Windsor, Ontario, Canada") has no
// postal code at all, unlike the Downtown Windsor BIA case the 2026-09-30
// fix already covered (which DID have one alongside its spelled-out
// region). Same grammar family, one more recognized anchor shape -- a
// closed, explicit vocabulary (this project's own documented service area,
// SERVICE_AREA.md: MI, OH, ON), never a guess at an unrecognized word, and
// this alone does NOT loosen the grammar into accepting an arbitrary
// unanchored comma-separated string -- the pre-existing regression guard
// (test #8, ordinary 4+-clause prose with no postal/region-shaped segment)
// still correctly falls through to unparseable.
const FULL_REGION_NAMES = new Set(["ontario", "michigan", "ohio"]);

function looksLikePostal(segment) {
  return US_ZIP_RE.test(segment) || CA_POSTAL_RE.test(segment);
}

function looksLikeFullRegionName(segment) {
  return FULL_REGION_NAMES.has(String(segment).trim().toLowerCase());
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

  // 2026-10-01 (parser generalization pass, Downtown Windsor BIA): a real,
  // confirmed, EXACTLY-3-segment shape -- "<Venue>, <Street>, <City>" with
  // no trailing region/postal/country field at all, e.g. "Vito's on
  // Ouellette, 375 Ouellette Ave, Windsor". The usual 4+-segment anchor
  // (a postal/region/full-region-name trailing field) can never apply
  // here since there IS no trailing field -- so this variant anchors on
  // the address segment itself instead: a DIGIT-LED second segment is as
  // strong a structural signal of "this really is street, not more prose"
  // as a zip code is for the 4+-segment shape. Confirmed against the full
  // current production candidate pool (2026-10-01): exactly one real
  // string matches this exact shape (segments.length===3 AND a digit-led
  // 2nd segment) across every currently-unresolved event on the site --
  // no false positives found, so this stays narrow (digit-led only, never
  // a bare word) rather than accepting any 3-segment string.
  if (segments.length === 3) {
    const [name3, address3, city3] = segments;
    if (name3 && address3 && city3 && /^\d/.test(address3)) {
      return {
        status: "parsed",
        candidateName: name3,
        candidateAddress: address3,
        candidateCity: city3,
        candidateRegion: null,
        candidatePostal: null,
        candidateCountry: null,
      };
    }
    return null;
  }

  if (segments.length < 4) return null; // need name, street, city, + at least one trailing field to anchor on
  const [name, address, city, ...rest] = segments;
  if (!name || !address || !city) return null;
  const trailing = rest.filter((s) => s.length > 0);
  if (!trailing.length) return null;
  const hasAnchor = trailing.some((s) => looksLikePostal(s) || REGION_CODE_RE.test(s) || looksLikeFullRegionName(s));
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

// 2026-10-01 (parser generalization pass, following the location_per_event
// config-repair measurement -- see NEEDS_FOLLOWUP_ROOT_CAUSE.md's follow-up
// analysis for the full investigation). Three more real, confirmed
// CivicPlus-family shapes, found only after several municipal feeds'
// location_per_event flag was corrected and their real per-event LOCATION
// text became visible for the first time:
//
//   Task 1 -- NO STREET component at all: "<name> - <City> <ST> <Zip>",
//   e.g. "Main Meeting Room - Mount Clemens MI 48043", "Downtown -
//   Rochester MI 48307". Real room/plaza/park names, not a guess -- but
//   the SAME trailing "- <words> <ST> <Zip>" shape is also used by a
//   handful of these feeds to glue a full narrative sentence onto a
//   city/state/zip (e.g. a parade-route description), which this module
//   must never mistake for a venue name. Confirmed from the actual
//   2026-10-01 production distribution:
//     - every real room/plaza/park name is <= 51 chars ("Larry Nehasil
//       Park (Five Mile and Farmington Roads)" is the longest confirmed
//       real one)
//     - every real narrative string wrongly glued onto this same shape
//       starts at 64 chars and runs past 200
//   The 55-char cap on the name group sits in that real, confirmed gap --
//   it is the confidence anchor for this grammar, not an arbitrary number.
//   The city group is separately capped at 25 chars (every real Orbit city
//   name is well under that -- "St. Clair Shores" is the longest at 16);
//   this specifically rejects a route/intersection description that would
//   otherwise satisfy the same bare letters-and-spaces character class
//   (e.g. "Denton Rd and North of Cherry Hill Rd Canton", 45 chars) --
//   left unparsed, honest gap preserved, exactly the posture this
//   project's "never guess" convention requires for a route/intersection
//   event with no conventional address.
const CIVICPLUS_NO_STREET_RE =
  /^(.{1,55}?)\s+-\s+([A-Za-z .'-]{1,25}?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;

//   Task 2 -- EMPTY NAME variant of the two CivicPlus shapes above: the
//   venue-name field before the dash is blank. Two confirmed real
//   sub-shapes, both real production LOCATION values, 2026-10-01:
//     (a) a real street address still follows, e.g. "- 12066 Merriman Road
//         Livonia MI 48150", "- 39000 Van Born Road Canton MI 48188".
//         These have no comma and no double-space delimiter anywhere
//         (confirmed by direct character-code inspection, not assumed) --
//         CIVICPLUS_LOCATION_RE's own street/city delimiter never applies
//         here. The street/city boundary is instead located with a
//         closed, standard street-type-suffix vocabulary (the same kind of
//         fixed, universal English addressing convention as a 2-letter
//         state code or a 5-digit zip, never a venue guess): the street is
//         everything up to and including the first recognized suffix
//         word, the city is whatever remains before the state/zip. Falls
//         through to unparseable (never guessed) when no recognized
//         suffix word is found, or when what's left over doesn't look
//         like a real city (the same 25-char cap as Task 1, for the same
//         reason).
//     (b) no street at all, e.g. "- Livonia MI 48154", "- St. Clair Shores
//         MI 48081" -- unambiguous, nothing to split, city-only.
//   candidateName is null in both -- there is no name to report, and
//   resolveIcsEventVenue (cron-feeds.js) is the one place that turns a
//   null name into the project's own existing "Venue TBA" convention
//   (never invented here).
const STREET_SUFFIX_RE =
  /\b(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Lane|Ln|Court|Ct|Circle|Cir|Way|Highway|Hwy|Parkway|Pkwy|Place|Pl|Terrace|Ter)\b\.?/;
const CIVICPLUS_EMPTY_NAME_WITH_STREET_OUTER_RE =
  /^-\s*(\d+.*?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;
const CIVICPLUS_EMPTY_NAME_NO_STREET_RE =
  /^-\s*([A-Za-z .'-]{1,25}?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;

function tryCivicplusEmptyNameWithStreet(cleaned) {
  const outer = CIVICPLUS_EMPTY_NAME_WITH_STREET_OUTER_RE.exec(cleaned);
  if (!outer) return null;
  const blob = outer[1]; // e.g. "39000 Van Born Road Canton" -- street + city, no delimiter between them
  const region = outer[2];
  const postal = outer[3];
  const suffixMatch = STREET_SUFFIX_RE.exec(blob);
  if (!suffixMatch) return null; // no recognized street-type word -- can't safely locate the boundary, leave unparsed
  const splitAt = suffixMatch.index + suffixMatch[0].length;
  const address = blob.slice(0, splitAt).trim();
  const city = blob.slice(splitAt).trim();
  if (!address || !city || city.length > 25) return null;
  return {
    status: "parsed",
    candidateName: null,
    candidateAddress: address,
    candidateCity: city,
    candidateRegion: region,
    candidatePostal: postal,
    candidateCountry: null,
  };
}

// ---- 2026-10-04 (BUG-012): empty markers, and the city in a trailing
// "<City> <ST> <ZIP>" ------------------------------------------------------
//
// Measured in production on 2026-10-04: 28 of the 55 events in Admin's
// Needs follow-up queue were feed events whose location text was stored
// whole as the venue name with no city, so they could not be placed and a
// person was asked to fix each one. Two causes, both in how this module
// read text that carried no ambiguity about the CITY:
//
//   1. 17 events had a LOCATION of "-" (City of Madison Heights), 1 of
//      "MI" and 1 of "ON". Those say nothing; they were stored as venues.
//   2. 9 events ended in the municipal calendar's own "<City> <ST> <ZIP>"
//      tail after text the grammars above rightly refuse to turn into a
//      venue name -- a sentence, a route, a name glued to a street:
//        "Join us as we celebrate Founder's Day! ... - Rochester MI 48307"
//        "Fifth Street Plaza - Fifth and Washington Ave. Royal Oak MI 48067"
//        "- Wayne County Community College 21000 Northline Rd. Taylor MI 48180"
//        "Canton Parks > Dog Park - Denton Rd and North of Cherry Hill Rd Canton MI 48187"
//      Refusing to guess the NAME is still right. Discarding the city with
//      it was not: the city is stated, in a fixed position, by the source.
//
// findTrailingCity() reads only that tail. It never produces a venue name.
// It reports a city when, and only when, one of two closed anchors holds:
//   (a) the text after the last " - " (or the whole text) is nothing but a
//       city -- one to four capitalised words, at most 25 characters -- in
//       front of the state and ZIP; or
//   (b) a standard street-type word (Rd, St, Ave, ...) ends the street and
//       what follows it is nothing but such a city.
// A street address is reported only when it is a plain "<number> <words>
// <street type>" run immediately before the city. With no ZIP at all, the
// state must be MI or OH and a numbered street must be present, so prose
// that merely ends in two capital letters is never read as a place.
const EMPTY_MARKER_RE = /^[^A-Za-z0-9]*$/;
const REGION_ONLY_NAMES = new Set(["mi", "on", "oh", "michigan", "ontario", "ohio"]);
const REGION_ONLY_SHAPE_RE = /^[A-Za-z]+\.?$/; // one bare word: "MI", "ON", "Ontario" -- never "Mi Casa"
const TAIL_STATE_ZIP_RE = /^(.*\S)\s+(MI|OH)\s+(\d{5}(?:-\d{4})?)$/;
const TAIL_STATE_ONLY_RE = /^(.*\S)\s+(MI|OH)$/;
const CITY_SHAPE_RE = /^[A-Z][A-Za-z.'-]*(?: [A-Z][A-Za-z.'-]*){0,3}$/;
const TRAILING_CITY_MAX = 25;
const STREET_SUFFIX_GLOBAL_RE = new RegExp(STREET_SUFFIX_RE.source, "g");
// "St." is a street type and also "Saint". The service area's only such
// cities are St. Clair and St. Clair Shores (SERVICE_AREA.md).
const SAINT_CITY_RE = /(?:^|\s)(St\.? Clair(?: Shores)?)$/;
const PLAIN_ADDRESS_RE = /^\d+[A-Za-z]?(?: [A-Za-z0-9.'-]+){1,6}$/;

function isEmptyMarker(cleaned) {
  if (EMPTY_MARKER_RE.test(cleaned)) return true;
  return REGION_ONLY_SHAPE_RE.test(cleaned) && REGION_ONLY_NAMES.has(cleaned.replace(/\.$/, "").toLowerCase());
}

function looksLikeCity(text) {
  return !!text && text.length <= TRAILING_CITY_MAX && CITY_SHAPE_RE.test(text);
}

// The plain "<number> <words> <street type>" run that ends `streetPart`, or
// null. Takes the LAST number in the text, so a date or a time earlier in a
// sentence is never mistaken for a house number.
function plainAddressAtEnd(streetPart) {
  let lastStart = -1;
  const re = /(?:^|\s)(\d+[A-Za-z]?)(?=\s)/g;
  let m;
  while ((m = re.exec(streetPart)) !== null) lastStart = m.index + m[0].length - m[1].length;
  if (lastStart < 0) return null;
  const candidate = streetPart.slice(lastStart).trim();
  return PLAIN_ADDRESS_RE.test(candidate) ? candidate : null;
}

function findTrailingCity(cleanedRaw) {
  const cleaned = collapseWhitespace(String(cleanedRaw || ""));
  let head, region, postal;
  const withZip = TAIL_STATE_ZIP_RE.exec(cleaned);
  if (withZip) {
    [, head, region, postal] = withZip;
  } else {
    const stateOnly = TAIL_STATE_ONLY_RE.exec(cleaned);
    if (!stateOnly) return null;
    [, head, region] = stateOnly;
    postal = null;
  }
  const streetRequired = postal === null;

  const dashAt = head.lastIndexOf(" - ");
  let segment = dashAt >= 0 ? head.slice(dashAt + 3) : head;
  segment = segment.replace(/^-\s*/, "").trim();
  if (!segment) return null;

  // (a) nothing but a city in front of the state and ZIP.
  if (!streetRequired && looksLikeCity(segment)) {
    return { trailingCity: segment, trailingAddress: null, trailingRegion: region, trailingPostal: postal };
  }

  // (b) a street-type word, then nothing but a city.
  let city = null;
  let streetPart = null;
  const saint = SAINT_CITY_RE.exec(segment);
  if (saint) {
    const before = segment.slice(0, saint.index).trim();
    if (!before || !new RegExp(STREET_SUFFIX_RE.source + "[\\s,.]*$").test(before)) return null;
    city = saint[1];
    streetPart = before;
  } else {
    const ends = [];
    STREET_SUFFIX_GLOBAL_RE.lastIndex = 0;
    let m;
    while ((m = STREET_SUFFIX_GLOBAL_RE.exec(segment)) !== null) ends.push(m.index + m[0].length);
    for (let i = ends.length - 1; i >= 0 && !city; i--) {
      const rest = segment.slice(ends[i]).replace(/^[\s,.]+/, "").trim();
      if (looksLikeCity(rest)) {
        city = rest;
        streetPart = segment.slice(0, ends[i]).trim();
      }
    }
  }
  if (!city) return null;

  const address = plainAddressAtEnd(streetPart);
  if (streetRequired && !address) return null;
  return { trailingCity: city, trailingAddress: address, trailingRegion: region, trailingPostal: postal };
}

function parseIcsLocation(raw) {
  if (typeof raw !== "string") return { status: "blank" };
  const cleaned = lightlyClean(raw).trim();
  if (!cleaned) return { status: "blank" };
  if (isEmptyMarker(cleaned)) return { status: "blank" }; // "-", "MI", "ON": no location stated (BUG-012)

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

  // 2026-10-01 generalizations -- see the header comments on each pattern
  // above for the full evidence behind every bound used here. Order
  // matters: the no-street (named) variant is tried before the empty-name
  // variants so a real name is never discarded in favor of a null one.
  const noStreet = CIVICPLUS_NO_STREET_RE.exec(cleaned);
  if (noStreet) {
    return {
      status: "parsed",
      candidateName: noStreet[1].trim(),
      candidateAddress: null,
      candidateCity: noStreet[2].trim(),
      candidateRegion: noStreet[3].trim(),
      candidatePostal: noStreet[4].trim(),
      candidateCountry: null,
    };
  }

  const emptyNameWithStreet = tryCivicplusEmptyNameWithStreet(cleaned);
  if (emptyNameWithStreet) return emptyNameWithStreet;

  const emptyNameNoStreet = CIVICPLUS_EMPTY_NAME_NO_STREET_RE.exec(cleaned);
  if (emptyNameNoStreet) {
    return {
      status: "parsed",
      candidateName: null,
      candidateAddress: null,
      candidateCity: emptyNameNoStreet[1].trim(),
      candidateRegion: emptyNameNoStreet[2].trim(),
      candidatePostal: emptyNameNoStreet[3].trim(),
      candidateCountry: null,
    };
  }

  // BUG-012: still not decomposable into a venue name -- but when the text
  // ends in the source's own "<City> <ST> <ZIP>", the city is kept.
  const trailing = findTrailingCity(cleaned);
  return Object.assign({ status: "unparseable", rawText: collapseWhitespace(cleaned) }, trailing || {});
}

module.exports = { parseIcsLocation, decodeHtmlEntities, stripHtmlTags, collapseWhitespace, findTrailingCity };
