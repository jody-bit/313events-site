"use strict";
// CrowdWork allowlist header (Lane B, source access recovery): the key is read from CROWDWORK_KEY only,
// is sent as X-CrowdWork-Key when present, and nothing changes when it is absent.
const test = require("node:test");
const assert = require("node:assert");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
const handler = require("../api/cron-planetanttheatre");
const { buildRequestHeaders, describeUpstream } = handler;

test("no key: the request headers are the pre-existing honest set", () => {
  const h = buildRequestHeaders({});
  assert.strictEqual(h["X-CrowdWork-Key"], undefined);
  assert.match(h["User-Agent"], /313\.events/);
  assert.match(h.Referer, /crowdwork\.com\/v\/planetanttheatre\/shows/);
});

test("blank or whitespace key is ignored", () => {
  assert.strictEqual(buildRequestHeaders({ CROWDWORK_KEY: "   " })["X-CrowdWork-Key"], undefined);
});

test("key present: sent as X-CrowdWork-Key and the User-Agent stays honest", () => {
  const h = buildRequestHeaders({ CROWDWORK_KEY: " test-key-not-real " });
  assert.strictEqual(h["X-CrowdWork-Key"], "test-key-not-real");
  assert.match(h["User-Agent"], /313\.events/);
});

test("the cron fetch uses buildRequestHeaders and the source never embeds a key literal", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../api/cron-planetanttheatre.js"), "utf8");
  assert.match(src, /headers: buildRequestHeaders\(\)/);
  assert.doesNotMatch(src, /X-CrowdWork-Key"\s*:\s*["'`]/);
});

test("diagnostic reports only a boolean for the key, plus status and Cloudflare headers", () => {
  const headers = new Map([["cf-mitigated", "challenge"], ["cf-ray", "abc123-DTW"]]);
  const withKey = describeUpstream(403, headers, buildRequestHeaders({ CROWDWORK_KEY: "secret-value-xyz" }));
  assert.deepStrictEqual(withKey, { status: 403, keyHeaderSent: true, cfMitigated: "challenge", cfRay: "abc123-DTW" });
  assert.doesNotMatch(JSON.stringify(withKey), /secret-value-xyz/);
  const without = describeUpstream(403, new Map(), buildRequestHeaders({}));
  assert.deepStrictEqual(without, { status: 403, keyHeaderSent: false, cfMitigated: "none", cfRay: "none" });
});
