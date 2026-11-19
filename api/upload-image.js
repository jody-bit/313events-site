// Vercel serverless function — receives a raw image file from submit.html's
// file-upload field and stores it in Supabase Storage (bucket:
// "event-flyers", created by migration_013), returning a public URL that
// gets saved as the event's image_url — same field api/submit.js already
// accepted, previously only fillable by pasting a link to an
// already-hosted image.
//
// Uses the SERVICE ROLE key (server-side only) rather than letting the
// browser write to Storage directly with the anon/publishable key, for the
// same reason api/submit.js uses the service role for its own insert:
// every upload goes through this endpoint's own size/type checks, and
// nobody who finds the public anon key in the page source can write
// arbitrary files straight into the bucket, bypassing those checks (and
// this site's moderation flow) entirely.
//
// This is a plain Vercel Node.js Serverless Function (this project has no
// Next.js/build step — see README), NOT a Next.js API route, so the
// Next.js-only `config.api.bodyParser` escape hatch doesn't apply here.
//
// 2026-09-05 CRITICAL FIX — Jody's friend hit "No image data received." on
// every attempt to add a flyer image, and it turns out this broke EVERY
// image upload since this endpoint shipped, not an edge case: the original
// comment here assumed Vercel's Node runtime auto-buffers any request body
// it doesn't recognize (i.e. anything other than json/urlencoded/text)
// into req.body as a raw Buffer. Reproduced live against production
// (submitted a synthetic in-memory file straight through submit.html's own
// uploadFlyerImage()): req.body came back empty for a plain
// "image/jpeg" POST, every single time — that assumption was wrong for
// this content type on this runtime. Fixed by reading the raw request
// stream directly (readRawBody() below) instead of trusting req.body for
// anything — the standard, runtime-independent way to receive a raw binary
// upload in a Vercel Node Function. Falls back to req.body first only for
// the (currently untested) case some other runtime version DOES pre-buffer
// it — never assume it's empty without checking, but never assume it's
// populated either.

const crypto = require("crypto");
const guard = require("./_lib/upload-guard");

// P0 security remediation (owner decision I1, 2026-10-17). Before this change the endpoint accepted any POST from anyone:
// no token, no rate limit, and the bytes were never inspected (the declared Content-Type alone decided acceptance).
// Now: GET returns a short-lived signed token the submit form fetches first; POST requires it, sniffs the real bytes
// (JPEG/PNG/GIF/WebP, must match the declared type, pixel ceiling), caps uploads per client per hour, writes under a
// per-client prefix, and says x-upsert: false so an existing object can never be replaced. The service key never reaches
// the browser; the token key is derived from it on the server.

async function readRawBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) { const e = new Error("too large"); e.code = "TOO_LARGE"; throw e; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
// Non-production deployments must never use the production database (api/_lib/environment.js).
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "event-flyers";
// 4MB, not 5 -- Vercel Serverless Functions cap the whole request body at ~4.5MB regardless of what this code checks.
// Matches migration_013's bucket file_size_limit; keep both in sync if this ever changes.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function recentUploadTimes(prefix) {
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 50, sortBy: { column: "created_at", order: "desc" } }),
  });
  if (!resp.ok) throw new Error(`storage list HTTP ${resp.status}`);
  const rows = await resp.json();
  return (Array.isArray(rows) ? rows : []).map((r) => r.created_at).filter(Boolean);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Image uploads are not configured yet (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)." });
    return;
  }

  if (req.method === "GET") {
    res.status(200).json({ token: guard.issueToken(SUPABASE_SERVICE_ROLE_KEY), expiresInSeconds: guard.TOKEN_TTL_MS / 1000 });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const tokenCheck = guard.verifyToken(SUPABASE_SERVICE_ROLE_KEY, req.headers["x-upload-token"]);
  if (!tokenCheck.ok) {
    res.status(401).json({ error: tokenCheck.reason === "expired" ? "That upload session expired — please reload the page and try again." : "Upload not authorised." });
    return;
  }

  const contentType = (req.headers["content-type"] || "").split(";")[0].trim();
  if (!ALLOWED_TYPES.has(contentType)) {
    res.status(400).json({ error: "Unsupported image type — please use JPG, PNG, WEBP, or GIF." });
    return;
  }
  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    res.status(413).json({ error: "That image is too large — max 4MB." });
    return;
  }

  let buffer;
  try {
    // req.body only if a runtime already gave us real bytes; otherwise stream with a hard byte ceiling.
    buffer = Buffer.isBuffer(req.body) && req.body.length ? req.body : await readRawBody(req, MAX_BYTES);
  } catch (err) {
    if (err && err.code === "TOO_LARGE") { res.status(413).json({ error: "That image is too large — max 4MB." }); return; }
    res.status(500).json({ error: "Failed to read the upload." });
    return;
  }
  if (!buffer.length) {
    res.status(400).json({ error: "No image data received." });
    return;
  }
  if (buffer.length > MAX_BYTES) {
    res.status(413).json({ error: "That image is too large — max 4MB." });
    return;
  }

  const verdict = guard.validateUpload(buffer, contentType);
  if (!verdict.ok) {
    res.status(verdict.status).json({ error: verdict.error });
    return;
  }

  const client = guard.clientKey(SUPABASE_SERVICE_ROLE_KEY, guard.clientIp(req.headers));
  const prefix = `u/${client}`;
  try {
    const times = await recentUploadTimes(prefix);
    if (guard.overClientLimit(times)) {
      res.setHeader("Retry-After", "3600");
      res.status(429).json({ error: "Too many uploads from this connection — please try again later." });
      return;
    }
  } catch (_) {
    // Fail closed: an unverifiable rate limit is not a pass.
    res.status(503).json({ error: "Uploads are temporarily unavailable — please try again shortly." });
    return;
  }

  const path = `${prefix}/${crypto.randomUUID()}.${verdict.ext}`;

  try {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": verdict.type,
        "x-upsert": "false",
        "Cache-Control": "max-age=31536000",
      },
      body: buffer,
    });

    if (!resp.ok) {
      res.status(502).json({ error: "Storage rejected the upload." });
      return;
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    res.status(201).json({ ok: true, url: publicUrl });
  } catch (err) {
    res.status(500).json({ error: "Upload failed." });
  }
};
