// Vercel Cron job — pulls Dossin Great Lakes Museum events from the Detroit
// Historical Society's combined events page (detroithistorical.org/events,
// which covers both the Detroit Historical Museum — already in this
// database as a manually-curated source — and the Dossin, on Belle Isle).
// This scraper keeps only rows whose location text says "Dossin Great
// Lakes Museum", so it doesn't duplicate the Historical Museum's existing
// manually-curated listings.
//
// NOTE: the URL that looks like the "right" one for just the Dossin
// (detroithistorical.org/dossin-great-lakes-museum/events-calendar/
// events-listing) is a Drupal BigPipe-lazy-loaded block that returns no
// event data to a plain fetch — confirmed empty on a real fetch. This
// scraper deliberately uses the general /events page instead and filters
// by location text, which DOES return full data to a plain fetch.
// Drupal's JSON:API is also exposed at /jsonapi/node/event but is
// misconfigured to deny anonymous reads of individual event resources —
// not usable, confirmed via a real 200-with-empty-data response.
//
// ** BEST-EFFORT ** — built from real fetched text, not a directly
// inspected DOM. Spot-check the first live run.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const SOURCE_URL = "https://www.detroithistorical.org/events";
const VENUE_NAME = "Dossin Great Lakes Museum";
const VENUE_MATCH = /dossin/i;

const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

const DATE_LINE = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/;
const TIME_LINE = /^(\d{1,2}:\d{2}\s*[ap]m)\s*-\s*(\d{1,2}:\d{2}\s*[ap]m)$/i;
const NOISE_LINE = /^(home|about|events|calendar|tickets?|buy tickets|membership|donate|contact|newsletter|subscribe|instagram|facebook|shop|visit|hours|admission)$/i;

function htmlToLines(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|article)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&#8217;/g, "’").replace(/&nbsp;/g, " ");
  return text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function parseDossinEvents(html) {
  const lines = htmlToLines(html);
  const events = [];
  let pendingTitle = null;
  let pendingDate = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateMatch = line.match(DATE_LINE);
    if (dateMatch) {
      const month = MONTHS[dateMatch[1].toLowerCase()];
      if (month) {
        pendingDate = { date: `${dateMatch[3]}-${month}-${dateMatch[2].padStart(2, "0")}`, time: null };
      }
      continue;
    }

    if (pendingDate) {
      const timeMatch = line.match(TIME_LINE);
      if (timeMatch) {
        pendingDate.time = `${timeMatch[1]} – ${timeMatch[2]}`;
        continue;
      }
      // A nearby line naming the venue confirms/attributes this event and
      // closes out the block, whether or not a time line was present.
      if (VENUE_MATCH.test(line)) {
        if (pendingTitle) {
          events.push({ title: pendingTitle, date: pendingDate.date, time: pendingDate.time });
        }
        pendingTitle = null;
        pendingDate = null;
        continue;
      }
    }

    if (NOISE_LINE.test(line) || line.length < 3 || line.length > 140) continue;
    if (!pendingDate) pendingTitle = line; // most recent non-noise line before a date is the title
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

  const parsed = parseDossinEvents(html);
  if (!parsed.length) {
    res.status(200).json({ upserted: 0, note: "No Dossin events parsed — the site's layout may have changed, or none are currently listed.", fetchedAt: new Date().toISOString() });
    return;
  }

  const rows = parsed.map((e) => ({
    external_id: `dossin-${e.date}-${e.title}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 250),
    title: e.title,
    category: "museum",
    venue_name_raw: VENUE_NAME,
    start_date: e.date,
    time_display: e.time,
    is_free: false,
    source: "Detroit Historical Society",
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
