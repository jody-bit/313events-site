// test/cron-lagerhouse-runlog.test.js — WP 0.5 pilot integration test.
//
// cron-lagerhouse.js was chosen as the WP 0.5 pilot connector (small,
// clear fetch -> parse -> write stages, not touched by any of today's
// incident commits). This exercises the full handler end-to-end with a
// mocked global.fetch, asserting the source_runs INSERT/UPDATE calls it
// makes at each exit path match what api/_lib/run-log.js and the approved
// WP 0.5 outcome semantics require -- not just that run-log.js works in
// isolation (see test/run-log.test.js for that).
//
// Plain Node assert, no dependencies, matching this repo's existing style.
// Run: node test/cron-lagerhouse-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-lagerhouse.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/cron-lagerhouse.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

function card({ date, slug, title, time = "8:00 PM", doors = null, price = "$10", desc = "A show.", img = "https://example.com/x.jpg" }) {
  const doorsSpan = doors ? `<span>Doors: ${doors}</span>` : "";
  return `<app-event-card><a href="/events/${date}/${slug}">
    <h3>${title}</h3>
    <span>${time}</span>
    ${doorsSpan}
    <div class="text-lg font-bold text-blue-600">${price}</div>
    <p class="line-clamp-2">${desc}</p>
    <img src="${img}">
  </a></app-event-card>`;
}

// A trailing chunk with no parseable href -- exercises records_fetched >
// records_parsed (a card existed, but didn't produce an event record).
const BROKEN_CARD = `<app-event-card><div>layout changed, no href here</div></app-event-card>`;

function twoValidCardsHtml() {
  return (
    "<html><body>" +
    card({ date: "2026-12-01", slug: "show-one", title: "Show One" }) +
    card({ date: "2026-12-02", slug: "show-two", title: "Show Two" }) +
    "</body></html>"
  );
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url === "https://thelagerhouse.com/events") return routes.source();
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
  delete process.env.CRON_SECRET; // no auth header needed in these fixtures

  // --- 1. successful run: two valid cards, both written ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => twoValidCardsHtml() }),
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
  console.log("PASS: successful run logs outcome=success with matching fetched/parsed/written counts");

  // --- 2. legitimate zero-record run: page has no cards at all ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => "<html><body>no shows today</body></html>" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "a genuinely empty page is success, not failed");
    assert.strictEqual(patches[0].body.records_fetched, 0);
    assert.strictEqual(patches[0].body.records_parsed, 0);
  }
  console.log("PASS: a page with zero cards logs outcome=success with records_fetched=0 (legitimate quiet run)");

  // --- 2b. cards present but none parseable: records_fetched > records_parsed ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => "<html><body>" + BROKEN_CARD + BROKEN_CARD + "</body></html>" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "still success -- the run completed normally");
    assert.strictEqual(patches[0].body.records_fetched, 2, "two raw cards were present");
    assert.strictEqual(patches[0].body.records_parsed, 0, "but neither produced a usable event record");
  }
  console.log("PASS: cards present but unparseable logs records_fetched=2/records_parsed=0 -- the exact 'suspicious zero' signal WP 0.5 was missing before");

  // --- 3. catchable failure: the Supabase upsert POST fails ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => twoValidCardsHtml() }),
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

  // --- 4. blocked/403 run: the upstream fetch itself returns 403 ---
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
    assert.strictEqual(patches[0].body.outcome, "blocked", "a 403 from the upstream is blocked, not failed");
    assert.strictEqual(patches[0].body.http_status, 403);
  }
  console.log("PASS: an upstream 403 logs outcome=blocked (not failed, not silently success)");

  // --- 5. unfinished started row: startRun succeeds, then the fetch call throws mid-flight and is never reached again by this test's harness (simulating what a hard timeout leaves behind) ---
  {
    const handler = freshHandler();
    const runInsertCalls = [];
    const fetchFn = async (url, opts = {}) => {
      if (url.includes("/rest/v1/source_runs") && opts.method === "POST") {
        runInsertCalls.push(JSON.parse(opts.body));
        return { ok: true, status: 201, json: async () => [{ id: "run-timeout-sim" }] };
      }
      if (url === "https://thelagerhouse.com/events") {
        // Simulate the serverless runtime hard-killing the function here --
        // no more of this handler's code executes, ever. We model that by
        // just never resolving (the test itself doesn't await it) rather
        // than by letting the handler run to any of its own catch blocks,
        // since a real hard-kill doesn't let a catch block run either.
        return new Promise(() => {});
      }
      throw new Error("unexpected call after simulated timeout: " + url);
    };
    global.fetch = fetchFn;
    const res = makeRes();
    handler({ headers: {} }, res); // deliberately not awaited -- it never resolves

    // Give the startRun() insert a tick to complete, then assert only that
    // one row was written, with outcome='started'. Nothing about run-log.js
    // requires a finishRun to ever be called for this to be correct -- the
    // stale 'started' row IS the evidence a monitoring layer would use.
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(runInsertCalls.length, 1);
    assert.strictEqual(runInsertCalls[0][0].outcome, "started");
    assert.strictEqual(runInsertCalls[0][0].source_slug, "lagerhouse");
  }
  console.log("PASS: a run that never reaches any exit path still leaves its 'started' row -- the timeout-evidence case");

  console.log("\nAll cron-lagerhouse.js WP 0.5 integration tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
