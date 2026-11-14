// test/feed-blocked-diagnostics.test.js
//
// A blocked feed (HTTP 401/403) now records WHY it can be told apart (non-secret response facts) and WHEN the block
// was first seen, and is raised again when it stays blocked (api/_lib/feed-run-health.js). Observability only: no
// retry, no changed request, no workaround, no body or cookie read.
//
// Run: node test/feed-blocked-diagnostics.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2026-11-06T22:00:00Z");
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const health = require(`${REPO_DIR}/api/_lib/feed-run-health.js`);

const H = (o) => ({ get: (n) => o[String(n).toLowerCase()] || null });

// 1. detail: only allow-listed, sanitized, non-volatile facts; nothing from cookies or the body
{
  const d = health.blockDetail(H({ server: "cloudflare", "content-type": "text/html; charset=UTF-8", "cf-mitigated": "challenge", "cf-ray": "8a1b2c3d4e5f-DTW", "set-cookie": "session=SECRET123", "x-sucuri-id": "19015" }));
  assert.strictEqual(d, "server=cloudflare; type=text/html; cf-mitigated=challenge; waf=cf-ray,x-sucuri-id");
  assert.ok(!/SECRET|8a1b2c3d|19015|session/.test(d), "no cookie value, ray id or sucuri id is recorded");
  assert.strictEqual(health.blockDetail(H({})), "");
  assert.strictEqual(health.blockDetail(undefined), "");
  assert.strictEqual(health.blockDetail({ Server: "Microsoft-IIS/10.0" }), "server=microsoft-iis/10.0", "plain header objects work and are lower-cased");
  assert.ok(health.blockDetail(H({ server: "a b<script>\n".repeat(20) })).length < 60, "values are sanitized and bounded");
}
console.log("PASS: 1. header facts are allow-listed, sanitized and secret-free");

// 2. the stored result keeps the status first and the first-seen date across runs
{
  const first = health.blockedResult(403, H({ server: "cloudflare" }), "1 event found", "2026-11-04");
  assert.strictEqual(first, "Fetch failed: HTTP 403 [server=cloudflare; first seen 2026-11-04]");
  const later = health.blockedResult(403, H({ server: "cloudflare" }), first, "2026-11-06");
  assert.strictEqual(later, first, "same block keeps its first-seen date");
  assert.strictEqual(health.blockedResult(403, H({}), "Fetch failed: HTTP 403", "2026-11-06"), "Fetch failed: HTTP 403 [first seen 2026-11-06]", "an old-format result starts counting today");
  assert.strictEqual(health.blockedResult(403, H({}), "Fetch failed: HTTP 503 [first seen 2026-10-01]", "2026-11-06"), "Fetch failed: HTTP 403 [first seen 2026-11-06]", "only a previous BLOCK carries its date forward");
  assert.strictEqual(health.blockedResult(503, H({ server: "x" }), "", "2026-11-06"), "Fetch failed: HTTP 503", "non-blocked statuses are unchanged");
  assert.strictEqual(health.blockedResult(500, undefined, "", "2026-11-06"), "Fetch failed: HTTP 500");
}
console.log("PASS: 2. first-seen date is kept; other statuses unchanged");

// 3. detail and date never change whether a block is new or persistent
{
  const a = "Fetch failed: HTTP 403 [server=cloudflare; first seen 2026-11-04]";
  const b = "Fetch failed: HTTP 403 [server=nginx; waf=cf-ray; first seen 2026-11-06]";
  assert.strictEqual(health.classifyFeedResult(b, a), "blocked_persistent");
  assert.strictEqual(health.classifyFeedResult(b, "Fetch failed: HTTP 403"), "blocked_persistent", "an old-format previous result is the same block");
  assert.strictEqual(health.classifyFeedResult("Fetch failed: HTTP 401 [first seen 2026-11-06]", a), "blocked", "a different status is a new block");
  assert.strictEqual(health.classifyFeedResult(a, "1 event found"), "blocked");
}
console.log("PASS: 3. classification looks at the status only");

// 4. blocked_long: at N days, then every 7th day; not before, not between
{
  const run = (since, today, kind = "blocked_persistent") => health.summarizeRun([{ id: "f", venue: "Feed", kind, result: `Fetch failed: HTTP 403 [first seen ${since}]` }], { today }).alerts.filter((a) => a.type === "blocked_long");
  assert.strictEqual(run("2026-11-06", "2026-11-06").length, 0, "day 0");
  assert.strictEqual(run("2026-11-04", "2026-11-06").length, 0, "day 2");
  assert.strictEqual(run("2026-11-03", "2026-11-06").length, 1, "day 3 (default N)");
  assert.strictEqual(run("2026-11-02", "2026-11-06").length, 0, "day 4");
  assert.strictEqual(run("2026-10-30", "2026-11-06").length, 1, "day 7");
  assert.strictEqual(run("2026-10-23", "2026-11-06").length, 1, "day 14");
  assert.match(run("2026-11-03", "2026-11-06")[0].detail, /still blocked after 3 day\(s\)/);
  assert.strictEqual(health.summarizeRun([{ id: "f", venue: "Feed", kind: "blocked_persistent", result: "Fetch failed: HTTP 403" }], { today: "2026-11-06" }).alerts.length, 0, "an old-format result has no date and no alert");
  assert.strictEqual(health.summarizeRun([{ id: "f", venue: "Feed", kind: "blocked_persistent", result: "Fetch failed: HTTP 403 [first seen 2026-10-30]" }], {}).alerts.length, 0, "no 'today' given: no alert");
  assert.strictEqual(health.summarizeRun([{ id: "f", venue: "Feed", kind: "failed", result: "Fetch failed: HTTP 500 [first seen 2026-10-01]" }], { today: "2026-11-06" }).alerts.filter((a) => a.type === "blocked_long").length, 0, "only blocks");
  assert.strictEqual(health.summarizeRun([{ id: "f", venue: "Feed", kind: "blocked_persistent", result: "Fetch failed: HTTP 403 [first seen 2026-11-05]" }], { today: "2026-11-06", blockedAlertDays: 1 }).alerts.filter((a) => a.type === "blocked_long").length, 1, "N is configurable");
}
console.log("PASS: 4. a still-blocked feed is raised at N days, then weekly");

// 5. the real handler stores the diagnostic result and sends nothing extra
(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const feed = { id: "fs-1", venue_name: "Blocked Feed", website: null, default_category: "community", feed_url: "https://publisher.example.invalid/cal.ics", feed_format: "ics", status: "approved", last_polled_at: "2026-11-05T22:10:00Z", last_poll_result: "Fetch failed: HTTP 403 [server=cloudflare; first seen 2026-11-03]" };
  const patches = []; const fetched = [];
  global.fetch = async (url, opts = {}) => {
    const m = opts.method || "GET";
    if (url.includes("/rest/v1/feed_sources") && m === "GET") return { ok: true, status: 200, json: async () => [feed] };
    if (url.includes("/rest/v1/feed_sources")) { patches.push(JSON.parse(opts.body || "{}")); return { ok: true, status: 204 }; }
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url === feed.feed_url) { fetched.push(opts); return { ok: false, status: 403, headers: H({ server: "cloudflare", "content-type": "text/html", "cf-mitigated": "challenge", "set-cookie": "a=SECRET" }), text: async () => "<html>blocked</html>" }; }
    if (url.includes("/rest/v1/source_runs")) return { ok: true, status: 201, json: async () => [{ id: "r1" }], text: async () => "" };
    return { ok: true, status: 200, json: async () => [], text: async () => "" };
  };
  const errors = []; const origErr = console.error; console.error = (...a) => errors.push(a.join(" "));
  for (const m of ["cron-feeds.js"]) delete require.cache[require.resolve(`${REPO_DIR}/api/${m}`)];
  const res = { _s: null, _b: null, status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; } };
  await require(`${REPO_DIR}/api/cron-feeds.js`)({ headers: {} }, res);
  console.error = origErr;
  assert.strictEqual(res._s, 200);
  const p = patches.find((x) => x.last_poll_result);
  assert.strictEqual(p.last_poll_result, "Fetch failed: HTTP 403 [server=cloudflare; type=text/html; cf-mitigated=challenge; first seen 2026-11-03]", "stored with detail; first-seen date kept");
  assert.ok(!/SECRET/.test(JSON.stringify(patches)), "no cookie value stored");
  assert.strictEqual(fetched.length, 1, "no retry");
  assert.ok(errors.some((e) => /"type":"blocked_long"/.test(e)), "day 3 still-blocked alert is logged");
  assert.ok(!errors.some((e) => /"type":"blocked"[,}]/.test(e)), "not re-alerted as a NEW block");
  console.log("PASS: 5. handler stores the diagnostic result, makes one request, alerts at day 3");
})().catch((e) => { console.error(e); process.exit(1); });
