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

  console.log("\nAll external-discovery.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
