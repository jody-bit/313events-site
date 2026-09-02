const crypto = require("crypto");
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


const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = "https://313.events";

function escapeHtmlForEmail(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// "Your event is live" email to the submitter (Jody, 2026-08-28) — fired
// only on the "approve" action, never "restore". Both set status to
// 'approved', but this project's events table has no separate status for
// "was live, then hidden" vs "was pending, then rejected" (see this file's
// header comment) — a "restore" can equally mean un-hiding an event that
// already got this email once (don't send it again) or reversing a reject
// that never got one (arguably should). Since there's no way to tell those
// apart from the data alone, this only fires on the unambiguous first-time
// path rather than risk double-emailing a submitter.
//
// Same fail-soft-and-swallow convention as this project's other best-effort
// email, api/submit.js's notifySubmission() — a failed send here must never
// turn an otherwise-successful approve action into an error response.
//
// IMPORTANT — deliverability: this reuses the same shared
// onboarding@resend.dev sender notifySubmission() already uses for Jody's
// own new-submission alert. Resend restricts that shared sender to only
// deliver to the account's OWN verified signup email until a custom domain
// is added — so as written, this email is a no-op for every real submitter
// except Jody's own address. To actually reach submitters: verify a domain
// (e.g. 313.events) in the Resend dashboard, then change the "from" address
// below to send from it. Flagged here rather than shipped as if it already
// worked for real submitters — it doesn't yet.
async function notifyEventLive(row) {
  if (!RESEND_API_KEY || !row.submitter_email) return;
  try {
    const eventUrl = `${SITE_URL}/event.html?id=${encodeURIComponent(row.id)}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "313.events <onboarding@resend.dev>",
        to: [row.submitter_email],
        subject: `Your event "${row.title}" is live on 313.events`,
        html: `
          <p>Good news — <b>${escapeHtmlForEmail(row.title)}</b> is now live on 313.events.</p>
          <p><a href="${eventUrl}">${eventUrl}</a></p>
          <p>That's your event's own page — share it directly, or find it anytime from the calendar.</p>
        `,
      }),
    });
  } catch (err) {
    console.error("notifyEventLive failed:", err.message);
  }
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
      if (resp.ok && action === "approve" && rows[0]) {
        await notifyEventLive(rows[0]);
      }
      res.status(resp.ok ? 200 : 502).json(resp.ok ? { ok: true, event: rows[0] } : { error: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
