// Vercel serverless function: the small OAuth 2.1 front for the Editorial Gateway (api/_lib/oauth-front.js does the work).
// One function, five routes selected by vercel.json rewrites (?route=):
//   /.well-known/oauth-protected-resource      -> protected-resource metadata
//   /.well-known/oauth-authorization-server    -> authorization-server metadata
//   /api/editorial-oauth/register   (POST JSON) -> stateless dynamic client registration
//   /api/editorial-oauth/authorize  (GET form, POST sign-in) -> the owner types the existing gateway token here, in the browser
//   /api/editorial-oauth/token      (POST form) -> code + PKCE verifier -> an egs1 device session as the access token
// No table, no new secret, no dependency. Never logs a token. A secret is never accepted in a URL or query string.
"use strict";
const front = require("./_lib/oauth-front");

const configured = () => process.env.EDITORIAL_GATEWAY_TOKEN;
function origin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Sign-in rate limit: 5 wrong tokens per 10 minutes per client address, per server instance, plus a fixed delay on every wrong
// guess. Serverless instances do not share memory, so this slows guessing and is not a global limit; the token itself is 16+ random characters.
const FAILS = new Map();
const WINDOW_MS = 10 * 60 * 1000, MAX_FAILS = 5;
function clientKey(req) { return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown"; }
function blocked(req, nowMs) {
  const k = clientKey(req);
  const list = (FAILS.get(k) || []).filter((t) => nowMs - t < WINDOW_MS);
  FAILS.set(k, list);
  return list.length >= MAX_FAILS;
}
function noteFail(req, nowMs) { const k = clientKey(req); FAILS.set(k, (FAILS.get(k) || []).concat(nowMs)); }

const FIELDS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state"];
function page(q, message) {
  const hidden = FIELDS.map((f) => `<input type="hidden" name="${f}" value="${esc(q[f])}">`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Connect to 313.events</title>
<style>body{font:16px system-ui;max-width:28rem;margin:3rem auto;padding:0 16px}input[type=password]{width:100%;padding:12px;font-size:16px;box-sizing:border-box}button{margin-top:12px;padding:12px 20px;font-size:16px}.e{color:#b00020}</style></head>
<body><h1>Connect to 313.events</h1><p>Enter the Editorial Gateway token to let this connector add event images. It is checked on the server and never shown or stored.</p>
${message ? `<p class="e">${esc(message)}</p>` : ""}<form method="post" action="/api/editorial-oauth/authorize">${hidden}
<input type="password" name="gateway_token" autocomplete="off" autocapitalize="off" required aria-label="Gateway token"><button type="submit">Connect</button></form></body></html>`;
}

function parseForm(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Object.fromEntries(new URLSearchParams(req.body));
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const route = String((req.query && req.query.route) || "");
  const o = origin(req);
  const token = configured();
  const notReady = () => res.status(503).json({ error: "temporarily_unavailable" });

  if (route === "protected-resource") { res.status(200).json(front.metadata(o).protectedResource); return; }
  if (route === "authorization-server") { res.status(200).json(front.metadata(o).authorizationServer); return; }
  if (!token) { notReady(); return; }

  if (route === "register") {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); res.status(405).json({ error: "invalid_request" }); return; }
    const r = front.register(token, typeof req.body === "string" ? safeJson(req.body) : req.body);
    res.status(r.status).json(r.body);
    return;
  }

  if (route === "authorize") {
    if (req.method === "GET") {
      const q = req.query || {};
      // The URL may carry the OAuth request, never a credential: a gateway_token/token/access_token query parameter is refused.
      if (q.gateway_token || q.token || q.access_token) { res.status(400).json({ error: "invalid_request" }); return; }
      const chk = front.checkAuthorize(token, q);
      if (!chk.ok) { res.status(400).json({ error: chk.error }); return; }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      res.status(200).send(page(q, ""));
      return;
    }
    if (req.method === "POST") {
      const f = parseForm(req);
      const q = {}; for (const k of FIELDS) q[k] = f[k];
      const chk = front.checkAuthorize(token, q);
      if (!chk.ok) { res.status(400).json({ error: chk.error }); return; }
      const nowMs = Date.now();
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      if (blocked(req, nowMs)) { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.status(429).send(page(q, "Too many attempts. Wait ten minutes and try again.")); return; }
      const a = front.approve(token, q, f.gateway_token, new Date(nowMs));
      if (!a.ok) {
        noteFail(req, nowMs);
        await new Promise((r) => setTimeout(r, 750));
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(401).send(page(q, "That token was not accepted."));
        return;
      }
      res.setHeader("Location", a.redirect);
      res.status(302).end();
      return;
    }
    res.setHeader("Allow", "GET, POST"); res.status(405).json({ error: "invalid_request" }); return;
  }

  if (route === "token") {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); res.status(405).json({ error: "invalid_request" }); return; }
    const f = parseForm(req);
    const r = front.token(token, f, new Date());
    res.status(r.status).json(r.body);
    return;
  }
  res.status(404).json({ error: "not_found" });
};

function safeJson(s) { try { return JSON.parse(s); } catch (_) { return null; } }
