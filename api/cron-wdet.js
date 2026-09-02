// Vercel Cron job — pulls Detroit-area events from WDET's public events
// calendar (wdet.org), which runs on the WordPress "The Events Calendar"
// plugin and exposes a real, documented JSON REST API — no HTML scraping
// needed. WDET's calendar includes both their own programming and
// community/partner events happening at other Detroit venues, plus WDET
// Travel packages (international trips) which are filtered out below since
// they aren't Detroit events at all.
//
// Verified live against wdet.org/wp-json/tribe/events/v1/events before
// writing this — confirmed field names, and confirmed travel-package
// entries have no venue attached, which is what the filter below relies on.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const API_URL = "https://wdet.org/wp-json/tribe/events/v1/events?per_page=50";
const ALLOWED_CITIES = ["detroit", "hamtramck", "highland park"];
const DEFAULT_STATUS = "approved";

// WDET/Tribe category names -> this calendar's category keys.
// Unrecognized categories are excluded rather than guessed at.
const CATEGORY_MAP = {
  comedy: "theatre",
  concert: "music",
  music: "music",
  food: "food",
  film: "film",
  art: "visual",
  "visual art": "visual",
  dance: "dance",
  family: "family",
  festival: "fest",
  museum: "museum",
  theatre: "theatre",
  theater: "theatre",
};

// WordPress's Tribe Events REST API returns title/venue name already
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

function mapCategory(categories) {
  if (!Array.isArray(categories)) return null;
  for (const c of categories) {
    const name = (c && (c.name || c.slug) || "").toLowerCase();
    if (CATEGORY_MAP[name]) return CATEGORY_MAP[name];
  }
  return null;
}

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

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${CRON_SECRET}`) {
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
    const r = await fetch(API_URL, { headers: { "User-Agent": "313events.com event calendar" } });
    if (!r.ok) {
      res.status(200).json({ upserted: 0, error: `WDET API fetch failed: HTTP ${r.status}` });
      return;
    }
    data = await r.json();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "WDET API fetch failed: " + err.message });
    return;
  }

  const events = Array.isArray(data.events) ? data.events : [];

  const rows = events
    .map((e) => {
      const venue = e.venue && e.venue.venue ? e.venue : null; // Tribe nests venue fields inside e.venue
      const venueName = venue ? venue.venue : null;
      const venueCity = venue && venue.city ? venue.city.toLowerCase() : "";

      // Travel packages and any other event with no real Detroit-area venue
      // are excluded here — this is the main filter that keeps international
      // trips and other non-local content off the calendar.
      if (!venueName || !ALLOWED_CITIES.includes(venueCity)) return null;

      const cat = mapCategory(e.categories);
      if (!cat) return null;

      if (!e.start_date) return null;
      const startDate = e.start_date.slice(0, 10); // "YYYY-MM-DD HH:MM:SS" -> date part

      return {
        external_id: `wdet-${e.id}`,
        title: decodeEntities(e.title),
        category: cat,
        venue_name_raw: decodeEntities(venueName),
        start_date: startDate,
        time_display: formatTimeRange(e.start_date, e.end_date),
        is_free: /free/i.test(e.cost || "") || !e.cost,
        price_from: null,
        ticket_url: e.url || null,
        source: "WDET",
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    res.status(200).json({ upserted: 0, fetchedAt: new Date().toISOString() });
    return;
  }

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
    res.status(200).json({ upserted: rowsWithStatus.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
