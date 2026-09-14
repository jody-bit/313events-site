const crypto = require("crypto");
// Vercel Cron job — auto-posts newly-approved events to 313.events' own
// Facebook Page feed. Added 2026-09-14 (Jody: "what if people posted their
// events on 313 and then it auto published to Facebook so they can come to
// one place and publish everywhere").
//
// WHY THIS POSTS TO THE PAGE FEED, NOT A NATIVE FACEBOOK "EVENT" — Meta
// closed off event creation on the Graph API to the general public years
// ago; making a real Facebook Event object programmatically requires being
// an approved "Official Events API" partner (a formal, gated application —
// not something available to a small site just by requesting a permission).
// Posting to a Page's own feed is a completely different, much more open
// capability: it only needs the `pages_manage_posts` permission, granted
// through normal Meta App Review + Business Verification (something Jody
// can do herself in Meta Business Suite — see FACEBOOK_SETUP.md). So this
// posts each event as a regular Page post with a link back to its
// 313.events page, rather than a Facebook Event RSVP object.
//
// WHY THE LINK PREVIEW WILL LOOK RIGHT — api/event-meta.js (added the same
// day as this file, same conversation) already serves real per-event
// og:title/og:description/og:image tags for event.html?id=... URLs. Meta's
// own crawler reads those exact tags to build the Page-post link card, so
// this file doesn't need to upload an image itself — passing `link` is
// enough and the preview card will show the event's own flyer/photo.
//
// WHY THIS IS A CRON, NOT TRIGGERED DIRECTLY FROM admin.html'S APPROVE
// BUTTON — keeps this decoupled from the moderation UI (same reasoning as
// every other cron in this project): if Facebook's API is slow, down, or
// this file has a bug, it can never block or break approving an event.
// Worst case a post is merely late by up to an hour, never lost — the
// `facebook_posted_at is null` filter below picks up anything not yet
// posted on every run, same idempotent-catch-up pattern cron-metrotimes.js
// uses for its own external_id upsert.
//
// SAFETY: NO_OP UNTIL CONFIGURED — exactly like every other cron here, this
// silently returns 200 with a "not configured" note if its env vars aren't
// set yet. Safe to deploy and schedule right now, before Jody has finished
// Facebook's app-review process; it starts actually posting the moment
// FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN exist in Vercel.
//
// SAFETY: BATCH CAP + DRY RUN — the first real run after this goes live
// could otherwise find every already-approved future event at once and
// post a spammy burst to the Page in one shot. POST_LIMIT caps each run,
// and a manual GET with ?dryRun=1 (still requires the CRON_SECRET) reports
// exactly what WOULD be posted — titles, dates, count — without posting
// anything, so Jody can sanity-check before ever letting it write live.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const GRAPH_API_VERSION = "v21.0";
const SITE_URL = "https://313.events";
const POST_LIMIT = 8; // per-run cap — see SAFETY note above

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

function formatDate(isoDate) {
  // start_date is a plain date (YYYY-MM-DD); parse as UTC-noon to dodge
  // local-timezone-off-by-one when formatting, same trick used elsewhere
  // in this codebase for date-only values.
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatPrice(event) {
  if (event.is_free) return "Free";
  if (event.price_from != null) return `From $${Number(event.price_from).toFixed(2).replace(/\.00$/, "")}`;
  return null;
}

function buildMessage(event) {
  const lines = [event.title];
  const venueLine = [event.venue_name_raw, formatDate(event.start_date), event.time_display]
    .filter(Boolean)
    .join(" · ");
  if (venueLine) lines.push(venueLine);
  const price = formatPrice(event);
  if (price) lines.push(price);
  lines.push("", `Details: ${SITE_URL}/event.html?id=${event.id}`);
  return lines.join("\n");
}

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ posted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }
  if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_ACCESS_TOKEN) {
    // Expected, safe no-op until Jody finishes Facebook's app review —
    // see FACEBOOK_SETUP.md. Not an error.
    console.log("[cron-post-to-facebook] FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN not set yet — no-op");
    res.status(200).json({ posted: 0, note: "Facebook not configured yet — see FACEBOOK_SETUP.md" });
    return;
  }

  const dryRun = req.query && (req.query.dryRun === "1" || req.query.dryRun === "true");
  const today = new Date().toISOString().slice(0, 10);

  let events;
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/events?status=eq.approved&facebook_posted_at=is.null` +
      `&start_date=gte.${today}&order=created_at.asc&limit=${POST_LIMIT}` +
      `&select=id,title,venue_name_raw,start_date,time_display,is_free,price_from`;
    const resp = await fetch(url, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[cron-post-to-facebook] Supabase query failed: ${errText}`);
      res.status(502).json({ posted: 0, error: "Supabase query failed: " + errText });
      return;
    }
    events = await resp.json();
  } catch (err) {
    console.error(`[cron-post-to-facebook] Supabase query threw: ${err.message}`);
    res.status(500).json({ posted: 0, error: err.message });
    return;
  }

  console.log(`[cron-post-to-facebook] candidates=${events.length} dryRun=${dryRun}`);

  if (dryRun) {
    res.status(200).json({
      dryRun: true,
      wouldPost: events.length,
      events: events.map((e) => ({ id: e.id, title: e.title, start_date: e.start_date })),
    });
    return;
  }

  let posted = 0;
  const errors = [];
  for (const event of events) {
    try {
      const message = buildMessage(event);
      const fbResp = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${FACEBOOK_PAGE_ID}/feed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            link: `${SITE_URL}/event.html?id=${event.id}`,
            access_token: FACEBOOK_PAGE_ACCESS_TOKEN,
          }),
        }
      );
      const fbJson = await fbResp.json();
      if (!fbResp.ok || !fbJson.id) {
        const errMsg = (fbJson.error && fbJson.error.message) || JSON.stringify(fbJson);
        console.error(`[cron-post-to-facebook] FB post failed for ${event.id} (${event.title}): ${errMsg}`);
        errors.push({ id: event.id, title: event.title, error: errMsg });
        continue; // one bad post never blocks the rest of the batch
      }

      const patchResp = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${event.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ facebook_post_id: fbJson.id, facebook_posted_at: new Date().toISOString() }),
      });
      if (!patchResp.ok) {
        const errText = await patchResp.text();
        // Posted successfully but failed to record it — flag loudly, since
        // the next run would otherwise post this same event again.
        console.error(
          `[cron-post-to-facebook] POSTED to Facebook (id=${fbJson.id}) but failed to save facebook_post_id for event ${event.id}: ${errText}`
        );
        errors.push({ id: event.id, title: event.title, error: "Posted but failed to record — will re-post next run: " + errText });
        continue;
      }
      posted++;
    } catch (err) {
      console.error(`[cron-post-to-facebook] unexpected error for ${event.id} (${event.title}): ${err.message}`);
      errors.push({ id: event.id, title: event.title, error: err.message });
    }
  }

  console.log(`[cron-post-to-facebook] posted=${posted} checked=${events.length} errors=${errors.length}`);
  res.status(200).json({ posted, checked: events.length, errors, fetchedAt: new Date().toISOString() });
};
