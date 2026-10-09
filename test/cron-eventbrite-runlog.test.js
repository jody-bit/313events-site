// test/cron-eventbrite-runlog.test.js — cron-eventbrite.js (WP 6.12's
// organizer-authorized Eventbrite adapter), full handler + pure-function
// coverage.
//
// Plain Node assert, no dependencies, matching this repo's existing style.
// Run: node test/cron-eventbrite-runlog.test.js
//
// No live Eventbrite credential exists for any configured organizer today
// (that's the expected, default state — see cron-eventbrite.js's own
// header), so every test here runs against mocked fetch and realistic,
// hand-built fixtures matching Eventbrite's real documented v3 Event
// object shape (GET /organizations/{id}/events/?expand=venue), never a
// live network call.
"use strict";
// Clock pinned (these fixtures name specific calendar dates; see
// test/fixtures/freeze-clock.js). Before the code under test loads.
require("./fixtures/freeze-clock.js").freezeClock("2026-10-08T15:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const FLORIAN_EAST_TOKEN_ENV = "EVENTBRITE_TOKEN_FLORIANEAST"; // must match cron-eventbrite.js's ORGANIZERS config

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-eventbrite.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/cron-eventbrite.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// Builds one Eventbrite v3 Event object, matching the real documented
// shape (GET /organizations/{organizer_id}/events/?expand=venue).
function ebEvent({
  id = "987654321",
  name = "Oyster Stout Night",
  description = "Join us for our seasonal Oyster Stout release.",
  startLocal = "2026-11-05T19:00:00",
  endLocal = "2026-11-05T22:00:00",
  url = "https://www.eventbrite.com/e/oyster-stout-night-tickets-987654321",
  isFree = false,
  isSeries = false,
  onlineEvent = false,
  logoUrl = "https://img.evbuc.com/https%3A%2F%2Fcdn.evbuc.com%2Fimages%2Fsome.jpg",
  venue = { id: "V1", name: "Florian East Lagers & Ales" },
} = {}) {
  return {
    id,
    name: { text: name, html: `<p>${name}</p>` },
    description: description === null ? null : { text: description, html: `<p>${description}</p>` },
    url,
    start: { timezone: "America/Detroit", local: startLocal, utc: startLocal + "Z" },
    end: endLocal ? { timezone: "America/Detroit", local: endLocal, utc: endLocal + "Z" } : null,
    status: "live",
    currency: "USD",
    online_event: onlineEvent,
    is_series: isSeries,
    is_series_parent: false,
    is_free: isFree,
    logo: logoUrl ? { url: logoUrl, id: "logo-1" } : null,
    organizer_id: "105186308861",
    venue_id: venue ? venue.id : null,
    venue: onlineEvent ? null : venue,
    category_id: "110",
    resource_uri: `https://www.eventbriteapi.com/v3/events/${id}/`,
  };
}

function orgEventsPage(events, { hasMore = false, continuation = null } = {}) {
  return {
    pagination: { object_count: events.length, page_number: 1, page_size: 50, page_count: 1, has_more_items: hasMore, continuation },
    events,
  };
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url.includes("eventbriteapi.com/v3/organizations/")) return routes.source(url, opts);
    if (url.includes("/rest/v1/venues")) return routes.venues ? routes.venues() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return routes.runInsert ? routes.runInsert() : { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return routes.runUpdate ? routes.runUpdate() : { ok: true, status: 204, json: async () => ({}) };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return routes.statusLookup ? routes.statusLookup() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && opts.method === "POST") return routes.upsert ? routes.upsert() : strictWriteResponse(url, opts);
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
function sourceCalls(calls) {
  return calls.filter((c) => c.url.includes("eventbriteapi.com/v3/organizations/"));
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  delete process.env[FLORIAN_EAST_TOKEN_ENV];

  const mod = freshHandler();
  const { parseEvent, formatTimeDisplay, ORGANIZERS, fetchOrganizerEvents, MAX_PAGES_PER_ORGANIZER } = mod;

  // --- 1. config is generalized, not Florian-East-specific in shape ---
  {
    assert.ok(Array.isArray(ORGANIZERS) && ORGANIZERS.length >= 1, "ORGANIZERS must be a config array, not a single hardcoded organizer");
    const fe = ORGANIZERS.find((o) => o.organizerId === "105186308861");
    assert.ok(fe, "Florian East's organizer id must be configured");
    assert.strictEqual(fe.tokenEnvVar, FLORIAN_EAST_TOKEN_ENV);
    assert.ok(Object.isFrozen(ORGANIZERS), "ORGANIZERS must be frozen, same convention as every other file-local config array in this project");
  }
  console.log("PASS: ORGANIZERS is a frozen, generalized config array, with Florian East as its first entry");

  // --- 2. a real Eventbrite event parses into a deterministic, stable row shape ---
  {
    const parsed = parseEvent(ebEvent());
    assert.strictEqual(parsed.external_id, "eventbrite-987654321");
    assert.strictEqual(parsed.title, "Oyster Stout Night");
    assert.strictEqual(parsed.start_date, "2026-11-05");
    assert.strictEqual(parsed.description, "Join us for our seasonal Oyster Stout release.");
    assert.strictEqual(parsed.ticket_url, "https://www.eventbrite.com/e/oyster-stout-night-tickets-987654321");
    assert.strictEqual(parsed.event_url, parsed.ticket_url, "ticket_url and event_url both come from the same Eventbrite event URL");
    assert.strictEqual(parsed.image_url, "https://img.evbuc.com/https%3A%2F%2Fcdn.evbuc.com%2Fimages%2Fsome.jpg");
    assert.strictEqual(parsed.is_free, false);
    assert.strictEqual(parsed.is_recurring, false);
  }
  console.log("PASS: a real Eventbrite event parses into a deterministic, stable row shape");

  // --- 3. rerunning the same event produces the same external_id ---
  {
    const a = parseEvent(ebEvent({ id: "111" })).external_id;
    const b = parseEvent(ebEvent({ id: "111" })).external_id;
    assert.strictEqual(a, b);
    assert.notStrictEqual(a, parseEvent(ebEvent({ id: "222" })).external_id);
  }
  console.log("PASS: external_id is stable across reruns and distinct across different events");

  // --- 4. category is always ambiguous -- never guessed, always pending_review ---
  {
    const parsed = parseEvent(ebEvent());
    assert.strictEqual(parsed.category, "community", "forced NOT NULL placeholder -- migration_009b's documented catch-all, not a guess");
    assert.strictEqual(parsed._defaultStatusForRow, "pending_review", "every row from this source is routed to human review -- Eventbrite's own taxonomy never maps onto this project's categories");
    assert.ok(parsed.internal_note.includes("Category not mappable"), "internal_note flags it for a moderator, never shown publicly");
  }
  console.log("PASS: every row is treated as category-ambiguous -- placeholder category + pending_review + internal_note, never guessed");

  // --- 5. in-person event's venue comes from the expanded venue object ---
  {
    const parsed = parseEvent(ebEvent({ venue: { id: "V9", name: "Florian East Lagers & Ales" } }));
    assert.strictEqual(parsed._rawVenueName, "Florian East Lagers & Ales");
  }
  console.log("PASS: an in-person event's venue name comes from Eventbrite's own expanded venue object");

  // --- 6. online event has no physical venue -- never guessed from the organizer's usual venue ---
  {
    const parsed = parseEvent(ebEvent({ onlineEvent: true, venue: null }));
    assert.strictEqual(parsed._rawVenueName, null, "an online event must never be assigned a guessed physical venue");
    assert.ok(parsed.internal_note.includes("Online event"), "internal_note records why venue is absent");
  }
  console.log("PASS: an online event's venue stays null and is never guessed from the organizer's own usual venue");

  // --- 7. missing structural fields produce null (not a guess) ---
  {
    assert.strictEqual(parseEvent(null), null);
    assert.strictEqual(parseEvent({}), null, "no id/name/start -- unusable");
    assert.strictEqual(parseEvent({ id: "1", name: { text: "X" } }), null, "no start.local -- unusable");
    assert.strictEqual(parseEvent({ id: "1", start: { local: "2026-11-05T19:00:00" } }), null, "no name.text -- unusable");
  }
  console.log("PASS: an event missing id/name.text/start.local is not guessed at -- returns null");

  // --- 8. description blank/whitespace-only is treated as absent ---
  {
    const blank = parseEvent(ebEvent({ description: "   " }));
    assert.strictEqual(blank.description, null);
    const missing = parseEvent(ebEvent({ description: null }));
    assert.strictEqual(missing.description, null);
  }
  console.log("PASS: blank/missing description is treated as absent, never metadata");

  // --- 9. price_from and is_all_day are never invented ---
  {
    const parsed = parseEvent(ebEvent());
    assert.strictEqual(parsed.price_from, null, "Eventbrite's Ticket Classes endpoint is not called -- never guessed");
    assert.strictEqual(parsed.is_all_day, false, "no such field exists on this source -- schema default, not inferred");
  }
  console.log("PASS: price_from stays null and is_all_day stays false -- never inferred from this source");

  // --- 10. is_recurring reflects Eventbrite's own is_series flag ---
  {
    assert.strictEqual(parseEvent(ebEvent({ isSeries: true })).is_recurring, true);
    assert.strictEqual(parseEvent(ebEvent({ isSeries: false })).is_recurring, false);
  }
  console.log("PASS: is_recurring is a direct boolean coercion of Eventbrite's own is_series field");

  // --- 11. source is always the platform, never the organizer (DEC-005) ---
  {
    const parsed = parseEvent(ebEvent());
    assert.strictEqual(parsed.source, "Eventbrite", "events.source records the platform the listing was found on, never the organizer's own name (DEC-005: source != organizer)");
  }
  console.log("PASS: events.source is always 'Eventbrite', never the organizer's own name");

  // --- 12. formatTimeDisplay: ranges, single time, and identical start/end ---
  {
    assert.strictEqual(formatTimeDisplay("2026-11-05T19:00:00", "2026-11-05T22:00:00"), "7:00 PM – 10:00 PM");
    assert.strictEqual(formatTimeDisplay("2026-11-05T20:00:00", null), "8:00 PM");
    assert.strictEqual(formatTimeDisplay("2026-11-05T20:00:00", "2026-11-05T20:00:00"), "8:00 PM", "identical start/end collapses to a single time, not a zero-length range");
    assert.strictEqual(formatTimeDisplay("2026-11-05T00:00:00", null), "12:00 AM", "midnight formats correctly, not '0:00 AM'");
    assert.strictEqual(formatTimeDisplay(null, null), null);
  }
  console.log("PASS: formatTimeDisplay reads venue-local wall-clock time directly from Eventbrite's own local datetime strings");

  // --- 13. fetchOrganizerEvents paginates via continuation, bounded by MAX_PAGES_PER_ORGANIZER ---
  {
    let page = 0;
    const fetchFn = async (url) => {
      page++;
      const u = new URL(url);
      assert.strictEqual(u.searchParams.get("expand"), "venue");
      assert.strictEqual(u.searchParams.get("status"), "live");
      if (page === 1) {
        assert.strictEqual(u.searchParams.get("continuation"), null);
        return { ok: true, status: 200, json: async () => orgEventsPage([ebEvent({ id: "p1" })], { hasMore: true, continuation: "cursor-2" }) };
      }
      assert.strictEqual(u.searchParams.get("continuation"), "cursor-2");
      return { ok: true, status: 200, json: async () => orgEventsPage([ebEvent({ id: "p2" })], { hasMore: false }) };
    };
    // fetchOrganizerEvents uses the global fetch internally -- set it for this call.
    global.fetch = fetchFn;
    const result = await fetchOrganizerEvents("105186308861", "fake-token");
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.events.length, 2);
    assert.strictEqual(result.events[0].id, "p1");
    assert.strictEqual(result.events[1].id, "p2");
    assert.strictEqual(page, 2, "stops paginating once has_more_items is false");
  }
  console.log("PASS: fetchOrganizerEvents follows Eventbrite's continuation-cursor pagination correctly");

  // --- 14. fetchOrganizerEvents is bounded -- never loops forever against a misbehaving organizer ---
  {
    let page = 0;
    global.fetch = async () => {
      page++;
      return { ok: true, status: 200, json: async () => orgEventsPage([ebEvent({ id: `inf-${page}` })], { hasMore: true, continuation: `c${page}` }) };
    };
    const result = await fetchOrganizerEvents("105186308861", "fake-token");
    assert.strictEqual(page, MAX_PAGES_PER_ORGANIZER, "must stop at exactly the page cap, never beyond it");
    assert.strictEqual(result.events.length, MAX_PAGES_PER_ORGANIZER);
    assert.strictEqual(result.error, null, "hitting the page cap is not itself an error -- it's a bounded safety limit");
  }
  console.log("PASS: pagination is bounded by MAX_PAGES_PER_ORGANIZER against an organizer whose feed never stops claiming more pages");

  // --- 15. fetchOrganizerEvents surfaces a non-OK response as an error, not a silent empty result ---
  {
    global.fetch = async () => ({ ok: false, status: 403, text: async () => "" });
    const result = await fetchOrganizerEvents("105186308861", "fake-token");
    assert.ok(result.error && result.error.includes("403"));
    assert.strictEqual(result.events.length, 0);
  }
  console.log("PASS: a non-OK upstream response is surfaced as an error, not silently treated as zero events found");

  // ==================================================================
  // Full-handler tests
  // ==================================================================

  // --- 16. every organizer skipped (no token configured) -- today's real, expected default state ---
  {
    const handler = freshHandler();
    delete process.env[FLORIAN_EAST_TOKEN_ENV];
    const { fetchFn, calls } = makeMockFetch({ source: () => { throw new Error("must not be called -- no token configured"); } });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(sourceCalls(calls).length, 0, "an organizer with no token configured must never be fetched");
    assert.strictEqual(upsertCalls(calls).length, 0);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    assert.deepStrictEqual(res._body.skipped, ["105186308861"]);
    assert.strictEqual(res._body.allOrganizersSkipped, true);
    const patches = patchCalls(calls);
    assert.strictEqual(patches[0].body.outcome, "success", "no configured organizers is a clean no-op success, not a failure -- WP 6.12 explicitly allows 'it waits on an organizer'");
  }
  console.log("PASS: with no organizer tokens configured (today's real state), every organizer is skipped and the run reports a clean success");

  // --- 17. a configured organizer's events are fetched, resolved, and upserted ---
  {
    process.env[FLORIAN_EAST_TOKEN_ENV] = "fake-token-123";
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => orgEventsPage([ebEvent({ id: "live-1" })]) }),
      venues: () => ({ ok: true, status: 200, json: async () => [{ id: "venue-fe-canonical", name: "Florian East Lagers & Ales" }] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const upserts = upsertCalls(calls);
    assert.strictEqual(upserts.length, 1);
    const row = upserts[0].body[0];
    assert.strictEqual(row.external_id, "eventbrite-live-1");
    assert.strictEqual(row.venue_id, "venue-fe-canonical", "resolves to the canonical venue by exact name match");
    assert.strictEqual(row.status, "pending_review");
    assert.strictEqual(res._body.upserted, 1);
    delete process.env[FLORIAN_EAST_TOKEN_ENV];
  }
  console.log("PASS: once an organizer's token is configured, its events are fetched, venue-resolved, and upserted as pending_review");

  // --- 18. unresolved venue (not yet in the venues table) stays null, never guessed/created ---
  {
    process.env[FLORIAN_EAST_TOKEN_ENV] = "fake-token-123";
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => orgEventsPage([ebEvent({ id: "live-2" })]) }),
      venues: () => ({ ok: true, status: 200, json: async () => [] }), // Florian East has no canonical venues row yet
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const row = upsertCalls(calls)[0].body[0];
    assert.strictEqual(row.venue_id, null, "no canonical venue exists yet -- never guessed or auto-created");
    assert.strictEqual(row.venue_name_raw, "Florian East Lagers & Ales", "the raw name from Eventbrite's own venue object is still preserved");
    delete process.env[FLORIAN_EAST_TOKEN_ENV];
  }
  console.log("PASS: an organizer with no canonical venues row yet gets venue_id: null, venue_name_raw preserved -- same honest-gap convention as every other connector");

  // --- 19. existing moderator-set status is preserved across re-ingestion ---
  {
    process.env[FLORIAN_EAST_TOKEN_ENV] = "fake-token-123";
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => orgEventsPage([ebEvent({ id: "existing-1" })]) }),
      statusLookup: () => ({ ok: true, status: 200, json: async () => [{ external_id: "eventbrite-existing-1", status: "approved" }] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const row = upsertCalls(calls)[0].body[0];
    assert.strictEqual(row.status, "approved", "a moderator's prior approval is never reset by a rerun, even though this row would otherwise default to pending_review");
    delete process.env[FLORIAN_EAST_TOKEN_ENV];
  }
  console.log("PASS: an existing row's moderator-set status survives re-ingestion, overriding this connector's own pending_review default");

  // --- 20. status lookup failure aborts with zero writes (fail-closed, WP 0.17) ---
  {
    process.env[FLORIAN_EAST_TOKEN_ENV] = "fake-token-123";
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => orgEventsPage([ebEvent({ id: "x" })]) }),
      statusLookup: () => ({ ok: false, status: 500, text: async () => "boom" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(upsertCalls(calls).length, 0, "a failed status lookup must never fall through to writing with a default status");
    assert.strictEqual(res._status, 502);
    delete process.env[FLORIAN_EAST_TOKEN_ENV];
  }
  console.log("PASS: a failed status lookup aborts the run with zero writes -- fail-closed, same contract as every other connector");

  // --- 21. a malformed/failed organizer response doesn't abort the whole run, and is recorded ---
  {
    process.env[FLORIAN_EAST_TOKEN_ENV] = "fake-token-123";
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ notEvents: [] }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(upsertCalls(calls).length, 0);
    assert.strictEqual(res._body.failed.length, 1);
    assert.ok(res._body.failed[0].error.includes("Unexpected API response shape"));
    const patches = patchCalls(calls);
    assert.strictEqual(patches[0].body.outcome, "partial", "a per-organizer failure with zero rows written is 'partial', not silently 'success'");
    delete process.env[FLORIAN_EAST_TOKEN_ENV];
  }
  console.log("PASS: a malformed organizer response writes zero events, is recorded in 'failed', and the run reports outcome=partial");

  // --- 22. only future events are kept, same rolling-window convention as every other connector ---
  {
    process.env[FLORIAN_EAST_TOKEN_ENV] = "fake-token-123";
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({
        ok: true,
        status: 200,
        json: async () => orgEventsPage([
          ebEvent({ id: "past-1", startLocal: "2020-01-01T19:00:00", endLocal: "2020-01-01T22:00:00" }),
          ebEvent({ id: "future-1", startLocal: "2099-01-01T19:00:00", endLocal: "2099-01-01T22:00:00" }),
        ]),
      }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const upserts = upsertCalls(calls);
    assert.strictEqual(upserts.length, 1);
    assert.strictEqual(upserts[0].body.length, 1);
    assert.strictEqual(upserts[0].body[0].external_id, "eventbrite-future-1");
    delete process.env[FLORIAN_EAST_TOKEN_ENV];
  }
  console.log("PASS: past events are filtered out -- only today-or-later events are written");

  // --- 23. source_runs logging is failure-safe ---
  {
    process.env[FLORIAN_EAST_TOKEN_ENV] = "fake-token-123";
    const handler = freshHandler();
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => orgEventsPage([ebEvent({ id: "rl-1" })]) }),
      runInsert: () => { throw new Error("source_runs table does not exist yet"); },
      runUpdate: () => { throw new Error("source_runs table does not exist yet"); },
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1, "ingestion completes normally even when source_runs logging is entirely broken");
    delete process.env[FLORIAN_EAST_TOKEN_ENV];
  }
  console.log("PASS: source_runs logging failures never block or break ingestion (fail-safe by run-log.js's own design)");

  // --- 24. CRON_SECRET auth is enforced when configured ---
  {
    process.env.CRON_SECRET = "s3cret";
    const handler = freshHandler();
    const res = makeRes();
    await handler({ headers: { authorization: "Bearer wrong" } }, res);
    assert.strictEqual(res._status, 401);
    delete process.env.CRON_SECRET;
  }
  console.log("PASS: an incorrect/missing bearer token is rejected with 401 when CRON_SECRET is configured");

  console.log("\nAll cron-eventbrite.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
