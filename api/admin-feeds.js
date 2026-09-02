const crypto = require("crypto");
// Vercel serverless function powering the "Feed sources" section of
// admin.html — approving/rejecting new self-service feed registrations
// (submit.html's "submit your event feed" form) and pausing/resuming ones
// already approved. Same ADMIN_SECRET gate as api/admin-events.js.
//
// GET  /api/admin-feeds   -> all feed_sources, newest first (every status —
//                            admin.html groups them client-side into
//                            Pending / Active / Paused / Rejected sections)
// POST /api/admin-feeds   -> { id, action: "approve"|"reject"|"pause"|"resume" }
//
// Approving here does NOT trigger an immediate poll — the newly-approved
// feed starts getting pulled the next time api/cron-feeds.js runs on its
// normal schedule, same as every other source in this project (nothing
// else runs on-demand either). last_polled_at/last_poll_result on each row
// show up here once that first run happens, so approval isn't a black box.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Timing-safe secret comparison — a plain `!==` string compare leaks how
// many leading characters matched via response timing, since JS's string
// equality short-circuits at the first mismatched character. That's a real,
// if narrow, side channel against CRON_SECRET / ADMIN_SECRET. Buffers of
// different lengths still get run through timingSafeEqual (against
// themselves) rather than returning immediately, so a length mismatch takes
// the same code path as a same-length mismatch instead of returning early.
// Added 2026-09-02 site audit.
function timingSafeStringEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}


function checkAuth(req, res) {
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: "ADMIN_SECRET not configured on the server." });
    return false;
  }
  const provided = req.headers["x-admin-secret"];
  if (!timingSafeStringEqual(provided || "", ADMIN_SECRET)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

const ACTION_TO_STATUS = {
  approve: "approved",
  reject: "rejected",
  pause: "paused",
  resume: "approved",
};

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Database not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." });
    return;
  }
  if (!checkAuth(req, res)) return;

  const sbHeaders = {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  if (req.method === "GET") {
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/feed_sources?select=*&order=created_at.desc`,
        { headers: sbHeaders }
      );
      const rows = await resp.json();
      res.status(resp.ok ? 200 : 502).json(resp.ok ? { feeds: rows } : { error: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};
    const { id, action } = body;

    if (!id || !ACTION_TO_STATUS[action]) {
      res.status(400).json({ error: "Body must include { id, action: 'approve'|'reject'|'pause'|'resume' }" });
      return;
    }

    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/feed_sources?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...sbHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ status: ACTION_TO_STATUS[action] }),
      });
      const rows = await resp.json();
      res.status(resp.ok ? 200 : 502).json(resp.ok ? { ok: true, feed: rows[0] } : { error: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
