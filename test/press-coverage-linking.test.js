// test/press-coverage-linking.test.js — scripts/press-coverage-linking.js
//
// "AUTOMATE ADMIN -> PRESS COVERAGE" (2026-09-23). Proves the deep
// article-to-event linking pipeline: pure extraction against real-shaped
// article text (drawn from the actual production Press Coverage queue at
// the time this shipped — Hour Detroit's "Heroes of the Revolution",
// Grosse Pointe News' "Tau Beta Fall Market", Metro Times' two Recovery &
// Resilience Festival articles, C&G's ambiguous "Photos sought" piece),
// plus the full orchestrator against injected (never-real-network) I/O.
//
// Plain Node assert, no dependencies.
// Run: node test/press-coverage-linking.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshLib() {
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/press-coverage-linking.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/scripts/press-coverage-linking.js`);
}

const silentLogger = { log() {}, warn() {}, error() {} };

// Real (paraphrase-free, directly-sourced) article text fragments — these
// are the actual facts each real article stated, used here only to prove
// extraction correctness against real-world phrasing, never persisted.
const HEROES_HEADLINE = "Douglas Elbinger on His Career Retrospective Exhibition 'Heroes of the Revolution'";
const HEROES_BODY =
  "Douglas Elbinger isn't afraid to be controversial. Proof of that can be found in \"Heroes of the Revolution,\" " +
  "his career retrospective exhibition opening on Sept. 19 at Color Ink Studio in Hazel Park. The exhibition " +
  "features photos over multiple decades of some of the most impactful figures in modern history.";

const TAU_BETA_HEADLINE = "Tau Beta Fall Market around the corner";
const TAU_BETA_BODY =
  "A weekend of curated shopping for a worthy cause returns to the Grosse Pointe Club next month when the Tau Beta " +
  "Fall Market opens to raise money for The Children's Center of Detroit. The market unfolds in two parts: a " +
  "ticketed preview party Thursday, Oct. 1, and public Market Days Friday and Saturday, Oct. 2 and 3.";

// The two real Metro Times articles — the article headline does NOT name
// the event (Jody's own example of the problem this whole task exists to
// solve).
const LOL_HEADLINE = "The Cure co-founder Lol Tolhurst talks recovery, goth and Detroit";
const LOL_BODY =
  "September is National Recovery Month, and the Downriver Council for the Arts and Passenger Recovery are " +
  "marking the occasion with the first Recovery & Resilience Festival: A Celebration of Recovery Pathways on " +
  "Sept. 20, featuring guest speaker Lol Tolhurst of The Cure.";
const DOWNRIVER_HEADLINE = "Downriver recovery festival brings music, art and support together";
const DOWNRIVER_EXCERPT = "The Recovery & Resilience Festival in Wyandotte will feature music, art, recovery resources, and guest speaker Lol Tolhurst of The Cure.";

const PHOTOS_HEADLINE = "Photos sought for exhibit celebrating America's 250th birthday";
const PHOTOS_BODY = "An upcoming exhibit aims to bring Americans together by letting them share pictures of places they love, whether across the state or country, or even at home.";

// "FIX PAST-EVENT RECAP CLUTTER" (2026-09-25) — two more real articles from
// the live Press Coverage queue, both traced from Jody's own report ("I
// should not have to manually dismiss obvious past-event coverage, and the
// Sept. 26 Mac Watts event should be resolvable").
//
// A real C&G Newspapers recap, published a full 12 days after the event it
// covers — the exact real-world gap that silently rolled its date to NEXT
// year under the old 5-day extractDates() slack window (see
// RECAP_TRAILING_SLACK_DAYS).
const LATHRUP_HEADLINE = "Lathrup Village Music Festival brings together community for full day of music";
const LATHRUP_BODY =
  "LATHRUP VILLAGE — Lathrup Village Municipal Park was bursting with activity on Sept. 12 due to the all-day " +
  "Lathrup Village Music Festival. The post Lathrup Village Music Festival brings together community for full " +
  "day of music first appeared on C & G Newspapers .";

// A real Grosse Pointe News concert preview — Jody's own example of an
// article that SHOULD be resolvable. Trimmed but verbatim (captured live
// 2026-09-25): no formal "event name" is ever stated (neither a "the X
// Festival/Market" phrase nor a quoted title — the performer's own name is
// the event's real identity), and no conventional venue is named either —
// only a specific street address for a fundraiser held in a parking lot
// between two businesses, one of which doesn't exist yet.
const MAC_WATTS_HEADLINE = "Get amped up with Mac Watts at outdoor concert";
const MAC_WATTS_BODY =
  "Nashville superstar and Michigan native Mac Watts will take the stage once again during an outdoor " +
  "fundraiser Saturday, Sept. 26, that benefits the future home of Michael B’s Cafe. The headliner " +
  "— who was raised in Bloomfield Hills before making it big in Music City — is one part of a " +
  "down-home celebration that kicks off at 5 p.m. The concert takes place in the parking lot between " +
  "Cabbage Patch Saloon and the future Michael B’s. Keeping with the country theme, bales of hay will " +
  "be provided for additional seating. Tickets are $60 and available online at michaelbcafe.org. The " +
  "project is the renovation of the building at 15118 Mack, Grosse Pointe Park.";

function run() {
  const {
    extractTitle, extractVenue, extractDates, extractCategory, extractDescriptionSentence,
    extractEventIdentity, isSufficientForCreate, deepMatchArticleToEvent, normalizeAmpersand,
    extractCity, extractStreetAddress, extractContextEntities, isDistributedEvent, mergeIdentities,
    linkPressCoverageQueue,
  } = freshLib();

  // --- 1. extractTitle: a quoted headline phrase, and a "the ... Festival/
  //     Market" body phrase — including when a descriptor word ("the
  //     first") sits between "the" and the real title. ---
  {
    assert.strictEqual(extractTitle(HEROES_HEADLINE, HEROES_BODY), "Heroes of the Revolution");
    assert.strictEqual(extractTitle(TAU_BETA_HEADLINE, TAU_BETA_BODY), "Tau Beta Fall Market");
    assert.strictEqual(extractTitle(LOL_HEADLINE, LOL_BODY), "Recovery & Resilience Festival", "must find the real event name in the BODY even though the headline never mentions it");
    assert.strictEqual(extractTitle(PHOTOS_HEADLINE, PHOTOS_BODY), null, "no event-shaped title phrase anywhere -- must not guess one");
  }
  console.log("PASS: extractTitle finds the real event name from body text, including when the headline doesn't mention it");

  // --- 2. extractVenue: explicit "at X in City" / "returns to the X" only
  //     -- never a bare capitalized phrase. ---
  {
    assert.deepStrictEqual(extractVenue(HEROES_BODY), { name: "Color Ink Studio", city: "Hazel Park" });
    assert.deepStrictEqual(extractVenue(TAU_BETA_BODY), { name: "Grosse Pointe Club", city: null });
    assert.strictEqual(extractVenue(LOL_BODY), null, "no venue named anywhere in this article -- must not guess one from \"Wyandotte\" or anything else");
    assert.strictEqual(extractVenue(PHOTOS_BODY), null);
  }
  console.log("PASS: extractVenue only ever returns a venue named by an explicit at/returns-to phrase, never a guess");

  // --- 3. extractDates: month+day, year inferred from publish date only
  //     when absent, never invented outright; multiple dates return sorted,
  //     deduped. ---
  {
    assert.deepStrictEqual(extractDates(HEROES_BODY, "2026-09-18T21:56:49+00:00"), ["2026-09-19"]);
    assert.deepStrictEqual(extractDates(TAU_BETA_BODY, "2026-09-17T15:03:58+00:00"), ["2026-10-01", "2026-10-02"]);
    assert.deepStrictEqual(extractDates(PHOTOS_BODY, "2026-09-21T14:58:42+00:00"), [], "no calendar date anywhere in this article");
    // A date already passed this year relative to publish date rolls to next year.
    assert.deepStrictEqual(extractDates("The show is Jan. 5.", "2026-09-01T00:00:00Z"), ["2027-01-05"]);
  }
  console.log("PASS: extractDates finds real calendar dates only, infers a missing year conservatively, never invents a date");

  // --- 4. extractCategory: a confident keyword only. ---
  {
    assert.strictEqual(extractCategory(HEROES_HEADLINE, HEROES_BODY), "visual");
    assert.strictEqual(extractCategory(TAU_BETA_HEADLINE, TAU_BETA_BODY), "vendor");
    assert.strictEqual(extractCategory(LOL_HEADLINE, LOL_BODY), "fest");
    assert.strictEqual(extractCategory(PHOTOS_HEADLINE, PHOTOS_BODY), "visual", "\"exhibit\" is itself a confident category keyword here");
  }
  console.log("PASS: extractCategory only assigns a category on a real keyword match");

  // --- 5. normalizeAmpersand: "Recovery and Resilience Festival" and
  //     "Recovery & Resilience Festival" -- the two real spellings across
  //     the two real articles -- normalize identically. ---
  {
    assert.strictEqual(
      normalizeAmpersand("Recovery and Resilience Festival"),
      normalizeAmpersand("Recovery & Resilience Festival")
    );
  }
  console.log("PASS: normalizeAmpersand treats \"and\" and \"&\" as the same word");

  // --- 6. isSufficientForCreate: Heroes/Tau Beta have every required
  //     signal; the Recovery Festival articles (real: no venue named
  //     anywhere, and -- on their own, un-pooled -- no confident city
  //     either) and the Photos/250th article (real: no title/venue/date at
  //     all) are both correctly insufficient, with accurate reason codes --
  //     Acceptance: "ambiguous/insufficient evidence stays human." Reason
  //     codes updated 2026-09-23 ("SMALL CORRECTION BEFORE DEPLOYMENT") --
  //     NO_VENUE_SIGNAL was too strict a hard requirement; a confident city
  //     is now an acceptable substitute (see #11c below), so the reason
  //     code is now NO_VENUE_OR_CITY_SIGNAL when neither is present. ---
  {
    const heroesId = extractEventIdentity(HEROES_HEADLINE, HEROES_BODY, "2026-09-18T21:56:49+00:00");
    assert.deepStrictEqual(isSufficientForCreate(heroesId), { sufficient: true, missing: [] });

    const tauId = extractEventIdentity(TAU_BETA_HEADLINE, TAU_BETA_BODY, "2026-09-17T15:03:58+00:00");
    assert.deepStrictEqual(isSufficientForCreate(tauId), { sufficient: true, missing: [] });

    const lolId = extractEventIdentity(LOL_HEADLINE, LOL_BODY, "2026-09-18T14:59:51+00:00");
    assert.deepStrictEqual(isSufficientForCreate(lolId), { sufficient: false, missing: ["NO_VENUE_OR_CITY_SIGNAL"] }, "LOL_BODY alone names no venue AND no known city -- must not guess");

    const photosId = extractEventIdentity(PHOTOS_HEADLINE, PHOTOS_BODY, "2026-09-21T14:58:42+00:00");
    const photosCheck = isSufficientForCreate(photosId);
    assert.strictEqual(photosCheck.sufficient, false);
    assert.ok(photosCheck.missing.includes("NO_TITLE_SIGNAL") && photosCheck.missing.includes("NO_VENUE_OR_CITY_SIGNAL") && photosCheck.missing.includes("NO_DATE_SIGNAL"));
  }
  console.log("PASS: isSufficientForCreate correctly gates on real evidence, with honest per-field reason codes");

  // --- 6b. isSufficientForCreate: a confident city + an explicit
  //     distributed-event signal (item 2 of the 2026-09-23 correction) IS
  //     sufficient without any single venue -- but a bare city on an
  //     ordinary (non-distributed) event is NOT, since that would risk
  //     accepting an under-reported single-venue event just because a city
  //     happened to be named. ---
  {
    const distributed = { title: "Neighborhood Kitchen Showcase", venueName: null, city: "Grosse Pointe", category: "food", startDate: "2026-09-25", isDistributed: true };
    assert.deepStrictEqual(isSufficientForCreate(distributed), { sufficient: true, missing: [] });

    const ordinaryNoVenue = { ...distributed, isDistributed: false };
    assert.deepStrictEqual(isSufficientForCreate(ordinaryNoVenue), { sufficient: false, missing: ["NO_CONFIDENT_VENUE"] }, "a city alone on a non-distributed event must never substitute for a real venue");
  }
  console.log("PASS: isSufficientForCreate accepts city-only ONLY when the event is explicitly signaled as distributed/venueless, never as a bare substitute for a missing venue");

  // --- 6c. extractCity: the title-proximate "<title> in <City>" pattern
  //     (the real signal found in the real Downriver excerpt), the
  //     KNOWN_CITIES fallback, and refusing to guess when two distinct
  //     known cities are both named (ambiguous). ---
  {
    assert.strictEqual(extractCity(DOWNRIVER_EXCERPT, "Recovery & Resilience Festival"), "Wyandotte");
    assert.strictEqual(extractCity("The show returns to Grosse Pointe this fall.", null), "Grosse Pointe");
    assert.strictEqual(
      extractCity("The Junior League of Detroit is hosting a tour of Grosse Pointe kitchens.", null),
      null,
      "two distinct known cities (Detroit, Grosse Pointe) named in the same text -- ambiguous, must not guess"
    );
    assert.strictEqual(extractCity(PHOTOS_BODY, null), null, "no known city named anywhere");
  }
  console.log("PASS: extractCity finds a confident city via the title-proximate phrase or an unambiguous known-city match, and refuses to guess when ambiguous");

  // --- 6d. isDistributedEvent: a narrow, explicit textual signal only --
  //     never inferred merely from the absence of a venue. ---
  {
    assert.strictEqual(isDistributedEvent("welcoming the public to tour seven newly renovated Grosse Pointe kitchens"), true);
    assert.strictEqual(isDistributedEvent("a self-guided studio tour across the neighborhood"), true);
    assert.strictEqual(isDistributedEvent(LOL_BODY), false, "an ordinary single-venue-shaped article must not be mistaken for a distributed event");
    assert.strictEqual(isDistributedEvent(""), false);
  }
  console.log("PASS: isDistributedEvent only fires on an explicit distributed/multi-location textual signal");

  // --- 6e. extractContextEntities: a narrow organizer/performer signal,
  //     used only to strengthen an external search query -- never a hard
  //     gate on its own. ---
  {
    assert.deepStrictEqual(extractContextEntities(LOL_BODY), ["Lol Tolhurst"]);
    assert.deepStrictEqual(extractContextEntities(PHOTOS_BODY), [], "no organizer/performer anchor phrase present -- must not guess one");
  }
  console.log("PASS: extractContextEntities finds a real organizer/performer anchor phrase only, never guesses one");

  // --- 6f. mergeIdentities: pools two partial identities (first non-null
  //     per field, latest endDate, union of contextTerms, OR of
  //     isDistributed) -- the mechanism item 3 of the correction relies on. ---
  {
    const a = { title: "Recovery & Resilience Festival", venueName: null, city: null, category: "fest", startDate: "2026-09-20", endDate: null, description: "desc A", contextTerms: ["Lol Tolhurst"], isDistributed: false };
    const b = { title: "Recovery & Resilience Festival", venueName: null, city: "Wyandotte", category: null, startDate: null, endDate: "2026-09-21", description: null, contextTerms: [], isDistributed: false };
    const merged = mergeIdentities([a, b]);
    assert.strictEqual(merged.title, "Recovery & Resilience Festival");
    assert.strictEqual(merged.city, "Wyandotte", "must pick up article B's city when article A has none");
    assert.strictEqual(merged.startDate, "2026-09-20", "must pick up article A's date when article B has none");
    assert.strictEqual(merged.endDate, "2026-09-21");
    assert.strictEqual(merged.category, "fest");
    assert.deepStrictEqual(merged.contextTerms, ["Lol Tolhurst"]);
  }
  console.log("PASS: mergeIdentities pools facts across articles -- first non-null per field, latest endDate, union of context terms");

  // --- 7. extractDescriptionSentence: the sentence actually containing the
  //     extracted title, bounded, never breaking mid-abbreviation ("Sept."). ---
  {
    const desc = extractDescriptionSentence(HEROES_BODY, "Heroes of the Revolution");
    assert.ok(desc.includes("opening on Sept. 19 at Color Ink Studio in Hazel Park."), "must not truncate at the abbreviation period in \"Sept.\"");
  }
  console.log("PASS: extractDescriptionSentence captures the real containing sentence without breaking on a month abbreviation");

  // --- 8. deepMatchArticleToEvent: title match works against FULL body
  //     text even when neither the article's headline NOR its stored
  //     excerpt contain the event's real title -- Acceptance: "existing
  //     event matched" + "headline differs from event title." ---
  {
    const candidateEvents = [{ id: "evt-recovery", title: "Recovery & Resilience Festival", venue_name_raw: "Some Hall", start_date: "2026-09-20" }];
    const searchText = `${LOL_HEADLINE} some short excerpt ${LOL_BODY}`;
    const match = deepMatchArticleToEvent(searchText, "2026-09-18", candidateEvents);
    assert.ok(match, "must match via the full body text even though neither headline nor excerpt name the event");
    assert.strictEqual(match.event.id, "evt-recovery");
    assert.strictEqual(match.matchType, "title");
  }
  console.log("PASS: deepMatchArticleToEvent matches an existing event via full body text when the headline doesn't name it");

  // --- 9. [FIX PAST-EVENT RECAP CLUTTER, 2026-09-25] extractDates: a recap
  //     published well over the old 5-day window after its own event must
  //     still resolve to the event's real (past) year, not roll forward to
  //     next year -- the real bug behind the Lathrup Village Music Festival
  //     and Senior Expo recaps sitting stuck in the Press Coverage queue. ---
  {
    assert.deepStrictEqual(
      extractDates(LATHRUP_BODY, "2026-09-24T12:00:00+00:00"),
      ["2026-09-12"],
      "a recap published 12 days after its event must land on the real, already-past 2026 date, not roll to 2027 the way the old 5-day slack window did"
    );
    // Still correctly rolls forward for a date genuinely many months behind
    // publish -- widening the slack must not turn off year-inference
    // entirely, only extend how much trailing lag counts as "this year."
    assert.deepStrictEqual(extractDates("The show is Jan. 5.", "2026-09-01T00:00:00Z"), ["2027-01-05"]);
  }
  console.log("PASS: [FIX PAST-EVENT RECAP CLUTTER] extractDates tolerates a real-world recap lag without misdating the event a year into the future");

  // --- 10. [FIX PAST-EVENT RECAP CLUTTER] extractTitle: a single-performer
  //     concert article with no formal event name at all (neither a "the X
  //     Festival/Market" phrase nor a quoted title) falls back to the
  //     performer's own name via an explicit "will <performance verb>"
  //     construction -- the real Mac Watts article, Jody's own example of
  //     an article that should be resolvable. ---
  {
    assert.strictEqual(
      extractTitle(MAC_WATTS_HEADLINE, MAC_WATTS_BODY),
      "Mac Watts",
      "no formal title phrase anywhere -- must fall back to the performer's own name, stated as \"Mac Watts will take the stage\""
    );
    // Must not fire on a bare proper-noun mention with no performance verb
    // -- e.g. an organizer's name in this same article -- only the narrow
    // "will <verb>" construction counts.
    assert.strictEqual(
      extractTitle("Fundraiser planned", "Alicia Carlisle, whose Cabbage Patch Saloon will be open for business during the event, is helping organize."),
      null,
      "\"will be open\" is not a performance verb -- must never guess a title from a bare proper-noun mention"
    );
  }
  console.log("PASS: [FIX PAST-EVENT RECAP CLUTTER] extractTitle falls back to a performer's own name only on an explicit \"will <performance verb>\" construction, never a bare name mention");

  // --- 11. [FIX PAST-EVENT RECAP CLUTTER] extractStreetAddress: a specific
  //     numbered street address anchored to one of this project's own known
  //     cities is a confident location signal, even with no conventional
  //     venue name stated anywhere -- the real Mac Watts article again
  //     (an outdoor fundraiser in a parking lot between two businesses). ---
  {
    assert.deepStrictEqual(extractStreetAddress(MAC_WATTS_BODY), { address: "15118 Mack", city: "Grosse Pointe Park" });
    assert.strictEqual(extractStreetAddress(HEROES_BODY), null, "no street address stated anywhere in this article -- must not guess one");
    assert.strictEqual(extractStreetAddress("Tickets are $60, available online."), null, "a bare number with no known city right after it must never be mistaken for an address");
  }
  console.log("PASS: [FIX PAST-EVENT RECAP CLUTTER] extractStreetAddress finds a real numbered address anchored to a known city, never a guess from a bare number");

  // --- 12. [FIX PAST-EVENT RECAP CLUTTER] isSufficientForCreate: a
  //     confident city PLUS a confident street address is sufficient
  //     location, same standing as a named venue -- but a city alone
  //     (without either the address or the existing distributed-event
  //     signal) still is not. ---
  {
    const withAddress = { title: "Mac Watts", venueName: null, city: "Grosse Pointe Park", streetAddress: "15118 Mack", category: "music", startDate: "2026-09-26", isDistributed: false };
    assert.deepStrictEqual(isSufficientForCreate(withAddress), { sufficient: true, missing: [] });

    const withoutAddress = { ...withAddress, streetAddress: null };
    assert.deepStrictEqual(isSufficientForCreate(withoutAddress), { sufficient: false, missing: ["NO_CONFIDENT_VENUE"] }, "a bare city, with neither an address nor a distributed-event signal, must still not be enough");
  }
  console.log("PASS: [FIX PAST-EVENT RECAP CLUTTER] isSufficientForCreate accepts a confident city+street-address pair as real location evidence, same as a named venue");

  // --- 13. [FIX PAST-EVENT RECAP CLUTTER] extractEventIdentity: the city
  //     anchored to the street address wins over the loose whole-text
  //     KNOWN_CITIES scan -- which, on the real Mac Watts article, is
  //     ambiguous (it also finds "Bloomfield Hills," the performer's own
  //     unrelated hometown, mentioned in the same article). ---
  {
    const identity = extractEventIdentity(MAC_WATTS_HEADLINE, MAC_WATTS_BODY, "2026-09-23T15:03:44+00:00");
    assert.strictEqual(identity.title, "Mac Watts");
    assert.strictEqual(identity.venueName, null);
    assert.strictEqual(identity.streetAddress, "15118 Mack");
    assert.strictEqual(identity.city, "Grosse Pointe Park", "must use the address-anchored city, not bail out on the ambiguous Bloomfield-Hills-vs-Grosse-Pointe-Park whole-text scan");
    assert.strictEqual(identity.category, "music");
    assert.strictEqual(identity.startDate, "2026-09-26");
  }
  console.log("PASS: [FIX PAST-EVENT RECAP CLUTTER] extractEventIdentity resolves the real Mac Watts article's city via its street address, sidestepping an unrelated hometown mention that would otherwise make the plain city scan ambiguous");

  console.log("\nAll press-coverage-linking.js pure-function tests passed.\n");
  return runOrchestratorTests({ linkPressCoverageQueue });
}

// ---------------------------------------------------------------------------
// Orchestrator tests — every I/O dependency injected, never a real request.

function makeCandidateEvents(rows) {
  return rows.map((r) => ({ ...r }));
}

async function runOrchestratorTests({ linkPressCoverageQueue }) {
  // --- 9. New event created when evidence is sufficient (Heroes of the
  //     Revolution scenario), then reused via generic enrichment reuse
  //     hook, with NO time ever written. ---
  {
    const events = [];
    const links = [];
    const enrichmentCalls = [];
    const counts = await linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      // Pinned "today" -- see [FIX PAST-EVENT RECAP CLUTTER, 2026-09-25]:
      // without this, the real wall-clock date would eventually pass this
      // fixture's Sept 19 event date and the new past-event auto-dismissal
      // would swallow this article before it ever reached creation.
      nowIso: "2026-09-18",
      fetchQueue: async () => [{ id: "article-heroes", title: HEROES_HEADLINE, excerpt: "", url: "https://hourdetroit.example/heroes", published_at: "2026-09-18T21:56:49+00:00" }],
      fetchCandidateEvents: async () => [],
      fetchArticleTextFn: async () => HEROES_BODY,
      buildVenueIdMap: async () => new Map(), // Color Ink Studio isn't a known canonical venue -- never invented
      applyLinkFn: async (_u, _h, articleId, eventId, matchType) => { links.push({ articleId, eventId, matchType }); return true; },
      createEventFn: async (_u, _k, _h, identity) => {
        const row = { id: "new-evt-heroes", title: identity.title, venue_name_raw: identity.venueName, start_date: identity.startDate };
        events.push({ identity, row });
        return row;
      },
      repairGenericMetadataFn: async (opts) => { enrichmentCalls.push(opts); return { written: 0 }; },
    });
    assert.strictEqual(counts.autoCreated, 1);
    assert.strictEqual(counts.autoMatched, 0);
    assert.strictEqual(counts.stillHuman, 0);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].identity.title, "Heroes of the Revolution");
    assert.strictEqual(events[0].identity.venueName, "Color Ink Studio");
    assert.ok(!("time_display" in events[0].identity) && !("timeDisplay" in events[0].identity), "the extracted identity must never carry a time field at all");
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].eventId, "new-evt-heroes");
    assert.strictEqual(links[0].matchType, "manual");
    assert.strictEqual(enrichmentCalls.length, 1, "the existing generic enrichment pipeline must be reused once a new event was created");
  }
  console.log("PASS: a new event is created when the article alone contains sufficient verified information, and generic enrichment is reused afterward");

  // --- 10. No invented time: createEvent's own row-builder never includes
  //     time_display/is_all_day, even when the article text contains an
  //     explicit clock time. ---
  {
    const { createEvent } = require(`${REPO_DIR}/scripts/press-coverage-linking.js`);
    const fetchFn = async (url, opts) => {
      const body = JSON.parse(opts.body);
      assert.ok(!("time_display" in body), "createEvent must never write time_display");
      assert.ok(!("is_all_day" in body), "createEvent must never write is_all_day -- both stay at their honest DB defaults");
      return { ok: true, status: 201, json: async () => [{ id: "evt-x", ...body }] };
    };
    global.fetch = fetchFn;
    const sbHeaders = {};
    await createEvent(
      "https://example.supabase.co", "test-key", sbHeaders,
      { title: "Some Show", venueName: "Some Hall", city: null, category: "music", startDate: "2026-10-01", endDate: null, description: null },
      new Map()
    );
  }
  console.log("PASS: no invented time -- an automated event row never carries a time_display or is_all_day, whatever the article text says");

  // --- 11. Two articles resolve to ONE canonical event via POOLING
  //     (rewritten 2026-09-23, "SMALL CORRECTION BEFORE DEPLOYMENT" item 3)
  //     -- the real Metro Times Recovery & Resilience Festival scenario:
  //     article A (LOL) has date+category but no venue/city; article B
  //     (Downriver, excerpt only) has a city but no date. Neither is
  //     independently sufficient -- pooling them BEFORE deciding is what
  //     makes this creatable, exactly like the PO's own acceptance example
  //     (mocked discoverEventVenueFn standing in for a configured TAVILY_API_KEY
  //     resolving the venue itself). Learned venue knowledge is persisted. ---
  {
    let createCalls = 0;
    const links = [];
    const upsertCalls = [];
    const discoverCalls = [];
    const counts = await linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      nowIso: "2026-09-18", // pinned -- see [FIX PAST-EVENT RECAP CLUTTER, 2026-09-25]
      fetchQueue: async () => [
        { id: "article-downriver", title: DOWNRIVER_HEADLINE, excerpt: DOWNRIVER_EXCERPT, url: "https://example.com/downriver", published_at: "2026-09-18T14:58:57+00:00" },
        { id: "article-lol", title: LOL_HEADLINE, excerpt: "", url: "https://example.com/lol", published_at: "2026-09-18T14:59:51+00:00" },
      ],
      fetchCandidateEvents: async () => [],
      fetchArticleTextFn: async (url) => (url.endsWith("/downriver") ? DOWNRIVER_EXCERPT : LOL_BODY),
      buildVenueIdMap: async () => new Map(),
      applyLinkFn: async (_u, _h, articleId, eventId, matchType) => { links.push({ articleId, eventId, matchType }); return true; },
      createEventFn: async (_u, _k, _h, identity) => {
        createCalls++;
        return { id: "evt-recovery", title: identity.title, venue_name_raw: identity.venueName, start_date: identity.startDate };
      },
      isExternalDiscoveryConfiguredFn: () => true, // simulating a configured TAVILY_API_KEY
      discoverEventVenueFn: async (opts) => {
        discoverCalls.push(opts);
        assert.strictEqual(opts.eventTitle, "Recovery & Resilience Festival");
        assert.strictEqual(opts.city, "Wyandotte", "must search using the CITY pooled in from the other article, even though this call is made once for the whole group");
        return { venueName: "Yack Arena", city: "Wyandotte", address: "3131 3rd St", website: "https://yackarena.example", sourceUrl: "https://yackarena.example/events" };
      },
      upsertVenueKnowledgeFn: async (_u, _k, discovery) => { upsertCalls.push(discovery); return { id: "venue-99", name: discovery.name }; },
      repairGenericMetadataFn: async () => ({ written: 0 }),
    });
    assert.strictEqual(discoverCalls.length, 1, "external venue resolution must be attempted exactly ONCE for the whole pooled group, not once per article");
    assert.strictEqual(createCalls, 1, "only ONE event must be created for the pooled group");
    assert.strictEqual(counts.autoCreated, 1);
    assert.strictEqual(counts.crossArticleDuplicatesPrevented, 1, "the second article must be recognized as covering the same event, not create a duplicate");
    assert.strictEqual(links.length, 2);
    assert.strictEqual(links[0].eventId, "evt-recovery");
    assert.strictEqual(links[1].eventId, "evt-recovery", "both articles must end up linked to the SAME single event");
    assert.strictEqual(upsertCalls.length, 1, "the externally-resolved venue must be persisted as reusable venue knowledge");
    assert.strictEqual(upsertCalls[0].name, "Yack Arena");
  }
  console.log("PASS: two articles that are each individually insufficient on venue pool their evidence and resolve to ONE canonical event via external venue discovery");

  // --- 11b. The REALISTIC unconfigured-today case: same pooled Recovery
  //     Festival scenario, but external discovery is unconfigured (the real
  //     production state -- no TAVILY_API_KEY today). Both articles must
  //     stay human TOGETHER, as one pooled decision, not two independent
  //     failures with different reasons. ---
  {
    const counts = await linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      nowIso: "2026-09-18", // pinned -- see [FIX PAST-EVENT RECAP CLUTTER, 2026-09-25]
      fetchQueue: async () => [
        { id: "article-downriver", title: DOWNRIVER_HEADLINE, excerpt: DOWNRIVER_EXCERPT, url: "https://example.com/downriver", published_at: "2026-09-18T14:58:57+00:00" },
        { id: "article-lol", title: LOL_HEADLINE, excerpt: "", url: "https://example.com/lol", published_at: "2026-09-18T14:59:51+00:00" },
      ],
      fetchCandidateEvents: async () => [],
      fetchArticleTextFn: async (url) => (url.endsWith("/downriver") ? DOWNRIVER_EXCERPT : LOL_BODY),
      buildVenueIdMap: async () => new Map(),
      isExternalDiscoveryConfiguredFn: () => false, // no TAVILY_API_KEY -- today's real state
      discoverEventVenueFn: async () => { throw new Error("must never even be called when external discovery isn't configured"); },
      createEventFn: async () => { throw new Error("must never create without sufficient evidence"); },
      repairGenericMetadataFn: async () => { throw new Error("must never run enrichment when nothing was created"); },
    });
    assert.strictEqual(counts.autoCreated, 0);
    assert.strictEqual(counts.stillHuman, 2);
    assert.strictEqual(counts.stillHumanDetail.length, 2);
    assert.deepStrictEqual(counts.stillHumanDetail[0].reasons, counts.stillHumanDetail[1].reasons, "both pooled articles must share the SAME decision/reason, not fail independently");
    assert.deepStrictEqual(counts.stillHumanDetail[0].reasons, ["NO_CONFIDENT_VENUE"]);
  }
  console.log("PASS: with external discovery unconfigured (today's real state), the pooled Recovery Festival group stays human TOGETHER with one shared reason, not two independent failures");

  // --- 11c. Item 2 -- a legitimately venueless/distributed event (city +
  //     explicit distributed signal) is created WITHOUT a fabricated
  //     venue/address. Uses a synthetic title that DOES satisfy title
  //     extraction (proving the mechanism itself) -- the real Kitchens for
  //     a Cause article's own headline/body does not pass title extraction
  //     today (a separate, out-of-scope gap; see delivery report). ---
  {
    const distributedBody =
      "The public is invited to a culinary tour of seven newly renovated kitchens this weekend as the " +
      "Neighborhood Kitchen Showcase returns to Grosse Pointe on Sept. 25 this year.";
    let createdRow = null;
    const counts = await linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      nowIso: "2026-09-16", // pinned -- see [FIX PAST-EVENT RECAP CLUTTER, 2026-09-25]
      fetchQueue: async () => [{ id: "article-kitchens", title: "Neighborhood Kitchen Showcase set for this weekend", excerpt: "", url: "https://example.com/kitchens", published_at: "2026-09-16T15:05:58+00:00" }],
      fetchCandidateEvents: async () => [],
      fetchArticleTextFn: async () => distributedBody,
      buildVenueIdMap: async () => new Map(),
      isExternalDiscoveryConfiguredFn: () => true,
      discoverEventVenueFn: async () => { throw new Error("must never attempt external resolution when a distributed event already has a confident city"); },
      applyLinkFn: async () => true,
      createEventFn: async (_u, _k, _h, identity) => { createdRow = identity; return { id: "evt-kitchens", title: identity.title, venue_name_raw: identity.venueName, start_date: identity.startDate }; },
      repairGenericMetadataFn: async () => ({ written: 0 }),
    });
    assert.strictEqual(counts.autoCreated, 1);
    assert.strictEqual(counts.stillHuman, 0);
    assert.ok(createdRow, "the distributed event must be created");
    assert.strictEqual(createdRow.venueName, null, "a distributed event must never be given a fabricated single venue");
    assert.strictEqual(createdRow.city, "Grosse Pointe");
  }
  console.log("PASS: a legitimately distributed/venueless event (self-guided kitchen tour) is created from city + distributed signal alone, never a fabricated venue");

  // --- 12. Ambiguous/insufficient evidence stays human, with accurate
  //     per-article reason codes -- never a guess, never silently dropped. ---
  {
    const links = [];
    let createCalls = 0;
    const counts = await linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      fetchQueue: async () => [{ id: "article-photos", title: PHOTOS_HEADLINE, excerpt: "", url: "https://example.com/photos", published_at: "2026-09-21T14:58:42+00:00" }],
      fetchCandidateEvents: async () => [],
      fetchArticleTextFn: async () => PHOTOS_BODY,
      buildVenueIdMap: async () => new Map(),
      applyLinkFn: async (...args) => { links.push(args); return true; },
      createEventFn: async () => { createCalls++; return null; },
      repairGenericMetadataFn: async () => ({ written: 0 }),
    });
    assert.strictEqual(counts.stillHuman, 1);
    assert.strictEqual(counts.autoCreated, 0);
    assert.strictEqual(counts.autoMatched, 0);
    assert.strictEqual(createCalls, 0, "must never even attempt to create an event without sufficient evidence");
    assert.strictEqual(links.length, 0, "must never link an unresolved article to anything");
    assert.strictEqual(counts.stillHumanDetail.length, 1);
    assert.ok(counts.stillHumanDetail[0].reasons.includes("NO_TITLE_SIGNAL"));
    assert.ok(counts.stillHumanDetail[0].reasons.includes("NO_VENUE_OR_CITY_SIGNAL"));
    assert.ok(counts.stillHumanDetail[0].reasons.includes("NO_DATE_SIGNAL"));
  }
  console.log("PASS: an article with genuinely ambiguous/insufficient evidence stays in the queue for a human, with honest reason codes");

  // --- 13. Manual/existing data is never touched by a MATCH -- only
  //     editorial_articles/editorial_article_events are ever written; the
  //     events table itself is never PATCHed or re-created for a match. ---
  {
    let createCalls = 0;
    const links = [];
    const counts = await linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      fetchQueue: async () => [{ id: "article-lol", title: LOL_HEADLINE, excerpt: "", url: "https://example.com/lol", published_at: "2026-09-18T14:59:51+00:00" }],
      fetchCandidateEvents: async () => [{ id: "evt-recovery-existing", title: "Recovery & Resilience Festival", venue_name_raw: "Ford Community Center", start_date: "2026-09-20" }],
      fetchArticleTextFn: async () => LOL_BODY,
      buildVenueIdMap: async () => new Map(),
      applyLinkFn: async (_u, _h, articleId, eventId, matchType) => { links.push({ articleId, eventId, matchType }); return true; },
      createEventFn: async () => { createCalls++; return null; },
      repairGenericMetadataFn: async () => { throw new Error("must never be called when nothing was created"); },
    });
    assert.strictEqual(counts.autoMatched, 1);
    assert.strictEqual(createCalls, 0, "an existing event must never be re-created or overwritten by a match");
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].eventId, "evt-recovery-existing");
    assert.strictEqual(links[0].matchType, "title");
  }
  console.log("PASS: a matched article never touches the events table -- only the article/join tables are written, existing event data stays untouched");

  // --- 14. Rerun does not duplicate: the default fetchQueue only ever
  //     returns matched_event_id IS NULL rows (the same guard
  //     api/admin-editorial.js's own link_event uses), so an
  //     already-linked article structurally can never be reprocessed --
  //     an empty queue on the "next run" does nothing at all. ---
  {
    const counts = await linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      fetchQueue: async () => [], // nothing left unmatched -- everything from the "first run" is already linked
      fetchCandidateEvents: async () => { throw new Error("must not even bother loading candidates when the queue is empty"); },
      repairGenericMetadataFn: async () => { throw new Error("must never run enrichment when nothing was created"); },
    });
    assert.strictEqual(counts.totalConsidered, 0);
    assert.strictEqual(counts.autoCreated, 0);
    assert.strictEqual(counts.autoMatched, 0);
  }
  console.log("PASS: rerun does not duplicate -- an empty (already-resolved) queue does nothing, never re-creates or re-links");

  // --- 15. The default applyLink() itself is is.null-guarded, same as
  //     api/admin-editorial.js's link_event action -- a second call for an
  //     already-linked article is a harmless no-op, proven against the real
  //     default implementation (not a mock). ---
  {
    const { applyLink } = require(`${REPO_DIR}/scripts/press-coverage-linking.js`);
    const patchCalls = [];
    const fetchFn = async (url, opts) => {
      if (opts.method === "PATCH") {
        patchCalls.push(url);
        assert.ok(url.includes("matched_event_id=is.null"), "the PATCH must always re-assert matched_event_id is still null, never overwrite an existing link");
        return { ok: true, status: 200 };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    global.fetch = fetchFn;
    await applyLink("https://example.supabase.co", {}, "article-1", "evt-1", "manual");
    assert.strictEqual(patchCalls.length, 1);
    assert.ok(patchCalls[0].includes("is.null"));
  }
  console.log("PASS: applyLink's own default implementation always re-asserts matched_event_id is still null before writing");

  // --- 16. [FIX PAST-EVENT RECAP CLUTTER, 2026-09-25] An article whose only
  //     stated date is already past (the real Lathrup Village Music
  //     Festival recap, published 12 days after its own event) is
  //     auto-dismissed outright -- never left stuck in the human queue,
  //     never risked as a bogus past-dated event even if every other field
  //     happened to extract cleanly. ---
  {
    const dismissed = [];
    const counts = await linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      nowIso: "2026-09-25", // "today" for this test -- after the recap's own Sept 12 event date
      fetchQueue: async () => [{ id: "article-lathrup", title: LATHRUP_HEADLINE, excerpt: "", url: "https://example.com/lathrup", published_at: "2026-09-24T12:00:00+00:00" }],
      fetchCandidateEvents: async () => [],
      fetchArticleTextFn: async () => LATHRUP_BODY,
      buildVenueIdMap: async () => new Map(),
      createEventFn: async () => { throw new Error("must never create an event for something already over"); },
      dismissArticleFn: async (_u, _h, articleId) => { dismissed.push(articleId); return true; },
      repairGenericMetadataFn: async () => { throw new Error("must never run enrichment when nothing was created"); },
    });
    assert.strictEqual(counts.autoDismissedPast, 1);
    assert.strictEqual(counts.autoCreated, 0);
    assert.strictEqual(counts.stillHuman, 0, "a past-event recap must never sit in the human queue either -- it's dismissed outright, not left stuck");
    assert.strictEqual(dismissed.length, 1);
    assert.strictEqual(dismissed[0], "article-lathrup");
    assert.strictEqual(counts.autoDismissedPastDetail.length, 1);
    assert.strictEqual(counts.autoDismissedPastDetail[0].date, "2026-09-12");
  }
  console.log("PASS: [FIX PAST-EVENT RECAP CLUTTER] a real recap whose only stated date is already past is auto-dismissed, never left for a human to dismiss by hand and never created as a bogus past-dated event");

  // --- 17. [FIX PAST-EVENT RECAP CLUTTER] An article naming BOTH a past
  //     reference and a genuine upcoming date must NOT be auto-dismissed --
  //     only when every extracted date is in the past. ---
  {
    const body = "Last year's turnout for the show was huge on Sept. 10. This year's show returns Oct. 15.";
    const counts = await linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      nowIso: "2026-09-25",
      fetchQueue: async () => [{ id: "article-mixed-dates", title: "Untitled", excerpt: "", url: "https://example.com/mixed", published_at: "2026-09-20T12:00:00+00:00" }],
      fetchCandidateEvents: async () => [],
      fetchArticleTextFn: async () => body,
      buildVenueIdMap: async () => new Map(),
      dismissArticleFn: async () => { throw new Error("must never auto-dismiss an article that also names a real upcoming date"); },
      repairGenericMetadataFn: async () => ({ written: 0 }),
    });
    assert.strictEqual(counts.autoDismissedPast, 0);
  }
  console.log("PASS: [FIX PAST-EVENT RECAP CLUTTER] an article naming both a past reference and a genuine upcoming date is never auto-dismissed -- only when every extracted date is in the past");

  // --- 18. [FIX PAST-EVENT RECAP CLUTTER] End-to-end: the real Mac Watts
  //     article -- Jody's own example of an article that should be
  //     resolvable -- now auto-creates, with title via the performer
  //     fallback and location via street-address+city, WITHOUT needing
  //     external venue discovery (unconfigured in real production today). ---
  {
    let createdRow = null;
    const counts = await linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      nowIso: "2026-09-23", // "today" for this test -- before the Sept 26 event
      fetchQueue: async () => [{ id: "article-macwatts", title: MAC_WATTS_HEADLINE, excerpt: "", url: "https://example.com/macwatts", published_at: "2026-09-23T15:03:44+00:00" }],
      fetchCandidateEvents: async () => [],
      fetchArticleTextFn: async () => MAC_WATTS_BODY,
      buildVenueIdMap: async () => new Map(),
      isExternalDiscoveryConfiguredFn: () => false, // no TAVILY_API_KEY -- today's real state
      discoverEventVenueFn: async () => { throw new Error("must never attempt external resolution when street-address+city already supply a confident location"); },
      applyLinkFn: async () => true,
      createEventFn: async (_u, _k, _h, identity) => {
        createdRow = identity;
        return { id: "evt-macwatts", title: identity.title, venue_name_raw: identity.venueName || "Venue TBA", start_date: identity.startDate };
      },
      repairGenericMetadataFn: async () => ({ written: 0 }),
    });
    assert.strictEqual(counts.autoCreated, 1, "a real concert article with a performer name and a street address -- but no formal title phrase or named venue -- must now resolve automatically");
    assert.strictEqual(counts.stillHuman, 0);
    assert.ok(createdRow);
    assert.strictEqual(createdRow.title, "Mac Watts");
    assert.strictEqual(createdRow.venueName, null, "must never fabricate a single venue name from \"the parking lot between two businesses\" -- the street-address+city path is what makes this creatable, not a guessed venue");
    assert.strictEqual(createdRow.city, "Grosse Pointe Park");
    assert.strictEqual(createdRow.streetAddress, "15118 Mack");
    assert.strictEqual(createdRow.startDate, "2026-09-26");
    assert.strictEqual(createdRow.category, "music");
  }
  console.log("PASS: [FIX PAST-EVENT RECAP CLUTTER] the real Mac Watts article now resolves automatically -- title via the performer fallback, location via street-address+city, no external search needed");

  // --- 19. [FIX PAST-EVENT RECAP CLUTTER] createEvent's own default row-
  //     builder: falls back to this project's existing "Venue TBA"
  //     placeholder (never null/blank) when isSufficientForCreate accepted
  //     an identity without a venue name, and writes venue_address_raw when
  //     a street address is known. ---
  {
    const { createEvent } = require(`${REPO_DIR}/scripts/press-coverage-linking.js`);
    let capturedBody = null;
    const fetchFn = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, status: 201, json: async () => [{ id: "evt-macwatts-2", ...capturedBody }] };
    };
    global.fetch = fetchFn;
    await createEvent(
      "https://example.supabase.co", "test-key", {},
      { title: "Mac Watts", venueName: null, city: "Grosse Pointe Park", streetAddress: "15118 Mack", category: "music", startDate: "2026-09-26", endDate: null, description: null },
      new Map()
    );
    assert.strictEqual(capturedBody.venue_name_raw, "Venue TBA", "no venue name known -- must fall back to this project's existing 'Venue TBA' placeholder, never null/blank");
    assert.strictEqual(capturedBody.venue_address_raw, "15118 Mack");
    assert.strictEqual(capturedBody.venue_city_raw, "Grosse Pointe Park");
  }
  console.log("PASS: [FIX PAST-EVENT RECAP CLUTTER] createEvent falls back to 'Venue TBA' and writes venue_address_raw when only a street address is known, never a fabricated venue name");

  await runProductionPathRegressionTests();
  console.log("\nAll press-coverage-linking.js orchestrator tests passed.");
}

// ---------------------------------------------------------------------------
// PRODUCTION BUG REGRESSION (2026-09-23) — "Considered: 6 / Matched: 0 /
// Created: 0 / Still needs review: 6" on the real deployed Auto-Link button,
// contradicting the pre-deployment simulation (2 auto-created / 4 human).
//
// Root cause #1 (universal — affected every article, every write):
// linkPressCoverageQueue() built its own sbHeaders WITHOUT
// "Content-Type": "application/json" (unlike api/admin-editorial.js's own
// sbHeaders, which always has it). fetch() defaults a JSON.stringify'd
// body to Content-Type: text/plain when none is set, and PostgREST rejects
// that outright — confirmed against LIVE production Supabase with a real,
// side-effect-free request: 400 PGRST102 "Content-Type not acceptable:
// text/plain" without the header, 204 with it. Every createEvent/applyLink
// write hit this and was silently converted by this file's own !resp.ok
// checks into CREATE_FAILED/LINK_WRITE_FAILED — i.e. "still needs review"
// with no visible error, however sufficient the extracted identity was.
//
// Root cause #2 (Heroes-specific, compounding): AT_VENUE_RE's trailing
// lookahead required the terminating period/comma to immediately follow
// the venue phrase with zero characters between. stripHtml() turns an
// HTML tag boundary into a literal space, so Hour Detroit's real page
// reads "...at Color Ink Studio in Hazel Park . The exhibition..." (a
// stray space before the period) — this silently defeated the match on
// the REAL page even though the same phrase matched fine on a hand-typed
// test fixture that never had that space.
//
// These tests reproduce the ACTUAL production execution path — the real
// default sbHeaders construction, the real default createEvent/applyLink/
// fetchArticleText functions (never overridden with createEventFn/
// applyLinkFn mocks the way the earlier tests in this file do) — against a
// mocked fetch that enforces the SAME Content-Type rule the real,
// deployed PostgREST instance enforces, and against REAL Hour Detroit page
// text (a trimmed but verbatim excerpt, captured live 2026-09-23) for the
// AT_VENUE_RE fix. Purely synthetic direct-function tests (like #9 above,
// which override createEventFn/applyLinkFn and so never exercise the real
// sbHeaders/fetch wiring at all) would not have caught either bug.
async function runProductionPathRegressionTests() {
  // A verbatim (trimmed) excerpt of Hour Detroit's real, live page after
  // stripHtml() — captured 2026-09-23 while debugging this production
  // report. Note the stray space before the period after "Hazel Park",
  // exactly as stripHtml() actually produces it from the real markup.
  const HEROES_REAL_PAGE_HTML =
    "<html><body><nav>FOOD COMMUNITY ARTS & AGENDA EVENTS</nav><article>" +
    "<h1>Douglas Elbinger on His Career Retrospective Exhibition &lsquo;Heroes of the Revolution&rsquo;</h1>" +
    "<p>Douglas Elbinger isn&rsquo;t afraid to be controversial. Proof of that can be found in " +
    "&ldquo;Heroes of the Revolution,&rdquo; his career retrospective exhibition opening on Sept. 19 at " +
    "<a href=\"https://colorinkstudio.com\">Color Ink Studio in Hazel Park</a>. The exhibition features photos " +
    "over multiple decades of some of the most impactful figures in modern history.</p>" +
    "<p>Heroes of the Revolution runs from Sept. 19-Oct. 30.</p>" +
    "</article></body></html>";

  // --- 16. Root cause #1 regression: the REAL default sbHeaders/createEvent/
  //     applyLink wiring (nothing overridden) must send Content-Type:
  //     application/json on every write, or a PostgREST-faithful mock
  //     rejects it exactly like real production did. ---
  {
    const queueRow = {
      id: "article-heroes-prod",
      title: "Douglas Elbinger on His Career Retrospective Exhibition ‘Heroes of the Revolution’",
      excerpt: "",
      url: "https://example.com/heroes-prod",
      published_at: "2026-09-18T21:56:49+00:00",
    };
    const writeAttempts = []; // { url, method, contentType }
    const fetchFn = async (url, opts = {}) => {
      const method = opts.method || "GET";
      if (method === "GET" && url.includes("/editorial_articles")) {
        return { ok: true, status: 200, json: async () => [queueRow] };
      }
      if (method === "GET" && url.includes("/events?status=")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (method === "GET" && url.includes("/venues?select=")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (method === "GET" && url === queueRow.url) {
        return { ok: true, status: 200, text: async () => HEROES_REAL_PAGE_HTML };
      }
      if (method === "POST" || method === "PATCH") {
        const contentType = opts.headers && opts.headers["Content-Type"];
        writeAttempts.push({ url, method, contentType });
        if (contentType !== "application/json") {
          // The REAL PostgREST response, verified live against production
          // Supabase 2026-09-23 (a real, side-effect-free 400).
          return { ok: false, status: 400, json: async () => ({ code: "PGRST102", message: "Content-Type not acceptable: text/plain" }) };
        }
        if (url.includes("/events") && !url.includes("/editorial_article_events") && method === "POST") {
          return { ok: true, status: 201, json: async () => [{ id: "evt-heroes-prod", title: "Heroes of the Revolution", venue_name_raw: "Color Ink Studio", start_date: "2026-09-18" }] };
        }
        return { ok: true, status: 204, json: async () => ({}) };
      }
      throw new Error(`unexpected fetch in production-path regression test: ${method} ${url}`);
    };
    global.fetch = fetchFn;

    const { linkPressCoverageQueue: realOrchestrator } = freshLib();
    const counts = await realOrchestrator({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      nowIso: "2026-09-18", // pinned -- see [FIX PAST-EVENT RECAP CLUTTER, 2026-09-25]
      repairGenericMetadataFn: async () => ({ written: 0 }),
      // Deliberately NOT overriding fetchQueue / fetchCandidateEvents /
      // fetchArticleTextFn / applyLinkFn / createEventFn / buildVenueIdMap —
      // this exercises the REAL default implementations and the REAL
      // internal sbHeaders, exactly like the deployed Admin Auto-Link path.
    });

    assert.ok(writeAttempts.length > 0, "the real default createEvent/applyLink must have attempted at least one write");
    assert.ok(
      writeAttempts.every((a) => a.contentType === "application/json"),
      `every real write must send Content-Type: application/json (production regression) — got: ${JSON.stringify(writeAttempts)}`
    );
    assert.strictEqual(counts.autoCreated, 1, "with the real page text and the real wiring, Heroes must actually be created — not silently rejected");
    assert.strictEqual(counts.stillHuman, 0);
  }
  console.log("PASS: [PRODUCTION REGRESSION] the real default sbHeaders/createEvent/applyLink wiring sends Content-Type: application/json, matching what real production PostgREST requires — a mock that enforces PostgREST's actual rule now succeeds instead of silently rejecting every write");

  // --- 17. Root cause #2 regression: extractVenue must find the venue
  //     phrase in text stripped from REAL markup, where an inline tag
  //     boundary (e.g. a link around the venue name) leaves a stray space
  //     before the terminating period — not just on a hand-typed fixture
  //     that never has that space. ---
  {
    const { extractVenue } = freshLib();
    const realStrippedText =
      "Proof of that can be found in “Heroes of the Revolution,” his career retrospective exhibition " +
      "opening on Sept. 19 at Color Ink Studio in Hazel Park . The exhibition features photos over multiple decades.";
    assert.deepStrictEqual(
      extractVenue(realStrippedText),
      { name: "Color Ink Studio", city: "Hazel Park" },
      "must find the venue even with a stray space before the period (a real stripHtml() artifact from an inline tag boundary), not just on cleanly hand-typed text"
    );
  }
  console.log("PASS: [PRODUCTION REGRESSION] extractVenue tolerates a stray space before terminal punctuation, the real stripHtml() artifact that defeated this match in production");

  // --- 18. Root cause #3 regression ("FINISH EDITORIAL / PRESS COVERAGE
  //     AUTOMATION", 2026-09-23): AT_VENUE_RE never matched either real
  //     Metro Times Recovery & Resilience Festival article, even though
  //     BOTH name their venue in full — "at the Downriver Council for the
  //     Arts, 81 Chestnut St., Wyandotte" and "held at 81 Chestnut Street
  //     in Wyandotte." Two compounding gaps, verbatim (trimmed) text from
  //     the real live pages captured while tracing this report:
  //       (a) "at THE <Venue>" — the definite article between "at" and the
  //           venue's own name was previously fatal (the pattern required
  //           the very next character after "at " to start the venue name).
  //       (b) a venue name with its own internal lowercase connector word
  //           ("Council FOR THE Arts") previously truncated the match at
  //           the first lowercase word ("Downriver Council"), which is
  //           worse than no match — resolveVenueId never fuzzy-matches, so
  //           a truncated name silently fails to resolve against the real
  //           venue even when a match is found at all.
  //     Also proves the fix does NOT turn the article's own back-reference
  //     to its own event name ("speak at the Recovery and Resilience
  //     Festival") into a false "venue" — the new event-noun-suffix guard
  //     (VENUE_REJECT_EVENT_NOUN_RE) exists specifically to keep the (a)
  //     fix from over-matching. ---
  {
    const { extractVenue } = freshLib();
    const downriverRealStripped =
      "September is National Recovery Month, and the Downriver Council for the Arts and Passenger Recovery are " +
      "marking the occasion with the first Recovery & Resilience Festival: A Celebration of Recovery Pathways on " +
      "Sept. 20, featuring guest speaker Lol Tolhurst of The Cure. The first Recovery & Resilience Festival is " +
      "free and open to all. It runs from noon to 10 p.m. Sunday, Sept. 20, at the Downriver Council for the " +
      "Arts , 81 Chestnut St., Wyandotte.";
    const lolRealStripped =
      "Tolhurst is speaking at the Recovery and Resilience Festival on Sunday, Sept. 20, about recovery and " +
      "managing substance use disorder. Tolhurst will speak at 6 p.m. at the Recovery and Resilience Festival. " +
      "The free event will be held at 81 Chestnut Street in Wyandotte, with free tickets available online.";
    assert.deepStrictEqual(
      extractVenue(downriverRealStripped),
      { name: "Downriver Council for the Arts", city: null },
      "must find the FULL venue name including its internal 'for the' connector words, from real 'at the <Venue>' phrasing"
    );
    assert.strictEqual(
      extractVenue(lolRealStripped),
      null,
      "this article never names a venue -- 'at the Recovery and Resilience Festival' is the article referring back to the EVENT itself and must never be read as a venue, even with the new (a)/(b) tolerance"
    );
  }
  console.log("PASS: [PRODUCTION REGRESSION] extractVenue finds a real venue name stated as \"at the <Venue>\" (including internal connector words like \"for the\"), while still never mistaking the article's own back-reference to its event's name for a venue");

  // --- 19. End-to-end production-path proof: with the (a)/(b) fix above,
  //     BOTH real Recovery & Resilience Festival articles pool to ONE
  //     created event purely from their own text -- no TAVILY_API_KEY
  //     needed for this case at all (isExternalDiscoveryConfiguredFn/
  //     tavilyApiKey are deliberately left at their REAL defaults here,
  //     reading process.env.TAVILY_API_KEY exactly like the real deployed
  //     Auto-Link path -- this project has no such credential configured
  //     today, confirmed via a full .env.local audit, so this proves the
  //     fix works in exactly the unconfigured state production is
  //     actually in, not a hypothetical configured one). Real default
  //     sbHeaders/createEvent/applyLink/fetchArticleText wiring throughout
  //     (nothing overridden), same PostgREST-faithful mock as test #16. ---
  {
    const downriverHtml =
      "<html><body><article><h1>Downriver recovery festival brings music, art and support together</h1>" +
      "<p>September is National Recovery Month, and the Downriver Council for the Arts and Passenger Recovery are " +
      "marking the occasion with the first Recovery &amp; Resilience Festival: A Celebration of Recovery Pathways " +
      "on Sept. 20, featuring guest speaker Lol Tolhurst of The Cure.</p>" +
      "<p>The first Recovery &amp; Resilience Festival is free and open to all. It runs from noon to 10 p.m. " +
      "Sunday, Sept. 20, at <a href=\"https://example.org\">the Downriver Council for the Arts</a>, 81 Chestnut " +
      "St., Wyandotte.</p></article></body></html>";
    const lolHtml =
      "<html><body><article><h1>The Cure co-founder Lol Tolhurst talks recovery, goth and Detroit</h1>" +
      "<p>Tolhurst is speaking at the Recovery and Resilience Festival on Sunday, Sept. 20, about recovery and " +
      "managing substance use disorder.</p>" +
      "<p>Tolhurst will speak at 6 p.m. at the Recovery and Resilience Festival. The free event will be held at " +
      "81 Chestnut Street in Wyandotte, with free tickets available online.</p></article></body></html>";
    const downriverRow = {
      id: "article-downriver-prod",
      title: DOWNRIVER_HEADLINE,
      excerpt: DOWNRIVER_EXCERPT,
      url: "https://example.com/downriver-prod",
      published_at: "2026-09-18T14:58:57+00:00",
    };
    const lolRow = {
      id: "article-lol-prod",
      title: LOL_HEADLINE,
      excerpt: "",
      url: "https://example.com/lol-prod",
      published_at: "2026-09-18T14:59:51+00:00",
    };
    const writeAttempts = [];
    const fetchFn = async (url, opts = {}) => {
      const method = opts.method || "GET";
      if (method === "GET" && url.includes("/editorial_articles")) {
        return { ok: true, status: 200, json: async () => [downriverRow, lolRow] };
      }
      if (method === "GET" && url.includes("/events?status=")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (method === "GET" && url.includes("/venues?select=")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (method === "GET" && url === downriverRow.url) {
        return { ok: true, status: 200, text: async () => downriverHtml };
      }
      if (method === "GET" && url === lolRow.url) {
        return { ok: true, status: 200, text: async () => lolHtml };
      }
      if (method === "POST" || method === "PATCH") {
        const contentType = opts.headers && opts.headers["Content-Type"];
        writeAttempts.push({ url, method, contentType });
        if (contentType !== "application/json") {
          return { ok: false, status: 400, json: async () => ({ code: "PGRST102", message: "Content-Type not acceptable: text/plain" }) };
        }
        if (url.includes("/events") && !url.includes("/editorial_article_events") && method === "POST") {
          return { ok: true, status: 201, json: async () => [{ id: "evt-recovery-prod", title: "Recovery & Resilience Festival", venue_name_raw: "Downriver Council for the Arts", start_date: "2026-09-20" }] };
        }
        return { ok: true, status: 204, json: async () => ({}) };
      }
      throw new Error(`unexpected fetch in Recovery Festival production-path regression test: ${method} ${url}`);
    };
    global.fetch = fetchFn;

    const { linkPressCoverageQueue: realOrchestrator } = freshLib();
    const counts = await realOrchestrator({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      logger: silentLogger,
      nowIso: "2026-09-18", // pinned -- see [FIX PAST-EVENT RECAP CLUTTER, 2026-09-25]
      repairGenericMetadataFn: async () => ({ written: 0 }),
      // isExternalDiscoveryConfiguredFn / tavilyApiKey deliberately left at
      // their real defaults (process.env.TAVILY_API_KEY, unset in this
      // test environment, matching today's real deployed state) -- this
      // proves the fix resolves the pooled group WITHOUT external
      // discovery, exactly as it must in production today.
    });

    assert.strictEqual(counts.autoCreated, 1, "the pooled Recovery & Resilience Festival group must now be created from the articles' own text alone");
    assert.strictEqual(counts.stillHuman, 0);
    assert.strictEqual(counts.crossArticleDuplicatesPrevented, 1, "both articles must resolve to the SAME single event, not two");
    assert.ok(writeAttempts.length > 0);
    assert.ok(writeAttempts.every((a) => a.contentType === "application/json"));
  }
  console.log("PASS: [PRODUCTION REGRESSION] both real Recovery & Resilience Festival articles now pool to ONE created event via the real default pipeline wiring, with no external discovery needed");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
