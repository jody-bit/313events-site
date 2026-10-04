// test/cron-localist-runlog.test.js — cron-localist.js (WP 6.1/6.2's
// generalized, multi-tenant Localist adapter), full handler + pure-function
// coverage.
//
// Plain Node assert, no dependencies, matching this repo's existing style.
// Run: node test/cron-localist-runlog.test.js
//
// Every test here runs against mocked fetch and realistic, hand-built
// fixtures matching Localist's real documented v2 API response shape
// (GET /api/2/events -> { events: [{ event: {...} }] }), never a live
// network call. No credential or live pilot exists for either confirmed
// tenant yet.
"use strict";
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-localist.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/cron-localist.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// Builds one Localist v2 "event" object (unwrapped -- the handler itself
// unwraps the { event: {...} } envelope when reading a page).
function locEvent({
  id = 918273645,
  title = "The Lovin' Spoonful",
  description_text = "A live performance at the Macomb Center for the Performing Arts.",
  eventTypes = ["Concerts & Performances"],
  venue_name = "Macomb Center for the Performing Arts",
  photo_url = "https://d3n9y02raqwsq1.cloudfront.net/photos/some-photo.jpg",
  localist_url = "https://events.macomb.edu/event/the_lovin_spoonful",
  ticket_url = null,
  instances = [{ id: 1111, start: "2026-11-07T19:30:00-05:00", end: "2026-11-07T21:30:00-05:00", all_day: false }],
} = {}) {
  return {
    id,
    title,
    description_text,
    filters: eventTypes === null ? undefined : { event_types: eventTypes.map((name) => ({ name })) },
    venue_name,
    photo_url,
    localist_url,
    ticket_url,
    event_instances: instances.map((i) => ({ event_instance: i })),
  };
}

function apiPage(events) {
  return { events: events.map((e) => ({ event: e })) };
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url.includes("/api/2/events")) return routes.source(url, opts);
    if (url.includes("/rest/v1/venues")) return routes.venues ? routes.venues() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return routes.runInsert ? routes.runInsert() : { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return routes.runUpdate ? routes.runUpdate() : { ok: true, status: 204, json: async () => ({}) };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return routes.statusLookup ? routes.statusLookup() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && opts.method === "POST") return routes.upsert ? routes.upsert() : strictWriteResponse(url, opts);
    throw new Error("unmocked URL in test: " + url);
  };
  return { fetchFn, calls };
}

function patchCalls(calls) { return calls.filter((c) => c.url.includes("/rest/v1/source_runs") && c.opts.method === "PATCH"); }
function upsertCalls(calls) { return calls.filter((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST"); }
function sourceCalls(calls) { return calls.filter((c) => c.url.includes("/api/2/events")); }

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  const mod = freshHandler();
  const { parseEvent, mapCategory, formatTimeDisplay, fetchTenantEvents, TENANTS, MAX_PAGES_PER_TENANT } = mod;
  const bgsu = TENANTS.find((t) => t.tenantSlug === "bgsu");
  const macomb = TENANTS.find((t) => t.tenantSlug === "macomb");

  // --- 1. TENANTS reflects only independently-verified Localist tenants ---
  {
    assert.ok(Object.isFrozen(TENANTS));
    assert.strictEqual(TENANTS.length, 2, "only BGSU and Macomb CC were confirmed as real Localist tenants -- the other four candidates were ruled out or left unconfirmed, never guessed in");
    assert.ok(bgsu && bgsu.apiBase === "https://events.bgsu.edu");
    assert.ok(macomb && macomb.apiBase === "https://events.macomb.edu");
    assert.ok(!TENANTS.some((t) => /umich|michigan\.edu|wayne|msu|utoledo/i.test(t.apiBase)), "UMich, Wayne State, MSU, and UToledo must not be configured -- none were confirmed as real Localist tenants");
  }
  console.log("PASS: TENANTS contains only the two independently-confirmed Localist campuses, not the four ruled-out/unconfirmed candidates");

  // --- 2. a real event parses into a deterministic, stable row shape ---
  {
    const rows = parseEvent(locEvent(), macomb);
    assert.strictEqual(rows.length, 1);
    const row = rows[0];
    assert.strictEqual(row.external_id, "localist-macomb-1111");
    assert.strictEqual(row.title, "The Lovin' Spoonful");
    assert.strictEqual(row.start_date, "2026-11-07");
    assert.strictEqual(row.event_url, "https://events.macomb.edu/event/the_lovin_spoonful");
    assert.strictEqual(row.image_url, "https://d3n9y02raqwsq1.cloudfront.net/photos/some-photo.jpg");
    assert.strictEqual(row.source, "Macomb Community College");
  }
  console.log("PASS: a real Localist event parses into a deterministic, stable row shape");

  // --- 3. external_id is tenant-prefixed -- two tenants' instance ids never collide ---
  {
    const a = parseEvent(locEvent({ instances: [{ id: 42, start: "2026-11-07T19:00:00-05:00" }] }), bgsu)[0].external_id;
    const b = parseEvent(locEvent({ instances: [{ id: 42, start: "2026-11-07T19:00:00-05:00" }] }), macomb)[0].external_id;
    assert.notStrictEqual(a, b, "the same raw instance id at two different tenants must not collide");
    assert.strictEqual(a, "localist-bgsu-42");
    assert.strictEqual(b, "localist-macomb-42");
  }
  console.log("PASS: external_id is tenant-prefixed, so identical raw instance ids at different tenants never collide");

  // --- 4. a recurring event (multiple instances) becomes one row per occurrence ---
  {
    const rows = parseEvent(locEvent({
      id: 5,
      instances: [
        { id: 501, start: "2026-11-03T18:00:00-05:00", end: "2026-11-03T19:00:00-05:00" },
        { id: 502, start: "2026-11-10T18:00:00-05:00", end: "2026-11-10T19:00:00-05:00" },
        { id: 503, start: "2026-11-17T18:00:00-05:00", end: "2026-11-17T19:00:00-05:00" },
      ],
    }), bgsu);
    assert.strictEqual(rows.length, 3, "one row per event_instance, not one row per event");
    assert.ok(rows.every((r) => r.is_recurring === true), "every occurrence of a multi-instance event is marked is_recurring");
    const ids = rows.map((r) => r.external_id);
    assert.strictEqual(new Set(ids).size, 3, "each occurrence gets its own distinct external_id");
  }
  console.log("PASS: a multi-instance (recurring) event produces one row per occurrence, each marked is_recurring and separately identified");

  // --- 5. a single-instance event is not marked recurring ---
  {
    const rows = parseEvent(locEvent(), bgsu);
    assert.strictEqual(rows[0].is_recurring, false);
  }
  console.log("PASS: a single-instance event is not marked is_recurring");

  // --- 6. category: real observed evidence maps correctly, standard types map, unknowns stay ambiguous ---
  {
    assert.strictEqual(mapCategory(["Concerts & Performances"]), "music", "directly observed on a real Macomb event during verification -- not invented");
    assert.strictEqual(mapCategory(["Music"]), "music");
    assert.strictEqual(mapCategory(["Film Screenings"]), "film");
    assert.strictEqual(mapCategory(["Athletics"]), "sports");
    assert.strictEqual(mapCategory(["Sports"]), "sports");
    assert.strictEqual(mapCategory(["Student Organizations"]), null, "a tenant-specific/custom type name with no confirmed mapping must not be guessed");
    assert.strictEqual(mapCategory([]), null);
    assert.strictEqual(mapCategory(null), null);
    assert.strictEqual(mapCategory(undefined), null);
  }
  console.log("PASS: category mapping covers only confirmed/standard Localist event types -- unknown or tenant-custom types stay unmapped, never guessed");

  // --- 7. an unmappable category routes to the placeholder + pending_review + internal_note, same as every other connector ---
  {
    const rows = parseEvent(locEvent({ eventTypes: ["Student Organizations"] }), bgsu);
    assert.strictEqual(rows[0].category, "community");
    assert.strictEqual(rows[0]._defaultStatusForRow, "pending_review");
    assert.ok(rows[0].internal_note && rows[0].internal_note.includes("not mappable"));
  }
  console.log("PASS: an unmappable category gets the placeholder category + pending_review + an internal_note, never guessed");

  // --- 7b. a classified row is STILL pending_review today (every tenant is brand new, no track record) ---
  {
    const rows = parseEvent(locEvent({ eventTypes: ["Concerts & Performances"] }), macomb);
    assert.strictEqual(rows[0].category, "music");
    assert.strictEqual(rows[0]._defaultStatusForRow, "pending_review", "a brand-new, unproven tenant earns human review first, even for a confidently-classified row");
    assert.strictEqual(rows[0].internal_note, null, "a confidently-classified row gets no category caveat note");
  }
  console.log("PASS: even a confidently-classified row is pending_review today -- new tenant trust, not a category-confidence limitation");

  // --- 8. missing filters/event_types entirely is handled, not a crash ---
  {
    const rows = parseEvent(locEvent({ eventTypes: null }), bgsu);
    assert.strictEqual(rows[0].category, "community");
  }
  console.log("PASS: an event with no filters/event_types object at all is treated as ambiguous, not a crash");

  // --- 9. venue name comes from Localist's own venue_name field (parseEvent
  // exposes it under _rawVenueName -- the handler renames it to
  // venue_name_raw and resolves venue_id before upsert) ---
  {
    const rows = parseEvent(locEvent({ venue_name: "Stroh Center" }), bgsu);
    assert.strictEqual(rows[0]._rawVenueName, "Stroh Center");
  }
  console.log("PASS: venue name is read from Localist's own venue_name field");

  // --- 10. missing venue stays null, never guessed ---
  {
    const e = locEvent({ venue_name: null });
    const rows = parseEvent(e, bgsu);
    assert.strictEqual(rows[0]._rawVenueName, null);
  }
  console.log("PASS: an event with no venue name at all stays venue-less, never guessed");

  // --- 11. missing structural fields produce no rows, not a guess ---
  {
    assert.deepStrictEqual(parseEvent(null, bgsu), []);
    assert.deepStrictEqual(parseEvent({}, bgsu), [], "no id/title/instances -- unusable");
    assert.deepStrictEqual(parseEvent({ id: 1, title: "X", event_instances: [] }, bgsu), [], "zero instances -- nothing to write");
    assert.deepStrictEqual(parseEvent({ id: 1, event_instances: [{ event_instance: { id: 1, start: "2026-11-07T19:00:00-05:00" } }] }, bgsu), [], "no title -- unusable");
  }
  console.log("PASS: an event missing id/title/instances produces zero rows -- never guessed at");

  // --- 12. an instance missing its own id or start is skipped, siblings are not ---
  {
    const rows = parseEvent(locEvent({
      instances: [
        { id: 1, start: "2026-11-07T19:00:00-05:00" },
        { id: null, start: "2026-11-14T19:00:00-05:00" },
        { id: 3, start: null },
      ],
    }), bgsu);
    assert.strictEqual(rows.length, 1, "only the one structurally usable instance produces a row");
  }
  console.log("PASS: an individual instance missing id/start is skipped without discarding its structurally-usable siblings");

  // --- 13. formatTimeDisplay / all_day handling ---
  {
    assert.strictEqual(formatTimeDisplay("2026-11-07T19:30:00-05:00", "2026-11-07T21:30:00-05:00"), "7:30 PM – 9:30 PM");
    assert.strictEqual(formatTimeDisplay("2026-11-07T19:30:00-05:00", null), "7:30 PM");
    assert.strictEqual(formatTimeDisplay("2026-11-07T19:30:00-05:00", "2026-11-07T19:30:00-05:00"), "7:30 PM", "identical start/end collapses to a single time");
    const allDayRows = parseEvent(locEvent({ instances: [{ id: 9, start: "2026-11-07T00:00:00-05:00", end: "2026-11-08T00:00:00-05:00", all_day: true }] }), bgsu);
    assert.strictEqual(allDayRows[0].is_all_day, true);
    assert.strictEqual(allDayRows[0].time_display, null, "an all-day instance never shows a fabricated time range");
  }
  console.log("PASS: formatTimeDisplay reads local wall-clock time directly from Localist's own instance datetime strings, and all-day instances never get a fabricated time_display");

  // --- 14. price_from, is_free, and ticket_url are never guessed ---
  {
    const rows = parseEvent(locEvent(), bgsu);
    assert.strictEqual(rows[0].price_from, null);
    assert.strictEqual(rows[0].is_free, false);
    assert.strictEqual(rows[0].ticket_url, null, "no ticket_url field was given in this fixture -- stays null, never derived from localist_url");
    const withTicket = parseEvent(locEvent({ ticket_url: "https://tix.example.com/abc" }), bgsu);
    assert.strictEqual(withTicket[0].ticket_url, "https://tix.example.com/abc", "a real ticket_url field, when the API actually returns one, is used as-is");
  }
  console.log("PASS: price_from/is_free are never inferred; ticket_url is only ever taken verbatim from a real field, never fabricated from the event's own page URL");

  // --- 15. fetchTenantEvents paginates until a short page, bounded by MAX_PAGES_PER_TENANT ---
  {
    let page = 0;
    global.fetch = async (url) => {
      page++;
      const u = new URL(url);
      assert.strictEqual(u.searchParams.get("pp"), "100");
      if (page === 1) return { ok: true, status: 200, json: async () => apiPage(Array.from({ length: 100 }, (_, i) => locEvent({ id: 1000 + i, instances: [{ id: 2000 + i, start: "2026-11-07T19:00:00-05:00" }] }))) };
      return { ok: true, status: 200, json: async () => apiPage([locEvent({ id: 9999, instances: [{ id: 8888, start: "2026-11-07T19:00:00-05:00" }] })]) };
    };
    const result = await fetchTenantEvents(bgsu);
    assert.strictEqual(page, 2, "stops once a page returns fewer than PAGE_SIZE events");
    assert.strictEqual(result.events.length, 101);
    assert.strictEqual(result.error, null);
  }
  console.log("PASS: fetchTenantEvents paginates correctly and stops at the first short (final) page");

  // --- 16. fetchTenantEvents is bounded -- never loops forever against a tenant that always returns a full page ---
  {
    let page = 0;
    global.fetch = async () => {
      page++;
      return { ok: true, status: 200, json: async () => apiPage(Array.from({ length: 100 }, (_, i) => locEvent({ id: page * 1000 + i, instances: [{ id: page * 10000 + i, start: "2026-11-07T19:00:00-05:00" }] }))) };
    };
    const result = await fetchTenantEvents(bgsu);
    assert.strictEqual(page, MAX_PAGES_PER_TENANT, "must stop at exactly the page cap");
    assert.strictEqual(result.error, null, "hitting the page cap is a bounded safety limit, not itself an error");
  }
  console.log("PASS: pagination is bounded by MAX_PAGES_PER_TENANT against a tenant whose feed never returns a short page");

  // --- 17. fetchTenantEvents surfaces a non-OK response and a malformed shape as errors ---
  {
    global.fetch = async () => ({ ok: false, status: 503, text: async () => "" });
    const r1 = await fetchTenantEvents(bgsu);
    assert.ok(r1.error && r1.error.includes("503"));

    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ notEvents: [] }) });
    const r2 = await fetchTenantEvents(bgsu);
    assert.ok(r2.error && r2.error.includes("Unexpected API response shape"));
  }
  console.log("PASS: a non-OK response and a malformed response shape are both surfaced as errors, not silently treated as zero events");

  // ==================================================================
  // Full-handler tests
  // ==================================================================

  // --- 18. both tenants are fetched, resolved, and upserted in one run ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: (url) => {
        if (url.startsWith(bgsu.apiBase)) return { ok: true, status: 200, json: async () => apiPage([locEvent({ id: 1, title: "BGSU Event", venue_name: "Stroh Center", instances: [{ id: 101, start: "2026-11-10T19:00:00-05:00" }] })]) };
        return { ok: true, status: 200, json: async () => apiPage([locEvent()]) };
      },
      venues: () => ({ ok: true, status: 200, json: async () => [{ id: "venue-stroh", name: "Stroh Center" }] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(sourceCalls(calls).length, 2, "both configured tenants are queried");
    const upserts = upsertCalls(calls);
    assert.strictEqual(upserts.length, 1, "one aggregate upsert call across both tenants");
    assert.strictEqual(upserts[0].body.length, 2);
    const bgsuRow = upserts[0].body.find((r) => r.external_id === "localist-bgsu-101");
    assert.strictEqual(bgsuRow.venue_id, "venue-stroh", "resolves to the canonical venue by exact name match");
    assert.strictEqual(res._body.upserted, 2);
  }
  console.log("PASS: both confirmed tenants are fetched and upserted in a single aggregate run, with venue resolution working per-row");

  // --- 19. an unresolved campus venue stays null, never guessed/created ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => apiPage([locEvent({ venue_name: "Olscamp Hall 101" })]) }),
      venues: () => ({ ok: true, status: 200, json: async () => [] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const row = upsertCalls(calls)[0].body.find((r) => r.venue_name_raw === "Olscamp Hall 101");
    assert.ok(row, "the raw campus building name is preserved");
    assert.strictEqual(row.venue_id, null, "an unrecognized campus building/room is never guessed or auto-created as a venue");
  }
  console.log("PASS: an unrecognized campus building/room name is preserved as venue_name_raw with venue_id left null -- the expected stress-test outcome, not a bug");

  // --- 20. existing moderator-set status is preserved across re-ingestion ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => apiPage([locEvent({ id: 55, instances: [{ id: 555, start: "2026-11-07T19:00:00-05:00" }] })]) }),
      statusLookup: () => ({ ok: true, status: 200, json: async () => [{ external_id: "localist-bgsu-555", status: "approved" }] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    const row = upsertCalls(calls)[0].body.find((r) => r.external_id === "localist-bgsu-555");
    assert.strictEqual(row.status, "approved");
  }
  console.log("PASS: an existing row's moderator-set status survives re-ingestion");

  // --- 21. status lookup failure aborts with zero writes (fail-closed) ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => apiPage([locEvent()]) }),
      statusLookup: () => ({ ok: false, status: 500, text: async () => "boom" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(upsertCalls(calls).length, 0);
    assert.strictEqual(res._status, 502);
  }
  console.log("PASS: a failed status lookup aborts the run with zero writes -- fail-closed, same contract as every other connector");

  // --- 22. one tenant failing doesn't abort the other, and is recorded ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: (url) => {
        if (url.startsWith(bgsu.apiBase)) return { ok: false, status: 503, text: async () => "" };
        return { ok: true, status: 200, json: async () => apiPage([locEvent()]) };
      },
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(res._body.failed.length, 1);
    assert.strictEqual(res._body.failed[0].tenant, "bgsu");
    assert.strictEqual(upsertCalls(calls)[0].body.length, 1, "macomb's events still get written even though bgsu failed");
    const patches = patchCalls(calls);
    assert.strictEqual(patches[0].body.outcome, "partial");
  }
  console.log("PASS: one tenant failing is isolated -- the other tenant's events still get written, and the run reports outcome=partial");

  // --- 23. past events are filtered out ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({
        ok: true,
        status: 200,
        json: async () => apiPage([
          locEvent({ id: 1, instances: [{ id: 11, start: "2020-01-01T19:00:00-05:00" }] }),
          locEvent({ id: 2, instances: [{ id: 22, start: "2099-01-01T19:00:00-05:00" }] }),
        ]),
      }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    const upserts = upsertCalls(calls);
    assert.strictEqual(upserts[0].body.length, 2, "one future row per tenant (both tenants return the same fixture)");
    assert.ok(upserts[0].body.every((r) => r.external_id.includes("-22")));
  }
  console.log("PASS: past occurrences are filtered out -- only today-or-later instances are written");

  // --- 24. source_runs logging is failure-safe ---
  {
    const handler = freshHandler();
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => apiPage([locEvent()]) }),
      runInsert: () => { throw new Error("source_runs table does not exist yet"); },
      runUpdate: () => { throw new Error("source_runs table does not exist yet"); },
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 2);
  }
  console.log("PASS: source_runs logging failures never block or break ingestion");

  // --- 25. CRON_SECRET auth is enforced when configured ---
  {
    process.env.CRON_SECRET = "s3cret";
    const handler = freshHandler();
    const res = makeRes();
    await handler({ headers: { authorization: "Bearer wrong" } }, res);
    assert.strictEqual(res._status, 401);
    delete process.env.CRON_SECRET;
  }
  console.log("PASS: an incorrect/missing bearer token is rejected with 401 when CRON_SECRET is configured");

  console.log("\nAll cron-localist.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
