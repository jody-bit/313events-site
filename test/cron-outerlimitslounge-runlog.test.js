// test/cron-outerlimitslounge-runlog.test.js — WP 0.5 Batch 1.
//
// Outer Limits Lounge pulls Squarespace's own JSON feed. Unlike the other
// three Batch 1 connectors, it has TWO separate early-return/zero-branch
// points: one on the raw `upcoming` array straight from the feed, and a
// second on `rawRows` after per-item date parsing. Both need their own
// finishRun() call. `excludedByDate` (items dropped for lacking a usable
// startDate) is kept out of records_parsed, same principle as VisitDetroit's
// pre-dedupe records_parsed rule.
//
// Mirrors test/cron-belle-isle-nature-center-runlog.test.js's structure.
// Plain Node assert, no dependencies.
// Run: node test/cron-outerlimitslounge-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const FEED_URL = "https://www.outerlimitslounge.com/events?format=json";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-outerlimitslounge.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  return require(`${REPO_DIR}/api/cron-outerlimitslounge.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

function squarespaceItem({ id, title = "Band Night", startDate, endDate, fullUrl = "/events/band-night", body = "<p>Live music.</p>" }) {
  return { id, title, startDate, endDate, fullUrl, body, excerpt: null };
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url === FEED_URL) return routes.source();
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
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

const NOW_MS = Date.now();
const FUTURE_MS = NOW_MS + 30 * 24 * 60 * 60 * 1000;

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 1. normal success: two valid upcoming items, both written ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ upcoming: [squarespaceItem({ id: 1, startDate: FUTURE_MS }), squarespaceItem({ id: 2, title: "Karaoke Night", startDate: FUTURE_MS })] }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 2);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success");
    assert.strictEqual(patches[0].body.records_fetched, 2);
    assert.strictEqual(patches[0].body.records_parsed, 2);
    assert.strictEqual(patches[0].body.records_written, 2);
  }
  console.log("PASS: normal success logs outcome=success with matching fetched/parsed/written counts");

  // --- 2. legitimate zero upstream records: the raw `upcoming` array
  //     itself is empty (first zero-branch) ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ upcoming: [] }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "an empty feed is success, not failed -- the page layout note stays informational");
    assert.strictEqual(patches[0].body.records_fetched, 0);
    assert.strictEqual(patches[0].body.records_parsed, 0);
  }
  console.log("PASS: an empty upcoming[] feed logs outcome=success with records_fetched=0 (first zero-branch)");

  // --- 2b. fetched > 0 / parsed = 0 via the SECOND zero-branch: items are
  //     present but none have a usable startDate, so detroitParts()
  //     returns null for each and rawRows ends up empty ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ upcoming: [squarespaceItem({ id: 1, startDate: null }), squarespaceItem({ id: 2, startDate: undefined })] }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    assert.strictEqual(res._body.excludedByDate, 2);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "still success -- the run completed normally");
    assert.strictEqual(patches[0].body.records_fetched, 2, "two raw items were present");
    assert.strictEqual(patches[0].body.records_parsed, 0, "but neither had a usable startDate (the second zero-branch)");
  }
  console.log("PASS: items present but none date-parseable logs records_fetched=2/records_parsed=0 (second zero-branch)");

  // --- 3. write failure ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ upcoming: [squarespaceItem({ id: 1, startDate: FUTURE_MS })] }) }),
      upsert: () => ({ ok: false, status: 500, text: async () => "internal server error" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 502);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "failed");
    assert.strictEqual(patches[0].body.records_written, 0);
    assert.ok(patches[0].body.error_sample.includes("internal server error"));
  }
  console.log("PASS: a failed upsert logs outcome=failed with records_written=0 and an error_sample");

  // --- 4. upstream blocked/auth failure ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: false, status: 403, text: async () => "" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "blocked");
    assert.strictEqual(patches[0].body.http_status, 403);
  }
  console.log("PASS: an upstream 403 logs outcome=blocked");

  // --- 5. logging failure does not break ingestion ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ upcoming: [squarespaceItem({ id: 1, startDate: FUTURE_MS })] }) }),
      runInsert: () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 0, "no PATCH is attempted when startRun() never produced a runId");
  }
  console.log("PASS: a source_runs logging failure does not affect ingestion's own success/response");

  // --- 6. Needs Follow-up investigation (2026-09-22): a real Squarespace
  //     "Post Body" block (HTML, entities, a nested <a><strong> link) is
  //     correctly recovered into a clean, event-specific description on
  //     the actual upsert payload -- the exact shape confirmed live
  //     against outerlimitslounge.com/events?format=json while
  //     investigating this. Proves authoritative descriptions really do
  //     exist for this source and really are being captured, not
  //     discarded. ---
  {
    const handler = freshHandler();
    const realBody = '<div class="sqs-html-content"><p><a href="https://bigbillband.bandcamp.com"><strong>Big Bill</strong></a> - “Nicely nervy new wave.” —<em>brooklynvegan</em></p><p><a href="https://gerberhq.bandcamp.com"><strong>Gerber &amp; the Babies</strong></a></p></div>';
    let capturedUpsertBody = null;
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ upcoming: [squarespaceItem({ id: 1, title: "Big Bill &amp; Friends", startDate: FUTURE_MS, body: realBody })] }) }),
    });
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "POST" && url.includes("/rest/v1/events")) capturedUpsertBody = JSON.parse(opts.body);
      return fetchFn(url, opts);
    };
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.ok(capturedUpsertBody && capturedUpsertBody.length === 1);
    assert.strictEqual(
      capturedUpsertBody[0].description,
      'Big Bill - “Nicely nervy new wave.” — brooklynvegan Gerber & the Babies',
      "HTML must be stripped and entities decoded into a clean, real, event-specific description"
    );
  }
  console.log("PASS: a real Squarespace Post Body block recovers into a clean, event-specific description");

  // --- 7. A listing with genuinely no Post Body content (confirmed live:
  //     about 23 of the venue's 53 currently-upcoming listings, dominated
  //     by the recurring "Karaoke with Polish John!" night, have none at
  //     all) writes description: null honestly -- never fabricated. This
  //     is the STRUCTURALLY UNAVAILABLE case, not a bug. ---
  {
    const handler = freshHandler();
    let capturedUpsertBody = null;
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ upcoming: [squarespaceItem({ id: 2, title: "Karaoke with Polish John!", startDate: FUTURE_MS, body: "" })] }) }),
    });
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "POST" && url.includes("/rest/v1/events")) capturedUpsertBody = JSON.parse(opts.body);
      return fetchFn(url, opts);
    };
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(capturedUpsertBody[0].description, null, "no Post Body content on the source must write null, never a fabricated description");
  }
  console.log("PASS: a listing with no Post Body content writes description: null (structurally unavailable, not invented)");

  // --- 8. An existing nonblank description (moderator-entered, or a prior
  //     successful scrape) must never be overwritten by this run's fresh
  //     result -- even when the fresh scrape is blank. This is the
  //     "never replace moderator-entered content" requirement: without
  //     this, a moderator who typed a real description into one of the
  //     body-less Needs Follow-up cards would have it silently reverted
  //     to null on the very next scheduled run. ---
  {
    const handler = freshHandler();
    let capturedUpsertBody = null;
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ upcoming: [squarespaceItem({ id: 3, title: "Karaoke with Polish John!", startDate: FUTURE_MS, body: "" })] }) }),
      statusLookup: () => ({ ok: true, status: 200, json: async () => [{ external_id: "oll-3", status: "approved", description: "Jody's own moderator-written note about this specific karaoke night." }] }),
    });
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "POST" && url.includes("/rest/v1/events")) capturedUpsertBody = JSON.parse(opts.body);
      return fetchFn(url, opts);
    };
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(
      capturedUpsertBody[0].description,
      "Jody's own moderator-written note about this specific karaoke night.",
      "an existing nonblank description must be preserved, never overwritten by this run's blank scrape"
    );
  }
  console.log("PASS: an existing nonblank description survives a re-scrape that would otherwise blank it out");

  // --- 9. An existing BLANK description still gets filled in when this
  //     run's fresh scrape does have real content (self-heals once the
  //     venue adds a Post Body later) -- proves 8's protection doesn't
  //     also block genuine recovery. ---
  {
    const handler = freshHandler();
    const realBody = '<p>A real write-up that did not exist on the last scrape.</p>';
    let capturedUpsertBody = null;
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ upcoming: [squarespaceItem({ id: 4, title: "Some Show", startDate: FUTURE_MS, body: realBody })] }) }),
      statusLookup: () => ({ ok: true, status: 200, json: async () => [{ external_id: "oll-4", status: "approved", description: null }] }),
    });
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "POST" && url.includes("/rest/v1/events")) capturedUpsertBody = JSON.parse(opts.body);
      return fetchFn(url, opts);
    };
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(capturedUpsertBody[0].description, "A real write-up that did not exist on the last scrape.");
  }
  console.log("PASS: a previously-blank description still self-heals once the source gains real content");

  // --- 10. Needs Follow-up semantics: an affected event (a real Post Body
  //     recovered, plus this connector's always-present address/ticket/
  //     time fields) returns ZERO missing fields under admin.html's exact
  //     getMissingFields() logic -- proving the recovered description
  //     really does clear the event out of Needs Follow-up entirely, not
  //     just one field of it. ---
  {
    const handler = freshHandler();
    const realBody = '<p>Real, event-specific content.</p>';
    let capturedUpsertBody = null;
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => ({ upcoming: [squarespaceItem({ id: 5, title: "Some Show", startDate: FUTURE_MS, body: realBody })] }) }),
    });
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "POST" && url.includes("/rest/v1/events")) capturedUpsertBody = JSON.parse(opts.body);
      return fetchFn(url, opts);
    };
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200);

    // Replicates admin.html's exact getMissingFields() inline (same
    // approach used throughout this Needs Follow-up burn-down).
    function getMissingFields(e) {
      const missing = [];
      if (!e.description || !e.description.trim()) missing.push("description");
      const hasRawAddress = !!(e.venue_address_raw && e.venue_address_raw.trim()) || !!(e.venue_city_raw && e.venue_city_raw.trim());
      const hasLinkedVenueAddress = !!(e.venues && e.venues.address && e.venues.address.trim());
      if (!hasRawAddress && !hasLinkedVenueAddress) missing.push("venue address/city");
      if (!(e.ticket_url && e.ticket_url.trim()) && !(e.event_url && e.event_url.trim())) missing.push("ticket/event link");
      if (!e.is_all_day && !(e.time_display && e.time_display.trim())) missing.push("start time");
      return missing;
    }
    assert.deepStrictEqual(getMissingFields(capturedUpsertBody[0]), [], "a recovered description, plus this connector's always-present address/ticket/time fields, must clear the event from Needs Follow-up entirely");
  }
  console.log("PASS: an affected event with a recovered description returns zero missing fields (cleared from Needs Follow-up entirely)");

  console.log("\nAll cron-outerlimitslounge.js WP 0.5 integration tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
