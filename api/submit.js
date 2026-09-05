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
  // "sports" was flagged here as a pre-existing gap (valid in the database
  // since migration_007, but missing from this whitelist, so a public
  // submitter picking Sports would fail server-side validation) — fixed now
  // since this edit already needed to touch this exact list for "vendor".
  "sports",
  // "vendor" (2026-08-30, migration_018): Vendor Markets — flea markets,
  // craft/holiday markets, oddities markets.
  "vendor",
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

// submit.html's price field is free text (placeholder literally suggests
// "e.g. $15–25, or 18+"), but a bare `parseFloat(price)` chokes on almost
// every shape that placeholder itself invites: parseFloat("$15–25") is NaN
// because parseFloat requires the string to START with a valid number — a
// leading "$" (or an en-dash range, "18+", "$15 - $25", etc.) breaks it
// outright. NaN then silently serializes to `null` in the JSON body sent to
// Supabase, so a submitter who typed a price by following the field's own
// example had it silently discarded. This pulls the first numeric amount
// out of the string instead (so "$15–25" and "15-25" both correctly become
// 15, the "from" price), same low price-from-a-range as
// api/cron-lagerhouse.js's own parsePrice() already does for scraped prices.
// Genuinely unparseable text (e.g. "TBD") still correctly falls through to
// null rather than guessing. 2026-09-02 audit fix.
function parsePriceFrom(input) {
  if (input === null || input === undefined) return null;
  const str = String(input).trim();
  if (!str) return null;
  const m = str.match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
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
    recurring, venue, address, venueTba, admission, price, ticketUrl, eventUrl,
    orgName, contactEmail, companyWebsite, elapsedMs,
  } = body;

  // ---- Basic spam/abuse protection (2026-09-02 audit fix) ----
  // No Redis/KV in this stack for real per-IP rate limiting, so this is two
  // lightweight, no-infrastructure checks instead of nothing at all:
  //
  // 1. Honeypot: companyWebsite is a hidden field on submit.html that no
  //    real visitor can see or reach (off-screen, aria-hidden, no tab stop)
  //    — a form-filling bot that blindly populates every input on the page
  //    fills it anyway. Any value here means this is essentially certainly
  //    a bot, so we respond as if it succeeded (skip the DB insert and the
  //    email alert) rather than returning an error that would tell an
  //    automated client what tripped it and invite it to adapt.
  if (companyWebsite) {
    res.status(200).json({ ok: true, id: null });
    return;
  }
  // 2. Elapsed time: pageLoadedAt is recorded in submit.html the moment the
  //    page loads; elapsedMs is how long the visitor's browser says it took
  //    from then until this exact submit. Filling in a title, category,
  //    date, venue, and contact email cannot happen in a few hundred
  //    milliseconds — a script that finds the form and posts straight to it
  //    can. Unlike the honeypot, a real (if very fast) human could
  //    plausibly trip this, so this gets a genuine, retryable error instead
  //    of a silent fake-success — a real submitter who hits it can just
  //    submit again a moment later.
  if (typeof elapsedMs === "number" && elapsedMs >= 0 && elapsedMs < 1200) {
    res.status(400).json({ error: "That went through a little too fast to be a real submission — please wait a moment and try again." });
    return;
  }

  // Server-side validation — never trust the client, even our own form.
  const errors = [];
  if (!title || typeof title !== "string" || !title.trim()) errors.push("title is required");
  if (!VALID_CATEGORIES.has(category)) errors.push("a valid category is required");
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.push("a valid startDate (YYYY-MM-DD) is required");
  // endDate is optional (single-day events leave it blank) but if it's set
  // it has to be a real date on or after startDate — the submit.html picker
  // for it is a totally independent field with no built-in tie to startDate,
  // so nothing stopped a submitter from landing on the wrong day before this
  // check existed. Caught 2026-08-29: "Fleatroit Junk City" got submitted
  // with end_date one day *before* its own start_date, sitting silently in
  // the database (see migration_017, which cleans up that specific row and
  // any others like it — this check is what stops new ones from happening).
  // ISO "YYYY-MM-DD" strings compare correctly with plain < on purpose —
  // lexical order matches chronological order for this format, no Date
  // parsing needed.
  if (endDate) {
    if (typeof endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      errors.push("endDate must be a valid date (YYYY-MM-DD)");
    } else if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && endDate < startDate) {
      errors.push("endDate can't be before startDate");
    }
  }
  if (!venue || typeof venue !== "string" || !venue.trim()) errors.push("venue is required");
  if (!orgName || typeof orgName !== "string" || !orgName.trim()) errors.push("orgName is required");
  if (!isValidEmail(contactEmail)) errors.push("a valid contactEmail is required");
  if (!isSafeHttpUrl(ticketUrl)) errors.push("ticketUrl must be a valid http(s) link");
  if (!isSafeHttpUrl(eventUrl)) errors.push("eventUrl must be a valid http(s) link");
  if (!isSafeHttpUrl(imageUrl)) errors.push("imageUrl must be a valid http(s) link");

  if (errors.length) {
    res.status(400).json({ error: "Invalid submission: " + errors.join("; ") });
    return;
  }

  const isFree = admission === "free";
  const priceFrom = admission === "paid" && price ? parsePriceFrom(price) : null;

  const row = {
    title: title.trim(),
    description: description || null,
    category,
    venue_name_raw: venueTba ? `${venue.trim()} (address TBA)` : venue.trim(),
    // 2026-09-04 fix — this form has always had a "Street address" field,
    // but this row never actually saved it: `address` was destructured
    // from the request body above and then silently discarded. See
    // migration_020_venue_address_raw.sql for the full story.
    venue_address_raw: address && address.trim() ? address.trim() : null,
    start_date: startDate,
    end_date: endDate || null,
    time_display: formatTimeDisplay(startTime),
    is_recurring: !!recurring,
    is_free: isFree,
    price_from: Number.isFinite(priceFrom) ? priceFrom : null,
    ticket_url: ticketUrl || null,
    // Separate from ticket_url on purpose — see migration_022_event_url.sql.
    // A submitter who pastes the exact same link into both boxes shouldn't
    // get it stored twice just to be de-duped again at render time, so drop
    // it here if it's identical to what's already going into ticket_url.
    event_url: eventUrl && eventUrl !== ticketUrl ? eventUrl : null,
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
