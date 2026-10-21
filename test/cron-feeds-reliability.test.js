// test/cron-feeds-reliability.test.js — the daily feeds cron stays inside its time limit and says what happened.
//
// WHY (owner GO 2026-10-21): the 22:00Z feeds run has a 60 s function limit and finished runs take 28-42 s. On
// Oct 18 and 19 a run was killed and its source_runs row stayed "started"; every finished run said "partial"
// because three city feeds answer HTTP 403 every day. This suite pins the fix in api/cron-feeds.js and
// api/_lib/feed-run-health.js.
//
// WHAT THIS SHOWS, with the connector's real handler and a fake network:
//   1. execution time limit   feeds are polled least-recently-polled first; once the run budget cannot cover another
//                             feed the rest are DEFERRED (not patched, so they lead the next run) and the run is partial
//   2. hung feed              a request that never answers is cut at its own timeout, reported as a timeout, and the
//                             next feed still runs
//   3. partial success        a good feed's events are written while another feed fails; no delete, no event PATCH
//   4. blocked sources        a feed blocked exactly as last time is persistent (listed, no alert, run not partial);
//                             a feed newly blocked raises an alert and makes the run partial
//   5. empty responses        an empty feed that was empty before is quiet; one that had events is an alert
//   6. stalled executions     an earlier run left at "started" is closed once as failed and alerted once
//   7. retry / idempotency    ?resume=1 re-polls only feeds that did not finish OK; events are keyed on external_id
//   8. existing behaviour     healthy feeds, ordering of results, response shape fields are unchanged
//
// Plain Node assert, no dependencies.
// Run: node test/cron-feeds-reliability.test.js
"use strict";
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");
const health = require("../api/_lib/feed-run-health.js");
const { classifyResponse } = require("../api/_lib/cron-run.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  for (const f of ["api/cron-feeds.js", "api/_lib/venue-lookup.js", "api/_lib/ics-location.js", "api/_lib/status-lookup.js", "api/_lib/feed-run-health.js", "scripts/press-coverage-linking.js"]) {
    try { delete require.cache[require.resolve(`${REPO_DIR}/${f}`)]; } catch (_) { /* optional */ }
  }
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
function makeRes() {
  return { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ics = (uid, summary) => ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `UID:${uid}`, "DTSTART:20281015T190000Z", `SUMMARY:${summary}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");

const feed = (n, extra = {}) => ({
  id: `fs-${n}`, venue_name: `Feed ${n}`, default_category: "community", feed_url: `https://feed.example/${n}.ics`,
  feed_format: "ics", status: "approved", location_per_event: false, last_polled_at: null, last_poll_result: null, ...extra,
});

// The fake network. `behavior[url]` is a function returning a fetch-like response (or a promise that never settles).
function network({ feeds, behavior = {}, stalledRows = [] }) {
  const log = { feedFetches: [], feedPatches: [], eventWrites: [], runPatches: [], methods: [] };
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || "GET";
    log.methods.push(`${method} ${url.split("?")[0].replace(SUPABASE_URL, "")}`);
    if (url.includes("/rest/v1/source_runs")) {
      if (method === "GET") return { ok: true, status: 200, json: async () => stalledRows.splice(0) };
      if (method === "POST") return { ok: true, status: 201, json: async () => [{ id: "current-run" }] };
      // the handler's own closing row (finishRun) is not a stalled-run close
      if (!url.includes("id=eq.current-run")) log.runPatches.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 204, text: async () => "" };
    }
    if (url.includes("/rest/v1/feed_sources?id=eq.")) {
      log.feedPatches.push({ id: decodeURIComponent(url.split("id=eq.")[1]), body: JSON.parse(opts.body) });
      return { ok: true, status: 204, text: async () => "" };
    }
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => feeds };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && method === "GET") return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && method === "POST") {
      log.eventWrites.push(JSON.parse(opts.body));
      return strictWriteResponse(url, opts);
    }
    if (url.startsWith("https://feed.example/")) {
      log.feedFetches.push(url);
      const b = behavior[url];
      if (!b) return { ok: true, status: 200, text: async () => ics(`uid-${url}`, `Event from ${url.split("/").pop()}`) };
      return b(opts);
    }
    throw new Error("unmocked URL: " + url);
  };
  return log;
}

async function runOnce({ env = {}, req = { headers: {}, query: {} }, ...net }) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = String(v); }
  try {
    const log = network(net);
    const handler = freshHandler();
    const res = makeRes();
    const errors = [];
    const realError = console.error;
    console.error = (...a) => errors.push(a.join(" "));
    try { await handler(req, res); } finally { console.error = realError; }
    assert.strictEqual(res._status, 200, "the handler answers 200");
    return { res, body: res._body, log, errors, handler };
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
const kindOf = (body, n) => body.results.find((r) => r.id === `fs-${n}`).kind;

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // 1. execution time limit: oldest-polled first, rest deferred when the budget cannot cover another feed
  {
    const slow = (ms) => async () => { await sleep(ms); return { ok: true, status: 200, text: async () => ics("u", "Slow") }; };
    const feeds = [
      feed(1, { last_polled_at: "2026-10-20T22:00:00Z", last_poll_result: "1 event found" }),
      feed(2, { last_polled_at: "2026-10-18T22:00:00Z", last_poll_result: "1 event found" }),
      feed(3, { last_polled_at: null }),
      feed(4, { last_polled_at: "2026-10-19T22:00:00Z", last_poll_result: "1 event found" }),
    ];
    const behavior = {};
    for (const f of feeds) behavior[f.feed_url] = slow(300);
    const { body, log } = await runOnce({ feeds, behavior, env: { FEEDS_BUDGET_MS: 1000, FEEDS_MIN_START_MS: 600, FEEDS_REQUEST_TIMEOUT_MS: 5000 } });
    assert.deepStrictEqual(log.feedFetches.slice(0, 2), ["https://feed.example/3.ics", "https://feed.example/2.ics"], "never-polled first, then the oldest poll");
    assert.strictEqual(log.feedFetches.length, 2, "only the feeds the budget could cover were fetched");
    assert.strictEqual(kindOf(body, 3), "ok");
    assert.strictEqual(kindOf(body, 4), "deferred");
    assert.strictEqual(kindOf(body, 1), "deferred");
    assert.strictEqual(body.feedsDeferred, 2);
    assert.strictEqual(body.budgetExhausted, true);
    assert.ok(body.alerts.some((a) => a.type === "budget_exhausted"), "deferral raises a budget_exhausted alert");
    const patchedIds = log.feedPatches.map((p) => p.id).sort();
    assert.deepStrictEqual(patchedIds, ["fs-2", "fs-3"], "deferred feeds are NOT patched, so they lead the next run");
    const run = classifyResponse(200, body, { sourceFailures: handlerOf(body).feedSourceFailures });
    assert.strictEqual(run.outcome, "partial", "a run that deferred feeds is partial, never success");
    // deferred is its own count: sources_failed is real failures only (here none)
    assert.strictEqual(run.session_data.sources_failed, 0, "deferred feeds are not failures");
    assert.strictEqual(run.session_data.sources_deferred, 2);
    // per-feed duration is recorded for polled feeds; the pre-loop time is reported once
    assert.ok(body.results.filter((r) => r.kind === "ok").every((r) => Number.isFinite(r.ms) && r.ms >= 250), "polled feeds carry their duration");
    assert.ok(body.results.filter((r) => r.kind === "deferred").every((r) => r.ms === undefined), "deferred feeds were not timed");
    assert.ok(Number.isFinite(body.preambleMs) && body.preambleMs >= 0);
  }
  {
    // real failures and deferrals together: counted separately, still partial; failures alone are unchanged
    const mk = (kind) => ({ kind });
    const f = classifyResponse(200, { upserted: 5, results: [mk("ok"), mk("failed"), mk("deferred"), mk("deferred")] }, { sourceFailures: handlerOf({}).feedSourceFailures });
    assert.strictEqual(f.outcome, "partial");
    assert.strictEqual(f.session_data.sources_failed, 1);
    assert.strictEqual(f.session_data.sources_deferred, 2);
    const noDefer = classifyResponse(200, { upserted: 5, results: [mk("ok"), mk("ok")] }, { sourceFailures: handlerOf({}).feedSourceFailures });
    assert.strictEqual(noDefer.outcome, "success");
    assert.strictEqual(noDefer.session_data.sources_deferred, undefined, "no deferral, no key");
  }
  console.log("PASS: feeds run oldest-polled first; when the budget cannot cover another feed the rest are deferred, unpatched, and the run is partial");

  // 2. a hung feed is cut at its own timeout and the next feed still runs
  {
    const feeds = [feed(1, { last_polled_at: "2026-10-18T00:00:00Z" }), feed(2, { last_polled_at: "2026-10-19T00:00:00Z" })];
    const behavior = { "https://feed.example/1.ics": () => new Promise(() => {}) };
    const t0 = Date.now();
    const { body, log } = await runOnce({ feeds, behavior, env: { FEEDS_BUDGET_MS: 5000, FEEDS_REQUEST_TIMEOUT_MS: 150, FEEDS_MIN_START_MS: 100 } });
    assert.ok(Date.now() - t0 < 2000, "a hung request does not hold the run");
    assert.strictEqual(kindOf(body, 1), "timeout");
    assert.strictEqual(body.results[0].result, health.TIMED_OUT_RESULT);
    assert.strictEqual(kindOf(body, 2), "ok", "the next feed is still polled");
    assert.strictEqual(body.feedsTimedOut, 1);
    assert.ok(body.alerts.some((a) => a.type === "timeout" && a.feed === "Feed 1"));
    assert.ok(log.feedPatches.some((p) => p.id === "fs-1" && p.body.last_poll_result === health.TIMED_OUT_RESULT), "the timeout is recorded on the feed");
  }
  console.log("PASS: a feed that never answers is cut at its request timeout, recorded, and the next feed still runs");

  // 2b. a feed that times out every day alerts once, then is listed quietly
  {
    const feeds = [feed(1, { last_polled_at: "2026-10-19T00:00:00Z", last_poll_result: health.TIMED_OUT_RESULT })];
    const { body } = await runOnce({ feeds, behavior: { "https://feed.example/1.ics": () => new Promise(() => {}) }, env: { FEEDS_REQUEST_TIMEOUT_MS: 100, FEEDS_MIN_START_MS: 50 } });
    assert.strictEqual(kindOf(body, 1), "timeout_persistent");
    assert.deepStrictEqual(body.alerts, [], "a repeat timeout does not alert again");
    assert.strictEqual(body.feedsPersistentlyFailing, 1);
    assert.strictEqual(classifyResponse(200, body, { sourceFailures: handlerOf(body).feedSourceFailures }).outcome, "success");
  }
  console.log("PASS: a feed that timed out last poll too is persistent: listed, no repeat alert, run not partial");

  // 3. partial success: good feed written, failing feed leaves existing events alone
  {
    const feeds = [feed(1), feed(2)];
    const behavior = { "https://feed.example/2.ics": async () => ({ ok: false, status: 500, text: async () => "" }) };
    const { body, log } = await runOnce({ feeds, behavior });
    assert.strictEqual(body.upserted, 1, "the good feed's event is written");
    assert.strictEqual(log.eventWrites.length, 1);
    assert.strictEqual(kindOf(body, 2), "failed");
    assert.ok(!log.methods.some((m) => m.startsWith("DELETE")), "nothing is deleted");
    assert.ok(!log.methods.some((m) => m.startsWith("PATCH /rest/v1/events")), "no event is overwritten or changed because another feed failed");
    assert.strictEqual(classifyResponse(200, body, { sourceFailures: handlerOf(body).feedSourceFailures }).outcome, "partial");
  }
  console.log("PASS: one feed failing leaves the good feed's events written and touches no existing event");

  // 4. blocked: persistent vs new
  {
    const feeds = [
      feed(1, { last_polled_at: "2026-10-19T00:00:00Z", last_poll_result: "Fetch failed: HTTP 403" }),
      feed(2, { last_polled_at: "2026-10-19T01:00:00Z", last_poll_result: "1 event found" }),
    ];
    const blocked = async () => ({ ok: false, status: 403, text: async () => "" });
    const behavior = { "https://feed.example/1.ics": blocked, "https://feed.example/2.ics": blocked };
    const { body, errors } = await runOnce({ feeds, behavior });
    assert.strictEqual(kindOf(body, 1), "blocked_persistent");
    assert.strictEqual(kindOf(body, 2), "blocked");
    assert.deepStrictEqual(body.alerts.map((a) => `${a.type}:${a.feed}`), ["blocked:Feed 2"], "only the NEW block alerts");
    assert.strictEqual(body.feedsPersistentlyFailing, 1);
    assert.ok(/Feed 1/.test(body.note), "the persistent block is named in the run note");
    assert.strictEqual(errors.filter((e) => e.startsWith("[feeds-alert]")).length, 1, "one logged alert, not one per blocked feed");

    // a day with only the persistent block is a clean run, not "partial every time"
    const only = await runOnce({ feeds: [feeds[0], feed(3)], behavior: { "https://feed.example/1.ics": blocked } });
    assert.strictEqual(classifyResponse(200, only.body, { sourceFailures: handlerOf(only.body).feedSourceFailures }).outcome, "success");
    assert.deepStrictEqual(only.body.alerts, []);
  }
  console.log("PASS: a feed blocked as before is listed but quiet; a newly blocked feed alerts once and makes the run partial");

  // 5. empty responses
  {
    const empty = async () => ({ ok: true, status: 200, text: async () => ["BEGIN:VCALENDAR", "VERSION:2.0", "END:VCALENDAR"].join("\r\n") });
    const feeds = [
      feed(1, { last_polled_at: "2026-10-19T00:00:00Z", last_poll_result: "Fetched OK — 0 events found (feed may be empty)" }),
      feed(2, { last_polled_at: "2026-10-19T01:00:00Z", last_poll_result: "5 events found" }),
    ];
    const { body } = await runOnce({ feeds, behavior: { "https://feed.example/1.ics": empty, "https://feed.example/2.ics": empty } });
    assert.strictEqual(kindOf(body, 1), "empty", "empty as before is a legitimate zero");
    assert.strictEqual(kindOf(body, 2), "empty_unexpected", "empty after having events is suspicious");
    assert.deepStrictEqual(body.alerts.map((a) => `${a.type}:${a.feed}`), ["unexpected_empty:Feed 2"]);
  }
  console.log("PASS: a feed that was empty before is quiet; one that had events and is now empty raises an unexpected_empty alert");

  // 5b. a 200 that is not a calendar is a failure, not an empty calendar
  {
    const html = async () => ({ ok: true, status: 200, text: async () => "<html><title>Just a moment...</title></html>" });
    const { body } = await runOnce({ feeds: [feed(1)], behavior: { "https://feed.example/1.ics": html } });
    assert.strictEqual(kindOf(body, 1), "failed");
    assert.strictEqual(body.results[0].result, health.NOT_A_CALENDAR_RESULT);
    assert.ok(/new failures: Feed 1/.test(body.note), "failed feeds are named in the run note");
  }
  console.log("PASS: an HTML/challenge body is a failed fetch, not an empty calendar; failed feeds are named in the run note");

  // 6. stalled execution: closed once, alerted once
  {
    const stalledRows = [{ id: "run-1", started_at: "2026-10-19T22:00:47Z" }];
    const first = await runOnce({ feeds: [feed(1)], stalledRows });
    assert.strictEqual(first.log.runPatches.length, 1);
    assert.strictEqual(first.log.runPatches[0].body.outcome, "failed");
    assert.ok(/never finished/.test(first.log.runPatches[0].body.error_sample));
    assert.ok(first.log.runPatches[0].url.includes("outcome=eq.started"), "the close re-asserts outcome=started, so a finished run is never rewritten");
    assert.ok(first.body.alerts.some((a) => a.type === "stalled_run"));
    assert.strictEqual(first.body.stalledRunsClosed, 1);
    const second = await runOnce({ feeds: [feed(1)], stalledRows });
    assert.strictEqual(second.log.runPatches.length, 0, "the same stalled run is not closed or alerted twice");
    assert.ok(!second.body.alerts.some((a) => a.type === "stalled_run"));
  }
  console.log("PASS: an earlier run left at 'started' is closed once as failed and alerted once");

  // 7. retry / idempotency
  {
    const now = new Date().toISOString();
    const feeds = [
      feed(1, { last_polled_at: now, last_poll_result: "3 events found" }),
      feed(2, { last_polled_at: now, last_poll_result: "Fetch failed: HTTP 500" }),
      feed(3, { last_polled_at: null }),
    ];
    const { body, log } = await runOnce({ feeds, req: { headers: {}, query: { resume: "1" } } });
    assert.strictEqual(kindOf(body, 1), "skipped_resume");
    assert.deepStrictEqual(log.feedFetches.sort(), ["https://feed.example/2.ics", "https://feed.example/3.ics"], "resume re-polls the failed and never-polled feeds only");
    assert.ok(!log.feedPatches.some((p) => p.id === "fs-1"), "a skipped feed is left untouched");
    const again = await runOnce({ feeds, req: { headers: {}, query: {} } });
    assert.strictEqual(again.log.feedFetches.length, 3, "without ?resume the normal run polls everything, exactly as before");
    for (const w of again.log.eventWrites) for (const r of w) assert.ok(r.external_id, "every event write is keyed on external_id (upsert), so a retry cannot duplicate");
  }
  console.log("PASS: ?resume=1 re-polls only unfinished feeds; the normal run is unchanged; event writes stay keyed on external_id");

  // 8. existing behaviour and pure rules
  {
    const { body } = await runOnce({ feeds: [feed(1), feed(2)] });
    assert.strictEqual(body.upserted, 2);
    assert.strictEqual(body.feedsChecked, 2);
    assert.deepStrictEqual(body.results.map((r) => r.kind), ["ok", "ok"]);
    assert.deepStrictEqual(body.alerts, []);
    assert.strictEqual(body.budgetExhausted, false);
    assert.strictEqual(classifyResponse(200, body, { sourceFailures: handlerOf(body).feedSourceFailures }).outcome, "success");
    assert.strictEqual(health.classifyFeedResult("Fetch failed: HTTP 500", "Fetch failed: HTTP 500"), "failed_persistent");
    assert.strictEqual(health.classifyFeedResult("Not polled automatically — no feed", ""), "manual");
    assert.deepStrictEqual(health.orderFeedsForRun([{ id: "b", last_polled_at: "2026-10-02T00:00:00Z" }, { id: "a", last_polled_at: null }]).map((f) => f.id), ["a", "b"]);
  }
  console.log("PASS: healthy feeds, response fields and the pure classification rules behave as specified");

  console.log("\nAll cron-feeds reliability checks passed.");
}

// feedSourceFailures lives on the exported handler; fetch it without re-requiring per call site.
function handlerOf() { return require(`${REPO_DIR}/api/cron-feeds.js`); }

run().catch((err) => { console.error("FAIL:", err); process.exit(1); });
