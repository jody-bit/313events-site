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

  // --- 15. Tribe grammar, exactly-3-segment variant with NO trailing
  //     region/postal/country field at all (2026-10-01 generalization
  //     pass, Downtown Windsor BIA). Real, live venue_name_raw, captured
  //     2026-10-01: "Vito's on Ouellette, 375 Ouellette Ave, Windsor" --
  //     anchored on the digit-led address segment itself rather than a
  //     trailing postal/region field, since there isn't one. ---
  {
    const result = parseIcsLocation("Vito’s on Ouellette, 375 Ouellette Ave, Windsor");
    assert.strictEqual(result.status, "parsed");
    assert.strictEqual(result.candidateName, "Vito’s on Ouellette");
    assert.strictEqual(result.candidateAddress, "375 Ouellette Ave");
    assert.strictEqual(result.candidateCity, "Windsor");
    assert.strictEqual(result.candidateRegion, null);
    assert.strictEqual(result.candidatePostal, null);
  }

  // --- 16. Regression guard: a 3-segment string whose middle segment is
  //     NOT digit-led (ordinary prose, no real street-address signal) must
  //     still fall through to unparseable, exactly as before this
  //     generalization -- the new variant only fires on a genuine
  //     digit-led address, never a bare 3-comma string. ---
  {
    const result = parseIcsLocation("Some Place, Near the river, Detroit");
    assert.strictEqual(result.status, "unparseable");
  }

  // --- 17. BUG-012 (2026-10-04): a LOCATION with no letter or digit in it
  //     states no location. Real production value: 17 upcoming City of
  //     Madison Heights events were stored with a venue of "-". ---
  {
    for (const marker of ["-", "--", " - ", "–", "—", ".", "...", "- -"]) {
      assert.strictEqual(parseIcsLocation(marker).status, "blank", `${JSON.stringify(marker)} states no location`);
    }
    // A bare region is NOT turned into the placeholder: it is left as the
    // text it is (one "MI" and one "ON" were in production that day). Nor is
    // any real word.
    for (const real of ["MI", "ON", "OH", "Michigan", "Ontario", "Mi Casa", "On Stage", "ON TAP", "Ohio Theatre", "M1 Concourse", "Oh!", "On", "TBD", "N/A"]) {
      const result = parseIcsLocation(real);
      assert.strictEqual(result.status, "unparseable", `${JSON.stringify(real)} is kept as text`);
      assert.strictEqual(result.rawText, real);
    }
    // A location written in another script is text, not an empty marker
    // (independent review, 2026-10-04: an ASCII-only test discarded these).
    for (const real of ["المركز الإسلامي", "Дом культуры", "底特律美術館"]) {
      const result = parseIcsLocation(real);
      assert.strictEqual(result.status, "unparseable", "non-Latin text is kept as the raw location");
      assert.strictEqual(result.rawText, real);
    }
  }

  // --- 18. BUG-012: text that still cannot be split into a venue NAME keeps
  //     the CITY from its own trailing "<known city> MI <ZIP>". The status
  //     stays "unparseable" and rawText is unchanged -- sections 4, 10, 11
  //     and 12 above still hold for these very strings -- and no venue name
  //     and no street address is produced. Every string in the first group
  //     is a real production venue_name_raw, captured 2026-10-01 or
  //     2026-10-04. ---
  {
    const real = [
      ["Join us as we celebrate Founder's Day! More information to come! - Rochester MI 48307", "Rochester"],
      ["Less scary Trick-or-Treating at Downtown businesses and vendors. Rain or shine! - Northville MI 48167", "Northville"],
      ["Downtown Northville - Witch themed shopping night is free and open to all. Shops and restaurants are open late with special sales and unique event themed offerings and games. - Northville MI 48167", "Northville"],
      ["Public alley west of Main Street, off Crane Avenue, one block south of Catalpa Drive. - Royal Oak MI 48067", "Royal Oak"],
      ["<p>Meet at Pronto/Five 15: 600 S Washington Ave, Royal Oak, MI 48067</p> -   Royal Oak MI 48067", "Royal Oak"],
      ["Downtown St. Clair Shores on Greater Mack Ave., from 9 Mile to 9 Mack/Cavalier Drive. - St. Clair Shores MI 48081", "St. Clair Shores"],
      ["Parade steps off from the Northville School District office lot on Cady St at 6pm. The parade will proceed east on Cady to north on Wing, east on Dunlap to north on Center to west on 8 mile to enter the stadium. - Northville MI 48167", "Northville"],
      ["Macomb Township offices closed in observance of the Thanksgiving holiday. This includes the Department of Public Works and Parks & Recreation offices. The Recreation Center may observe adjusted hours. - Macomb MI 48042", "Macomb"],
      ["Fifth Street Plaza - Fifth and Washington Ave. Royal Oak MI 48067", "Royal Oak"],
      ["Canton Parks > Dog Park - Denton Rd and North of Cherry Hill Rd Canton MI 48187", "Canton"],
      ["- Wayne County Community College 21000 Northline Rd. Taylor MI 48180", "Taylor"],
      ["- Wyandotte Museums 2610 Biddle Ave Wyandotte MI 48192", "Wyandotte"],
    ];
    // The same rule on the shapes two independent reviews used against it:
    // the city is the LISTED name, whatever stands in front of it.
    const constructed = [
      ["- Stage Nature Center 6685 Coolidge Hwy Lower Level Troy MI 48098", "Troy"], // not "Lower Level Troy"
      ["- Macomb Center 44575 Garfield Rd Bldg B Clinton Township MI 48038", "Clinton Township"], // not "Bldg B Clinton Township"
      ["- City Hall 211 Williams St Suite A Royal Oak MI 48067", "Royal Oak"], // not "Suite A Royal Oak"
      ["Bus departs from the Macomb County Court House Mount Clemens MI 48043", "Mount Clemens"], // not "House Mount Clemens"
      ["Flu shots with Dr. Patel Royal Oak MI 48067", "Royal Oak"], // not "Patel Royal Oak"
      ["Shopping trip: Somerset Collection and Lane Bryant Troy MI 48084", "Troy"], // not "Bryant Troy"
      ["Movie night at the Ford Drive In Dearborn MI 48126", "Dearborn"], // not "In Dearborn"
      ["Downtown Royal Oak MI 48067", "Royal Oak"],
      ["From 1 to 3 pm on Main St Royal Oak MI 48067", "Royal Oak"], // "St" in front of a city is a street type
      ["Veterans Park 123 Jefferson Ave St. Clair Shores MI 48080", "St. Clair Shores"],
      ["Troy Community Center, Troy, MI 48084", "Troy"], // a comma before the state
      ["- Royal Oak, MI 48067", "Royal Oak"],
      ["Depot Park — Clarkston MI 48346", "Clarkston"],
      ["Village of Grosse Pointe Shores MI 48236", "Grosse Pointe Shores"],
      ["Stony Creek Metropark, Lake Orion MI 48362", "Lake Orion"], // the longer listed name, not a refusal
      ["Wharton Center 750 E Shaw Ln East Lansing MI 48824", "East Lansing"], // the longest listed name wins: not Lansing, and not refused for "East"
      ["ROYAL OAK FARMERS MARKET 316 E 11 MILE ROAD ROYAL OAK MI 48067", "Royal Oak"], // the list's spelling is returned
      ["Stroh Center 1535 E Wooster St Bowling Green OH 43403", "Bowling Green"],
    ];
    for (const [raw, city] of [...real, ...constructed]) {
      const result = parseIcsLocation(raw);
      assert.strictEqual(result.status, "unparseable", `no venue name is split out of: ${raw.slice(0, 60)}`);
      assert.ok(result.rawText && !("candidateName" in result), "the raw text is kept; no name is produced");
      assert.strictEqual(result.trailingCity, city, `city of: ${raw.slice(0, 70)}`);
      assert.ok(!("trailingAddress" in result), "no street address is ever recovered from free text");
    }
  }

  // --- 19. BUG-012 regression guards: no city is read where one is not
  //     certain. Each group is a class of wrong value an earlier form of the
  //     rule produced. ---
  {
    const noCity = [
      // nothing place-like at the end
      "Fifth Avenue Pedestrian Plaza &nbsp;(between 4th and 5th)",
      "Join us downtown, near the river, after the parade, before sunset",
      "Some Place, Near the river, Detroit",
      "We meet at the corner near the big tree MI 48067",
      "Take I-75 north and exit at Big Beaver Rd then turn left MI 48084",
      "Some long prose that says nothing useful about where this is - Not Applicable MI 48067",
      "A long name for a place that really does go on for quite a while - Memorial Park MI 48067",
      "Rummage sale in the basement of St. Mary's Church MI 48067",
      // no ZIP: never enough, whatever else is there
      "Come and say HI",
      "Detroit MI",
      "Go Blue MI",
      "Fifth and Washington Ave. Royal Oak MI",
      "Bus leaves at 9 from 211 Williams St Royal Oak MI",
      "Fall Bug Hunt Saturday, October 10, 2026 10 a.m. &ndash; 4 p.m. Meet at the Plymouth Arts and Recreation Center, 650 Church St. Plymouth, MI - Meet at the Plymouth Arts and Recreation 650 Church Street Plymouth MI",
      // a state this rule does not accept, and stated places it cannot read
      "Doors open at seven and tickets are ten dollars at the door for everyone - Royal Oak ON 48067",
      "Caesars Windsor, Windsor ON",
      "Cedar Point, Sandusky, Ohio",
      "Mackinac Island",
      "Online",
      "Zoom (link sent after registration)",
      // the list is per state: an Ohio city that shares a Michigan city's name is not that city
      "Pro Football Hall of Fame 2121 George Halas Dr NW Canton OH 44708",
      "Hobart Arena 255 Adams St Troy OH 45373",
      "Downtown Warren OH 44483",
      "Sandusky MI 48471",
      // a ZIP that is not the state's
      "Somewhere in Royal Oak MI 90210",
      "Stroh Center Bowling Green OH 48067",
      // a listed name that is only the tail of another place, or one side of an intersection
      "Meeting in the board room of Port Huron Township MI 48060",
      "Village Hall South Rockwood MI 48179",
      "Fall color tour to Camp Dearborn MI 48380",
      "Historic Fort Wayne MI 48209",
      "Flea market in Old Redford MI 48219",
      "Corner of Greenfield and Warren MI 48228",
      "Upper Sandusky OH 43351",
    ];
    for (const raw of noCity) {
      const result = parseIcsLocation(raw);
      assert.strictEqual(result.status, "unparseable", raw);
      assert.ok(!("trailingCity" in result), `no city may be read out of: ${raw}`);
    }
  }

  // --- 20. BUG-012 does not change anything the existing grammars already
  //     parse: a structured location is still "parsed", name and all. ---
  {
    const a = parseIcsLocation("Royal Oak Farmers Market - 316 E 11 Mile Road  Royal Oak MI 48067");
    assert.deepStrictEqual([a.status, a.candidateName, a.candidateAddress, a.candidateCity], ["parsed", "Royal Oak Farmers Market", "316 E 11 Mile Road", "Royal Oak"]);
    const b = parseIcsLocation("Main Meeting Room - Mount Clemens MI 48043");
    assert.deepStrictEqual([b.status, b.candidateName, b.candidateCity], ["parsed", "Main Meeting Room", "Mount Clemens"]);
    const c = parseIcsLocation("- 12066 Merriman Road Livonia MI 48150");
    assert.deepStrictEqual([c.status, c.candidateName, c.candidateAddress, c.candidateCity], ["parsed", null, "12066 Merriman Road", "Livonia"]);
    const d = parseIcsLocation("- Livonia MI 48154");
    assert.deepStrictEqual([d.status, d.candidateName, d.candidateCity], ["parsed", null, "Livonia"]);
    assert.ok(!("trailingCity" in a) && !("trailingCity" in b) && !("trailingCity" in c) && !("trailingCity" in d));
  }

  // --- 21. The closed list of city names (api/_lib/orbit-cities.js). ---
  {
    const { knownCity } = require(`${REPO_DIR}/api/_lib/orbit-cities.js`);
    const discovery = require(`${REPO_DIR}/discovery.js`);
    // Every Michigan and Ohio city the site already knows is on it, under its
    // own state, so the two can never disagree about a name.
    const stateCode = { Michigan: "MI", Ohio: "OH" };
    const siteCities = discovery._defaultConfig.places.filter((p) => p[1] === "city" && stateCode[p[2]]);
    assert.ok(siteCities.length >= 50, "discovery.js's place list was read");
    for (const [name, , region] of siteCities) assert.strictEqual(knownCity(name, stateCode[region]), name, `${name} (in discovery.js) must be a known ${region} city`);
    // Case and periods do not matter; the listed spelling comes back.
    assert.strictEqual(knownCity("ST CLAIR SHORES", "MI"), "St. Clair Shores");
    assert.strictEqual(knownCity("st. clair shores", "mi"), "St. Clair Shores");
    assert.strictEqual(knownCity("Mt. Clemens", "MI"), "Mount Clemens");
    assert.strictEqual(knownCity("  Royal   Oak ", "MI"), "Royal Oak");
    // A name is a city only in its own state, and a state is required.
    assert.strictEqual(knownCity("Troy", "OH"), null);
    assert.strictEqual(knownCity("Toledo", "MI"), null);
    assert.strictEqual(knownCity("Toledo", "OH"), "Toledo");
    assert.strictEqual(knownCity("Troy"), null);
    assert.strictEqual(knownCity("Troy", "ON"), null);
    // Things that are not places are not on it.
    for (const notACity of ["Lower Level", "Suite A", "Downtown", "Memorial Park", "Not Applicable", "Township", "", null, undefined]) {
      assert.strictEqual(knownCity(notACity, "MI"), null, `${JSON.stringify(notACity)} is not a city`);
    }
  }

  console.log("ics-location.test.js: all assertions passed");
}

run();
