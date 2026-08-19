// Vercel serverless function powering admin.html — the moderation queue.
// Protected by ADMIN_SECRET (set in Vercel Environment Variables). The
// secret is sent as a header from admin.html after the moderator types it
// into a prompt; it is never hard-coded into any HTML/JS file.
//
// GET  /api/admin-events           -> list events with status=pending_review
// POST /api/admin-events           -> { id, action: "approve"|"reject" }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

function checkAuth(req, res) {
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: "ADMIN_SECRET not configured on the server." });
    return false;
  }
  const provided = req.headers["x-admin-secret"];
  if (provided !== ADMIN_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

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
        `${SUPABASE_URL}/rest/v1/events?status=eq.pending_review&select=*&order=created_at.desc`,
        { headers: sbHeaders }
      );
      const rows = await resp.json();
      res.status(resp.ok ? 200 : 502).json(resp.ok ? { events: rows } : { error: rows });
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

    if (!id || !["approve", "reject"].includes(action)) {
      res.status(400).json({ error: "Body must include { id, action: 'approve'|'reject' }" });
      return;
    }

    const newStatus = action === "approve" ? "approved" : "rejected";
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...sbHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ status: newStatus }),
      });
      const rows = await resp.json();
      res.status(resp.ok ? 200 : 502).json(resp.ok ? { ok: true, event: rows[0] } : { error: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
