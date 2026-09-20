const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
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


const SOURCE_URL = "https://www.detroithistorical.org/events";
const VENUE_NAME = "Dossin Great Lakes Museum";
const VENUE_MATCH = /dossin/i;
const DEFAULT_STATUS = "approved";

const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

// Live layout, confirmed 2026-09-20 by fetching detroithistorical.org/events
// and diffing its real line-by-line text against this file's regexes: each
// event renders as four consecutive lines — TITLE, then VENUE NAME, then a
// single combined "Month D, YYYY, H:MMam - H:MMpm" line, then a "LEARN MORE"
// link. The date and time sit on ONE line together, not two separate lines
// the way the original DATE_LINE/TIME_LINE pair assumed — that assumption
// was simply wrong from the start (not a site change since this was
// written), so DATE_LINE never matched a single real line and this scraper
// has upserted zero rows on every run since it existed, despite returning a
// clean 200 every time (confirmed via Vercel's own logs: three straight
// scheduled runs, all 200, with nothing ever written — a silent failure,
// not a crashing one). Root-caused 2026-09-20.
const TITLE_DATE_TIME_LINE = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:,\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*-\s*(\d{1,2}:\d{2}\s*(?:am|pm)))?\s*$/i;
const NOISE_LINE = /^(home|about|events|calendar|tickets?|buy tickets|membership|donate|contact|newsletter|subscribe|instagram|facebook|shop|visit|hours|admission)$/i;

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
    .replace(/<\/(p|div|li|h[1-6]|tr|article)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
  return text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function parseDossinEvents(html) {
  const lines = htmlToLines(html);
  const events = [];

  // Walk the lines looking for the combined date/time line, then look
  // backward two lines for VENUE and TITLE — the real, confirmed order on
  // this page (see TITLE_DATE_TIME_LINE's comment above). This replaces the
  // old forward-looking state machine, which never worked because it
  // expected date and time on separate lines.
  for (let i = 0; i < lines.length; i++) {
    const dtMatch = lines[i].match(TITLE_DATE_TIME_LINE);
    if (!dtMatch) continue;

    const month = MONTHS[dtMatch[1].toLowerCase()];
    if (!month) continue;

    const venueLine = lines[i - 1];
    const titleLine = lines[i - 2];
    if (!venueLine || !VENUE_MATCH.test(venueLine)) continue; // not a Dossin event — skip
    if (!titleLine || NOISE_LINE.test(titleLine) || titleLine.length < 3 || titleLine.length > 140) continue;

    const date = `${dtMatch[3]}-${month}-${dtMatch[2].padStart(2, "0")}`;
    let time = null;
    if (dtMatch[4] && dtMatch[5]) {
      let start = dtMatch[4].trim();
      const end = dtMatch[5].trim();
      // Some entries omit am/pm on the start time when it shares the end
      // time's period (e.g. "1:00 - 2:30pm" means 1:00pm-2:30pm) — infer it
      // from the end time rather than leaving it ambiguous.
      if (!/am|pm/i.test(start)) {
        const suffix = end.match(/am|pm/i);
        if (suffix) start += suffix[0];
      }
      time = `${start} – ${end}`;
    }

    events.push({ title: titleLine, date, time });
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
    const r = await fetch(SOURCE_URL, { headers: { "User-Agent": "Mozilla/5.0 (313.events event calendar)" } });
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

  // See api/_lib/venue-lookup.js — links to the existing venues row if one
  // exists, never creates or guesses a fuzzy match.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const venueId = resolveVenueId(venueMap, VENUE_NAME);

  const rawRows = parsed.map((e) => ({
    external_id: `dossin-${e.date}-${e.title}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 250),
    title: e.title,
    category: "museum",
    venue_name_raw: VENUE_NAME,
    venue_id: venueId,
    start_date: e.date,
    time_display: e.time,
    is_free: false,
    source: "Detroit Historical Society",
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
