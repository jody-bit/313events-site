// test/editorial-oauth-handler.test.js — the wired OAuth front: discovery, registration, sign-in, token, then a gateway call.
// Synthetic token, no network. Run: node test/editorial-oauth-handler.test.js
"use strict";
const assert = require("assert");
const crypto = require("crypto");
const T = "s".repeat(40);
process.env.EDITORIAL_GATEWAY_TOKEN = T;
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const handler = require("../api/editorial-oauth.js");
const gw = require("../api/_lib/editorial-gateway");

function call(route, { method = "GET", query = {}, body, headers = {} } = {}) {
  const out = { status: 200, headers: {}, body: null };
  const res = { setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; }, send(b) { out.body = b; return this; }, end() { return this; } };
  const req = { method, query: Object.assign({ route }, query), body, headers: Object.assign({ host: "preview.example", "x-forwarded-for": "9.9.9.9" }, headers) };
  return handler(req, res).then(() => out);
}
(async () => {
  assert.strictEqual((await call("protected-resource")).body.authorization_servers[0], "https://preview.example");
  assert.strictEqual((await call("authorization-server")).body.code_challenge_methods_supported[0], "S256");
  const RU = "https://claude.ai/api/mcp/auth_callback";
  const reg = await call("register", { method: "POST", body: { redirect_uris: [RU] } });
  assert.strictEqual(reg.status, 201);
  const verifier = crypto.randomBytes(32).toString("base64url");
  const q = { client_id: reg.body.client_id, redirect_uri: RU, response_type: "code", code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "st" };
  const form = await call("authorize", { query: q });
  assert.strictEqual(form.status, 200);
  assert.ok(/type="password"/.test(form.body) && !form.body.includes(T));
  assert.strictEqual((await call("authorize", { query: Object.assign({ token: T }, q) })).status, 400, "a credential in the URL is refused");
  assert.strictEqual((await call("authorize", { query: { client_id: "x" } })).status, 400);

  const bad = await call("authorize", { method: "POST", body: Object.assign({ gateway_token: "nope-nope-nope-nope" }, q) });
  assert.strictEqual(bad.status, 401);
  const good = await call("authorize", { method: "POST", body: Object.assign({ gateway_token: T }, q), headers: { "x-forwarded-for": "8.8.8.8" } });
  assert.strictEqual(good.status, 302);
  const loc = good.headers.location;
  assert.ok(loc.startsWith(RU + "?code=") && !loc.includes(T));
  const code = new URL(loc).searchParams.get("code");
  const tk = await call("token", { method: "POST", body: { grant_type: "authorization_code", code, client_id: q.client_id, redirect_uri: RU, code_verifier: verifier } });
  assert.strictEqual(tk.status, 200);
  assert.strictEqual(gw.callerKind({ authorization: "Bearer " + tk.body.access_token }, T), "session");

  // rate limit: five wrong tokens from one address, then blocked even with the right token
  for (let i = 0; i < 5; i++) await call("authorize", { method: "POST", body: Object.assign({ gateway_token: "wrong-wrong-wrong-wrong" }, q), headers: { "x-forwarded-for": "7.7.7.7" } });
  const limited = await call("authorize", { method: "POST", body: Object.assign({ gateway_token: T }, q), headers: { "x-forwarded-for": "7.7.7.7" } });
  assert.strictEqual(limited.status, 429);

  // the gateway's 401 carries the discovery challenge
  const gateway = require("../api/editorial-gateway.js");
  const out = { headers: {} };
  const r2 = { setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, status(c) { out.status = c; return this; }, json() { return this; } };
  await gateway({ method: "POST", headers: { host: "preview.example" }, query: {}, body: {} }, r2);
  assert.strictEqual(out.status, 401);
  assert.ok(/resource_metadata="https:\/\/preview\.example\/\.well-known\/oauth-protected-resource"/.test(out.headers["www-authenticate"]));
  console.log("PASS: OAuth front wired -- discovery, registration, sign-in form (no credential in URL), rate limit, PKCE token, gateway challenge");
})().catch((e) => { console.error(e); process.exit(1); });
