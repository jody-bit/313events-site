const crypto = require("crypto");
// Vercel serverless function powering admin.html — the moderation queue.
// Protected by ADMIN_SECRET (set in Vercel Environment Variables). The
// secret is sent as a header from admin.html after the moderator types it
// into a prompt; it is never hard-coded into any HTML/JS file.
//
// GET  /api/admin-events                    -> list events with status=pending_review
// GET  /api/admin-events?search=<text>      -> search live (status=approved) events by
//                                               title, for the "Live events" takedown tool
// GET  /api/admin-events?search=<text>&includePending=1
//                                            -> same search, but also matches
//                                               status=pending_review — used only by
//                                               Press coverage's "search for a matching
//                                               event" box (api/admin-editorial.js's
//                                               link_event action), where a real match
//                                               sitting in the submission queue is exactly
//                                               what a moderator is trying to find. Kept
//                                               opt-in rather than the default so the
//                                               existing takedown tool's "only ever
//                                               searches already-approved events" guarantee
//                                               (see below) doesn't change for it.
// GET  /api/admin-events?hidden=1           -> most recently hidden/rejected events (for undo)
// GET  /api/admin-events?incomplete=1       -> upcoming pending_review/approved events missing
//                                               a "critical field" (see admin.html's
//                                               getMissingFields() for the exact definition) —
//                                               the "Needs follow-up" section. Added 2026-09-05
//                                               at Jody's request: an approved event from a
//                                               trusted crawler source currently goes straight
//                                               to the live site even if a field failed to parse
//                                               (e.g. venue address regex didn't match), with
//                                               nobody ever looking at it the way a pending_review
//                                               submission gets looked at. This surfaces both
//                                               pending AND already-approved events with a gap,
//                                               past events excluded (start_date >= today) since
//                                               a stale one isn't worth chasing. Filtering itself
//                                               happens client-side in admin.html rather than via
//                                               a PostgREST filter here — deliberately, so the
//                                               definition of "missing" can be tweaked in one place
//                                               without touching this endpoint's query shape.
// POST /api/admin-events -> { id, action: "approve"|"reject"|"hide"|"restore"|"update_fields" }
//   approve/reject: pending_review -> approved/rejected (the original submission queue)
//   hide:           approved -> rejected (takes an already-live event off the site)
//   restore:        rejected -> approved (undo a hide, or reverse a reject)
//   update_fields:  { id, action: "update_fields", fields: { description?, venue_address_raw?,
//                     venue_city_raw?, ticket_url?, event_url?, time_display? } } — fills in a
//                     gap the "Needs follow-up" section flagged. Only ever fills a blank field
//                     in, never blanks or overwrites one that already has a value from here.
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

// Same check api/submit.js uses for ticketUrl/eventUrl on the public form —
// duplicated rather than shared, per this project's one-file-per-endpoint
// convention (no shared JS modules).
function isSafeHttpUrl(url) {
  if (!url) return true; // both fields are optional
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
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
      const includePending = req.query?.includePending === "1";
      const incomplete = req.query?.incomplete === "1";

      let url;
      if (incomplete) {
        const todayISO = new Date().toISOString().slice(0, 10);
        url = `${SUPABASE_URL}/rest/v1/events?status=in.(pending_review,approved)&start_date=gte.${todayISO}&select=id,title,category,status,start_date,time_display,venue_name_raw,venue_address_raw,venue_city_raw,description,ticket_url,event_url,submitter_org_name,submitter_email,source&order=start_date.asc`;
      } else if (search) {
        // Live-event takedown search: only ever searches already-approved
        // (publicly visible) events — never pending_review or already-hidden
        // ones, so this can't be used to "approve via search" by accident.
        // includePending=1 (Press coverage's match-search only) widens that
        // to also catch a real match still sitting in the submission queue,
        // and also searches venue_name_raw alongside title — a moderator
        // reading an article often recognizes the venue name with more
        // confidence than guessing the exact event title wording.
        // encodeURIComponent already turns the literal "%" wildcards (and any
        // comma/parens that could otherwise be mistaken for or()-filter
        // syntax, e.g. searching "Arts, Beats & Eats") into safe percent-
        // escapes. A previous version of this code re-escaped the already-
        // escaped "%25" into "%2525" before embedding it in the or=(...)
        // filter below, which after PostgREST's single decode pass left a
        // literal "%25...%25" (real percent signs + the digits "25") as the
        // ilike pattern instead of "%...%" — so it only matched titles that
        // literally contained "25" next to the search term, i.e. effectively
        // nothing. That's why searching "Renaissance" or "Nicolas" in Press
        // Coverage's "Check for a match" found zero results even though the
        // events genuinely existed and were approved. Just use `encoded`
        // as-is here, same as the working title=ilike.${encoded} branch below.
        const encoded = encodeURIComponent(`%${search}%`);
        const statusFilter = includePending ? "status=in.(approved,pending_review)" : "status=eq.approved";
        const matchFilter = includePending
          ? `or=(title.ilike.${encoded},venue_name_raw.ilike.${encoded})`
          : `title=ilike.${encoded}`;
        url = `${SUPABASE_URL}/rest/v1/events?${statusFilter}&${matchFilter}&select=*&order=start_date.asc&limit=50`;
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

    // update_fields (2026-09-05, Jody: "how do I get to edit these fields?"
    // — asked right after the "Needs follow-up" section shipped as a
    // read-only heads-up) — lets admin.html actually fix a flagged gap in
    // place instead of sending Jody to Supabase's own SQL editor for every
    // single one. Deliberately its own small whitelist rather than a
    // generic "PATCH any column" endpoint: only the fields the follow-up
    // queue actually checks for are editable here, each validated the same
    // way api/submit.js validates the same fields on the public form.
    if (action === "update_fields") {
      const EDITABLE_FIELDS = ["description", "venue_address_raw", "venue_city_raw", "ticket_url", "event_url", "time_display"];
      const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
      const requested = {};
      for (const key of EDITABLE_FIELDS) {
        if (!(key in fields)) continue;
        const val = typeof fields[key] === "string" ? fields[key].trim() : fields[key];
        if (val == null || val === "") continue;
        if ((key === "ticket_url" || key === "event_url") && !isSafeHttpUrl(val)) {
          res.status(400).json({ error: `${key} must be a valid http(s) link` });
          return;
        }
        requested[key] = val;
      }
      if (!id || !Object.keys(requested).length) {
        res.status(400).json({ error: "Body must include { id, action: 'update_fields', fields: { <at least one editable field> } }" });
        return;
      }
      try {
        // Re-check the row's CURRENT values server-side rather than trusting
        // whatever admin.html last rendered — this tool only ever fills a
        // gap in, never overwrites a field that already has something in it
        // (even if that got filled in by another tab, or a cron re-run,
        // between page load and clicking Save).
        const currentResp = await fetch(
          `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}&select=${Object.keys(requested).join(",")}`,
          { headers: sbHeaders }
        );
        const currentRows = await currentResp.json();
        if (!currentResp.ok || !currentRows[0]) {
          res.status(404).json({ error: "Event not found" });
          return;
        }
        const current = currentRows[0];
        const patch = {};
        for (const key of Object.keys(requested)) {
          const existing = current[key];
          if (existing == null || (typeof existing === "string" && !existing.trim())) {
            patch[key] = requested[key];
          }
        }
        if (!Object.keys(patch).length) {
          res.status(200).json({ ok: true, event: current, note: "Nothing to fill in — every requested field already had a value." });
          return;
        }
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { ...sbHeaders, Prefer: "return=representation" },
          body: JSON.stringify(patch),
        });
        const rows = await resp.json();
        res.status(resp.ok ? 200 : 502).json(resp.ok ? { ok: true, event: rows[0] } : { error: rows });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    if (!id || !["approve", "reject", "hide", "restore"].includes(action)) {
      res.status(400).json({ error: "Body must include { id, action: 'approve'|'reject'|'hide'|'restore'|'update_fields' }" });
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
