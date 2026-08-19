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
  "family", "fest", "food", "film", "nightlife",
]);

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    time_display: startTime || null,
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
    res.status(201).json({ ok: true, id: inserted && inserted.id, status: "pending_review" });
  } catch (err) {
    res.status(500).json({ error: "Submission failed: " + err.message });
  }
};
