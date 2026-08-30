// Vercel serverless function powering admin.html's "Press coverage" section
// — the review queue for editorial_articles rows cron-editorial.js stored
// but couldn't confidently match to an existing event (matched_event_id is
// null). Added 2026-08-28 after Jody pointed out that filtering non-event
// articles out at ingestion (migration_015, cron-editorial.js's
// looksLikeEventCoverage()) only answered half of her original question —
// "if an article DOES mention a real event, can I generate one for it so it
// shows up properly?" — which this file, plus admin.html's new section and
// migration_016's admin_dismissed column, actually implements. Same
// ADMIN_SECRET header-auth pattern as api/admin-events.js and
// api/admin-feeds.js — protected, not public.
//
// GET  /api/admin-editorial
//   -> unmatched, undismissed articles (the review queue), newest first.
//      No further content filtering needed here: every row that reaches
//      this table with matched_event_id null already passed
//      looksLikeEventCoverage() at ingest time (see cron-editorial.js) —
//      that's the "does this look like it's about an event at all" check;
//      this queue is purely "a human hasn't looked at it yet."
//
// POST /api/admin-editorial -> { articleId, action: "create_event" | "dismiss", event? }
//   dismiss:      sets admin_dismissed=true so the article drops out of the
//                 queue for good, without touching matched_event_id (it's
//                 still correctly "unmatched" — it just wasn't worth an
//                 event). Distinct from rejecting an event submission:
//                 there's no event here to reject, just a decision not to
//                 create one.
//   create_event: validates `event` the same way api/submit.js validates a
//                 public submission, inserts it into `events` directly as
//                 status='approved' (unlike submit.js's pending_review —
//                 this IS the review; a second review step would be
//                 pointless when the person clicking the button already is
//                 the moderator), then links the article back to the new
//                 event: matched_event_id = the new event's id,
//                 match_type = 'manual' — the exact case migration_011
//                 reserved that enum value for ("a future admin override")
//                 and cron-editorial.js has never itself set. Once linked,
//                 radar.html's next load renders this as a normal matched
//                 card (event-first, "As seen in" style) instead of the
//                 "Not yet linked to a listed event" unmatched card — no
//                 separate radar.html change needed, its query already
//                 joins on matched_event_id.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Same 13-category taxonomy as radar.html's CATS / schema.sql's
// event_category enum (music/theatre/dance/visual/museum/family/fest/food/
// film/nightlife/community/sports/vendor) — kept as its own literal list
// rather than imported, same one-file-per-endpoint convention as every other
// api/*.js in this project. api/submit.js's own VALID_CATEGORIES list was
// separately missing "sports" (a pre-existing gap noted in that file); now
// fixed there too as of the same 2026-08-30 change that added "vendor" here.
const VALID_CATEGORIES = new Set([
  "music", "theatre", "dance", "visual", "museum", "family",
  "fest", "food", "film", "nightlife", "community", "sports", "vendor",
]);

function isSafeHttpUrl(url) {
  if (!url) return true; // optional fields
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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
      const url = `${SUPABASE_URL}/rest/v1/editorial_articles?matched_event_id=is.null&admin_dismissed=eq.false&select=id,source,title,excerpt,url,thumbnail_url,published_at&order=published_at.desc&limit=100`;
      const resp = await fetch(url, { headers: sbHeaders });
      const rows = await resp.json();
      res.status(resp.ok ? 200 : 502).json(resp.ok ? { articles: rows } : { error: rows });
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
    const { articleId, action } = body;

    if (!articleId || !["create_event", "dismiss"].includes(action)) {
      res.status(400).json({ error: "Body must include { articleId, action: 'create_event'|'dismiss' }" });
      return;
    }

    if (action === "dismiss") {
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/editorial_articles?id=eq.${encodeURIComponent(articleId)}`, {
          method: "PATCH",
          headers: { ...sbHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ admin_dismissed: true }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          res.status(502).json({ error: "Database rejected the dismiss: " + errText });
          return;
        }
        res.status(200).json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    // action === "create_event"
    const ev = body.event || {};
    const {
      title, category, description, venue, city, startDate, endDate,
      timeDisplay, isFree, priceFrom, ticketUrl, imageUrl,
    } = ev;

    const errors = [];
    if (!title || typeof title !== "string" || !title.trim()) errors.push("title is required");
    if (!VALID_CATEGORIES.has(category)) errors.push("a valid category is required");
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.push("a valid startDate (YYYY-MM-DD) is required");
    if (!venue || typeof venue !== "string" || !venue.trim()) errors.push("venue is required");
    if (!isSafeHttpUrl(ticketUrl)) errors.push("ticketUrl must be a valid http(s) link");
    if (!isSafeHttpUrl(imageUrl)) errors.push("imageUrl must be a valid http(s) link");
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) errors.push("endDate must be YYYY-MM-DD if provided");

    if (errors.length) {
      res.status(400).json({ error: "Invalid event: " + errors.join("; ") });
      return;
    }

    const parsedPrice = priceFrom ? parseFloat(priceFrom) : null;
    const row = {
      title: title.trim(),
      description: description || null,
      category,
      venue_name_raw: venue.trim(),
      venue_city_raw: city && city.trim() ? city.trim() : null,
      start_date: startDate,
      end_date: endDate || null,
      time_display: timeDisplay || null,
      is_free: !!isFree,
      price_from: Number.isFinite(parsedPrice) ? parsedPrice : null,
      ticket_url: ticketUrl || null,
      image_url: imageUrl || null,
      // Distinct from cron-editorial.js's own `source` field on
      // editorial_articles (the outlet name, e.g. "Metro Times") — this is
      // events.source, which every other event-creation path in this
      // project also sets to describe HOW the event entered the database
      // (see submit.js's 'Venue Submission', the various crons' outlet
      // names). "Editorial Review" makes it visible in admin.html's "Live
      // events" search / source column that this one started life as a
      // press-coverage article Jody turned into an event by hand, not a
      // public submission or an automated feed.
      source: "Editorial Review",
      status: "approved",
    };

    try {
      const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: "POST",
        headers: { ...sbHeaders, Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      if (!insertResp.ok) {
        const errText = await insertResp.text();
        res.status(502).json({ error: "Database rejected the new event: " + errText });
        return;
      }
      const [inserted] = await insertResp.json();

      // Link the article back to the event it was reviewed for. Best-effort
      // in the sense that a failure here still leaves a real, live event on
      // the site (the more important half of this action) — it just means
      // this one article keeps showing in the queue and would need a manual
      // retry, rather than the whole action rolling back. Supabase/Postgres
      // has no cross-table transaction available over plain REST here, same
      // constraint every other multi-step write in this project already
      // works within (e.g. cron-editorial.js's own upsert-then-count flow).
      const linkResp = await fetch(`${SUPABASE_URL}/rest/v1/editorial_articles?id=eq.${encodeURIComponent(articleId)}`, {
        method: "PATCH",
        headers: { ...sbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ matched_event_id: inserted.id, match_type: "manual" }),
      });
      const linked = linkResp.ok;

      res.status(201).json({ ok: true, event: inserted, linked });
    } catch (err) {
      res.status(500).json({ error: "Failed to create event: " + err.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
