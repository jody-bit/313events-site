// test/ics-location.test.js
//
// Unit tests for api/_lib/ics-location.js's parseIcsLocation -- the
// per-VEVENT LOCATION parser added for the Phase 6 per-event
// venue-resolution shared infrastructure (2026-09-29). Pure function, no
// network/database, so these run directly against real fixture strings
// captured live from the actual feeds this was built to unblock.
//
// Run: node test/ics-location.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { parseIcsLocation } = require(`${REPO_DIR}/api/_lib/ics-location.js`);

function run() {
  // --- 1. Tribe/The Events Calendar grammar (real Windsor Symphony
  //     Orchestra LOCATION, captured live 2026-09-28) parses into a full
  //     structured candidate. ---
  {
    const result = parseIcsLocation(
      "The Capitol Theatre, 121 University Ave. W., Windsor, ON, N9A 5P4, Canada"
    );
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "The Capitol Theatre");
    assert.strictEqual(result.candidateAddress, "121 University Ave. W.");
    assert.strictEqual(result.candidateCity, "Windsor");
    assert.strictEqual(result.candidateRegion, "ON");
    assert.strictEqual(result.candidatePostal, "N9A 5P4");
    assert.strictEqual(result.candidateCountry, "Canada");
  }

  // --- 2. CivicPlus "clean" grammar (real Royal Oak Farmers Market
  //     LOCATION, captured live from romi.gov's own iCalendar export,
  //     2026-09-29) parses into a full structured candidate, including
  //     correctly using the double-space as the address/city delimiter
  //     (this shape has no commas at all). ---
  {
    const result = parseIcsLocation(
      "Royal Oak Farmers Market - 316 E 11 Mile Road  Royal Oak MI 48067"
    );
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Royal Oak Farmers Market");
    assert.strictEqual(result.candidateAddress, "316 E 11 Mile Road");
    assert.strictEqual(result.candidateCity, "Royal Oak");
    assert.strictEqual(result.candidateRegion, "MI");
    assert.strictEqual(result.candidatePostal, "48067");
    assert.strictEqual(result.candidateCountry, null);
  }

  // --- 3. THE REGRESSION FIXTURE: real Royal Oak "Downtown Events"
  //     LOCATION, captured live from romi.gov's own iCalendar export,
  //     2026-09-29 -- editor-entered free text with embedded raw HTML
  //     markup, not a structured venue string at all. Exact raw value
  //     (after cron-feeds.js's own ICS backslash-unescaping, which has
  //     already run by the time a caller has this string):
  //       "<p>Meet at Pronto/Five 15: 600 S Washington Ave, Royal Oak, MI
  //       48067</p> -   Royal Oak MI 48067"
  //     Before this change, a feed producing this LOCATION had no
  //     per-event resolution at all, so this text was simply never looked
  //     at. This test's whole point: prove the useful part of this real
  //     location text SURVIVES, sanitized, rather than being thrown away
  //     as "Venue TBA" (that would be a regression back to discarding real
  //     source information) or being force-parsed into an invented
  //     name/address/city split it never actually stated. ---
  {
    const raw =
      "<p>Meet at Pronto/Five 15: 600 S Washington Ave, Royal Oak, MI 48067</p> -   Royal Oak MI 48067";
    const result = parseIcsLocation(raw);
    assert.strictEqual(result.status, "unparseable");
    // The markup is gone...
    assert.ok(!result.rawText.includes("<p>"), "HTML tags must not survive into rawText");
    assert.ok(!result.rawText.includes("</p>"), "HTML tags must not survive into rawText");
    // ...but the actual useful location information a human wrote is
    // fully intact and readable, not discarded and not "Venue TBA":
    assert.strictEqual(
      result.rawText,
      "Meet at Pronto/Five 15: 600 S Washington Ave, Royal Oak, MI 48067 - Royal Oak MI 48067"
    );
    assert.notStrictEqual(result.rawText, "Venue TBA");
  }

  // --- 4. Blank/missing LOCATION is its own distinct outcome, never
  //     confused with "unparseable." ---
  {
    assert.strictEqual(parseIcsLocation("").status, "blank");
    assert.strictEqual(parseIcsLocation(null).status, "blank");
    assert.strictEqual(parseIcsLocation(undefined).status, "blank");
    // Pure markup with no real text inside also reduces to blank, not to
    // an empty "unparseable" string.
    assert.strictEqual(parseIcsLocation("<p></p>").status, "blank");
    assert.strictEqual(parseIcsLocation("   ").status, "blank");
  }

  // --- 5. HTML entities (a real CivicPlus category was seen using
  //     "&nbsp;" mid-string) are decoded, not left as literal markup, in
  //     both the parsed and unparseable paths. ---
  {
    const result = parseIcsLocation("Fifth Avenue Pedestrian Plaza &nbsp;(between 4th and 5th)");
    assert.strictEqual(result.status, "unparseable");
    assert.ok(!result.rawText.includes("&nbsp;"), "HTML entities must be decoded, not left literal");
  }

  // --- 6. Tribe grammar, region spelled out in full rather than
  //     abbreviated (real Downtown Windsor BIA LOCATION, captured live
  //     2026-09-30 -- root-cause fix for the "68 actionable Needs
  //     Follow-up, Auto-Repair fixed 0" investigation). The old regex
  //     required an exact 2-letter region code and fell through to
  //     "unparseable" for every event from this feed; name/address/city
  //     must still resolve correctly even though region/postal here are
  //     unusual (a full province name, and a postal code the source feed
  //     itself glued onto the city with no space). ---
  {
    const result = parseIcsLocation(
      "Windsor Public Library, 185 Ouellette Ave, Windsor, Ontario, WindN9A 5S8, Canada"
    );
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Windsor Public Library");
    assert.strictEqual(result.candidateAddress, "185 Ouellette Ave");
    assert.strictEqual(result.candidateCity, "Windsor");
  }

  // --- 7. Tribe grammar with NO region field at all (real Eastern Market
  //     Partnership LOCATION, captured live 2026-09-30 -- same root-cause
  //     fix): "<Venue>, <Street>, <City>, <Zip>, <Country>" -- four
  //     trailing fields, not five. Must still parse on the strength of the
  //     zip code alone as the confidence anchor. ---
  {
    const result = parseIcsLocation(
      "Cool Cities / Hope Village, 14150 Woodrow Wilson, Detroit, 48238, United States"
    );
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Cool Cities / Hope Village");
    assert.strictEqual(result.candidateAddress, "14150 Woodrow Wilson");
    assert.strictEqual(result.candidateCity, "Detroit");
    assert.strictEqual(result.candidateRegion, null);
    assert.strictEqual(result.candidatePostal, "48238");
    assert.strictEqual(result.candidateCountry, "United States");
  }

  // --- 8. Regression guard: ordinary 4+-clause prose with no postal/
  //     region-shaped trailing segment must still fall through to
  //     "unparseable" rather than being force-parsed now that the region
  //     anchor has been relaxed. ---
  {
    const result = parseIcsLocation(
      "Join us downtown, near the river, after the parade, before sunset"
    );
    assert.strictEqual(result.status, "unparseable");
  }

  // --- 9. CivicPlus "no street" grammar (Task 1, 2026-10-01 generalization
  //     pass): a legitimate room/plaza/facility name plus city/state/zip,
  //     with no street component at all. All three of these are real,
  //     currently-live production venue_name_raw values (Mount Clemens
  //     Public Library's three sub-feeds, City of Rochester), captured live
  //     2026-10-01 via direct production query, after the location_per_event
  //     config fix made their real per-event LOCATION text visible for the
  //     first time. The location/room name must be preserved and the
  //     verified city populated; no street address is invented. ---
  {
    const result = parseIcsLocation("Main Meeting Room - Mount Clemens MI 48043");
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Main Meeting Room");
    assert.strictEqual(result.candidateAddress, null);
    assert.strictEqual(result.candidateCity, "Mount Clemens");
    assert.strictEqual(result.candidateRegion, "MI");
    assert.strictEqual(result.candidatePostal, "48043");
  }
  {
    const result = parseIcsLocation("Downtown - Rochester MI 48307");
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Downtown");
    assert.strictEqual(result.candidateCity, "Rochester");
  }
  {
    // Real Mount Clemens value at 40 chars -- well under the 55-char name
    // cap, confirms the cap isn't so tight it rejects a real, slightly
    // longer legitimate facility name.
    const result = parseIcsLocation(
      "Meadows Assisted Living and Care Campus - Mount Clemens MI 48043"
    );
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Meadows Assisted Living and Care Campus");
    assert.strictEqual(result.candidateCity, "Mount Clemens");
  }
  {
    // Real Livonia value at 52 chars of name -- right up near the 55-char
    // cap boundary -- must still parse, not be rejected as "too long to be
    // a real name."
    const result = parseIcsLocation(
      "Larry Nehasil Park (Five Mile and Farmington Roads) - Livonia MI 48154"
    );
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Larry Nehasil Park (Five Mile and Farmington Roads)");
    assert.strictEqual(result.candidateCity, "Livonia");
  }
  {
    // Real Wyandotte value, 48 chars of name -- confirms a name containing
    // punctuation ("&", ".") and its own internal words still parses whole,
    // rather than only bare single-word room names.
    const result = parseIcsLocation(
      "Theatre Square 1st & Elm St. Downtown Wyandotte - Wyandotte MI 48192"
    );
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Theatre Square 1st & Elm St. Downtown Wyandotte");
    assert.strictEqual(result.candidateCity, "Wyandotte");
  }

  // --- 10. Regression guards for the "no street" grammar: the SAME feeds
  //     that produce the legitimate shapes above ALSO glue narrative prose
  //     and intersection/route descriptions onto the identical
  //     "<text> - <City> <ST> <Zip>" shape. These must never be force-parsed
  //     into an invented venue name or a mangled city -- all four are real,
  //     live production venue_name_raw values, captured 2026-10-01. ---
  {
    // Real City of Rochester value: a narrative sentence (66 chars before
    // the dash), past the 55-char name cap -- correctly left unparsed
    // rather than treated as a venue name.
    const result = parseIcsLocation(
      "Join us as we celebrate Founder's Day! More information to come! - Rochester MI 48307"
    );
    assert.strictEqual(result.status, "unparseable");
  }
  {
    // Real Canton Township value: "Canton Parks > Dog Park - Denton Rd and
    // North of Cherry Hill Rd Canton MI 48187" -- an intersection/route
    // description (45 chars) sits where the city would go. The 25-char
    // city cap correctly rejects this rather than mangling an intersection
    // description into a "city" field -- an honest gap for a
    // district/route event with no conventional address, not a parser
    // failure.
    const result = parseIcsLocation(
      "Canton Parks > Dog Park - Denton Rd and North of Cherry Hill Rd Canton MI 48187"
    );
    assert.strictEqual(result.status, "unparseable");
  }
  {
    // Real Northville value: a 233-char parade-route narrative glued onto
    // the same shape. Far past every length cap in both directions --
    // guards against a pathological narrative ever slipping through.
    const result = parseIcsLocation(
      "Parade steps off from the Northville School District office lot on Cady St at 6pm. The parade will proceed east on Cady to north on Wing, east on Dunlap to north on Center to west on 8 mile to enter the stadium. - Northville MI 48167"
    );
    assert.strictEqual(result.status, "unparseable");
  }
  {
    // Real Northville value containing TWO " - " delimiters ("Downtown
    // Northville - Witch themed shopping night is free and open to all...
    // - Northville MI 48167"). Confirms the grammar doesn't get confused by
    // an extra dash inside the narrative body and accidentally split on the
    // wrong one.
    const result = parseIcsLocation(
      "Downtown Northville - Witch themed shopping night is free and open to all. Shops and restaurants are open late with special sales and unique event themed offerings and games. - Northville MI 48167"
    );
    assert.strictEqual(result.status, "unparseable");
  }

  // --- 11. CivicPlus "empty name" grammar (Task 2, 2026-10-01
  //     generalization pass). All real, live production venue_name_raw
  //     values, captured 2026-10-01. ---
  {
    // (a) Real street address follows, no comma/double-space delimiter at
    //     all (confirmed by direct character-code inspection) -- street/
    //     city boundary located via the closed street-suffix vocabulary.
    const result = parseIcsLocation("- 39000 Van Born Road Canton MI 48188");
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, null);
    assert.strictEqual(result.candidateAddress, "39000 Van Born Road");
    assert.strictEqual(result.candidateCity, "Canton");
    assert.strictEqual(result.candidateRegion, "MI");
    assert.strictEqual(result.candidatePostal, "48188");
  }
  {
    const result = parseIcsLocation("- 12066 Merriman Road Livonia MI 48150");
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, null);
    assert.strictEqual(result.candidateAddress, "12066 Merriman Road");
    assert.strictEqual(result.candidateCity, "Livonia");
  }
  {
    // (b) No street at all -- unambiguous, city-only.
    const result = parseIcsLocation("- Livonia MI 48154");
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, null);
    assert.strictEqual(result.candidateAddress, null);
    assert.strictEqual(result.candidateCity, "Livonia");
  }
  {
    const result = parseIcsLocation("- St. Clair Shores MI 48081");
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateCity, "St. Clair Shores");
  }

  // --- 12. Regression guards for the "empty name" grammar: real production
  //     values that deliberately do NOT satisfy either empty-name sub-shape
  //     and must be left unparsed rather than guessed at. ---
  {
    // Real Wyandotte value: "- Wyandotte Museums 2610 Biddle Ave Wyandotte
    // MI 48192" -- text immediately after the dash is NOT digit-led (it's
    // "Wyandotte Museums", a venue name that got glued on rather than left
    // blank), so the street-address sub-shape's digit anchor correctly
    // never fires, and the no-street sub-shape's pure-letters character
    // class can't match the embedded "2610" either. A genuinely ambiguous
    // "name + street + city" string with the name wrongly positioned after
    // the dash instead of before it -- left unparsed, intentionally, rather
    // than guessed.
    const result = parseIcsLocation(
      "- Wyandotte Museums 2610 Biddle Ave Wyandotte MI 48192"
    );
    assert.strictEqual(result.status, "unparseable");
  }
  {
    // Real Wyandotte value, same shape: "- Wayne County Community College
    // 21000 Northline Rd. Taylor MI 48180".
    const result = parseIcsLocation(
      "- Wayne County Community College 21000 Northline Rd. Taylor MI 48180"
    );
    assert.strictEqual(result.status, "unparseable");
  }
  {
    // Real St. Clair Shores value: a route description ("Downtown St.
    // Clair Shores on Greater Mack Ave., from 9 Mile to 9 Mack/Cavalier
    // Drive.") containing its own internal comma, glued onto the
    // city/state/zip shape. Exercises both grammars at once: the embedded
    // comma means tryTribeGrammar sees too few segments to anchor on, and
    // the 113-char prefix is far past the no-street name cap too -- must
    // still fall all the way through to unparseable, not a partial/wrong
    // parse.
    const result = parseIcsLocation(
      "Downtown St. Clair Shores on Greater Mack Ave., from 9 Mile to 9 Mack/Cavalier Drive. - St. Clair Shores MI 48081"
    );
    assert.strictEqual(result.status, "unparseable");
  }
  {
    // Real Livonia value: a 213-char narrative with NO trailing zip code at
    // all (ends in "...Plymouth MI", not "...Plymouth MI 48170") --
    // confirms the grammar correctly requires a real zip, not just a
    // trailing 2-letter state code, before accepting a split.
    const result = parseIcsLocation(
      "Fall Bug Hunt Saturday, October 10, 2026 10 a.m. &ndash; 4 p.m. Meet at the Plymouth Arts and Recreation Center, 650 Church St. Plymouth, MI - Meet at the Plymouth Arts and Recreation 650 Church Street Plymouth MI"
    );
    assert.strictEqual(result.status, "unparseable");
  }

  // --- 13. Tribe grammar, full-region-name anchor with ZERO postal-shaped
  //     segment anywhere (Task 3, 2026-10-01 generalization pass). Real,
  //     live Windsor Symphony Orchestra venue_name_raw, captured 2026-10-01:
  //     "Parking Garage at Pelissier St. and Park St., Pelissier St. and
  //     Park St., Windsor, Ontario, Canada" -- no postal code at all, unlike
  //     the Downtown Windsor BIA case test #6 already covers (which does
  //     have one alongside its spelled-out region). What matters downstream
  //     is name/address/city (see cron-feeds.js's resolveIcsEventVenue,
  //     which never reads region/postal/country past this module) -- those
  //     three must resolve correctly even though this string's trailing
  //     "Ontario, Canada" has no postal anchor. ---
  {
    const result = parseIcsLocation(
      "Parking Garage at Pelissier St. and Park St., Pelissier St. and Park St., Windsor, Ontario, Canada"
    );
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Parking Garage at Pelissier St. and Park St.");
    assert.strictEqual(result.candidateAddress, "Pelissier St. and Park St.");
    assert.strictEqual(result.candidateCity, "Windsor");
  }

  // --- 14. Pre-existing CivicPlus "clean" (Task-adjacent) regression guard:
  //     a real, legitimate no-street-component name/city string (real City
  //     of Canton Township value) must not be swallowed by any of the new
  //     grammars' edge cases. ---
  {
    const result = parseIcsLocation("Your Home - Canton MI 48188");
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Your Home");
    assert.strictEqual(result.candidateCity, "Canton");
  }

  console.log("ics-location.test.js: all assertions passed");
}

run();
