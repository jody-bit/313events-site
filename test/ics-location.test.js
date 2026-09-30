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

  console.log("ics-location.test.js: all assertions passed");
}

run();
