// Vercel serverless function — receives venue/organizer event submissions
// from submit.html and inserts them into Supabase as status='pending_review'.
//
// Uses the SERVICE ROLE key (server-side only, set in Vercel Environment
// Variables — never expose this key in front-end code) so it can write even
// though the anon-key RLS insert policy would also allow this on its own.
// Using the service role here lets us also do basic server-side validation
// and hard-code status regardless of what the client sends.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_CATEGORIES = new Set([
  "music", "theatre", "dance", "visual", "museum",
  "family", "fest", "food", "film", "nightlife", "community",
  // Note: "sports" is a valid category in the database (migration_007) but
  // was already missing from this list before this edit — a pre-existing
  // gap, not introduced here. Flagged, not fixed, since it's outside what
  // this change was asked to do.
]);

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// <input type="time">'s value attribute is always 24-hour "HH:MM" (browser-
// native, locale-independent — that's per the HTML spec, not a user choice),
// and this was being stored as time_display completely unconverted, showing
// as "18:00" on event.html/index.html instead of "6:00 PM" like every other
// source on this site (RSS/scraper crons already format their own times
// this way). Jody, 2026-08-28: "why is this showing the time in army time?"
// Unrecognized input passes through as-is rather than being dropped, so a
// shape this doesn't expect fails visibly (a weird string) instead of
// silently losing the time entirely.
function formatTimeDisplay(rawTime) {
  if (!rawTime || typeof rawTime !== "string") return null;
  const m = rawTime.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return rawTime;
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${ampm}`;
}

// Only allow http(s) links to be stored at all. Without this, someone could
// submit ticketUrl/imageUrl as "javascript:..." or another non-http scheme —
// index.html now escapes and scheme-checks again before rendering (defense
// in depth), but rejecting it here means it never even reaches the database.
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
// Where new-submission alerts go — see the setup note on notifySubmission().
const NOTIFY_EMAIL = process.env.SUBMISSION_NOTIFY_EMAIL || "jody@sentientproductions.com";

function escapeHtmlForEmail(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Best-effort email alert so a new submission doesn't just sit silently in
// the moderation queue until someone remembers to open /admin.html. This is
// a convenience notification, not a required pipeline step: if RESEND_API_KEY
// isn't set yet, or the send fails, the submission itself still succeeds —
// notifySubmission() only ever logs and swallows its own errors.
//
// One-time setup: sign up free at resend.com using jody@sentientproductions.com
// as the account's own login/owner email, create an API key, add it to
// Vercel as RESEND_API_KEY. No domain verification needed as long as alerts
// keep going to that same address — Resend's shared "onboarding@resend.dev"
// sender can only send to the account's own verified (signup) email until a
// custom domain is added. If the Resend account was instead signed up under
// a different address, alerts to jody@sentientproductions.com will silently
// fail (notifySubmission() swallows its own errors) until either the
// account's owner email matches this one, or a custom domain is verified.
async function notifySubmission(row) {
  if (!RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "313.events <onboarding@resend.dev>",
        to: [NOTIFY_EMAIL],
        subject: `New event submission: ${row.title}`,
        html: `
          <p><b>${escapeHtmlForEmail(row.title)}</b> — ${escapeHtmlForEmail(row.category)}</p>
          <p>${escapeHtmlForEmail(row.start_date)}${row.time_display ? " · " + escapeHtmlForEmail(row.time_display) : ""}</p>
          <p>Venue: ${escapeHtmlForEmail(row.venue_name_raw)}</p>
          <p>Submitted by: ${escapeHtmlForEmail(row.submitter_org_name)} (${escapeHtmlForEmail(row.submitter_email)})</p>
          ${row.description ? `<p>${escapeHtmlForEmail(row.description)}</p>` : ""}
          <p><a href="https://313.events/admin.html">Review in the admin queue &rarr;</a></p>
        `,
      }),
    });
  } catch (err) {
    console.error("notifySubmission failed:", err.message);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Submissions are not configured yet (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const {
    title, category, description, imageUrl, startDate, endDate, startTime,
    recurring, venue, address, venueTba, admission, price, ticketUrl,
    orgName, contactEmail,
  } = body;

  // Server-side validation — never trust the client, even our own form.
  const errors = [];
  if (!title || typeof title !== "string" || !title.trim()) errors.push("title is required");
  if (!VALID_CATEGORIES.has(category)) errors.push("a valid category is required");
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.push("a valid startDate (YYYY-MM-DD) is required");
  if (!venue || typeof venue !== "string" || !venue.trim()) errors.push("venue is required");
  if (!orgName || typeof orgName !== "string" || !orgName.trim()) errors.push("orgName is required");
  if (!isValidEmail(contactEmail)) errors.push("a valid contactEmail is required");
  if (!isSafeHttpUrl(ticketUrl)) errors.push("ticketUrl must be a valid http(s) link");
  if (!isSafeHttpUrl(imageUrl)) errors.push("imageUrl must be a valid http(s) link");

  if (errors.length) {
    res.status(400).json({ error: "Invalid submission: " + errors.join("; ") });
    return;
  }

  const isFree = admission === "free";
  const priceFrom = admission === "paid" && price ? parseFloat(price) : null;

  const row = {
    title: title.trim(),
    description: description || null,
    category,
    venue_name_raw: venueTba ? `${venue.trim()} (address TBA)` : venue.trim(),
    start_date: startDate,
    end_date: endDate || null,
    time_display: formatTimeDisplay(startTime),
    is_recurring: !!recurring,
    is_free: isFree,
    price_from: Number.isFinite(priceFrom) ? priceFrom : null,
    ticket_url: ticketUrl || null,
    image_url: imageUrl || null,
    source: "Venue Submission",
    status: "pending_review",
    submitter_org_name: orgName.trim(),
    submitter_email: contactEmail.trim(),
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      res.status(502).json({ error: "Database rejected the submission: " + errText });
      return;
    }

    const [inserted] = await resp.json();
    await notifySubmission(row);
    res.status(201).json({ ok: true, id: inserted && inserted.id, status: "pending_review" });
  } catch (err) {
    res.status(500).json({ error: "Submission failed: " + err.message });
  }
};
