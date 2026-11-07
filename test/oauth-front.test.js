// DRAFT adapter tests: synthetic token, no network.
"use strict";
const assert = require("assert");
const crypto = require("crypto");
const gw = require("../api/_lib/editorial-gateway");
const o = require("../api/_lib/oauth-front");
const T = "s".repeat(40);
const now = new Date("2026-11-05T05:00:00Z");
const RU = "https://claude.ai/api/mcp/auth_callback";
const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

const m = o.metadata("https://preview.example");
assert.strictEqual(m.authorizationServer.code_challenge_methods_supported[0], "S256");
assert.deepStrictEqual(m.protectedResource.authorization_servers, ["https://preview.example"]);
assert.strictEqual(o.register(T, { redirect_uris: ["https://evil.example/cb"] }).status, 400, "unknown redirect host refused");
assert.strictEqual(o.register(T, { redirect_uris: ["http://claude.ai/cb"] }).status, 400, "http refused");
const ISS = "https://preview.example";
const reg = o.register(T, { client_name: "Claude <b>x</b>", redirect_uris: [RU, "https://chatgpt.com/connector_platform_oauth_redirect"] });
assert.strictEqual(reg.status, 201);
const q = { client_id: reg.body.client_id, redirect_uri: RU, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "abc", resource: "https://preview.example/api/editorial-gateway" };
assert.strictEqual(o.checkAuthorize(T, Object.assign({}, q, { resource: "https://other.example/mcp" }), ISS).error, "invalid_target", "resource indicator must name this gateway");
assert.ok(o.checkAuthorize(T, q, ISS).ok, "resource naming this gateway is accepted when the SERVER supplies the issuer");
assert.strictEqual(o.checkAuthorize(T, q, "https://evil.example").error, "invalid_target", "issuer is never read from the request");
assert.ok(!reg.body.client_name.includes("<"), "client_name sanitised for the consent text");
assert.strictEqual(o.checkAuthorize(T, Object.assign({}, q, { redirect_uri: "https://claude.ai/other" }), ISS).error, "invalid_redirect_uri");
assert.strictEqual(o.checkAuthorize(T, Object.assign({}, q, { code_challenge_method: "plain" }), ISS).error, "invalid_request");
assert.strictEqual(o.checkAuthorize("u".repeat(40), q, ISS).error, "invalid_client", "clients registered under another token are void");
assert.strictEqual(o.approve(T, q, "wrong-token-wrong-token", now, ISS).error, "access_denied");
const ok = o.approve(T, q, ` ${T}\n`, now, ISS);
assert.ok(ok.ok && ok.redirect.startsWith(RU + "?code=") && ok.redirect.includes("state=abc") && ok.redirect.includes("iss="));
assert.ok(!ok.redirect.includes(T), "the token never appears in the redirect");
const code = new URL(ok.redirect).searchParams.get("code");
const form = { grant_type: "authorization_code", code, client_id: q.client_id, redirect_uri: RU, code_verifier: verifier };
assert.strictEqual(o.token(T, Object.assign({}, form, { code_verifier: "x".repeat(43) }), now, ISS).status, 400, "wrong PKCE verifier");
assert.strictEqual(o.token(T, form, new Date(now.getTime() + 61000), ISS).status, 400, "code expires after 60 s");
assert.strictEqual(o.token(T, Object.assign({}, form, { resource: "https://other.example/api/editorial-gateway" }), now, ISS).body.error, "invalid_target", "foreign resource at the token endpoint refused");
const tk = o.token(T, form, now, ISS);
assert.strictEqual(tk.status, 200);
assert.strictEqual(gw.callerKind({ authorization: "Bearer " + tk.body.access_token }, T, now), "session", "the gateway accepts the issued access token as a device session");
assert.strictEqual(gw.callerKind({ authorization: "Bearer " + tk.body.access_token }, "r".repeat(40), now), null, "rotating the token revokes it");
assert.ok(!JSON.stringify(tk.body).includes(T));
const cs = o.consent(T, q, ISS);
assert.ok(cs && cs.redirect_host === "claude.ai" && cs.client_name === "Claude bx/b" || cs.client_name.startsWith("Claude"), "consent names client and redirect host");
assert.ok(/claude\.ai/.test(cs.warning) && /24 hours/.test(cs.warning) && /self-asserted/.test(cs.warning) && cs.warning.indexOf("claude.ai") < cs.warning.indexOf("claims"));
assert.strictEqual(o.consent(T, Object.assign({}, q, { redirect_uri: "https://claude.ai/other" }), ISS), null, "no consent text for an unregistered redirect");
const den = new URL(o.denyRedirect(T, q, "access_denied", ISS));
assert.strictEqual(den.searchParams.get("error"), "access_denied"); assert.strictEqual(den.searchParams.get("iss"), ISS); assert.strictEqual(den.searchParams.get("state"), "abc");
assert.strictEqual(o.denyRedirect(T, Object.assign({}, q, { redirect_uri: "https://claude.ai/other" }), "access_denied", ISS), null, "never redirect an error to an unregistered URI");
assert.strictEqual(m.authorizationServer.authorization_response_iss_parameter_supported, true);
assert.strictEqual(tk.body.expires_in, 86400);
assert.strictEqual(o.toolAuthError("https://preview.example")._meta["mcp/www_authenticate"][0].includes("oauth-protected-resource"), true);
console.log("PASS: oauth-front draft: discovery, stateless registration, owner approval, PKCE code exchange, revocation by token rotation");

// ---- gw-test issuer host (exact, env-gated; inert unless EDITORIAL_OAUTH_EXTRA_HOSTS is set) ----
{
  const saved = {};
  for (const k of ["EDITORIAL_OAUTH_EXTRA_HOSTS", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) { saved[k] = process.env[k]; delete process.env[k]; }
  const iss = (host, xfh) => o.issuerFor(Object.assign({ host }, xfh ? { "x-forwarded-host": xfh } : {}));
  try {
    // unset: gw-test is NOT trusted (falls back to production), exactly today's behaviour
    assert.strictEqual(iss("gw-test.313.events"), "https://313.events");
    assert.strictEqual(iss("313.events"), "https://313.events");
    assert.strictEqual(iss("www.313.events"), "https://www.313.events");

    process.env.EDITORIAL_OAUTH_EXTRA_HOSTS = "gw-test.313.events";
    assert.strictEqual(iss("gw-test.313.events"), "https://gw-test.313.events", "exact configured host is trusted");
    assert.strictEqual(iss("x", "gw-test.313.events"), "https://gw-test.313.events", "proxy-forwarded host is validated the same way");
    assert.strictEqual(iss("GW-TEST.313.events"), "https://gw-test.313.events", "case-insensitive");
    // unknown / lookalike / sibling / deeper / port / path hosts fail safe to production
    for (const bad of ["evil.com", "x.evil.com", "gw-test.313.events.evil.com", "other.313.events", "a.gw-test.313.events", "gw-test.313.events:8443", "gw-test.313.events/x", "gw-test-313.events", "evilgw-test.313.events"]) {
      assert.strictEqual(iss(bad), "https://313.events", "must not trust " + bad);
    }
    assert.strictEqual(iss("gw-test.313.events", "evil.com"), "https://313.events", "forwarded host wins and is checked");

    // malformed / hostile config is ignored, never widens trust
    for (const cfg of ["*.313.events", "*", "evil.com", ".313.events", "313.events.", "a..313.events", "-x.313.events", "gw-test.313.events:443", "https://gw-test.313.events", "gw test.313.events"]) {
      process.env.EDITORIAL_OAUTH_EXTRA_HOSTS = cfg;
      assert.strictEqual(iss("gw-test.313.events"), "https://313.events", "config " + JSON.stringify(cfg) + " must not trust anything");
      assert.strictEqual(iss("evil.com"), "https://313.events");
    }
    // a list: valid entries kept, invalid dropped
    process.env.EDITORIAL_OAUTH_EXTRA_HOSTS = " gw-test.313.events , *.313.events, evil.com ";
    assert.strictEqual(iss("gw-test.313.events"), "https://gw-test.313.events");
    assert.strictEqual(iss("evil.com"), "https://313.events");
    assert.strictEqual(iss("anything.313.events"), "https://313.events");
  } finally {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
  console.log("PASS: oauth-front issuerFor: exact gw-test host only when configured; wildcard/lookalike/port/malformed config fail safe");
}
