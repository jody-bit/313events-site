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

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "event-flyers";
// 4MB, not 5 — Vercel Serverless Functions cap the whole request body
// (headers + payload) at ~4.5MB regardless of what this code checks, so a
// limit here that isn't comfortably under that just means the platform
// itself rejects borderline uploads with an opaque error instead of this
// endpoint's own clear "too large" message. Matches migration_013's bucket
// file_size_limit — keep both in sync if this ever changes.
const MAX_BYTES = 4 * 1024 * 1024;
const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Image uploads are not configured yet (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)." });
    return;
  }

  const contentType = (req.headers["content-type"] || "").split(";")[0].trim();
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) {
    res.status(400).json({ error: "Unsupported image type — please use JPG, PNG, WEBP, or GIF." });
    return;
  }

  let buffer;
  try {
    // Prefer req.body only if some runtime already gave us real bytes;
    // otherwise read the raw stream ourselves — see the file-header
    // comment for why req.body can't be trusted to be populated here.
    buffer = Buffer.isBuffer(req.body) && req.body.length ? req.body : await readRawBody(req);
  } catch (err) {
    res.status(500).json({ error: "Failed to read the upload: " + err.message });
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

  const path = `${crypto.randomUUID()}.${ext}`;

  try {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": contentType,
      },
      body: buffer,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      res.status(502).json({ error: "Storage rejected the upload: " + errText });
      return;
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    res.status(201).json({ ok: true, url: publicUrl });
  } catch (err) {
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
};
