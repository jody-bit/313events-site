// test/cron-bigtimebingo-runlog.test.js — api/cron-bigtimebingo.js handler
// tests: venue resolution, moderator protection (status + description),
// fail-closed status-lookup abort, and the actual Needs Follow-up
// semantics (admin.html's getMissingFields()) once the canonical Garden
// Bowl venue is resolvable.
//
// See test/bigtimebingo-occurrences.test.js for the pure date-generation
// tests (Monday-only, DST safety, deterministic/idempotent external_ids) --
// not repeated here.
//
// Plain Node assert, no dependencies.
// Run: node test/cron-bigtimebingo-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-bigtimebingo.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/status-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/bigtimebingo-occurrences.js`)];
  return require(`${REPO_DIR}/api/cron-bigtimebingo.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url.includes("/rest/v1/venues")) return routes.venues ? routes.venues() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return routes.runInsert ? routes.runInsert() : { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return routes.runUpdate ? routes.runUpdate() : { ok: true, status: 204, json: async () => ({}) };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return routes.statusLookup ? routes.statusLookup() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && opts.method === "POST") return routes.upsert ? routes.upsert() : { ok: true, status: 201, text: async () => "" };
    throw new Error("unmocked URL in test: " + url);
  };
  return { fetchFn, calls };
}

function upsertBody(calls) {
  const call = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
  return call ? call.body : null;
}

// admin.html's getMissingFields(), replicated inline -- see that file for
// the source of truth. Kept in sync by hand across this project's test
// suite (same convention every other *-runlog.test.js file already uses).
function getMissingFields(e) {
  const missing = [];
  if (!e.description || !e.description.trim()) missing.push('description');
  const hasRawAddress = !!(e.venue_address_raw && e.venue_address_raw.trim()) || !!(e.venue_city_raw && e.venue_city_raw.trim());
  const hasLinkedVenueAddress = !!(e.venues && e.venues.address && e.venues.address.trim());
  if (!hasRawAddress && !hasLinkedVenueAddress) missing.push('venue address/city');
  if (!(e.ticket_url && e.ticket_url.trim()) && !(e.event_url && e.event_url.trim())) missing.push('ticket/event link');
  if (!e.is_all_day && !(e.time_display && e.time_display.trim())) missing.push('start time');
  return missing;
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 7. Garden Bowl resolves to the canonical venue when it exists. ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      venues: () => ({ ok: true, status: 200, json: async () => [{ id: "venue-garden-bowl", name: "Garden Bowl" }] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    const body = upsertBody(calls);
    assert.ok(Array.isArray(body) && body.length > 0);
    for (const row of body) {
      assert.strictEqual(row.venue_id, "venue-garden-bowl", "every occurrence must resolve to the canonical Garden Bowl venue_id when one exists");
      assert.strictEqual(row.venue_name_raw, "Garden Bowl");
    }
  }
  console.log("PASS: Garden Bowl resolves to its canonical venue_id on every generated occurrence");

  // --- No canonical venue yet: resolves to null, not a crash or a guess (mirrors the pre-migration Trinosophes case). ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      venues: () => ({ ok: true, status: 200, json: async () => [] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    const body = upsertBody(calls);
    for (const row of body) {
      assert.strictEqual(row.venue_id, null, "with no canonical venue row yet, venue_id must be null, never a guessed id");
    }
  }
  console.log("PASS: with no canonical Garden Bowl row yet, venue_id resolves to null rather than guessing");

  // --- 8. Canonical venue address/city satisfies Needs Follow-up without duplicating address onto the event row. ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      venues: () => ({ ok: true, status: 200, json: async () => [{ id: "venue-garden-bowl", name: "Garden Bowl" }] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const body = upsertBody(calls);
    const row = body[0];
    assert.strictEqual(row.venue_address_raw, undefined, "must not duplicate canonical address onto the event row");
    assert.strictEqual(row.venue_city_raw, undefined, "must not duplicate canonical city onto the event row");
    // Simulate the admin API's actual response shape (venue_id joined to
    // venues(address,city)) the way api/admin-events.js's incomplete=1
    // query does, and prove getMissingFields() reports zero missing
    // fields for a freshly-generated occurrence once the canonical venue
    // is resolvable.
    const asAdminSees = { ...row, venues: { address: "4140 Woodward Ave", city: "Detroit" } };
    assert.deepStrictEqual(getMissingFields(asAdminSees), [], "a freshly-generated Big Time Bingo occurrence must have zero Needs Follow-up missing fields once Garden Bowl's canonical venue is resolvable");
  }
  console.log("PASS: canonical venue address/city alone satisfies Needs Follow-up -- zero missing fields, no duplicated event-level address");

  // --- 14 & 15. Moderator-entered description and status survive re-ingestion. ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      venues: () => ({ ok: true, status: 200, json: async () => [{ id: "venue-garden-bowl", name: "Garden Bowl" }] }),
      statusLookup: () => ({
        ok: true,
        status: 200,
        json: async () => [
          { external_id: "big-time-bingo-2026-09-28", status: "rejected", description: null },
          { external_id: "big-time-bingo-2026-10-05", status: "approved", description: "Jody's own note: this week's lineup theme is 80s trivia bingo." },
          { external_id: "big-time-bingo-2026-10-12", status: "pending_review", description: null },
        ],
      }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const body = upsertBody(calls);
    const byId = new Map(body.map((r) => [r.external_id, r]));

    assert.strictEqual(byId.get("big-time-bingo-2026-09-28").status, "rejected", "a rejected occurrence must stay rejected, not reset to approved");
    assert.strictEqual(byId.get("big-time-bingo-2026-10-05").status, "approved");
    assert.strictEqual(byId.get("big-time-bingo-2026-10-05").description, "Jody's own note: this week's lineup theme is 80s trivia bingo.", "a moderator-hand-edited description must survive re-ingestion, never overwritten back to the generic generated text");
    assert.strictEqual(byId.get("big-time-bingo-2026-10-12").status, "pending_review", "pending_review must be preserved, not reset");
    // An occurrence never seen before still gets the default status and
    // the generated description (self-heal / normal-case behavior).
    const brandNew = body.find((r) => !["big-time-bingo-2026-09-28", "big-time-bingo-2026-10-05", "big-time-bingo-2026-10-12"].includes(r.external_id));
    assert.ok(brandNew, "there must be at least one occurrence with no prior row");
    assert.strictEqual(brandNew.status, "approved");
    assert.ok(/Big Time Bingo is a weekly Monday-night bingo event/.test(brandNew.description));
  }
  console.log("PASS: rejected/approved/pending_review status and moderator-edited descriptions all survive re-ingestion");

  // --- 16. Status/existing-row lookup failure is fail-closed: aborts with zero event writes. ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      venues: () => ({ ok: true, status: 200, json: async () => [{ id: "venue-garden-bowl", name: "Garden Bowl" }] }),
      statusLookup: () => ({ ok: false, status: 500, json: async () => { throw new Error("bad json"); }, text: async () => "internal error" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 502, "a failed status/description lookup must abort with 502, never fall back to an empty map");
    assert.strictEqual(res._body.upserted, 0);
    const upsertCall = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    assert.strictEqual(upsertCall, undefined, "zero event writes must occur when the protective lookup fails -- fail closed, same as every other connector in this project");
  }
  console.log("PASS: a failed status/description lookup aborts the run with zero event writes (fail-closed)");

  // --- 17. The resulting event is evaluated using the real Needs Follow-up semantics end to end (description + venue + link + time all present). ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      venues: () => ({ ok: true, status: 200, json: async () => [{ id: "venue-garden-bowl", name: "Garden Bowl" }] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const body = upsertBody(calls);
    for (const row of body) {
      const asAdminSees = { ...row, venues: { address: "4140 Woodward Ave", city: "Detroit" } };
      assert.deepStrictEqual(getMissingFields(asAdminSees), [], `occurrence ${row.external_id} must have zero Needs Follow-up missing fields`);
    }
  }
  console.log("PASS: every generated occurrence clears Needs Follow-up under the real getMissingFields() semantics");

  console.log("\nAll cron-bigtimebingo.js runlog tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
