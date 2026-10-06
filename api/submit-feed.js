// Vercel serverless function — receives self-service "submit your event
// feed" registrations from submit.html's second form and inserts them into
// Supabase's feed_sources table as status='pending_review'.
//
// Distinct from api/submit.js (one event at a time): this registers an
// ONGOING feed URL — originally iCalendar (.ics) only; as of migration_044
// (2026-10-03) also 'rss' (polled best-effort, see api/cron-feeds.js) and
// 'manual' (no feed at all — just a link for a human to follow up on, see
// VALID_FEED_FORMATS below) — that api/cron-feeds.js will poll (or, for
// 'manual', deliberately never poll) once a human approves it via
// admin.html. See migration_008_feed_sources.sql for why this needs its
// own approval gate instead of landing straight in `events` the way a
// single submission does: approving a FEED is a standing trust decision
// ("keep pulling from this URL forever"), not a one-time content decision.
//
// Uses the SERVICE ROLE key (server-side only, set in Vercel Environment
// Variables) for the same reasons api/submit.js does: basic server-side
// validation, and hard-coding status regardless of what the client sends.

const SUPABASE_URL = process.env.SUPABASE_URL;
// Non-production deployments must never use the production database (api/_lib/environment.js).
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_CATEGORIES = new Set([
  "music", "theatre", "dance", "visual", "museum",
  "family", "fest", "food", "film", "nightlife", "sports",
  // "community" and "vendor" were missing here even after api/submit.js got
  // both (see that file's own comment on "sports"/"vendor") — a feed source
  // registering with either default category would fail this validation
  // even though both are valid values in the database. Fixed 2026-09-02
  // audit, mirroring api/submit.js's whitelist exactly.
  "community", "vendor", "training",
  // "gaming" (migration_036/037, 2026-09-22) was added to api/submit.js's
  // own whitelist the same day but never mirrored here — found 2026-10-03
  // while auditing this file for the RSS/manual intake work below. A feed
  // source registering with defaultCategory: 'gaming' (e.g. a future
  // GottaGacha-style tabletop/esports venue submitting their own feed)
  // would have failed this validation even though it's a real, valid
  // category in the database. Fixed now, mirroring api/submit.js exactly.
  "gaming",
]);

// feed_format now has three legal values (migration_044, 2026-10-03):
//   'ics'    — parsed in full by api/cron-feeds.js (unchanged, v1 since
//              migration_008).
//   'rss'    — now actually polled too, best-effort (see that file's own
//              header for the date-confidence tradeoffs this accepts).
//   'manual' — NOT a feed at all. For a venue/organizer with no calendar
//              export of any kind (the MBMC / Detroit History Tours
//              pattern, 2026-10-03) — feedUrl here is just "a link to
//              where your events are listed" for a human reviewer to look
//              at, never fetched or parsed automatically. Lands in the
//              same admin.html Feed sources queue as ics/rss, but
//              api/cron-feeds.js always skips it (see that file's loop).
const VALID_FEED_FORMATS = new Set(["ics", "rss", "manual"]);

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Only allow http(s) links to be stored at all — same reasoning as
// api/submit.js's isSafeHttpUrl(): rejecting a non-http(s) scheme here means
// it never even reaches the database, on top of index.html's own render-time
// scheme check.
function isSafeHttpUrl(url) {
  if (!url) return false; // feedUrl is required, unlike api/submit.js's optional link fields
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.SUBMISSION_NOTIFY_EMAIL || "jody@sentientproductions.com";

function escapeHtmlForEmail(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Same best-effort, swallow-your-own-errors convention as api/submit.js's
// notifySubmission() — approving a feed starts an ongoing pull, so it's
// arguably worth flagging just as promptly as a single event, but a failed
// alert still shouldn't fail the submission itself.
async function notifyFeedSubmission(row) {
  if (!RESEND_API_KEY) return;
  try {
    // 'manual' gets its own subject/body — it's not "wants to auto-submit
    // via feed" at all, it's "has no feed, needs a human to follow up",
    // same distinction admin.html's card rendering makes (see that file).
    const isManual = row.feed_format === "manual";
    const subject = isManual
      ? `New manual follow-up candidate: ${row.venue_name}`
      : `New event feed submitted: ${row.venue_name}`;
    const intro = isManual
      ? `<p><b>${escapeHtmlForEmail(row.venue_name)}</b> has no calendar feed/export — they're asking to be added to 313.events anyway. This needs a human to follow up (e.g. a one-time manual pull, same pattern as MBMC/Detroit History Tours), not an automated poll.</p>`
      : `<p><b>${escapeHtmlForEmail(row.venue_name)}</b> wants to auto-submit events via feed.</p>`;
    const feedLine = isManual
      ? `<p>Their events page: <a href="${escapeHtmlForEmail(row.feed_url)}">${escapeHtmlForEmail(row.feed_url)}</a></p>`
      : `<p>Feed (${escapeHtmlForEmail(row.feed_format.toUpperCase())}): <a href="${escapeHtmlForEmail(row.feed_url)}">${escapeHtmlForEmail(row.feed_url)}</a></p>`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "313.events <onboarding@resend.dev>",
        to: [NOTIFY_EMAIL],
        subject,
        html: `
          ${intro}
          ${feedLine}
          <p>Default category: ${escapeHtmlForEmail(row.default_category)}</p>
          <p>Submitted by: ${escapeHtmlForEmail(row.contact_email)}</p>
          ${row.website ? `<p>Website: ${escapeHtmlForEmail(row.website)}</p>` : ""}
          ${row.notes ? `<p>${escapeHtmlForEmail(row.notes)}</p>` : ""}
          <p><i>${isManual ? "This is not polled automatically — it will stay in the queue until a human follows up." : "This feed will NOT be polled until approved in the admin queue."}</i></p>
          <p><a href="${require("./_lib/environment").siteUrl()}/admin.html">Review in the admin queue &rarr;</a></p>
        `,
      }),
    });
  } catch (err) {
    console.error("notifyFeedSubmission failed:", err.message);
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

  const { venueName, contactEmail, website, feedUrl, feedFormat, defaultCategory, notes, companyWebsite, elapsedMs } = body;

  // Basic spam/abuse protection — see api/submit.js's identical checks for
  // the full reasoning (2026-09-02 audit fix). Same honeypot field and
  // elapsed-time signal, submitted from this same page's feedForm.
  if (companyWebsite) {
    res.status(200).json({ ok: true, id: null });
    return;
  }
  if (typeof elapsedMs === "number" && elapsedMs >= 0 && elapsedMs < 1200) {
    res.status(400).json({ error: "That went through a little too fast to be a real submission — please wait a moment and try again." });
    return;
  }

  // Server-side validation — never trust the client, even our own form.
  const errors = [];
  if (!venueName || typeof venueName !== "string" || !venueName.trim()) errors.push("venueName is required");
  if (!isValidEmail(contactEmail)) errors.push("a valid contactEmail is required");
  if (!isSafeHttpUrl(feedUrl)) errors.push("feedUrl must be a valid http(s) link");
  if (!VALID_FEED_FORMATS.has(feedFormat)) errors.push("feedFormat must be 'ics', 'rss', or 'manual'");
  if (!VALID_CATEGORIES.has(defaultCategory)) errors.push("a valid defaultCategory is required");
  if (website && !isSafeHttpUrl(website)) errors.push("website must be a valid http(s) link");

  if (errors.length) {
    res.status(400).json({ error: "Invalid submission: " + errors.join("; ") });
    return;
  }

  const row = {
    venue_name: venueName.trim(),
    contact_email: contactEmail.trim(),
    website: website || null,
    feed_url: feedUrl.trim(),
    feed_format: feedFormat,
    default_category: defaultCategory,
    notes: notes || null,
    status: "pending_review",
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/feed_sources`, {
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
      // A duplicate feed_url hits feed_sources_url_key — surface that
      // plainly instead of a raw Postgres constraint-violation string.
      if (resp.status === 409 || /duplicate key/i.test(errText)) {
        res.status(409).json({ error: "This feed URL has already been submitted." });
        return;
      }
      res.status(502).json({ error: "Database rejected the submission: " + errText });
      return;
    }

    const [inserted] = await resp.json();
    await notifyFeedSubmission(row);
    res.status(201).json({ ok: true, id: inserted && inserted.id, status: "pending_review" });
  } catch (err) {
    res.status(500).json({ error: "Submission failed: " + err.message });
  }
};
