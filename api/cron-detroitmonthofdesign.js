const crypto = require("crypto");
// Vercel Cron job — pulls the full Detroit Month of Design festival program
// (September 2026) from detroitmonthofdesign.org. Added 2026-09-02 at
// Jody's request ("let's add this calendar feed to the database").
//
// SOURCE DISCOVERY — worth documenting since this one took real digging:
// the site's own /events page (a Wix "Load More" list widget) only ever
// exposes ~20 events to a plain fetch — the rest load via client-side
// interaction this project's serverless functions can't drive (no headless
// browser in this stack, and adding one would be a real architecture
// change, not something to do unilaterally for one source). Confirmed via
// a live browser session (2026-09-02): clicking "Load More" repeatedly
// never actually grew the real event-detail link count past 20 once
// Facebook/Twitter share-button URLs — which also embed the string
// "/event-details/" and inflated early counts to look like it was working
// — were correctly filtered out.
//
// The fix: robots.txt points at /sitemap.xml, which is a sitemap INDEX
// listing (among others) event-pages-sitemap.xml — Wix auto-generates this
// for every dynamic "event details" page regardless of whether the list
// widget ever surfaces it. That sitemap alone had 317 URLs at build time,
// spanning the whole festival. Same "read the sitemap instead of the
// listing UI" approach cron-dossin.js already uses for a different reason
// (its own listing page needs a Drupal API plain fetch can't reach).
//
// Each individual event-details page is server-rendered AND carries a
// clean schema.org "Event" JSON-LD block (confirmed live) with exactly
// what's needed: name, description, startDate/endDate as full ISO
// datetimes with timezone offset baked in (so the date portion can be
// sliced straight off the string — no UTC-conversion pitfalls), and a
// location with venue name + full street address. This is meaningfully
// richer than most sources this project scrapes.
//
// TWO THINGS THIS SOURCE IS UNUSUALLY GOOD FOR:
//   1. Real multi-day spans — several entries are week+ long installations
//      (e.g. one light installation runs the entire festival, Sep 1-30).
//      start_date/end_date are set from the real startDate/endDate dates,
//      which is exactly what the 2026-09-02 audit's end_date display fix
//      (index.html/calendar.html/map.html/event.html) was built for.
//   2. Real set times — when an event starts and ends the same calendar
//      day, time_display becomes an actual "7:00 PM–11:00 PM" range (this
//      site's own detail pages show exactly that under "Time & Location"),
//      directly answering Jody's "why don't promoters put set times"
//      question for this source. A multi-day span only shows its start
//      time — an end date/time on a different day isn't a meaningful
//      "closes at" for the display, so time_display stays a single time
//      there instead of a misleading range.
//
// Not every sitemap URL parses (confirmed live: one of four spot-checked
// URLs returned 200 with no Event JSON-LD at all — no year-round explanation
// found, may be a removed/unpublished listing the sitemap hasn't caught up
// on yet). Same "skip what doesn't parse, don't guess" convention as every
// other scraper here.
//
// No single-category signal exists anywhere in the JSON-LD (schema.org
// Event has no generic category field, and this site's own filter chips —
// Exhibitions/Talks/Workshops/Installations/Open Studios — aren't exposed
// per-event in the markup this scrapes). Defaulted to "visual" (design is
// closest fit among this project's 13 categories) for the whole source,
// same one-size-fits-the-source approach cron-trinosophes.js/cron-halo.js
// already take for their own single-category venues.
//
// ** STATUS-PRESERVING UPSERT ** — same pattern as every other cron here
// since the 2026-09-02 audit: looks up each row's current status before
// writing and reuses it, only defaulting brand-new rows to DEFAULT_STATUS.
//
// ** BEST-EFFORT ** — built from real fetched HTML and JSON-LD, spot-check
// the first live run. 317 detail-page fetches (at build time) run with
// limited concurrency to stay well inside this function's maxDuration —
// see vercel.json's functions block.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Timing-safe secret comparison — see any other cron-*.js's identical
// helper for the full reasoning (2026-09-02 audit fix).
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

const SITEMAP_URL = "https://www.detroitmonthofdesign.org/event-pages-sitemap.xml";
const DEFAULT_CATEGORY = "visual";
const DEFAULT_STATUS = "approved"; // official festival's own site, same trust tier as cron-dossin.js/cron-lagerhouse.js
const FETCH_CONCURRENCY = 12;
const REQUEST_HEADERS = { "User-Agent": "Mozilla/5.0 (313events.com event calendar)" };

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

async function fetchDetailUrls() {
  const r = await fetch(SITEMAP_URL, { headers: REQUEST_HEADERS });
  if (!r.ok) throw new Error(`Sitemap fetch failed: HTTP ${r.status}`);
  const xml = await r.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]));
  return [...new Set(urls)].filter((u) => u.includes("/event-details/"));
}

// 12-hour time string straight from an ISO datetime's own HH:MM (the ISO
// string already carries the correct local offset, e.g.
// "2026-09-03T17:00:00-04:00" — no Date-object timezone conversion needed
// or wanted here).
function formatTime12h(isoString) {
  const m = isoString.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${ampm}`;
}

function isoDatePortion(isoString) {
  return isoString.slice(0, 10);
}

async function fetchEventFromDetailPage(url) {
  const r = await fetch(url, { headers: REQUEST_HEADERS });
  if (!r.ok) return null;
  const html = await r.text();
  const m = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"Event".*?\})<\/script>/s);
  if (!m) return null; // no Event JSON-LD on this page — skip, don't guess
  let ld;
  try {
    ld = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!ld.name || !ld.startDate) return null;

  const startDateISO = ld.startDate;
  const endDateISO = ld.endDate || ld.startDate;
  const startDatePortion = isoDatePortion(startDateISO);
  const endDatePortion = isoDatePortion(endDateISO);
  const sameDay = endDatePortion === startDatePortion;

  const startTime = formatTime12h(startDateISO);
  const endTime = sameDay ? formatTime12h(endDateISO) : null;
  const timeDisplay = startTime && endTime && endTime !== startTime ? `${startTime}–${endTime}` : startTime;

  const location = ld.location || {};
  const address = location.address || "";
  const cityMatch = address.match(/,\s*([A-Za-z .]+?),\s*MI\s*\d{5}/);

  return {
    external_id: `dmod-${url.split("/event-details/")[1]}`.slice(0, 250),
    title: decodeEntities(ld.name),
    description: ld.description ? decodeEntities(ld.description) : undefined,
    category: DEFAULT_CATEGORY,
    venue_name_raw: location.name ? decodeEntities(location.name) : "Venue TBA",
    venue_city_raw: cityMatch ? cityMatch[1].trim() : "Detroit",
    start_date: startDatePortion,
    end_date: endDatePortion !== startDatePortion ? endDatePortion : undefined,
    time_display: timeDisplay || undefined,
    is_free: !!(ld.description && /\bfree\b/i.test(ld.description)),
    source: "Detroit Month of Design",
    image_url: ld.image && ld.image.url ? ld.image.url : undefined,
    ticket_url: url,
  };
}

// Runs `items` through `worker` with at most `limit` in flight at once —
// 317 detail-page fetches one at a time would run well past any reasonable
// maxDuration; unbounded Promise.all risks hammering the source site.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
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

  let detailUrls;
  try {
    detailUrls = await fetchDetailUrls();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Sitemap fetch failed: " + err.message });
    return;
  }
  if (!detailUrls.length) {
    res.status(200).json({ upserted: 0, note: "Sitemap parsed but contained no event-details URLs.", fetchedAt: new Date().toISOString() });
    return;
  }

  let parsedResults;
  try {
    parsedResults = await mapWithConcurrency(detailUrls, FETCH_CONCURRENCY, async (url) => {
      try {
        return await fetchEventFromDetailPage(url);
      } catch {
        return null; // one bad page never aborts the whole run
      }
    });
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Detail page fetch pass failed: " + err.message });
    return;
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const parsed = parsedResults.filter(Boolean).filter((e) => e.start_date >= todayISO || (e.end_date && e.end_date >= todayISO));

  if (!parsed.length) {
    res.status(200).json({ upserted: 0, note: "No current/upcoming Detroit Month of Design events parsed.", checkedUrls: detailUrls.length, fetchedAt: new Date().toISOString() });
    return;
  }

  // De-dupe by external_id — Postgres's ON CONFLICT DO UPDATE can't touch
  // the same target row twice in one statement.
  const seen = new Map();
  for (const row of parsed) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  try {
    const idList = rows.map((r) => r.external_id).join(",");
    const lookupResp = await fetch(
      `${SUPABASE_URL}/rest/v1/events?external_id=in.(${idList})&select=external_id,status`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const existingStatusByExternalId = new Map();
    if (lookupResp.ok) {
      const existingRows = await lookupResp.json();
      if (Array.isArray(existingRows)) {
        existingRows.forEach((row) => existingStatusByExternalId.set(row.external_id, row.status));
      }
    }
    // Lookup failure falls through with an empty map — every row defaults
    // to DEFAULT_STATUS, same as this scraper's first-ever run. Not
    // silently worse than the old (non-status-preserving) behavior.

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
    res.status(200).json({ upserted: rowsWithStatus.length, checkedUrls: detailUrls.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
