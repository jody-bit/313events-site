// test/cron-gottagacha-runlog.test.js — GottaGacha connector, full handler
// + pure-function coverage (Product Owner implementation approval,
// 2026-09-22).
//
// Plain Node assert, no dependencies, matching this repo's existing style.
// Run: node test/cron-gottagacha-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-gottagacha.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/cron-gottagacha.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// Builds one raw API event object, matching the real shape confirmed live
// against https://www.gottagacha.com/api/events.
function apiEvent({
  id = "5bcbabc3-35d4-40de-90bc-26ed9ef959c8",
  title = "TCG Tuesday",
  description = "GG TCG Tuesday! Come and enjoy some casual play.",
  eventDate = "2026-10-06",
  startTime = "19:00:00",
  endTime = "21:00:00",
  recurrenceType = "weekly",
  location = "Gotta Gacha",
} = {}) {
  return { id, title, description, eventDate, startTime, endTime, recurrenceType, location };
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url.includes("www.gottagacha.com/api/events")) return routes.source();
    if (url.includes("/rest/v1/venues")) return routes.venues ? routes.venues() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return routes.runInsert ? routes.runInsert() : { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return routes.runUpdate ? routes.runUpdate() : { ok: true, status: 204, json: async () => ({}) };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return routes.statusLookup ? routes.statusLookup() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && opts.method === "POST") return routes.upsert ? routes.upsert() : { ok: true, status: 201, text: async () => "" };
    throw new Error("unmocked URL in test: " + url);
  };
  return { fetchFn, calls };
}

function patchCalls(calls) {
  return calls.filter((c) => c.url.includes("/rest/v1/source_runs") && c.opts.method === "PATCH");
}
function upsertCalls(calls) {
  return calls.filter((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  const mod = freshHandler();
  const { parseEvent, mapCategory, buildExternalId, isCanonicalGottaGachaLocation } = mod;

  // --- 1. API event parses deterministically ---
  {
    const parsed = parseEvent(apiEvent());
    assert.strictEqual(parsed.external_id, "gottagacha-5bcbabc3-35d4-40de-90bc-26ed9ef959c8-2026-10-06");
    assert.strictEqual(parsed.title, "TCG Tuesday");
    assert.strictEqual(parsed.start_date, "2026-10-06");
  }
  console.log("PASS: an API event parses into a deterministic, stable row shape");

  // --- 2. recurring occurrence identity is stable across reruns ---
  {
    const a = buildExternalId("series-1", "2026-10-06");
    const b = buildExternalId("series-1", "2026-10-06");
    assert.strictEqual(a, b, "same series + same date must produce the identical external_id every time");
  }
  console.log("PASS: rerunning the same occurrence produces the same external_id");

  // --- 3. different dates in the same series do not collide ---
  {
    const week1 = buildExternalId("series-1", "2026-10-06");
    const week2 = buildExternalId("series-1", "2026-10-13");
    assert.notStrictEqual(week1, week2, "different occurrence dates of the same series must not collide");
  }
  console.log("PASS: different dates in the same series produce different external_id values");

  // --- 3b. non-recurring events remain stable / distinct from other series ---
  {
    const oneOff = buildExternalId("series-2", "2026-10-06");
    const recurring = buildExternalId("series-1", "2026-10-06");
    assert.notStrictEqual(oneOff, recurring);
    assert.strictEqual(buildExternalId("series-2", "2026-10-06"), oneOff, "non-recurring events are still stable across reruns");
  }
  console.log("PASS: non-recurring events remain stable and distinct from other series");

  // --- 4. description is captured ---
  {
    const parsed = parseEvent(apiEvent({ description: "  Real description text.  " }));
    assert.strictEqual(parsed.description, "Real description text.", "surrounding whitespace is trimmed, content preserved");
    const blank = parseEvent(apiEvent({ description: "   " }));
    assert.strictEqual(blank.description, null, "whitespace-only description is treated as absent, not metadata");
    const missing = parseEvent(apiEvent({ description: null }));
    assert.strictEqual(missing.description, null);
  }
  console.log("PASS: description is captured verbatim (trimmed), blank/whitespace-only treated as absent");

  // --- 5. start/end times are captured correctly ---
  {
    const ranged = parseEvent(apiEvent({ startTime: "19:00:00", endTime: "21:00:00" }));
    assert.strictEqual(ranged.time_display, "7:00 PM – 9:00 PM");
    const single = parseEvent(apiEvent({ startTime: "20:00:00", endTime: null }));
    assert.strictEqual(single.time_display, "8:00 PM");
    const sameTime = parseEvent(apiEvent({ startTime: "20:00:00", endTime: "20:00:00" }));
    assert.strictEqual(sameTime.time_display, "8:00 PM", "identical start/end collapses to a single time, not a zero-length range");
  }
  console.log("PASS: start/end times are formatted into time_display correctly, including the no-real-end-time cases");

  // --- 6. gaming event maps to Gaming & Esports ---
  {
    assert.strictEqual(mapCategory("TCG Tuesday", "we play Magic, Lorcana, Pokemon, Yugioh, One Piece"), "gaming");
    assert.strictEqual(mapCategory("SE-MI Fighting Game Tournament", "weekly fighting game tournaments"), "gaming");
    assert.strictEqual(mapCategory("DND Seasons of Magic", ""), "gaming");
    assert.strictEqual(mapCategory("Road2Riptide", "https://www.start.gg/tournament/road2riptide-2026/details"), "gaming");
    assert.strictEqual(mapCategory("Cyberpunk Beta Release", "https://melee.gg/Tournament/View/460016"), "gaming");
    assert.strictEqual(mapCategory("Citadel Tourney", ""), "gaming", "'Tourney' abbreviation matches, title alone is sufficient evidence");
    assert.strictEqual(mapCategory("Friday Night Magic", "Come play Magic The Gathering"), "gaming");
  }
  console.log("PASS: real gaming/TCG/D&D/esports/fighting-game titles map to Gaming & Esports");

  // --- 7. movie event maps to Film ---
  {
    assert.strictEqual(mapCategory("Anime Movie Night", "JJK S1 FIRST HALF"), "film");
    assert.strictEqual(mapCategory("Spooky Movie Night", "Spoopy Movie Night"), "film");
    assert.strictEqual(mapCategory("Movie Night @ GG", "Over the Moon"), "film");
  }
  console.log("PASS: movie-night/screening titles map to Film");

  // --- 8. music event maps to Music ---
  {
    assert.strictEqual(mapCategory("Live Music Night", "Join us for a live band performance"), "music");
    assert.strictEqual(mapCategory("Summer Concert Series", ""), "music");
  }
  console.log("PASS: a clearly-labeled live-music/concert event maps to Music");

  // --- 9. workshop maps to Classes & Training ---
  {
    assert.strictEqual(mapCategory("Mooncake Workshop", "Materials Included $30/Person"), "training");
    assert.strictEqual(mapCategory("Beginner Painting Classes", ""), "training");
  }
  console.log("PASS: workshop/class titles map to Classes & Training");

  // --- 10. ambiguous event is not guessed into a category ---
  {
    assert.strictEqual(mapCategory("Ticketed Private Event", null), null);
    assert.strictEqual(mapCategory("Karaoke Night [OPEN]", "OPEN NIGHT"), null, "karaoke isn't in any given rule -- not guessed as Music or Nightlife");
    // The real, genuinely ambiguous case found during discovery: a DJ/rave
    // night does not meet the Music rule's bar (Music vs. Nightlife & Club
    // isn't disambiguated by the given rules) and must not be guessed.
    assert.strictEqual(mapCategory("Citywave: Magical Funk", "DJs: HuuniBadg3r, buy tickets on Eventbrite"), null);

    const parsed = parseEvent(apiEvent({ title: "Ticketed Private Event", description: null }));
    assert.strictEqual(parsed.category, "community", "forced NOT NULL placeholder -- migration_009b's documented catch-all, not a guess");
    assert.strictEqual(parsed._defaultStatusForRow, "pending_review", "ambiguous events are routed to human review, never silently approved");
    assert.ok(parsed.internal_note && parsed.internal_note.includes("not deterministically mapped"), "internal_note flags it for a moderator, never shown publicly");
  }
  console.log("PASS: an event matching no deterministic rule is not guessed -- placeholder category + pending_review + internal_note, never Community for a real gaming match");

  // --- 11. GottaGacha-location event resolves/falls back correctly ---
  {
    assert.strictEqual(isCanonicalGottaGachaLocation("Gotta Gacha"), true);
    assert.strictEqual(isCanonicalGottaGachaLocation("GottaGacha"), true);
    assert.strictEqual(isCanonicalGottaGachaLocation("  gottagacha "), true, "case/whitespace-insensitive");
    assert.strictEqual(isCanonicalGottaGachaLocation(null), true, "absent location falls back to canonical, per explicit instruction");
    assert.strictEqual(isCanonicalGottaGachaLocation(undefined), true);
  }
  console.log("PASS: on-site/absent location resolves to the canonical GottaGacha venue");

  // --- 12. off-site location is not falsely assigned to GottaGacha ---
  {
    assert.strictEqual(isCanonicalGottaGachaLocation("Huntington Place"), false);
    assert.strictEqual(isCanonicalGottaGachaLocation("Youmacon"), false);

    // Full-handler proof: a hypothetical future event whose source location
    // genuinely differs must NOT get the canonical venue_id, even when one
    // exists in the venues table.
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [apiEvent({ id: "offsite-1", title: "GG @ Some Convention", description: "off-site booth", location: "Huntington Place, Detroit" })],
        }),
      }),
      venues: () => ({ ok: true, status: 200, json: async () => [{ id: "venue-gg-canonical", name: "GottaGacha" }] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const upserts = upsertCalls(calls);
    assert.strictEqual(upserts.length, 1);
    const row = upserts[0].body[0];
    assert.strictEqual(row.venue_name_raw, "Huntington Place, Detroit", "off-site location is preserved verbatim, not overwritten");
    assert.notStrictEqual(row.venue_id, "venue-gg-canonical", "the canonical GottaGacha venue_id is never assigned to an off-site event");
    assert.strictEqual(row.venue_id, null, "no venues-table row named 'Huntington Place, Detroit' exists in this fixture, so it stays null -- never guessed/created");
  }
  console.log("PASS: an off-site source location is preserved and never falsely assigned the canonical GottaGacha venue");

  // --- 12b. real catalog case: GG @ Youmacon still reports location as GottaGacha at the source ---
  {
    // Documented, not silently "solved": GottaGacha's own API currently
    // labels even known off-site programming (its Youmacon convention
    // booth) with location: "GottaGacha" -- there is no better structured
    // signal available. This proves the connector behaves correctly given
    // what the source ACTUALLY provides today, while the off-site branch
    // above proves it also behaves correctly if the source ever starts
    // providing a real off-site location.
    const parsed = parseEvent(apiEvent({ id: "youmacon-1", title: "GG @ Youmacon", description: "GG will be attending Youmacon 2026 this year!!", location: "GottaGacha" }));
    assert.strictEqual(isCanonicalGottaGachaLocation(parsed._rawLocation), true);
  }
  console.log("PASS: documents that the source's own location field does not distinguish this known off-site case -- on-site branch fires as the source dictates, not silently misrepresented");

  // --- 13. missing image remains null ---
  {
    const parsed = parseEvent(apiEvent());
    assert.strictEqual(parsed.image_url, null);
  }
  console.log("PASS: image_url is always null -- no image field exists at the source");

  // --- 14. missing price does not become free ---
  {
    const parsed = parseEvent(apiEvent());
    assert.strictEqual(parsed.price_from, null);
    assert.strictEqual(parsed.is_free, false, "absence of a price field is never treated as evidence of 'free'");
  }
  console.log("PASS: missing price stays null and is_free stays false -- never inferred");

  // --- 15. root-site URL does not become event_url ---
  {
    const parsed = parseEvent(apiEvent());
    assert.strictEqual(parsed.event_url, null, "never set to https://www.gottagacha.com merely because the ICS feed's URL property contains it");
  }
  console.log("PASS: event_url stays null -- the bare site root is never used as a fabricated event URL");

  // --- 16. malformed API response produces no writes ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ notEvents: [] }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(upsertCalls(calls).length, 0, "no upsert call is ever made for a malformed response");
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "failed");
  }
  console.log("PASS: a malformed/non-array API response writes zero events and logs outcome=failed");

  // --- 17. fetch failure produces no writes ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => { throw new Error("network unreachable"); },
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(upsertCalls(calls).length, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "failed");
    assert.strictEqual(res._body.upserted, 0);
  }
  console.log("PASS: an upstream fetch failure writes zero events, changes no status, and logs outcome=failed");

  // --- 17b. blocked (401/403) is distinguished from a generic failure ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: false, status: 403, text: async () => "" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const patches = patchCalls(calls);
    assert.strictEqual(patches[0].body.outcome, "blocked", "a 403 from the upstream is blocked, not a generic failure");
  }
  console.log("PASS: an upstream 403 logs outcome=blocked, not failed");

  // --- 18. existing approved/rejected status is preserved on re-ingestion ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [apiEvent({ id: "existing-1" })] }) }),
      statusLookup: () => ({ ok: true, status: 200, json: async () => [{ external_id: "gottagacha-existing-1-2026-10-06", status: "rejected" }] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const upserts = upsertCalls(calls);
    assert.strictEqual(upserts[0].body[0].status, "rejected", "a moderator's prior rejection is never reset by a rerun, even though this row would otherwise default to approved");
  }
  console.log("PASS: an existing row's moderator-set status (approved/rejected) is preserved across re-ingestion");

  // --- 18b. ambiguous row with no existing status gets pending_review, not the connector default ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [apiEvent({ id: "ambiguous-1", title: "Ticketed Private Event", description: null, recurrenceType: null })] }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const upserts = upsertCalls(calls);
    assert.strictEqual(upserts[0].body[0].status, "pending_review");
    assert.strictEqual(upserts[0].body[0].category, "community");
  }
  console.log("PASS: a brand-new ambiguous-category row gets pending_review, not the connector's approved default");

  // --- 19. source_runs logging is failure-safe ---
  {
    const handler = freshHandler();
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ events: [apiEvent()] }) }),
      runInsert: () => { throw new Error("source_runs table does not exist yet"); },
      runUpdate: () => { throw new Error("source_runs table does not exist yet"); },
    });
    global.fetch = fetchFn;
    const res = makeRes();
    // Must not throw even though every source_runs call fails.
    await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1, "ingestion completes normally even when source_runs logging is entirely broken");
  }
  console.log("PASS: source_runs logging failures never block or break ingestion (fail-safe by run-log.js's own design)");

  console.log("\nAll cron-gottagacha.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
