// Vercel Cron job — scrapes Trinosophes' own events page (trinosophes.com/Events)
// and upserts parsed shows into Supabase as status='approved'.
//
// ** BEST-EFFORT / UNVERIFIED **
// Trinosophes' site has no structured data at all (no JSON-LD, no repeating
// HTML containers) — it's a flat text page where a bold date heading like
// "August 16" is followed by one or more event name lines before the next
// date heading. This parser was written from a description of that page's
// structure, not tested against a live fetch (this environment's network is
// sandboxed and can't reach arbitrary external sites directly). Treat the
// first real cron run as a test: check the `events` table for rows with
// source='Trinosophes' and eyeball them against https://trinosophes.com/Events
// before trusting this long-term. If the site's layout doesn't match what's
// assumed here, this will silently upsert 0 rows (fails soft, same pattern
// as the other cron jobs) rather than corrupt existing data.
//
// Protect this endpoint the same way as cron-ticketmaster.js: set CRON_SECRET
// in Vercel and reference /api/cron-trinosophes in vercel.json's crons list.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const SOURCE_URL = "https://trinosophes.com/Events";
const VENUE_NAME = "Trinosophes";
const VENUE_CITY = "Detroit";

const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

// Strip HTML tags down to plain text lines, collapsing whitespace, so the
// date-heading-then-title heuristic can run against something close to what
// a human sees rendered on the page.
// Decodes HTML entities in scraped text. The previous version only handled
// &amp;/&#8217;/&nbsp; by name, which missed common WordPress numeric
// entities like &#038; (its usual encoding of "&") — those slipped straight
// through and showed up as literal "&#038;" text on the live site instead of
// "&". Numeric decoding (both decimal and hex) is handled generically here
// so nothing needs to be added to a hand-picked list again.
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

function htmlToLines(html) {
  const text = decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Matches a standalone date heading line like "August 16" or "August 16, 2026".
const DATE_LINE = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s*(\d{4}))?$/i;
// Matches a 4-digit year-only heading line, e.g. "2026" — used to track the
// current year context since individual date lines usually omit it.
const YEAR_LINE = /^(20\d{2})$/;

function parseTrinosophesEvents(html) {
  const lines = htmlToLines(html);
  const events = [];
  let currentYear = new Date().getFullYear(); // fallback if no year heading seen yet
  let pendingDate = null; // {month, day}

  for (const line of lines) {
    const yearMatch = line.match(YEAR_LINE);
    if (yearMatch) {
      currentYear = parseInt(yearMatch[1], 10);
      pendingDate = null;
      continue;
    }

    const dateMatch = line.match(DATE_LINE);
    if (dateMatch) {
      const month = MONTHS[dateMatch[1].toLowerCase()];
      const day = dateMatch[2].padStart(2, "0");
      const year = dateMatch[3] || String(currentYear);
      pendingDate = { date: `${year}-${month}-${day}` };
      continue;
    }

    // Skip obvious section headers / nav / footer noise. This is a defensive
    // guard, not a guarantee — untested against the real live page, so
    // spot-check the first cron run's output before trusting it.
    const isNoise =
      line.length <= 2 ||
      line.length > 120 || // real titles are short; long lines are usually paragraph copy
      /^coming soon$/i.test(line) ||
      /^(home|about|events|shop|contact|menu|tickets?|newsletter|subscribe|instagram|facebook|twitter|donate|directions|hours|faq)$/i.test(line) ||
      /^https?:\/\//i.test(line) ||
      /@/.test(line); // likely an email/handle line, not an event title

    if (pendingDate && !isNoise) {
      events.push({ date: pendingDate.date, title: line });
      // Trinosophes sometimes lists multiple acts on one date across
      // several lines — keep pendingDate open so they all attach to the
      // same date, rather than clearing it after the first line.
    }
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

  // Trinosophes' page turned out to be a full historical archive (real shows
  // going back to 2012), not just upcoming ones — discovered 2026-08-25 when
  // a live run upserted 552 rows. Keep only current/upcoming events, same
  // pattern as cron-cinema-detroit.js.
  const today = new Date().toISOString().slice(0, 10);
  const parsed = parseTrinosophesEvents(html).filter((e) => e.date >= today);
  if (!parsed.length) {
    res.status(200).json({ upserted: 0, note: "No upcoming events parsed — the site's layout may have changed, or none are currently listed.", fetchedAt: new Date().toISOString() });
    return;
  }

  const rawRows = parsed.map((e) => ({
    external_id: `trinosophes-${e.date}-${e.title}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 250),
    title: e.title,
    category: "music", // Trinosophes is predominantly a music/arts venue; not fine-grained per event
    venue_name_raw: VENUE_NAME,
    start_date: e.date,
    // Trinosophes' events page never lists a showtime (confirmed 2026-08-26
    // — every listing is just a date heading + title, no times anywhere).
    // Per Jody: doors are reliably either 7:00 or 7:30, so default to the
    // earlier, safer time rather than showing blank/no time at all, and
    // flag it as approximate via `note` (the site's short-caveat field —
    // rendered under the venue line) so no one shows up expecting an exact
    // start.
    time_display: "7:00 PM",
    note: "Doors ~7:00 PM (sometimes 7:30) — confirm at trinosophes.com or by calling the venue.",
    is_free: false,
    source: "Trinosophes",
    status: "approved",
  }));

  // De-dupe by external_id before sending. The page lists recurring events
  // across multiple years with untested year-tracking (see BEST-EFFORT note
  // above), so two real, different-date events can occasionally land on the
  // same computed external_id. Postgres's ON CONFLICT DO UPDATE can't touch
  // the same target row twice in one statement — without this, one bad pair
  // fails the ENTIRE batch (every real event in the run), not just the dupe.
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

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
