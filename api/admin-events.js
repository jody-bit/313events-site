// Vercel serverless function powering admin.html — the moderation queue.
// Protected by ADMIN_SECRET (set in Vercel Environment Variables). The
// secret is sent as a header from admin.html after the moderator types it
// into a prompt; it is never hard-coded into any HTML/JS file.
//
// GET  /api/admin-events                    -> list events with status=pending_review
// GET  /api/admin-events?search=<text>      -> search live (status=approved) events by
//                                               title, for the "Live events" takedown tool
// GET  /api/admin-events?hidden=1           -> most recently hidden/rejected events (for undo)
// POST /api/admin-events -> { id, action: "approve"|"reject"|"hide"|"restore" }
//   approve/reject: pending_review -> approved/rejected (the original submission queue)
//   hide:           approved -> rejected (takes an already-live event off the site)
//   restore:        rejected -> approved (undo a hide, or reverse a reject)
// "hide" and "reject" both land on the same event_status enum value
// ('rejected') — there's no separate DB status for "was live, then pulled"
// vs. "a submission we declined." Adding one would need a Postgres enum
// migration; reusing 'rejected' avoids that and is fine since both mean the
// same thing to the public site (not shown), and "restore" un-does either.

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
      const search = typeof req.query?.search === "string" ? req.query.search.trim() : "";
      const hidden = req.query?.hidden === "1";

      let url;
      if (search) {
        // Live-event takedown search: only ever searches already-approved
        // (publicly visible) events — never pending_review or already-hidden
        // ones, so this can't be used to "approve via search" by accident.
        const encoded = encodeURIComponent(`%${search}%`);
        url = `${SUPABASE_URL}/rest/v1/events?status=eq.approved&title=ilike.${encoded}&select=*&order=start_date.asc&limit=50`;
      } else if (hidden) {
        // Recently hidden/rejected, most recent first — the undo list.
        url = `${SUPABASE_URL}/rest/v1/events?status=eq.rejected&select=*&order=updated_at.desc&limit=20`;
      } else {
        url = `${SUPABASE_URL}/rest/v1/events?status=eq.pending_review&select=*&order=created_at.desc`;
      }

      const resp = await fetch(url, { headers: sbHeaders });
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

    if (!id || !["approve", "reject", "hide", "restore"].includes(action)) {
      res.status(400).json({ error: "Body must include { id, action: 'approve'|'reject'|'hide'|'restore' }" });
      return;
    }

    const newStatus = (action === "approve" || action === "restore") ? "approved" : "rejected";
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
