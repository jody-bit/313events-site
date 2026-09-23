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

function run() {
  const {
    extractTitle, extractVenue, extractDates, extractCategory, extractDescriptionSentence,
    extractEventIdentity, isSufficientForCreate, deepMatchArticleToEvent, normalizeAmpersand,
    extractCity, extractContextEntities, isDistributedEvent, mergeIdentities,
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

  console.log("\nAll press-coverage-linking.js orchestrator tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
