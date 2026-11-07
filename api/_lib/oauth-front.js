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

const SESSION_SECONDS = 24 * 3600; // shorter than the 7-day device session (R&Q gap 16); the client re-authorizes daily (no refresh token)
// Redirect URIs a client may register. https only; hosts of the two vendors. (Exact callback paths to be confirmed on Preview.)
const REDIRECT_HOSTS = new Set(["claude.ai", "claude.com", "chatgpt.com"]);
function redirectAllowed(uri) { try { const u = new URL(uri); return u.protocol === "https:" && !u.username && !u.port && REDIRECT_HOSTS.has(u.hostname) && !u.hash; } catch (_) { return false; } }

function metadata(origin) {
  return {
    protectedResource: { resource: `${origin}/api/editorial-gateway`, authorization_servers: [origin], bearer_methods_supported: ["header"], scopes_supported: ["editorial"] },
    authorizationServer: { issuer: origin, authorization_endpoint: `${origin}/api/editorial-oauth/authorize`, token_endpoint: `${origin}/api/editorial-oauth/token`,
      registration_endpoint: `${origin}/api/editorial-oauth/register`, response_types_supported: ["code"], grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true, client_id_metadata_document_supported: false, scopes_supported: ["editorial"] },
  };
}

function register(configured, body) {
  const uris = body && Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectAllowed)) return { status: 400, body: { error: "invalid_redirect_uri" } };
  const name = typeof body.client_name === "string" ? body.client_name.replace(/[^\w .\-()]/g, "").slice(0, 60) : "";
  const client_id = sign(configured, "client", { v: 1, ru: uris, nm: name });
  return { status: 201, body: { client_id, redirect_uris: uris, client_name: name || undefined, token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] } };
}

// Validates the authorization request the browser arrives with. -> { ok, client, error }
// issuer = the server-derived origin (fixed config / allow-listed host), NEVER a request field.
function checkAuthorize(configured, q, issuer) {
  const c = unsign(configured, "client", q.client_id);
  if (!c || c.v !== 1) return { ok: false, error: "invalid_client" };
  if (!c.ru.includes(q.redirect_uri)) return { ok: false, error: "invalid_redirect_uri" };
  // RFC 8707: a resource indicator, when sent, must name this gateway (audience binding).
  if (q.resource && q.resource !== `${issuer}/api/editorial-gateway`) return { ok: false, error: "invalid_target" };
  if (q.response_type !== "code" || q.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(q.code_challenge || "")) return { ok: false, error: "invalid_request" };
  return { ok: true, client: c };
}

// Text the sign-in page MUST show before the owner types the token (consent-phishing defense, R&Q gap 15).
function consent(configured, q, issuer) {
  const chk = checkAuthorize(configured, q, issuer);
  if (!chk.ok) return null;
  const host = new URL(q.redirect_uri).hostname;
  return { client_name: chk.client.nm || "(unnamed connector)", redirect_host: host,
    warning: `This will send your sign-in to ${host}. The connector claims to be ${chk.client.nm ? `"${chk.client.nm}"` : "unnamed"} (self-asserted, not verified). Only continue if YOU just started adding a connector there. Signing in lets it find events and upload images on 313.events for 24 hours.` };
}

// Error redirect (RFC 6749 4.1.2.1 + RFC 9207): carries iss and state. Only when client and redirect_uri already validated; otherwise show an error page, never redirect.
function denyRedirect(configured, q, error, issuer) {
  const c = unsign(configured, "client", q.client_id);
  if (!c || c.v !== 1 || !c.ru.includes(q.redirect_uri)) return null;
  const u = new URL(q.redirect_uri); u.searchParams.set("error", error); u.searchParams.set("iss", String(issuer)); if (q.state) u.searchParams.set("state", q.state);
  return u.toString();
}

// The owner submitted the sign-in form. enteredToken is compared to the configured token; success -> redirect URL carrying a 60 s code.
function approve(configured, q, enteredToken, now, issuer) {
  const chk = checkAuthorize(configured, q, issuer);
  if (!chk.ok) return { ok: false, error: chk.error };
  if (gateway.tokenStatus(configured).state !== "ok" || !sameSecret(gateway.normalizeToken(enteredToken), gateway.normalizeToken(configured))) return { ok: false, error: "access_denied" };
  const exp = Math.floor((now || new Date()).getTime() / 1000) + 60;
  const code = sign(configured, "code", { cid: q.client_id, ru: q.redirect_uri, cc: q.code_challenge, exp, res: q.resource || null });
  const u = new URL(q.redirect_uri); u.searchParams.set("code", code); u.searchParams.set("iss", String(issuer)); if (q.state) u.searchParams.set("state", q.state);
  return { ok: true, redirect: u.toString() };
}

function token(configured, form, now, issuer) {
  if (form.resource && form.resource !== `${issuer}/api/editorial-gateway`) return { status: 400, body: { error: "invalid_target" } };
  if (form.grant_type !== "authorization_code") return { status: 400, body: { error: "unsupported_grant_type" } };
  const c = unsign(configured, "code", form.code);
  const t = Math.floor((now || new Date()).getTime() / 1000);
  if (!c || t >= c.exp || c.cid !== form.client_id || c.ru !== form.redirect_uri || (c.res && form.resource && c.res !== form.resource)) return { status: 400, body: { error: "invalid_grant" } };
  if (b64u(crypto.createHash("sha256").update(String(form.code_verifier || "")).digest()) !== c.cc) return { status: 400, body: { error: "invalid_grant" } };
  const s = gateway.createSession(configured, { ttl_seconds: SESSION_SECONDS, label: "oauth-connector" }, now);
  return { status: 200, body: { access_token: s.session, token_type: "Bearer", expires_in: SESSION_SECONDS, scope: "editorial" } };
}

// Tool-level auth error for MCP tools/call results (ChatGPT tool OAuth UI): field names per Codex readback, CONFIRM on Preview.
const toolAuthError = (origin) => ({ isError: true, content: [{ type: "text", text: "Sign in required." }], _meta: { "mcp/www_authenticate": [challenge(origin)] } });
const SECURITY_SCHEMES = [{ type: "oauth2", scopes: ["editorial"] }];

// 401 challenge the gateway should send so clients discover the front: WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"
const challenge = (origin) => `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`;


// The issuer is server-derived, never a request field: a fixed production host or one of this deployment's own Vercel hosts.
// A Host/X-Forwarded-Host that is not on that list is ignored in favour of the deployment's own URL (R&Q gap 17).
function allowedHosts() {
  const hosts = new Set(["313.events", "www.313.events"]);
  // Optional, non-secret, per-environment EXTRA exact hostnames (comma-separated), e.g. one temporary connector-test host on a Preview.
  // Inert unless the env var is set. Each entry must be an exact hostname under 313.events: no wildcard, no port, no path, no
  // empty label, and neither the apex nor www (already listed). Anything else is ignored, so a mistyped value cannot widen trust.
  for (const h of String(process.env.EDITORIAL_OAUTH_EXTRA_HOSTS || "").split(",")) {
    const v = h.trim().toLowerCase();
    if (v !== "313.events" && v !== "www.313.events" && /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+313\.events$/.test(v)) hosts.add(v);
  }
  for (const k of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) if (process.env[k]) hosts.add(String(process.env[k]).replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  return hosts;
}
function issuerFor(headers) {
  const asked = String(headers["x-forwarded-host"] || headers.host || "").split(",")[0].trim().toLowerCase();
  const hosts = allowedHosts();
  if (hosts.has(asked)) return `https://${asked}`;
  const fallback = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "313.events";
  return `https://${String(fallback).replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
}

module.exports = { issuerFor, consent, denyRedirect, toolAuthError, SECURITY_SCHEMES, SESSION_SECONDS, metadata, register, checkAuthorize, approve, token, challenge, redirectAllowed };
