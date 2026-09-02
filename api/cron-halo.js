const crypto = require("crypto");
// Vercel Cron job — scrapes HALO Detroit's own events page
// (thehalodetroit.com/currentevents). robots.txt for this site places no
// restrictions on crawling it. The site is built on Wix, has no JSON-LD or
// API, but content is server-rendered (confirmed — a plain fetch sees the
// same event text a browser does, no JS execution required).
//
// This parser was built from a confirmed literal line-by-line dump of one
// real event block (fetched directly from the live page), not guessed —
// higher confidence than the Trinosophes scraper, but still worth spot
// checking after the first real cron run since Wix markup can change.
// Confirmed structure per event, in order:
//   "Sun, Aug 23"                                  <- short date, marks a new event
//   "CURTAIN CALL CABARET: ... /"                  <- title (trailing " /" stripped)
//   "HALO DETROIT - Bar and Lounge"                <- venue name (constant, skipped)
//   "[Buy Tickets]"                                <- button (skipped)
//   "Aug 23, 2026, 7:00 PM – 11:00 PM"              <- full date+time, the real parse anchor
//   "HALO DETROIT - Bar and Lounge, 8070 ... USA"   <- address (skipped)
//   "Share" + social links                          <- skipped
//
// Note: HALO also lists some of its DJ/electronic nights on Resident
// Advisor (ra.co) — those are NOT pulled from here (RA scraping remains off
// limits per its Terms of Use) and won't duplicate with what this scraper
// finds on the venue's own site, since this only reads thehalodetroit.com.

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


const SOURCE_URL = "https://www.thehalodetroit.com/currentevents";
const VENUE_NAME = "HALO Detroit";
const VENUE_CITY = "Detroit";
const DEFAULT_STATUS = "approved";

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

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
    .replace(/<\/(p|div|li|h[1-6]|tr|span)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// "Sun, Aug 23" — short date marking the start of a new event block.
const SHORT_DATE_LINE = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+([A-Za-z]{3})\s+(\d{1,2})$/;
// "Aug 23, 2026, 7:00 PM – 11:00 PM" — the reliable full date+time anchor.
const FULL_DATETIME_LINE = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}:\d{2}\s*[AP]M)(?:\s*[–—-]\s*(\d{1,2}:\d{2}\s*[AP]M))?/i;
const NOISE_LINE = /^(buy tickets|details|rsvp|share|learn more)$/i;

function parseHaloEvents(html) {
  const lines = htmlToLines(html);
  const events = [];
  let candidateTitle = null;
  let inEventBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (SHORT_DATE_LINE.test(line)) {
      inEventBlock = true;
      candidateTitle = null;
      continue;
    }

    if (!inEventBlock) continue;

    const fullMatch = line.match(FULL_DATETIME_LINE);
    if (fullMatch) {
      const monthKey = fullMatch[1].slice(0, 3).toLowerCase();
      const month = MONTHS[monthKey];
      const day = fullMatch[2].padStart(2, "0");
      const year = fullMatch[3];
      if (month && candidateTitle) {
        const time = fullMatch[5] ? `${fullMatch[4]} – ${fullMatch[5]}` : fullMatch[4];
        events.push({ date: `${year}-${month}-${day}`, title: candidateTitle, time });
      }
      inEventBlock = false; // event block finished; wait for the next short-date line
      candidateTitle = null;
      continue;
    }

    if (line === VENUE_NAME || NOISE_LINE.test(line) || line.startsWith(VENUE_NAME)) continue;

    // First non-noise, non-venue line after the short date is the title.
    if (!candidateTitle) {
      candidateTitle = line.replace(/\s*\/\s*$/, "").trim(); // strip trailing " /" separator
    }
  }

  return events;
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

  const parsed = parseHaloEvents(html);
  if (!parsed.length) {
    res.status(200).json({ upserted: 0, note: "No events parsed — the site's layout may have changed.", fetchedAt: new Date().toISOString() });
    return;
  }

  const rawRows = parsed.map((e) => ({
    external_id: `halo-${e.date}-${e.title}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 250),
    title: e.title,
    category: "nightlife", // best-effort default — HALO's own page doesn't distinguish cabaret/DJ/social events
    venue_name_raw: VENUE_NAME,
    start_date: e.date,
    time_display: e.time,
    is_free: false,
    source: "HALO Detroit",
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
    res.status(200).json({ upserted: rowsWithStatus.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
