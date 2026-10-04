// test/external-discovery-gate.test.js — the temporary gate on web-search
// enrichment (api/_lib/external-discovery.js), added 2026-10-04.
//
// WHY THE GATE EXISTS
// Production, 2026-10-01 to 10-03: the web-search tier stored site
// navigation text, other dates' pages and other events' pages as
// `authoritative` descriptions on public events, and created venue rows with
// an aggregator's homepage as the website and a defaulted city. Until the
// logic is repaired and validated it must not write again. See BUG-010 in
// project/BACKLOG.md.
//
// WHAT THIS TEST PROVES
//   1. The gate is closed by default and opens only on the exact string
//      "true".
//   2. Closed, with a real-looking search key configured exactly as in
//      production: not configured, no search request, null from all three
//      discovery functions.
//   3. Through the real enrichment pass (scripts/generic-metadata-
//      enrichment.js, the function the 12:30 UTC cron, the 23:00 UTC
//      editorial cron and Admin's Auto-Repair all call) with its real
//      defaults: closed, nothing from a search result is written — no
//      `authoritative` description, no venue created, no address, city or
//      note from a search — while every deterministic step still writes.
//   4. The SAME inputs with the gate open DO produce those web-search
//      writes. So (3) is the gate's doing, not an inert fixture, and the
//      gate is reversible by the flag alone.
//   5. Through the article-linking pass (scripts/press-coverage-linking.js)
//      with its real defaults: closed, no venue search and no venue created.
//   6. No other file sends a search request or reads the key, so the gate
//      cannot be bypassed.
//
// Plain Node assert, no dependencies.
// Run: node test/external-discovery-gate.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_DIR = path.resolve(process.env.REPO_DIR || process.cwd());
const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "test-service-key";
const GATE = "WEB_SEARCH_ENRICHMENT_ENABLED";
const silent = { log() {}, warn() {}, error() {} };

function fresh(file) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(`${REPO_DIR}/api/`) || key.startsWith(`${REPO_DIR}/scripts/`)) delete require.cache[key];
  }
  return require(`${REPO_DIR}/${file}`);
}

// Production's state: a real key is configured. The gate is the only thing
// that differs between the two halves of each test.
function setEnv(gateValue) {
  process.env.TAVILY_API_KEY = "tvly-a-real-looking-key";
  if (gateValue === undefined) delete process.env[GATE];
  else process.env[GATE] = gateValue;
}

const ok = (body, status) => ({ ok: true, status: status || 200, json: async () => body, text: async () => JSON.stringify(body) });

// A fake database plus a fake search provider behind one global fetch. The
// search provider answers every query with pages that PASS this module's own
// verification — the worst case: without the gate, each would be written.
function world({ venues, candidates }) {
  const log = { searches: [], venueWrites: [], eventPatches: [] };
  const storedVenues = venues.map((v) => ({ ...v }));
  global.fetch = async (url, init) => {
    const target = String(url);
    const method = ((init && init.method) || "GET").toUpperCase();
    if (target.startsWith("https://api.tavily.com/")) {
      const query = JSON.parse(init.body).query;
      log.searches.push(query);
      if (/official website/.test(query)) {
        // venue search (discoverVenueKnowledge)
        return ok({ results: [{ url: "https://detroit.gaycities.com/bars/pronto", title: "Pronto Royal Oak", content: "Pronto Royal Oak is a bar and restaurant at 608 S Washington Ave with a patio." }] });
      }
      // description search (discoverAuthoritativeDescription)
      return ok({ results: [{ url: "https://some-listing.example.com/throb", title: "THROB Saturdays", content: "THROB Saturdays is a weekly dance party with rotating resident DJs and drink specials all night long." }] });
    }
    if (!target.startsWith(SUPABASE_URL)) throw new Error("unmocked URL in test: " + target);
    if (target.includes("/rest/v1/venues")) {
      if (method === "GET") {
        const ilike = /name=ilike\.([^&]+)/.exec(target);
        if (ilike) return ok(storedVenues.filter((v) => v.name.toLowerCase() === decodeURIComponent(ilike[1]).toLowerCase()));
        return ok(storedVenues);
      }
      const body = JSON.parse(init.body);
      log.venueWrites.push({ method, body });
      if (method === "POST") { const row = { id: `venue-new-${storedVenues.length}`, facebook_url: null, ...body }; storedVenues.push(row); return ok([row], 201); }
      return ok([body]);
    }
    if (target.includes("/rest/v1/events")) {
      if (method === "GET") return ok(candidates.map((c) => ({ ...c })));
      if (method === "PATCH") {
        const id = decodeURIComponent(/id=eq\.([^&]+)/.exec(target)[1]);
        const body = JSON.parse(init.body);
        log.eventPatches.push({ id, body });
        return ok([{ id, ...body }]);
      }
    }
    throw new Error(`unmocked database request in test: ${method} ${target}`);
  };
  return { log, storedVenues };
}

const patchesFor = (log, id) => log.eventPatches.filter((p) => p.id === id).map((p) => p.body);
const fieldsWritten = (log, id) => patchesFor(log, id).flatMap((b) => Object.keys(b)).sort();

// One enrichment run's worth of events: three the deterministic steps can
// repair, and one only a web search could "repair".
function enrichmentFixture() {
  const venues = [
    { id: "venue-magic-stick", name: "Magic Stick", address: "4120 Woodward Ave", city: "Detroit", website: "https://majesticdetroit.com", facebook_url: null },
    { id: "venue-el-club", name: "El Club", address: "4114 Vernor Hwy", city: "Detroit", website: "https://elclubdetroit.com", facebook_url: null },
  ];
  const base = { category: "music", is_free: false, price_from: null, time_display: "9:00 PM", is_all_day: false, source: "VisitDetroit", note: null, venues: null };
  const candidates = [
    // (a) address known, venue name unknown -> venue name + link from the canonical address (deterministic)
    { ...base, id: "ev-reverse", title: "Reverse Lookup Night", description: "Already described.", start_date: "2026-10-10", venue_id: null, venue_name_raw: null, venue_address_raw: "4114 Vernor Hwy", venue_city_raw: "Detroit", ticket_url: "https://tickets.example.com/a", event_url: null },
    // (b) venue name known and canonical, address/city blank -> copied from the canonical venue (deterministic)
    { ...base, id: "ev-forward", title: "Forward Lookup Night", description: "Already described.", start_date: "2026-10-11", venue_id: null, venue_name_raw: "Magic Stick", venue_address_raw: null, venue_city_raw: null, ticket_url: "https://tickets.example.com/b", event_url: null },
    // (c) linked venue, no description, no link -> generated description + venue's own site as the link (deterministic)
    { ...base, id: "ev-linked", title: "Linked Venue Night", description: null, start_date: "2026-10-12", venue_id: "venue-el-club", venue_name_raw: "El Club", venue_address_raw: "4114 Vernor Hwy", venue_city_raw: "Detroit", ticket_url: null, event_url: null, venues: { name: "El Club", address: "4114 Vernor Hwy", city: "Detroit", website: "https://elclubdetroit.com", facebook_url: null } },
    // (d) the production case: a venue name no canonical row resolves, no description -> only a web search can fill these
    { ...base, id: "ev-websearch", title: "THROB Saturdays", description: null, start_date: "2026-10-03", venue_id: null, venue_name_raw: "Pronto Royal Oak", venue_address_raw: null, venue_city_raw: null, ticket_url: "https://tickets.example.com/d", event_url: null },
  ];
  return { venues, candidates };
}

async function runEnrichment() {
  const { venues, candidates } = enrichmentFixture();
  const { log, storedVenues } = world({ venues, candidates });
  const { repairGenericMetadata } = fresh("scripts/generic-metadata-enrichment.js");
  // Called exactly as api/cron-enrichment.js, api/cron-editorial.js and
  // api/admin-events.js call it: nothing injected but the database
  // credentials, so every discovery default is the real one.
  const counts = await repairGenericMetadata({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silent });
  return { log, counts, storedVenues };
}

function assertDeterministicStepsWrote(log, label) {
  assert.deepStrictEqual(patchesFor(log, "ev-reverse"), [{ venue_id: "venue-el-club", venue_name_raw: "El Club" }], `${label}: venue name resolved from a canonical address`);
  assert.deepStrictEqual(fieldsWritten(log, "ev-forward"), ["venue_address_raw", "venue_city_raw", "venue_id"], `${label}: address and city copied from the canonical venue`);
  assert.strictEqual(patchesFor(log, "ev-forward")[0].venue_address_raw, "4120 Woodward Ave");
  const linked = patchesFor(log, "ev-linked");
  assert.ok(linked.some((b) => b.description_source === "generated" && /^Linked Venue Night takes place at El Club on /.test(b.description)), `${label}: generated (template) description still written`);
  assert.ok(linked.some((b) => b.event_url === "https://elclubdetroit.com"), `${label}: venue's own site still recovered as the event link`);
}

async function run() {
  const savedFetch = global.fetch;
  const savedEnv = { key: process.env.TAVILY_API_KEY, gate: process.env[GATE] };
  try {
    // =======================================================================
    // 1. Closed by default; opens only on the exact string "true"
    // =======================================================================
    {
      const lib = fresh("api/_lib/external-discovery.js");
      assert.strictEqual(lib.EXTERNAL_DISCOVERY_GATE_ENV, GATE);
      for (const value of [undefined, "", "false", "0", "1", "yes", "on", "TRUE", "True", " true", "true "]) {
        assert.strictEqual(lib.isExternalDiscoveryGateOpen(value === undefined ? {} : { [GATE]: value }), false, `gate must stay closed for ${JSON.stringify(value)}`);
      }
      assert.strictEqual(lib.isExternalDiscoveryGateOpen({ [GATE]: "true" }), true);
      assert.strictEqual(lib.isExternalDiscoveryGateOpen(null), false);
    }
    console.log('PASS: the gate is closed by default and opens only on the exact string "true"');

    // =======================================================================
    // 2. Closed, with a key configured as in production
    // =======================================================================
    {
      setEnv(undefined);
      const lib = fresh("api/_lib/external-discovery.js");
      assert.strictEqual(lib.isExternalDiscoveryConfigured(), false, "a configured key alone no longer means configured");
      assert.strictEqual(lib.isExternalDiscoveryConfigured({ TAVILY_API_KEY: "tvly-a-real-looking-key" }), false, "…nor does a key handed in by the caller");
      // A caller-built object cannot open the gate: it is read from the real environment only.
      assert.strictEqual(lib.isExternalDiscoveryConfigured({ TAVILY_API_KEY: "k", [GATE]: "true" }), false);

      let requests = 0;
      const wouldSucceed = async () => { requests++; return ok({ results: [{ url: "https://venue.example.com/x", title: "Garden Bowl THROB Saturdays", content: "Garden Bowl THROB Saturdays, a weekly night at 4120 Woodward Ave, Detroit, MI with resident DJs." }] }); };
      global.fetch = wouldSucceed;
      const event = { title: "THROB Saturdays", venue_name_raw: "Garden Bowl", start_date: "2026-10-03" };
      // explicit key + injected provider (what a test or a careless caller would do)…
      assert.strictEqual(await lib.discoverVenueKnowledge({ venueName: "Garden Bowl", apiKey: "k", fetchFn: wouldSucceed }), null);
      assert.strictEqual(await lib.discoverEventVenue({ eventTitle: "THROB Saturdays", city: "Detroit", apiKey: "k", fetchFn: wouldSucceed }), null);
      assert.strictEqual(await lib.discoverAuthoritativeDescription({ event, apiKey: "k", fetchFn: wouldSucceed }), null);
      // …and the production defaults (key from the environment, the real fetch).
      assert.strictEqual(await lib.discoverVenueKnowledge({ venueName: "Garden Bowl" }), null);
      assert.strictEqual(await lib.discoverEventVenue({ eventTitle: "THROB Saturdays", city: "Detroit" }), null);
      assert.strictEqual(await lib.discoverAuthoritativeDescription({ event }), null);
      assert.strictEqual(requests, 0, "no search request is sent while the gate is closed");

      // The same six calls with the gate open all search and all return something.
      setEnv("true");
      const open = fresh("api/_lib/external-discovery.js");
      assert.strictEqual(open.isExternalDiscoveryConfigured(), true);
      assert.ok(await open.discoverVenueKnowledge({ venueName: "Garden Bowl", apiKey: "k", fetchFn: wouldSucceed }));
      assert.ok(await open.discoverEventVenue({ eventTitle: "THROB Saturdays", city: "Detroit", apiKey: "k", fetchFn: wouldSucceed }));
      assert.ok(await open.discoverAuthoritativeDescription({ event, apiKey: "k", fetchFn: wouldSucceed }));
      assert.ok(await open.discoverVenueKnowledge({ venueName: "Garden Bowl" }));
      assert.ok(await open.discoverEventVenue({ eventTitle: "THROB Saturdays", city: "Detroit" }));
      assert.ok(await open.discoverAuthoritativeDescription({ event }));
      assert.strictEqual(requests, 6, "…so the closed result above is the gate, not a fixture that finds nothing");
    }
    console.log("PASS: closed, with a real key configured — not configured, no search request, null from all three discovery functions (and all three work when it is open)");

    // =======================================================================
    // 3. The enrichment pass, gate CLOSED (production)
    // =======================================================================
    {
      setEnv(undefined);
      const { log, counts, storedVenues } = await runEnrichment();

      assert.strictEqual(log.searches.length, 0, "no search request left the enrichment pass");
      assert.deepStrictEqual(log.venueWrites, [], "no venue was created or changed");
      assert.strictEqual(storedVenues.length, 2);
      const all = log.eventPatches.map((p) => p.body);
      assert.ok(all.every((b) => b.description_source !== "authoritative"), "no description was written from a search result");
      assert.ok(all.every((b) => !("note" in b)), "no search provenance note was written");

      // The event only a web search could fill: no address, city or venue
      // link is written. It still gets the deterministic template sentence,
      // built from its own stored fields, labelled `generated`.
      assert.deepStrictEqual(patchesFor(log, "ev-websearch"), [{ description: "THROB Saturdays takes place at Pronto Royal Oak on October 3 at 9:00 PM.", description_source: "generated" }]);

      assertDeterministicStepsWrote(log, "gate closed");
      assert.strictEqual(counts.externalSearchesAttempted, 0);
      assert.strictEqual(counts.externalVenueDiscoveryResolved, 0);
      assert.strictEqual(counts.externalDescriptionsRecovered, 0);
      assert.strictEqual(counts.externalVenueDiscoveryUnavailable, 1, "the run reports the venue search as unavailable, not as attempted");
      assert.strictEqual(counts.externalDescriptionUnavailable, 2, "…and likewise the two description searches");
      assert.strictEqual(counts.written, 4, "all four events were still enriched by the deterministic steps");
    }
    console.log("PASS: enrichment pass, gate closed — no search, no venue created, no authoritative description, no search-derived address/city/note; every deterministic step still writes");

    // =======================================================================
    // 4. The same pass, same inputs, gate OPEN
    // =======================================================================
    {
      setEnv("true");
      const { log, counts, storedVenues } = await runEnrichment();

      assert.ok(log.searches.length >= 2, "with the gate open the same run does search");
      // …and writes exactly the kind of thing production showed:
      assert.deepStrictEqual(
        log.venueWrites,
        [{ method: "POST", body: { name: "Pronto Royal Oak", address: "608 S Washington Ave", city: "Detroit", website: "https://detroit.gaycities.com" } }],
        "a venue row created from an aggregator page, with a defaulted city and the aggregator's homepage as its website"
      );
      assert.strictEqual(storedVenues.length, 3);
      const web = patchesFor(log, "ev-websearch");
      assert.ok(web.some((b) => b.venue_address_raw === "608 S Washington Ave" && b.venue_city_raw === "Detroit" && typeof b.note === "string"), "the event's address and city written from that venue row, with a provenance note");
      assert.ok(web.some((b) => b.description_source === "authoritative" && /^THROB Saturdays is a weekly dance party/.test(b.description)), "a description from a search result stored as authoritative");
      assert.ok(counts.externalSearchesAttempted >= 2);
      assert.strictEqual(counts.externalVenueDiscoveryResolved, 1);
      assert.ok(counts.externalDescriptionsRecovered >= 1);

      assertDeterministicStepsWrote(log, "gate open"); // unchanged either way
    }
    console.log("PASS: the same pass with the gate open performs the web-search writes — the gate is what stops them, and the flag alone reverses it");

    // =======================================================================
    // 5. The article-linking pass (cron-editorial, Admin auto-link), closed
    // =======================================================================
    {
      const linking = fs.readFileSync(`${REPO_DIR}/scripts/press-coverage-linking.js`, "utf8");
      // Its venue search is guarded by the shared configured-check, taken
      // from the gated module by default, and it reads no key of its own
      // beyond the default it hands to that check.
      assert.ok(/isExternalDiscoveryConfiguredFn = isExternalDiscoveryConfigured,/.test(linking));
      assert.ok(/if \(hasCore && !hasLocation && isExternalDiscoveryConfiguredFn\(\{ TAVILY_API_KEY: tavilyApiKey \}\)\) \{/.test(linking), "the venue search stays behind the configured-check");
      assert.strictEqual((linking.match(/discoverEventVenueFn\(/g) || []).length, 1, "and that guarded call is the only place it searches");

      // End to end, with the pass's real discovery defaults: two articles
      // about one festival, neither naming a venue — the case this search
      // exists for (the fixture of test/press-coverage-linking.test.js §11).
      const runLinking = async (gateValue) => {
        setEnv(gateValue);
        const seen = { searches: [], venuesPersisted: [], eventsCreated: [] };
        global.fetch = async (url, init) => {
          if (!String(url).startsWith("https://api.tavily.com/")) throw new Error("unmocked URL in test: " + url);
          seen.searches.push(JSON.parse(init.body).query);
          return ok({ results: [{ url: "https://yackarena.example/events", title: "Recovery & Resilience Festival", content: "The Recovery & Resilience Festival takes place at Yack Arena in Wyandotte, with music and art. 3131 3rd St." }] });
        };
        const { linkPressCoverageQueue } = fresh("scripts/press-coverage-linking.js");
        const counts = await linkPressCoverageQueue({
          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silent, nowIso: "2026-09-18",
          fetchQueue: async () => [
            { id: "article-downriver", title: "Downriver recovery festival brings music, art and support together", excerpt: "The Recovery & Resilience Festival in Wyandotte will feature music, art, recovery resources, and guest speaker Lol Tolhurst of The Cure.", url: "https://example.com/downriver", published_at: "2026-09-18T14:58:57+00:00" },
            { id: "article-lol", title: "The Cure co-founder Lol Tolhurst talks recovery, goth and Detroit", excerpt: "", url: "https://example.com/lol", published_at: "2026-09-18T14:59:51+00:00" },
          ],
          fetchCandidateEvents: async () => [],
          fetchArticleTextFn: async (url) => (url.endsWith("/downriver")
            ? "The Recovery & Resilience Festival in Wyandotte will feature music, art, recovery resources, and guest speaker Lol Tolhurst of The Cure."
            : "September is National Recovery Month, and the Downriver Council for the Arts and Passenger Recovery are marking the occasion with the first Recovery & Resilience Festival: A Celebration of Recovery Pathways on Sept. 20, featuring guest speaker Lol Tolhurst of The Cure."),
          buildVenueIdMap: async () => new Map(),
          applyLinkFn: async () => true,
          createEventFn: async (_u, _k, _h, identity) => { seen.eventsCreated.push(identity); return { id: "evt-1", title: identity.title, venue_name_raw: identity.venueName, start_date: identity.startDate }; },
          upsertVenueKnowledgeFn: async (_u, _k, discovery) => { seen.venuesPersisted.push(discovery); return { id: "venue-99", name: discovery.name }; },
          repairGenericMetadataFn: async () => ({ written: 0 }),
          // NOT injected, so they are the real ones, as in production:
          // isExternalDiscoveryConfiguredFn, discoverEventVenueFn, tavilyApiKey.
        });
        return { seen, counts };
      };

      const closed = await runLinking(undefined);
      assert.strictEqual(closed.seen.searches.length, 0, "closed: the article pass sends no venue search");
      assert.deepStrictEqual(closed.seen.venuesPersisted, [], "…persists no venue from one");
      assert.deepStrictEqual(closed.seen.eventsCreated, [], "…and creates no event on a searched-for venue; the articles wait for a person");
      assert.strictEqual(closed.counts.autoCreated, 0);
      assert.strictEqual(closed.counts.stillHuman, 2);

      const opened = await runLinking("true");
      assert.strictEqual(opened.seen.searches.length, 1, "open: the same two articles trigger the venue search");
      assert.deepStrictEqual(opened.seen.venuesPersisted.map((v) => [v.name, v.website]), [["Yack Arena", "https://yackarena.example"]], "…a venue is persisted from the search result");
      assert.strictEqual(opened.seen.eventsCreated.length, 1, "…and an event is created at it");
      assert.strictEqual(opened.seen.eventsCreated[0].venueName, "Yack Arena");
    }
    console.log("PASS: article-linking pass, real defaults — closed: no venue search, no venue persisted, no event created from one; open: all three happen");

    // =======================================================================
    // 6. Nothing can go around the gate
    // =======================================================================
    {
      const sources = [];
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === "node_modules") continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith(".js")) sources.push(full);
        }
      };
      walk(`${REPO_DIR}/api`);
      walk(`${REPO_DIR}/scripts`);
      const rel = (f) => path.relative(REPO_DIR, f);
      const code = (f) => fs.readFileSync(f, "utf8").split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");

      const sendsSearch = sources.filter((f) => /tavily\.com/i.test(code(f))).map(rel);
      assert.deepStrictEqual(sendsSearch, ["api/_lib/external-discovery.js"], "only one file can send a search request");

      const lib = code(`${REPO_DIR}/api/_lib/external-discovery.js`);
      assert.strictEqual((lib.match(/api\.tavily\.com/g) || []).length, 1, "…in one place");
      assert.ok(/async function tavilySearch\(\{[^}]*\}\) \{\s*if \(!isExternalDiscoveryGateOpen\(\)\) return \[\];/.test(lib), "…whose first statement is the gate");
      assert.strictEqual((lib.match(/\btavilySearch\(/g) || []).length, 4, "the three discovery functions each call it once; nothing else does");
      assert.ok(/function isExternalDiscoveryConfigured\(env = process\.env\) \{\s*if \(!isExternalDiscoveryGateOpen\(\)\) return false;/.test(lib), "and the configured-check is gated too");

      // Who else touches the search key at all: only the two scripts that
      // pass it straight into the gated functions.
      const readsKey = sources.filter((f) => /TAVILY_API_KEY/.test(code(f))).map(rel).sort();
      assert.deepStrictEqual(readsKey, ["api/_lib/external-discovery.js", "scripts/generic-metadata-enrichment.js", "scripts/press-coverage-linking.js"]);

      // No other search provider has been wired in beside it.
      const otherProviders = sources.filter((f) => /api\.search\.brave\.com|serpapi\.com|customsearch\.googleapis|api\.bing\.microsoft|duckduckgo\.com|api\.exa\.ai|api\.perplexity\.ai/i.test(code(f))).map(rel);
      assert.deepStrictEqual(otherProviders, []);
    }
    console.log("PASS: one file, one request function, gated on its first line; no other file sends a search or could bypass it");

    console.log("\nAll web-search gate checks passed.");
  } finally {
    global.fetch = savedFetch;
    if (savedEnv.key === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = savedEnv.key;
    if (savedEnv.gate === undefined) delete process.env[GATE]; else process.env[GATE] = savedEnv.gate;
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
