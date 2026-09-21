// test/run-log.test.js — WP 0.5 pilot: api/_lib/run-log.js
//
// Plain Node assert, no dependencies, matching this repo's existing style
// (see test/cron-dossin-parse.test.js). Run: node test/run-log.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshRunLog() {
  // run-log.js reads process.env lazily (not cached at require time), but
  // the module itself IS cached by Node's require() — that's fine here
  // since it holds no per-call state, only pure functions closing over
  // process.env at call time. One require is reused across all tests.
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  return require(`${REPO_DIR}/api/_lib/run-log.js`);
}

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of Object.keys(vars)) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    });
}

// Mock fetch that only understands the two source_runs REST calls this
// module makes. Records every call for assertions.
function makeMockFetch({ postId = "11111111-1111-1111-1111-111111111111", postOk = true, patchThrows = false, postThrows = false } = {}) {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (opts.method === "POST") {
      if (postThrows) throw new Error("simulated network failure on insert");
      if (!postOk) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 201, json: async () => [{ id: postId }] };
    }
    if (opts.method === "PATCH") {
      if (patchThrows) throw new Error("simulated network failure on update");
      return { ok: true, status: 204, json: async () => ({}) };
    }
    throw new Error("unexpected method in mock: " + opts.method);
  };
  return { fetchFn, calls };
}

async function run() {
  // --- 1. successful run: startRun then finishRun(outcome:'success') ---
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, async () => {
    const { startRun, finishRun } = freshRunLog();
    const { fetchFn, calls } = makeMockFetch();
    global.fetch = fetchFn;

    const handle = await startRun("lagerhouse");
    assert.ok(handle && handle.runId, "startRun should return a handle with runId when configured");
    assert.strictEqual(calls.length, 1, "startRun should make exactly one fetch call");
    assert.strictEqual(calls[0].opts.method, "POST");
    assert.strictEqual(calls[0].body[0].source_slug, "lagerhouse");
    assert.strictEqual(calls[0].body[0].outcome, "started");

    await finishRun(handle, { outcome: "success", http_status: 200, records_fetched: 5, records_parsed: 5, records_written: 5 });
    assert.strictEqual(calls.length, 2, "finishRun should make exactly one more fetch call");
    assert.strictEqual(calls[1].opts.method, "PATCH");
    assert.ok(calls[1].url.includes(handle.runId), "PATCH should target the row by runId");
    assert.strictEqual(calls[1].body.outcome, "success");
    assert.strictEqual(calls[1].body.records_written, 5);
    assert.ok(typeof calls[1].body.duration_ms === "number" && calls[1].body.duration_ms >= 0, "duration_ms should be a non-negative number");
    assert.ok(calls[1].body.finished_at, "finished_at should be set");
  });
  console.log("PASS: successful run logs a started row then a success update");

  // --- 2. legitimate zero-record run: success outcome with zero counts ---
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, async () => {
    const { startRun, finishRun } = freshRunLog();
    const { fetchFn, calls } = makeMockFetch();
    global.fetch = fetchFn;

    const handle = await startRun("lagerhouse");
    await finishRun(handle, { outcome: "success", records_fetched: 0, records_parsed: 0, records_written: 0 });
    const patch = calls.find((c) => c.opts.method === "PATCH");
    assert.strictEqual(patch.body.outcome, "success");
    assert.strictEqual(patch.body.records_fetched, 0);
    assert.strictEqual(patch.body.records_parsed, 0);
    assert.strictEqual(patch.body.records_written, 0);
  });
  console.log("PASS: legitimate zero-record run is logged as success with zero counts, not failed");

  // --- 3. catchable failure: outcome='failed', error_sample sanitized+set ---
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, async () => {
    const { startRun, finishRun } = freshRunLog();
    const { fetchFn, calls } = makeMockFetch();
    global.fetch = fetchFn;

    const handle = await startRun("lagerhouse");
    await finishRun(handle, { outcome: "failed", error_sample: "Fetch failed: TypeError: fetch is not a function" });
    const patch = calls.find((c) => c.opts.method === "PATCH");
    assert.strictEqual(patch.body.outcome, "failed");
    assert.ok(patch.body.error_sample.includes("TypeError"));
  });
  console.log("PASS: a catchable failure finalizes the row as outcome='failed' with an error_sample");

  // --- 4. blocked/403 run ---
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, async () => {
    const { startRun, finishRun } = freshRunLog();
    const { fetchFn, calls } = makeMockFetch();
    global.fetch = fetchFn;

    const handle = await startRun("metrotimes");
    await finishRun(handle, { outcome: "blocked", http_status: 403, error_sample: "Fetch failed: HTTP 403" });
    const patch = calls.find((c) => c.opts.method === "PATCH");
    assert.strictEqual(patch.body.outcome, "blocked");
    assert.strictEqual(patch.body.http_status, 403);
  });
  console.log("PASS: an upstream 403 is logged as outcome='blocked', distinct from 'failed'");

  // --- 5. unfinished started row: finishRun is simply never called ---
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, async () => {
    const { startRun } = freshRunLog();
    const { fetchFn, calls } = makeMockFetch();
    global.fetch = fetchFn;

    const handle = await startRun("detroitmonthofdesign");
    // Simulate the runtime hard-killing the function here: no finishRun
    // call happens, ever. This is the actual mechanism WP 0.5 relies on for
    // timeout detection -- there is no code path to "test" beyond
    // confirming the started row was written and nothing about this module
    // requires a matching finishRun call to exist.
    assert.strictEqual(calls.length, 1, "only the startRun insert should have happened");
    assert.strictEqual(calls[0].body[0].outcome, "started");
    assert.ok(handle.runId, "the row id is available -- this is the evidence a stale 'started' row leaves behind");
  });
  console.log("PASS: an unfinished run leaves exactly its 'started' row and nothing more (timeout evidence)");

  // --- 6. not configured: startRun/finishRun no-op, never throw, never call fetch ---
  await withEnv({ SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" }, async () => {
    const { startRun, finishRun } = freshRunLog();
    let fetchCalled = false;
    global.fetch = async () => { fetchCalled = true; throw new Error("should not be called"); };

    const handle = await startRun("lagerhouse");
    assert.strictEqual(handle, null, "startRun should return null when not configured");
    await finishRun(handle, { outcome: "success" }); // must not throw on a null handle
    assert.strictEqual(fetchCalled, false, "no fetch call should be made when Supabase isn't configured");
  });
  console.log("PASS: missing SUPABASE_URL/KEY no-ops safely, never throws, never calls fetch");

  // --- 7. network failures on both insert and update are swallowed, never thrown ---
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, async () => {
    const { startRun, finishRun } = freshRunLog();
    const { fetchFn: insertThrows } = makeMockFetch({ postThrows: true });
    global.fetch = insertThrows;
    const handle = await startRun("lagerhouse");
    assert.strictEqual(handle, null, "a thrown fetch on insert should resolve to null, not throw");

    const { fetchFn: updateThrows } = makeMockFetch({ patchThrows: true });
    global.fetch = updateThrows;
    const handle2 = await startRun("lagerhouse"); // fresh insert succeeds under this mock
    await assert.doesNotReject(
      finishRun(handle2, { outcome: "success" }),
      "a thrown fetch on update must not propagate out of finishRun"
    );
  });
  console.log("PASS: network failures on insert or update are caught, never thrown to the caller");

  // --- 8. an invalid outcome is rejected without writing or throwing ---
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, async () => {
    const { startRun, finishRun } = freshRunLog();
    const { fetchFn, calls } = makeMockFetch();
    global.fetch = fetchFn;
    const handle = await startRun("lagerhouse");
    await finishRun(handle, { outcome: "not-a-real-outcome" });
    const patchCalls = calls.filter((c) => c.opts.method === "PATCH");
    assert.strictEqual(patchCalls.length, 0, "an invalid outcome should not be written");
  });
  console.log("PASS: an invalid outcome value is rejected rather than silently written");

  // --- 9. sanitizeErrorSample: truncation and redaction ---
  {
    const { sanitizeErrorSample } = freshRunLog();
    const long = "x".repeat(600);
    const truncated = sanitizeErrorSample(long);
    assert.ok(truncated.length < 600, "long error text should be truncated");
    assert.ok(truncated.endsWith("[truncated]"));

    const withBearer = sanitizeErrorSample("request failed: Bearer abc123.def456-ghi header rejected");
    assert.ok(!withBearer.includes("abc123.def456-ghi"), "a Bearer token should be redacted");
    assert.ok(withBearer.includes("[REDACTED]"));

    const withJwt = sanitizeErrorSample("token was eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U rejected");
    assert.ok(!withJwt.includes("eyJhbGciOiJIUzI1NiJ9"), "a JWT-shaped token should be redacted");

    const withApikey = sanitizeErrorSample("apikey=sk_live_abcdefghijklmnop was invalid");
    assert.ok(!withApikey.includes("sk_live_abcdefghijklmnop"), "an apikey value should be redacted");
  }
  console.log("PASS: sanitizeErrorSample truncates long text and redacts credential-shaped substrings");

  // --- 10. an unknown/typo'd source_slug is rejected, never throws, never calls fetch ---
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, async () => {
    const { startRun } = freshRunLog();
    let fetchCalled = false;
    global.fetch = async () => { fetchCalled = true; throw new Error("should not be called"); };

    const handle = await startRun("lager-house"); // plausible typo of the real "lagerhouse" slug
    assert.strictEqual(handle, null, "an unknown source_slug must resolve to null, not throw");
    assert.strictEqual(fetchCalled, false, "no fetch call should be made for an unknown source_slug");

    const handle2 = await startRun(undefined);
    assert.strictEqual(handle2, null, "a missing source_slug must also resolve to null, not throw");
  });
  console.log("PASS: an unknown/typo'd source_slug is rejected by startRun without throwing or calling fetch (see api/_lib/source-slugs.js)");

  console.log("\nAll run-log.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
