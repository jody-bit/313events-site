// Vercel Cron job — scrapes the Redford Theatre's own events archive page
// (redfordtheatre.com/events/). WordPress + Elementor, no calendar plugin
// REST API (confirmed: no /wp-json/tribe/* namespace, no `event` post type
// in the WP REST index) and no JSON-LD found — plain HTML scrape.
//
// Confirmed structure from a real fetch of the /events/ archive page: each
// listing renders as a title, then a line shaped like one of:
//   "Saturday, August 22nd at 6:30 PM"
//   "Friday, August 28 at 8:00 PM"                    (no ordinal suffix)
//   "Friday, September 18 - Sunday, September 20, 2026" (multi-day, no time)
// Year is often omitted on single-date lines — inferred as the nearest
// future occurrence, same approach as the Metro Times scraper.
//
// ** BEST-EFFORT ** — built from real fetched text, but the exact DOM
// structure (which element holds the title vs. the date line) couldn't be
// directly inspected in this environment. Spot-check the first live run
// against https://redfordtheatre.com/events/ before trusting it long-term.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const SOURCE_URL = "https://redfordtheatre.com/events/";
const VENUE_NAME = "Redford Theatre";

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6,
  august: 7, september: 8, october: 9, november: 10, december: 11,
};

const DATE_LINE = /^[A-Za-z]+day,?\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?(?:\s*[-–]\s*[A-Za-z]+day,?\s+[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*(\d{4})?)?(?:\s+at\s+(\d{1,2}:\d{2}\s*[AP]M))?/i;
const NOISE_LINE = /^(home|about|events|calendar|tickets?|buy tickets|donate|history|organ|membership|volunteer|contact|newsletter|subscribe|instagram|facebook|copyright|all rights reserved)/i;

function htmlToLines(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|article|section)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&#8217;/g, "’").replace(/&nbsp;/g, " ");
  return text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function nextOccurrenceOf(monthIdx, day, explicitYear) {
  if (explicitYear) return new Date(parseInt(explicitYear, 10), monthIdx, day);
  const now = new Date();
  let year = now.getFullYear();
  let candidate = new Date(year, monthIdx, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3)) {
    candidate = new Date(year + 1, monthIdx, day);
  }
  return candidate;
}

function parseRedfordEvents(html) {
  const lines = htmlToLines(html);
  const events = [];
  let pendingTitle = null;

  for (const line of lines) {
    const dateMatch = line.match(DATE_LINE);
    if (dateMatch) {
      const monthIdx = MONTHS[dateMatch[1].toLowerCase()];
      const day = parseInt(dateMatch[2], 10);
      const year = dateMatch[3] || dateMatch[4];
      const time = dateMatch[5] || null;
      if (monthIdx !== undefined && day && pendingTitle) {
        const d = nextOccurrenceOf(monthIdx, day, year);
        events.push({
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          title: pendingTitle,
          time,
        });
      }
      pendingTitle = null;
      continue;
    }

    if (NOISE_LINE.test(line) || line.length < 3 || line.length > 100) continue;
    if (/^\$\d/.test(line) || /^tickets?:/i.test(line)) continue; // price lines, not titles
    pendingTitle = line;
  }

  return events;
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

  let html;
  try {
    const r = await fetch(SOURCE_URL, { headers: { "User-Agent": "Mozilla/5.0 (313events.com event calendar)" } });
    if (!r.ok) {
      res.status(200).json({ upserted: 0, error: `Fetch failed: HTTP ${r.status}` });
      return;
    }
    html = await r.text();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Fetch failed: " + err.message });
    return;
  }

  const parsed = parseRedfordEvents(html);
  if (!parsed.length) {
    res.status(200).json({ upserted: 0, note: "No events parsed — the site's layout may have changed.", fetchedAt: new Date().toISOString() });
    return;
  }

  const rows = parsed.map((e) => ({
    external_id: `redford-${e.date}-${e.title}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 250),
    title: e.title,
    category: "film",
    venue_name_raw: VENUE_NAME,
    start_date: e.date,
    time_display: e.time,
    is_free: false,
    source: "Redford Theatre",
    status: "approved",
  }));

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    res.status(200).json({ upserted: rows.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
