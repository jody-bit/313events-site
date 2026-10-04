// test/external-discovery.test.js — api/_lib/external-discovery.js
//
// 2026-09-23, "CORRECTION TO ENRICHMENT PRODUCT BEHAVIOR." Proves the
// bounded external-discovery building blocks in isolation, with a mocked
// fetch -- never a real network call to Tavily or anywhere else. Covers:
// configuration gating (no call attempted without a real key),
// verification (never trust an unofficial-domain or unrelated result), the
// conservative address extractor (never guesses), and both discovery
// functions' fail-closed behavior.
//
// Plain Node assert, no dependencies.
// Run: node test/external-discovery.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

// 2026-10-04: web-search discovery is behind a temporary gate that is
// CLOSED unless WEB_SEARCH_ENRICHMENT_ENABLED is exactly "true" (see the top
// of api/_lib/external-discovery.js). This file tests the discovery
// mechanics themselves — verification, extraction, fail-closed behaviour —
// with a mocked provider, so it opens the gate for itself. What happens
// while the gate is closed, which is production's state, is proven in
// test/external-discovery-gate.test.js.
process.env.WEB_SEARCH_ENRICHMENT_ENABLED = "true";

function freshLib() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/external-discovery.js`)];
  return require(`${REPO_DIR}/api/_lib/external-discovery.js`);
}

async function run() {
  const {
    isExternalDiscoveryConfigured,
    verifyOfficialResult,
    extractAddressFromContent,
    discoverVenueKnowledge,
    discoverAuthoritativeDescription,
    titleEvidenceCoverage,
    extractDateMentions,
    eventDateCompatible,
    verifyEventSpecificResult,
  } = freshLib();

  // --- 1. isExternalDiscoveryConfigured: only true with a real, non-blank
  //     TAVILY_API_KEY. ---
  {
    assert.strictEqual(isExternalDiscoveryConfigured({}), false);
    assert.strictEqual(isExternalDiscoveryConfigured({ TAVILY_API_KEY: "" }), false);
    assert.strictEqual(isExternalDiscoveryConfigured({ TAVILY_API_KEY: "   " }), false);
    assert.strictEqual(isExternalDiscoveryConfigured({ TAVILY_API_KEY: "tvly-real-key" }), true);
  }
  console.log("PASS: isExternalDiscoveryConfigured is true only with a real, non-blank key");

  // --- 2. verifyOfficialResult: rejects known non-official domains even
  //     with a perfect name match. ---
  {
    assert.strictEqual(
      verifyOfficialResult(["Garden Bowl"], { url: "https://www.facebook.com/gardenbowl", title: "Garden Bowl", content: "Garden Bowl" }),
      false,
      "a known aggregator/social domain is never treated as an official source, even with a perfect name match"
    );
    assert.strictEqual(
      verifyOfficialResult(["Garden Bowl"], { url: "https://www.ticketmaster.com/garden-bowl", title: "Garden Bowl tickets" }),
      false
    );
  }
  console.log("PASS: verifyOfficialResult rejects known non-official domains regardless of name match");

  // --- 3. verifyOfficialResult: rejects an otherwise-official-looking
  //     domain when the subject name doesn't actually appear anywhere. ---
  {
    assert.strictEqual(
      verifyOfficialResult(["Garden Bowl"], { url: "https://majesticdetroit.com/some-other-venue", title: "Magic Stick", content: "A different venue entirely." }),
      false,
      "an unrelated result must never be accepted just because its domain looks legitimate"
    );
  }
  console.log("PASS: verifyOfficialResult rejects a result whose content doesn't actually mention the subject");

  // --- 4. verifyOfficialResult: accepts a real match on a non-blocklisted
  //     domain. ---
  {
    assert.strictEqual(
      verifyOfficialResult(["Garden Bowl"], { url: "https://majesticdetroit.com/garden-bowl", title: "Garden Bowl | Majestic Detroit", content: "Garden Bowl is a bowling alley and music venue at 4140 Woodward Ave, Detroit, MI." }),
      true
    );
  }
  console.log("PASS: verifyOfficialResult accepts a genuinely matching result on a legitimate domain");

  // --- 5. verifyOfficialResult: subject terms under 3 characters are
  //     ignored (too weak to mean anything), and an empty subject list
  //     never verifies anything. ---
  {
    assert.strictEqual(verifyOfficialResult([], { url: "https://example.com", title: "Anything" }), false);
    assert.strictEqual(verifyOfficialResult(["a", "b"], { url: "https://example.com", title: "a b" }), false);
  }
  console.log("PASS: verifyOfficialResult never verifies against empty or too-weak subject terms");

  // --- 6. extractAddressFromContent: recognizes a clear street address and
  //     an adjacent Michigan city, never invents either. ---
  {
    const found = extractAddressFromContent("Garden Bowl is located at 4140 Woodward Ave, Detroit, MI and has been open since 1913.");
    assert.deepStrictEqual(found, { address: "4140 Woodward Ave", city: "Detroit" });

    const addressOnly = extractAddressFromContent("Find us at 123 Main Street for the show.");
    assert.deepStrictEqual(addressOnly, { address: "123 Main Street", city: null }, "a city is only returned when confidently present, never inferred");

    assert.strictEqual(extractAddressFromContent("A great night out in Detroit with live music."), null, "no street-address-shaped text must never produce a guess");
    assert.strictEqual(extractAddressFromContent(null), null);
    assert.strictEqual(extractAddressFromContent(""), null);
  }
  console.log("PASS: extractAddressFromContent only extracts a clearly street-address-shaped substring, never guesses");

  // --- 7. discoverVenueKnowledge: no apiKey -> null immediately, NO fetch
  //     attempted at all (proves the "dormant by default" contract). ---
  {
    let fetchCalled = false;
    const fetchFn = async () => { fetchCalled = true; throw new Error("should never be called"); };
    const result = await discoverVenueKnowledge({ venueName: "Garden Bowl", apiKey: "", fetchFn });
    assert.strictEqual(result, null);
    assert.strictEqual(fetchCalled, false, "with no configured API key, no network call is ever attempted");
  }
  console.log("PASS: discoverVenueKnowledge makes no network call at all when no API key is configured");

  // --- 8. discoverVenueKnowledge: with a key, a verified result is
  //     returned with only confidently-extractable fields; an unverified
  //     top result is skipped in favor of a later verified one. ---
  {
    const fetchFn = async (url, opts) => {
      assert.strictEqual(url, "https://api.tavily.com/search");
      assert.strictEqual(opts.method, "POST");
      assert.strictEqual(opts.headers.Authorization, "Bearer test-tavily-key");
      return {
        ok: true,
        json: async () => ({
          results: [
            { url: "https://www.yelp.com/biz/garden-bowl", title: "Garden Bowl reviews", content: "Reviews for Garden Bowl" },
            { url: "https://majesticdetroit.com/garden-bowl", title: "Garden Bowl | Majestic Detroit", content: "Garden Bowl, 4140 Woodward Ave, Detroit, MI. Bowling and live music." },
          ],
        }),
      };
    };
    const result = await discoverVenueKnowledge({ venueName: "Garden Bowl", apiKey: "test-tavily-key", fetchFn });
    assert.deepStrictEqual(result, {
      name: "Garden Bowl",
      website: "https://majesticdetroit.com",
      address: "4140 Woodward Ave",
      city: "Detroit",
      sourceUrl: "https://majesticdetroit.com/garden-bowl",
    });
  }
  console.log("PASS: discoverVenueKnowledge skips an unverified (Yelp) result and returns the verified official one");

  // --- 9. discoverVenueKnowledge: no verifiable result at all -> null,
  //     never a low-confidence guess. ---
  {
    const fetchFn = async () => ({ ok: true, json: async () => ({ results: [{ url: "https://www.facebook.com/gardenbowl", title: "Garden Bowl", content: "Garden Bowl" }] }) });
    const result = await discoverVenueKnowledge({ venueName: "Garden Bowl", apiKey: "test-tavily-key", fetchFn });
    assert.strictEqual(result, null);
  }
  console.log("PASS: discoverVenueKnowledge returns null when nothing in the results is verifiable");

  // --- 10. discoverVenueKnowledge: a failed HTTP response or a thrown
  //     network error both fail closed to null, never throw out of the
  //     function. ---
  {
    const failFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    assert.strictEqual(await discoverVenueKnowledge({ venueName: "Garden Bowl", apiKey: "k", fetchFn: failFetch }), null);
    const throwFetch = async () => { throw new Error("network down"); };
    assert.strictEqual(await discoverVenueKnowledge({ venueName: "Garden Bowl", apiKey: "k", fetchFn: throwFetch }), null);
  }
  console.log("PASS: discoverVenueKnowledge fails closed to null on any HTTP or network failure");

  // --- 11. discoverAuthoritativeDescription: no apiKey -> null, no fetch
  //     attempted. ---
  {
    let fetchCalled = false;
    const fetchFn = async () => { fetchCalled = true; throw new Error("should never be called"); };
    const result = await discoverAuthoritativeDescription({ event: { title: "The House of Tarot", venue_name_raw: "MAD Arts" }, apiKey: "", fetchFn });
    assert.strictEqual(result, null);
    assert.strictEqual(fetchCalled, false);
  }
  console.log("PASS: discoverAuthoritativeDescription makes no network call at all when no API key is configured");

  // --- 12. discoverAuthoritativeDescription: a verified result's content
  //     is returned, capped/trimmed to a sentence boundary when long. ---
  {
    const longContent = "The House of Tarot is a monthly tarot-reading and vendor night at MAD Arts. " +
      "It features local readers and makers. " + "X".repeat(400) + ". More trailing text that should be cut.";
    const fetchFn = async () => ({ ok: true, json: async () => ({ results: [{ url: "https://madarts.example.com/events/house-of-tarot", title: "The House of Tarot at MAD Arts", content: longContent }] }) });
    const result = await discoverAuthoritativeDescription({ event: { title: "The House of Tarot", venue_name_raw: "MAD Arts" }, apiKey: "k", fetchFn });
    assert.ok(result);
    assert.strictEqual(result.sourceUrl, "https://madarts.example.com/events/house-of-tarot");
    assert.ok(result.text.length <= 401, "long content is capped rather than stored in full");
    assert.ok(result.text.startsWith("The House of Tarot is a monthly tarot-reading"));
  }
  console.log("PASS: discoverAuthoritativeDescription returns a verified, length-capped description with its source URL");

  // --- 13. discoverAuthoritativeDescription: an event with no title
  //     returns null defensively (schema guarantees this never happens in
  //     production, same defensive posture as description-enrichment.js). ---
  {
    assert.strictEqual(await discoverAuthoritativeDescription({ event: { title: "" }, apiKey: "k" }), null);
    assert.strictEqual(await discoverAuthoritativeDescription({ event: null, apiKey: "k" }), null);
  }
  console.log("PASS: discoverAuthoritativeDescription returns null defensively for an event with no title");

  // ===========================================================================
  // 2026-10-01 hardening: event-specific identity verification for
  // discoverAuthoritativeDescription. Regression fixtures below are drawn
  // directly from the RA candidate-recovery V1 production experiment (the
  // real 10-candidate batch), per the Product Owner's explicit instruction
  // to use the real failures as fixtures rather than invented ones.
  // ===========================================================================

  // --- 14. titleEvidenceCoverage: scores 0 for a result that shares only
  //     the venue's name, full coverage for a result that genuinely
  //     restates the event's own vocabulary. ---
  {
    assert.strictEqual(
      titleEvidenceCoverage("Family Affair", "Upcoming Events August 21 Gezellig feat Ataxia Mister Joshooa September 4 Yotto Dally in the Alley"),
      0,
      "a generic venue events-list page that never mentions the event's own title scores zero coverage"
    );
    assert.strictEqual(
      titleEvidenceCoverage(
        "HIPHOP NIGHT: NAMEBRANDSMITH & DJBJ 3525 (CLUB BANGERS ALL NIGHT)",
        "Hiphop Night at Big Pink features club bangers all night from Namebrandsmith and DJBJ 3525. Saturday, 3 October 10PM-2AM."
      ),
      1,
      "a page that genuinely restates the event's own title vocabulary scores full coverage even when reworded"
    );
  }
  console.log("PASS: titleEvidenceCoverage distinguishes genuine event-title evidence from venue-name-only content");

  // --- 15. extractDateMentions / eventDateCompatible: catches a wrong-
  //     calendar-instance match (same recurring series, different date)
  //     and an internally-inconsistent result (URL says one date, prose
  //     says another), while never penalizing a result with no date
  //     mentioned at all. ---
  {
    const realmsOfTechnoEvent = { start_date: "2026-10-01" };
    assert.deepStrictEqual(extractDateMentions("Thursday, 6 August 10pm - 2am"), [{ month: 8, day: 6, year: null }]);
    assert.strictEqual(
      eventDateCompatible(realmsOfTechnoEvent, "Realms of Techno brings underground energy to SPKRBOX. Thursday, 6 August 10pm-2am."),
      false,
      "Realms of Techno: Oct 1 event, Aug 6 recovered content -- must be rejected as a different calendar instance"
    );

    const grooveNightEvent = { start_date: "2026-10-01" };
    assert.strictEqual(
      eventDateCompatible(grooveNightEvent, "Groove Night. When. Thursday, 30 July. 10PM. https://ma.to/event/quixotic-spkrbox-30-jul-2026"),
      false,
      "Groove Night: Oct 1 event, Jul 30 recovered content -- must be rejected"
    );

    const marbleBarAnniversaryEvent = { start_date: "2026-10-03" };
    assert.strictEqual(
      eventDateCompatible(
        marbleBarAnniversaryEvent,
        "Oct 4 · Marble Bar, Detroit. Marble Bar celebrates 11 years. https://ma.to/event/marble-bar-11-year-anniversary-03-oct-2026"
      ),
      false,
      "Marble Bar 11 Year Anniversary: event is Oct 3, the URL slug agrees but the recovered prose itself says Oct 4 -- one disagreeing mention is enough to reject"
    );

    const noDateMentionedEvent = { start_date: "2026-10-01" };
    assert.strictEqual(
      eventDateCompatible(noDateMentionedEvent, "The House of Tarot is a monthly tarot-reading and vendor night at MAD Arts."),
      true,
      "a result that never mentions any date is not penalized -- absence of a date is not evidence of the wrong date"
    );

    const jiveTurkeysEvent = { start_date: "2026-10-04" };
    assert.strictEqual(
      eventDateCompatible(jiveTurkeysEvent, "Jive Turkeys Detroit annual fundraiser at TV Lounge. Sunday, October 4 at 1 pm EDT."),
      true,
      "a genuinely agreeing date mention is accepted"
    );
  }
  console.log("PASS: eventDateCompatible rejects wrong-instance and internally-inconsistent dates, never penalizes a result with no date at all");

  // --- 16. verifyEventSpecificResult / discoverAuthoritativeDescription
  //     end to end: the real production failures are now rejected, and
  //     the real production successes (content-correct, even though
  //     their SOURCE TIER was wrong -- that's source-authority.test.js's
  //     job to cover) are still accepted. ---
  async function descriptionFor(event, result) {
    const fetchFn = async () => ({ ok: true, json: async () => ({ results: [result] }) });
    return discoverAuthoritativeDescription({ event, apiKey: "test-tavily-key", fetchFn });
  }

  {
    // Family Affair -- generic Marble Bar events-page dump, never mentions this event.
    const rejected1 = await descriptionFor(
      { title: "Family Affair", venue_name_raw: "Marble Bar", start_date: "2026-10-02" },
      { url: "https://themarblebar.com/events", title: "Marble Bar | Upcoming Events", content: "Upcoming Events August 21 Gezellig feat Ataxia Mister Joshooa September 4 Yotto Dally in the Alley Official Afters" }
    );
    assert.strictEqual(rejected1, null, "Family Affair: a generic venue events listing that never names this event must not become its description");

    // NO SKIPS -- generic Big Pink/Detroit-techno website copy, unrelated to this event.
    const rejected2 = await descriptionFor(
      { title: "NO SKIPS: HIPHOP & R&B NIGHT (SUNDAY NIGHT) - BLAKITO", venue_name_raw: "Big Pink", start_date: "2026-10-04" },
      { url: "https://bigpinklovesyou.com", title: "Big Pink", content: "Although widely associated with Europe, techno music was invented in Detroit and its suburbs in the early 1980s by young African-Americans." }
    );
    assert.strictEqual(rejected2, null, "NO SKIPS: generic techno-history copy that never names this event or its performer must not become its description");

    // E L I X I R -- generic Northern Lights residency/nav content.
    const rejected3 = await descriptionFor(
      { title: "E L I X I R • DR. Disko Dust • 9th Circle", venue_name_raw: "Northern Lights Lounge", start_date: "2026-10-01" },
      { url: "https://www.northernlightslounge.com/music", title: "Northern Lights Lounge", content: "Skip to Content Northern Lights Lounge LIVE MUSIC WEEKLY RESIDENCIES MONTHLY RESIDENCIES No cover 21+" }
    );
    assert.strictEqual(rejected3, null, "E L I X I R: scraped nav/residency boilerplate that never names the performers must not become its description");

    // Realms of Techno -- same recurring series, wrong calendar instance (Aug 6 vs Oct 1).
    const rejected4 = await descriptionFor(
      { title: "Realms of Techno", venue_name_raw: "Spkrbox", start_date: "2026-10-01" },
      { url: "https://ma.to/event/realms-of-techno-spkrbox-06-aug-2026", title: "Realms of Techno at SPKRBOX", content: "Realms of Techno brings a heavy dose of underground energy to SPKRBOX. Thursday, 6 August 10pm-2am." }
    );
    assert.strictEqual(rejected4, null, "Realms of Techno: title matches but the content is for a different calendar instance of this recurring series");

    // Groove Night -- same shape, wrong instance (Jul 30 vs Oct 1).
    const rejected5 = await descriptionFor(
      { title: "Groove Night", venue_name_raw: "Spkrbox", start_date: "2026-10-01" },
      { url: "https://ma.to/event/quixotic-spkrbox-30-jul-2026", title: "Groove Night at SPKRBOX", content: "Groove Night. Groove Night. When. Thursday, 30 July. 10PM." }
    );
    assert.strictEqual(rejected5, null, "Groove Night: same recurring-series-wrong-instance failure");

    // Marble Bar 11 Year Anniversary -- internally inconsistent (URL says Oct 3, prose says Oct 4; event is Oct 3).
    const rejected6 = await descriptionFor(
      { title: "Marble Bar 11 Year Anniversary", venue_name_raw: "Marble Bar", start_date: "2026-10-03" },
      { url: "https://ma.to/event/marble-bar-11-year-anniversary-03-oct-2026", title: "Marble Bar 11 Year Anniversary", content: "Oct 4 · Marble Bar, Detroit. Marble Bar celebrates 11 years of music and beautiful disorder." }
    );
    assert.strictEqual(rejected6, null, "Marble Bar 11 Year Anniversary: the recovered prose's own stated date disagrees with the event's real date");

    // Jive Turkeys -- genuinely correct content (title AND date both agree); must still be ACCEPTED.
    // (Its source tier being wrongly primary_authoritative is a separate, source-authority.js-level defect -- see that test file.)
    const accepted1 = await descriptionFor(
      { title: "Jive Turkeys Detroit annual fundraiser", venue_name_raw: "TV Lounge", start_date: "2026-10-04" },
      { url: "https://app.discotech.me/events/38273665-jive-turkeys-detroit-annual-fundraiser-at-tv-lounge", title: "Jive Turkeys Detroit annual fundraiser", content: "Jive Turkeys Detroit annual fundraiser at TV Lounge. Sunday, October 4 at 1 pm EDT." }
    );
    assert.ok(accepted1, "Jive Turkeys: genuinely matching title and date must still be accepted as Level 1 evidence");
    assert.strictEqual(accepted1.sourceUrl, "https://app.discotech.me/events/38273665-jive-turkeys-detroit-annual-fundraiser-at-tv-lounge");

    // Ø[Phase] -- content/date genuinely agree (title AND date both match,
    // Unicode title handled fine), but technobeatscloud.com is now itself
    // in NON_OFFICIAL_DOMAINS (fix #4's defensive hardening) -- so this
    // is rejected at the domain-denylist stage, same as any other known
    // aggregator, and correctly falls through to the safe template.
    // (Jive Turkeys above shows the OTHER half of the story: its real
    // production URL was on a *subdomain* of discotech.me, which the
    // exact-match denylist above does not catch -- that's exactly why
    // the generalized domainPlausiblyOwnedByName check in
    // source-authority.test.js, not the denylist, is the real protection
    // for whatever the next not-yet-discovered aggregator turns out to
    // be.)
    const rejected7 = await descriptionFor(
      { title: "Ø[Phase] - Holden Federico - Jėck - Lincoln Factory", venue_name_raw: "Lincoln Factory", start_date: "2026-10-03" },
      { url: "https://technobeatscloud.com/en/events/event/phase-holden-federico-jeck-lincoln-factory-2026-10-03", title: "Ø[Phase] - Holden Federico - Jėck - Lincoln Factory", content: "Ø[Phase] - Holden Federico - Jėck - Lincoln Factory at Lincoln Factory (Detroit) on 3 October 2026." }
    );
    assert.strictEqual(rejected7, null, "Ø[Phase]: technobeatscloud.com is now a denylisted aggregator domain, so even genuinely-matching content from it is rejected outright");

    // The same genuinely-matching title+date content from a domain that
    // is NOT a known aggregator (fictional, for this test only) must
    // still be accepted -- proves the new title/date checks reject only
    // what's actually wrong, not every aggregator-shaped result.
    const accepted2 = await descriptionFor(
      { title: "Ø[Phase] - Holden Federico - Jėck - Lincoln Factory", venue_name_raw: "Lincoln Factory", start_date: "2026-10-03" },
      { url: "https://lincolnfactorydetroit.example.com/events/phase-holden-federico-jeck", title: "Ø[Phase] - Holden Federico - Jėck - Lincoln Factory", content: "Ø[Phase] - Holden Federico - Jėck - Lincoln Factory at Lincoln Factory (Detroit) on 3 October 2026." }
    );
    assert.ok(accepted2, "genuinely matching title and date, including a Unicode-styled title, is accepted from a non-denylisted domain");
  }
  console.log("PASS: discoverAuthoritativeDescription rejects every real wrong-instance/generic-content production failure while still accepting genuinely matching content");

  console.log("\nAll external-discovery.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
