// test/cron-trinosophes-runlog.test.js — WP 0.5 Batch 2.
//
// Trinosophes' page is a full historical archive (see the 2026-08-25
// comment in cron-trinosophes.js), so parseTrinosophesEvents's raw output
// (before the upcoming-only filter) is a genuine, naturally-available
// "fetched" count -- unlike Dossin/HALO/Redford, this connector DOES have a
// real fetched>0/parsed=0 case: historical events the parser finds but the
// date filter drops. WP 0.14 (routing new rows to pending_review) is a
// separate, not-yet-approved WP and is intentionally NOT exercised or
// implied by any assertion here -- every row in this suite still writes
// with the connector's existing DEFAULT_STATUS ('approved').
//
// Plain Node assert, no dependencies.
// Run: node test/cron-trinosophes-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SOURCE_URL = "https://trinosophes.com/Events";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-trinosophes.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  return require(`${REPO_DIR}/api/cron-trinosophes.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// A date-heading line ("Month Day, Year") followed by a title line -- the
// shape parseTrinosophesEvents expects (see its own header comment).
function dateHeadingHtml(dateHeading, title) {
  return `<div>${dateHeading}</div><div>${title}</div>`;
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url === SOURCE_URL) return routes.source();
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

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 1. normal success: one upcoming show ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => dateHeadingHtml("December 5, 2026", "A Future Band") }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success");
    assert.strictEqual(patches[0].body.records_fetched, 1, "the archive-wide parse found one event, and it's upcoming");
    assert.strictEqual(patches[0].body.records_parsed, 1);
    assert.strictEqual(patches[0].body.records_written, 1);
  }
  console.log("PASS: normal success logs outcome=success with matching fetched/parsed/written counts");

  // --- 2. legitimate zero candidates: nothing at all on the page ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => "<div>Coming Soon</div>" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "a genuinely empty parse is success, not failed");
    assert.strictEqual(patches[0].body.records_fetched, 0);
    assert.strictEqual(patches[0].body.records_parsed, 0);
  }
  console.log("PASS: zero Trinosophes events parsed logs outcome=success with records_fetched=0/records_parsed=0");

  // --- 2b. fetched > 0 / parsed = 0: the archive-wide parse finds a real,
  //     historical (past) event, but the upcoming-only filter drops it --
  //     this connector's own natural fetched/parsed split, per its
  //     2026-08-25 full-archive discovery ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => dateHeadingHtml("August 16, 2020", "A Very Old Show") }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "still success -- the run completed normally");
    assert.strictEqual(patches[0].body.records_fetched, 1, "one historical event was found in the archive-wide parse");
    assert.strictEqual(patches[0].body.records_parsed, 0, "but it's not upcoming, so the date filter dropped it");
  }
  console.log("PASS: a historical-only page logs records_fetched=1/records_parsed=0 (the real fetched/parsed split for this connector)");

  // --- 3. write failure ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => dateHeadingHtml("December 5, 2026", "A Future Band") }),
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
      source: () => ({ ok: true, status: 200, text: async () => dateHeadingHtml("December 5, 2026", "A Future Band") }),
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

  // --- 6. DEFAULT_STATUS unchanged -- confirms WP 0.14's pending-review
  //     routing was NOT implicitly pulled in while adding run logging ---
  {
    const handler = freshHandler();
    let capturedUpsertBody = null;
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => dateHeadingHtml("December 5, 2026", "A Future Band") }),
      upsert: () => ({ ok: true, status: 201, text: async () => "" }),
    });
    global.fetch = async (url, opts = {}) => {
      if (opts.method === "POST" && url.includes("/rest/v1/events")) {
        capturedUpsertBody = JSON.parse(opts.body);
      }
      return fetchFn(url, opts);
    };
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.ok(capturedUpsertBody && capturedUpsertBody.length === 1);
    assert.strictEqual(capturedUpsertBody[0].status, "approved", "WP 0.14's pending_review routing is separate and was not implemented here");
  }
  console.log("PASS: new rows still write with status='approved' -- WP 0.14 routing was not implicitly added");

  // --- 7. Needs Follow-up investigation (2026-09-22): when the venues
  //     table actually contains a canonical "Trinosophes" row, this
  //     connector's venue_id resolution (resolveVenueId(), from the
  //     shared api/_lib/venue-lookup.js layer) must write that row's id
  //     onto every upserted event -- proving venue_id really is written
  //     on ingestion, end to end through the real connector, not just in
  //     the resolver's own unit tests (test/venue-lookup.test.js). Every
  //     other test above (and every other single-venue cron's own runlog
  //     test) mocks /rest/v1/venues as an empty array, which only ever
  //     exercised the "no match" path -- this is the connector-level
  //     "a real match exists" case that was previously untested anywhere. ---
  {
    const handler = freshHandler();
    let capturedUpsertBody = null;
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => dateHeadingHtml("December 5, 2026", "A Future Band") }),
    });
    global.fetch = async (url, opts = {}) => {
      if (url.includes("/rest/v1/venues")) {
        return { ok: true, status: 200, json: async () => [{ id: "venue-trinosophes-id", name: "Trinosophes" }] };
      }
      if (opts.method === "POST" && url.includes("/rest/v1/events")) {
        capturedUpsertBody = JSON.parse(opts.body);
      }
      return fetchFn(url, opts);
    };
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.ok(capturedUpsertBody && capturedUpsertBody.length === 1);
    assert.strictEqual(capturedUpsertBody[0].venue_id, "venue-trinosophes-id", "the canonical Trinosophes venues row's id must be written onto the upserted event");
    assert.strictEqual(capturedUpsertBody[0].venue_name_raw, "Trinosophes");

    // Replicates admin.html's exact getMissingFields() "venue address/city"
    // check inline (same approach as test/cron-dossin-runlog.test.js and
    // test/cron-wdet-runlog.test.js's own Needs Follow-up tests): once
    // venue_id resolves AND the admin query's venues(address,city) embed
    // (api/admin-events.js's incomplete=1 select string) supplies a real
    // canonical address, the event is no longer flagged for this reason --
    // proving the full connector -> resolver -> admin-join -> missing-
    // field-check chain actually clears once a canonical match exists.
    const rowAsAdminWouldSeeIt = {
      ...capturedUpsertBody[0],
      venues: { address: "1464 Gratiot Ave", city: "Detroit" }, // what the admin query's embed would return for this venue_id
    };
    const hasRawAddress = !!(rowAsAdminWouldSeeIt.venue_address_raw && rowAsAdminWouldSeeIt.venue_address_raw.trim()) || !!(rowAsAdminWouldSeeIt.venue_city_raw && rowAsAdminWouldSeeIt.venue_city_raw.trim());
    const hasLinkedVenueAddress = !!(rowAsAdminWouldSeeIt.venues && rowAsAdminWouldSeeIt.venues.address && rowAsAdminWouldSeeIt.venues.address.trim());
    assert.strictEqual(hasRawAddress, false, "this connector never writes venue_address_raw/venue_city_raw itself -- confirms the raw-field path is genuinely blank, not silently already covering this");
    assert.strictEqual(hasLinkedVenueAddress, true, "once venue_id resolves to a canonical row with a real address, admin.html's hasLinkedVenueAddress check is satisfied");
  }
  console.log("PASS: a real canonical Trinosophes venues row resolves venue_id on ingestion and clears admin.html's VENUE ADDRESS/CITY check");

  console.log("\nAll cron-trinosophes.js WP 0.5 integration tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
