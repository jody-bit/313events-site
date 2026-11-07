// test/cron-feeds-error-code.test.js — a network-level "fetch failed" records its underlying error code only if it is in
// an explicit known-code set; the NEW suffix carries nothing else (no URL, host, query, header, token, stack, cause message).
// The pre-existing "Error: " + err.message text is not touched or redacted by this change.
// Unchanged by design: the failure classification, the 12 s timeout, the fetched URL and every write path.
//
// Run: node test/cron-feeds-error-code.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const health = require(`${REPO_DIR}/api/_lib/feed-run-health.js`);

function freshHandler() {
  for (const m of ["api/cron-feeds.js", "api/_lib/venue-lookup.js", "api/_lib/ics-location.js", "api/_lib/status-lookup.js", "scripts/press-coverage-linking.js"]) {
    try { delete require.cache[require.resolve(`${REPO_DIR}/${m}`)]; } catch (_) {}
  }
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
function makeRes() {
  return { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
}

// 1. Unit: allowlist and redaction.
{
  const cause = Object.assign(new Error("connect to https://secret.example.gov/cal.ics?token=SECRET123 timed out"), { name: "ConnectTimeoutError", code: "UND_ERR_CONNECT_TIMEOUT", stack: "STACKSECRET" });
  const err = Object.assign(new TypeError("fetch failed"), { cause });
  const out = health.describeFetchError(err);
  assert.strictEqual(out, " (cause: UND_ERR_CONNECT_TIMEOUT)");
  for (const bad of ["secret", "SECRET123", "token", "STACKSECRET", "https", "example.gov"]) assert.ok(!out.includes(bad), `must not record ${bad}`);

  assert.strictEqual(health.describeFetchError(Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("getaddrinfo ENOTFOUND host.private.example"), { code: "ENOTFOUND" }) })), " (cause: ENOTFOUND)");
  // name used only for a known undici name on the cause, never on the top-level error
  assert.strictEqual(health.describeFetchError(Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("x"), { name: "SocketError" }) })), " (cause: SocketError)");
  // Secret-shaped but upper-case codes must NOT pass: only the explicit known set is recorded.
  for (const code of ["PRIVATE_API_TOKEN_123", "SECRET123", "SUPABASE_SERVICE_ROLE_KEY", "UND_ERR_NOT_A_REAL_CODE", "ECONNRESET_X"]) {
    for (const holder of ["top", "cause", "deep"]) {
      const inner = Object.assign(new Error("x"), { code });
      const err = holder === "top" ? Object.assign(new TypeError("fetch failed"), { code })
        : holder === "cause" ? Object.assign(new TypeError("fetch failed"), { cause: inner })
        : Object.assign(new TypeError("fetch failed"), { cause: { cause: inner } });
      assert.strictEqual(health.describeFetchError(err), "", `unknown/secret-shaped code ${code} (${holder}) must be omitted`);
    }
  }
  // non-allowlisted shapes record nothing: lower-case code, spaces, URL-like, too long, non-string, no cause
  for (const code of ["connect to https://x/y", "has space", "lower_case", "A", "X".repeat(60), 42, null, {}]) {
    assert.strictEqual(health.describeFetchError(Object.assign(new TypeError("fetch failed"), { cause: { code } })), "", `rejects ${String(code).slice(0, 20)}`);
  }
  assert.strictEqual(health.describeFetchError(Object.assign(new TypeError("fetch failed"), { code: "ECONNRESET" })), " (cause: ECONNRESET)");
  assert.strictEqual(health.describeFetchError(new TypeError("fetch failed")), "");
  assert.strictEqual(health.describeFetchError(null), "");
  assert.strictEqual(health.describeFetchError("string error"), "");
  // classification is unchanged: still a failure, still not a timeout or a block
  assert.strictEqual(health.classifyFeedResult("Error: fetch failed (cause: UND_ERR_CONNECT_TIMEOUT)", null), health.KINDS.FAILED);
}

// 2. Handler: a fetch that rejects with an undici-shaped error records the code in last_poll_result and the run result.
async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const FEED = { id: "fs-err-1", venue_name: "Error Code City", default_category: "community", feed_url: "https://secret.example.gov/cal.ics?token=SECRET123", feed_format: "ics", status: "approved" };
  let patchedResult = null; let fetchedFeedUrls = 0;
  global.fetch = async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [FEED] };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
    if (url === FEED.feed_url) {
      fetchedFeedUrls++;
      const cause = Object.assign(new Error("connect to secret.example.gov timed out"), { name: "ConnectTimeoutError", code: "UND_ERR_CONNECT_TIMEOUT" });
      throw Object.assign(new TypeError("fetch failed"), { cause });
    }
    if (opts.method === "PATCH" && url.includes("/rest/v1/feed_sources")) { patchedResult = JSON.parse(opts.body).last_poll_result; return { ok: true, status: 200, text: async () => "" }; }
    if (url.includes("/rest/v1/source_runs")) return { ok: true, status: 200, json: async () => [{ id: "run-1" }], text: async () => "" };
    return { ok: true, status: 200, json: async () => [], text: async () => "" };
  };
  const handler = freshHandler();
  const res = makeRes();
  await handler({ headers: {}, query: {} }, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(fetchedFeedUrls, 1, "the feed URL is fetched exactly once, as before");
  const r = res._body.results.find((x) => x.id === FEED.id);
  assert.strictEqual(r.result, "Error: fetch failed (cause: UND_ERR_CONNECT_TIMEOUT)");
  assert.strictEqual(r.kind, health.KINDS.FAILED);
  assert.strictEqual(patchedResult, "Error: fetch failed (cause: UND_ERR_CONNECT_TIMEOUT)");
  for (const bad of ["secret", "SECRET123", "token=", "https://"]) assert.ok(!r.result.includes(bad) && !String(patchedResult).includes(bad), `no ${bad} in the stored result`);
}
run().then(() => console.log("ok cron-feeds-error-code")).catch((e) => { console.error(e); process.exit(1); });
