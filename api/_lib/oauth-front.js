// DRAFT (not wired, not deployed): the smallest OAuth 2.1 front that lets a Claude or ChatGPT custom connector reach the
// Editorial Gateway without a static header. Stateless: no table, no new secret. The only secret is the existing
// EDITORIAL_GATEWAY_TOKEN, typed once by the owner into the gateway's own sign-in page (never a URL, never chat).
// Access tokens are the existing egs1 device sessions (createSession), so rotating the token revokes every connector.
// Flow: discovery -> dynamic client registration (stateless, signed) -> authorize (owner types the token) -> code (60 s, PKCE S256)
//       -> token (code + verifier -> egs1 session). No refresh token: when the session expires the client re-authorizes.
"use strict";
const crypto = require("crypto");
const gateway = require("./editorial-gateway");

const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const key = (token, purpose) => crypto.createHash("sha256").update(`313events-oauth-front|${purpose}|${gateway.normalizeToken(token)}`).digest();
function sign(token, purpose, obj) { const body = b64u(JSON.stringify(obj)); return `${body}.${b64u(crypto.createHmac("sha256", key(token, purpose)).update(body).digest())}`; }
function unsign(token, purpose, value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 2) return null;
  const want = crypto.createHmac("sha256", key(token, purpose)).update(parts[0]).digest();
  const got = unb64u(parts[1]);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try { return JSON.parse(unb64u(parts[0]).toString("utf8")); } catch (_) { return null; }
}
const sameSecret = (a, b) => { const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

// Redirect URIs a client may register. https only; hosts of the two vendors. (Exact callback paths to be confirmed on Preview.)
const REDIRECT_HOSTS = new Set(["claude.ai", "claude.com", "chatgpt.com"]);
function redirectAllowed(uri) { try { const u = new URL(uri); return u.protocol === "https:" && !u.username && !u.port && REDIRECT_HOSTS.has(u.hostname) && !u.hash; } catch (_) { return false; } }

function metadata(origin) {
  return {
    protectedResource: { resource: `${origin}/api/editorial-gateway`, authorization_servers: [origin], bearer_methods_supported: ["header"] },
    authorizationServer: { issuer: origin, authorization_endpoint: `${origin}/api/editorial-oauth/authorize`, token_endpoint: `${origin}/api/editorial-oauth/token`,
      registration_endpoint: `${origin}/api/editorial-oauth/register`, response_types_supported: ["code"], grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] },
  };
}

function register(configured, body) {
  const uris = body && Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectAllowed)) return { status: 400, body: { error: "invalid_redirect_uri" } };
  const client_id = sign(configured, "client", { v: 1, ru: uris });
  return { status: 201, body: { client_id, redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] } };
}

// Validates the authorization request the browser arrives with. -> { ok, client, error }
function checkAuthorize(configured, q) {
  const c = unsign(configured, "client", q.client_id);
  if (!c || c.v !== 1) return { ok: false, error: "invalid_client" };
  if (!c.ru.includes(q.redirect_uri)) return { ok: false, error: "invalid_redirect_uri" };
  if (q.response_type !== "code" || q.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(q.code_challenge || "")) return { ok: false, error: "invalid_request" };
  return { ok: true, client: c };
}

// The owner submitted the sign-in form. enteredToken is compared to the configured token; success -> redirect URL carrying a 60 s code.
function approve(configured, q, enteredToken, now) {
  const chk = checkAuthorize(configured, q);
  if (!chk.ok) return { ok: false, error: chk.error };
  if (gateway.tokenStatus(configured).state !== "ok" || !sameSecret(gateway.normalizeToken(enteredToken), gateway.normalizeToken(configured))) return { ok: false, error: "access_denied" };
  const exp = Math.floor((now || new Date()).getTime() / 1000) + 60;
  const code = sign(configured, "code", { cid: q.client_id, ru: q.redirect_uri, cc: q.code_challenge, exp });
  const u = new URL(q.redirect_uri); u.searchParams.set("code", code); if (q.state) u.searchParams.set("state", q.state);
  return { ok: true, redirect: u.toString() };
}

function token(configured, form, now) {
  if (form.grant_type !== "authorization_code") return { status: 400, body: { error: "unsupported_grant_type" } };
  const c = unsign(configured, "code", form.code);
  const t = Math.floor((now || new Date()).getTime() / 1000);
  if (!c || t >= c.exp || c.cid !== form.client_id || c.ru !== form.redirect_uri) return { status: 400, body: { error: "invalid_grant" } };
  if (b64u(crypto.createHash("sha256").update(String(form.code_verifier || "")).digest()) !== c.cc) return { status: 400, body: { error: "invalid_grant" } };
  const s = gateway.createSession(configured, { ttl_seconds: 7 * 86400, label: "oauth-connector" }, now);
  return { status: 200, body: { access_token: s.session, token_type: "Bearer", expires_in: 7 * 86400 } };
}

// 401 challenge the gateway should send so clients discover the front: WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"
const challenge = (origin) => `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`;

module.exports = { metadata, register, checkAuthorize, approve, token, challenge, redirectAllowed };
