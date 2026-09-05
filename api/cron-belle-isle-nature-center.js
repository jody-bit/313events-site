const crypto = require("crypto");
// Vercel Cron job — pulls Belle Isle Nature Center's own programming from
// the WordPress "The Events Calendar" plugin's public JSON REST API.
// Verified live before writing: belleislenaturecenter.org/wp-json/tribe/events/v1/events
// returns real, current events with clean field names. Unlike WDET, this
// site's `venue`/`organizer` fields come back as empty arrays `[]` rather
// than nested objects — every event on this feed is Belle Isle Nature
// Center's own programming, so no venue filter is needed the way WDET
// needed one to exclude travel packages.
//
// Small venue — usually only a handful of upcoming events at any time.
// That's expected, not a sign of a broken scraper.

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


const API_URL = "https://belleislenaturecenter.org/wp-json/tribe/events/v1/events?per_page=50";
const VENUE_NAME = "Belle Isle Nature Center";
const DEFAULT_STATUS = "approved";

function formatTimeRange(startDate, endDate) {
  try {
    const start = new Date(startDate.replace(" ", "T"));
    const end = endDate ? new Date(endDate.replace(" ", "T")) : null;
    const fmt = (d) => {
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, "0");
      const ap = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      return `${h}:${m} ${ap}`;
    };
    if (end && end.getTime() !== start.getTime()) return `${fmt(start)} – ${fmt(end)}`;
    return fmt(start);
  } catch {
    return null;
  }
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// WordPress's Tribe Events REST API returns title/description already
// HTML-entity-encoded (the same "rendered" behavior as core WP's REST API),
// e.g. a raw "&#038;" instead of "&" — undecoded, that leaks straight
// through to the live site as literal entity text. Numeric decoding
// (decimal and hex) is generic, so nothing needs to be added to a
// hand-picked list as new entities show up.
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

  let data;
  try {
    const r = await fetch(API_URL, { headers: { "User-Agent": "313.events event calendar" } });
    if (!r.ok) {
      res.status(200).json({ upserted: 0, error: `Fetch failed: HTTP ${r.status}` });
      return;
    }
    data = await r.json();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Fetch failed: " + err.message });
    return;
  }

  const events = Array.isArray(data.events) ? data.events : [];

  const rows = events
    .filter((e) => e.start_date)
    .map((e) => ({
      external_id: `bink-${e.id}`,
      title: decodeEntities(e.title),
      description: decodeEntities(stripHtml(e.description)).slice(0, 500) || null,
      category: "family",
      venue_name_raw: VENUE_NAME,
      start_date: e.start_date.slice(0, 10),
      time_display: formatTimeRange(e.start_date, e.end_date),
      is_free: !e.cost || /free/i.test(e.cost),
      ticket_url: e.url || null,
      source: "Belle Isle Nature Center",
    }));

  if (!rows.length) {
    res.status(200).json({ upserted: 0, fetchedAt: new Date().toISOString() });
    return;
  }

  try {
    // Look up each row's current status before writing, so an admin's
    // approve/reject decision on an existing row isn't reset to
    // DEFAULT_STATUS by this merge-duplicates upsert. Belle Isle Nature
    // Center wasn't in the original bug report's file list, but it has the
    // exact same hardcoded-status-in-upsert pattern, so it needed the same
    // 2026-09-02 fix — see cron-lagerhouse.js's header comment for the full
    // story.
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
    res.status(200).json({ upserted: rowsWithStatus.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
