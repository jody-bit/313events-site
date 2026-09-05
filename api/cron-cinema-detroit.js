const crypto = require("crypto");
// Vercel Cron job — pulls Cinema Detroit's screenings from WordPress's core
// REST API (wp/v2/pages). Cinema Detroit (cinemadetroit.org) runs Divi, not
// a calendar plugin — there's no /wp-json/tribe/* namespace and no `event`
// post type. Each individual film/screening is instead hand-published as an
// ordinary WordPress `page`, with the date/time buried as plain text inside
// Divi Builder shortcode markup (e.g. "Saturday, May 9, 2026 | 3:30 p.m."
// inside a heading shortcode). This scrapes that core `pages` endpoint —
// still a real, documented, unauthenticated WP API, just not a purpose-
// built events one — and regexes the date/time out of the rendered content.
//
// ** LOW CONFIDENCE, VERIFY BEFORE TRUSTING **
// At the time this was written, every published page on this endpoint was
// already in the past relative to today — either Cinema Detroit hadn't
// posted anything newer yet, or current listings live somewhere this
// scraper doesn't reach (e.g. a Zeffy embed or social-only announcement).
// That means this may upsert 0 rows for a while, which is expected/fails
// soft, not a bug — but it's worth an occasional manual check against
// https://cinemadetroit.org to confirm this is still the right approach.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

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


const API_URL = "https://cinemadetroit.org/wp-json/wp/v2/pages?per_page=100&status=publish";
const VENUE_NAME = "Cinema Detroit";
const DEFAULT_STATUS = "approved";

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6,
  august: 7, september: 8, october: 9, november: 10, december: 11,
};

// "Saturday, May 9, 2026 | 3:30 p.m."  or  "Friday, January 16, 2026 at 7:00 p.m."
const DATE_TIME = /(?:[A-Za-z]+day,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s*(?:\||at)\s*(\d{1,2}:\d{2}\s*[ap]\.?m\.?))?/i;

// Decodes HTML entities in scraped/WP-API text. The previous version only
// handled &amp;/&#8217;/&nbsp; by name, which missed common WordPress
// numeric entities like &#038; (its usual encoding of "&" — WP's REST API
// returns title.rendered already entity-encoded, so this matters even for
// the title itself, not just the scraped body text). Numeric decoding
// (decimal and hex) is handled generically here so nothing needs to be
// added to a hand-picked list again.
function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripToText(html) {
  return decodeEntities(
    (html || "")
      .replace(/\[[^\]]*\]/g, " ") // Divi shortcodes
      .replace(/<[^>]+>/g, "\n")
  );
}

function parsePage(page) {
  const title = page.title && page.title.rendered ? decodeEntities(page.title.rendered.trim()) : null;
  if (!title) return null;

  const text = stripToText(page.content && page.content.rendered);
  const match = text.match(DATE_TIME);
  if (!match) return null;

  const monthIdx = MONTHS[match[1].toLowerCase()];
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (monthIdx === undefined || !day || !year) return null;

  return {
    external_id: `cinemadetroit-${page.id}`,
    title,
    start_date: `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    time_display: match[4] || null,
  };
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
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  let pages;
  try {
    const r = await fetch(API_URL, { headers: { "User-Agent": "313.events event calendar" } });
    if (!r.ok) {
      res.status(200).json({ upserted: 0, error: `Fetch failed: HTTP ${r.status}` });
      return;
    }
    pages = await r.json();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Fetch failed: " + err.message });
    return;
  }

  if (!Array.isArray(pages)) {
    res.status(200).json({ upserted: 0, error: "Unexpected API response shape" });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const parsed = pages.map(parsePage).filter((e) => e && e.start_date >= today);

  if (!parsed.length) {
    res.status(200).json({ upserted: 0, checked: pages.length, note: "No upcoming screenings found — see LOW CONFIDENCE note in source.", fetchedAt: new Date().toISOString() });
    return;
  }

  const rawRows = parsed.map((e) => ({
    external_id: e.external_id,
    title: e.title,
    category: "film",
    venue_name_raw: VENUE_NAME,
    start_date: e.start_date,
    time_display: e.time_display,
    is_free: false,
    source: "Cinema Detroit",
  }));

  // De-dupe by external_id before sending — Postgres's ON CONFLICT DO UPDATE
  // can't touch the same target row twice in one statement, so one duplicate
  // pair would otherwise fail the entire batch instead of just that pair.
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  try {
    // Look up each row's current status before writing, so an admin's
    // approve/reject decision on an existing row isn't reset to
    // DEFAULT_STATUS by this merge-duplicates upsert. 2026-09-02 fix for the
    // status-clobbering bug — see cron-lagerhouse.js's header comment for
    // the full story.
    const idList = rows.map((r) => r.external_id).join(",");
    const existingStatusByExternalId = new Map();
    try {
      const lookupResp = await fetch(
        `${SUPABASE_URL}/rest/v1/events?external_id=in.(${idList})&select=external_id,status`,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      if (lookupResp.ok) {
        const existingRows = await lookupResp.json();
        if (Array.isArray(existingRows)) {
          existingRows.forEach((row) => existingStatusByExternalId.set(row.external_id, row.status));
        }
      }
    } catch {
      // Lookup failed — fall through with an empty map, same as this
      // scraper's first-ever run.
    }
    const rowsWithStatus = rows.map((row) => ({
      ...row,
      status: existingStatusByExternalId.get(row.external_id) || DEFAULT_STATUS,
    }));

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rowsWithStatus),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    res.status(200).json({ upserted: rowsWithStatus.length, checked: pages.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
