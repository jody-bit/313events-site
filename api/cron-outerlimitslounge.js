const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingStatuses } = require("./_lib/status-lookup");

// Vercel Cron job — pulls Outer Limits Lounge's own show calendar straight
// from Squarespace's own structured JSON feed for the page, discovered
// 2026-09-16 while looking into Jody's "we need to crawl the Outer Limits
// Lounge instagram" request. Their actual website (outerlimitslounge.com,
// confirmed Squarespace via the page's own <meta> tags and asset CDN) turned
// out to be a far better source than an Instagram screenshot pull: appending
// `?format=json` to any Squarespace page is a long-standing, publicly
// documented convention (it's the exact same JSON payload Squarespace's own
// front-end template fetches to render the page) — not a bypass of
// anything, and not scraping in the HTML-parsing sense. Confirmed live: 53
// upcoming events, clean titles, real millisecond start/end timestamps, and
// a permalink for every show.
//
// ** WHY NOT INSTAGRAM ** — every other social-only source in this project
// (Resident Advisor, the various Paris Bar flyer batches) is a manual,
// human-transcribed screenshot pull, on purpose: no automated Instagram
// crawling of any kind. This source sidesteps that entirely by using the
// venue's own website instead, so it can run on the normal automated cron
// schedule like Ticketmaster/VisitDetroit rather than needing Jody to send
// screenshots.
//
// ** WHAT'S NOT IN THIS FEED ** — no description, no ticket link, no price,
// and no reliable per-event flyer image (the "upcoming" listing includes an
// `assetUrl` base path, but it does not resolve to an actual image for a
// show that has no cover image attached in Squarespace, which is most of
// them — confirmed by checking a specific event's own item JSON). Rather
// than guess at any of these, description/image_url/price_from are left
// null and ticket_url instead points at the event's own page on
// outerlimitslounge.com — the same "link back to the real source rather
// than invent one" fallback used everywhere else in this project (RA's
// fallback button, the Paris Bar Instagram-post links).
//
// ** VENUE ** — every event on this page is at Outer Limits Lounge itself
// (5507 Caniff Street, Hamtramck) — confirmed via the feed's own
// `location.addressTitle`/`addressLine1`/`addressLine2` on every sampled
// item, so those are hardcoded here rather than re-parsed per event.
//
// ** CATEGORY ** — Jody caught a real miss here: the first pass hardcoded
// "music" for every event (copying the cron-lagerhouse.js/cron-trinosophes.js
// convention), based on only glancing at the first ~8 listings. The full
// 53-event feed is NOT all bands — it also has a recurring weekly karaoke
// night, recurring Lions watch parties, a film series ("Slimeball Cinerama
// After Dark"), an actual film festival ("Planet 9 Film Fest"), and a Santa
// photo-op night. The feed itself has no category/tag data (every item's
// own `categories`/`tags` arrays are empty, confirmed live), so this maps
// by keyword against the title instead — checked against the full live
// 53-event list before shipping, not just a sample. Falls back to "music"
// (this venue's primary purpose) when nothing else matches.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Timing-safe secret comparison — see cron-ticketmaster.js's own copy of
// this helper for the full rationale (2026-09-02 site audit).
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

const FEED_URL = "https://www.outerlimitslounge.com/events?format=json";
const SOURCE_SLUG = SLUGS.outerlimitslounge; // WP 0.5 -- see api/_lib/source-slugs.js
const SITE_ORIGIN = "https://www.outerlimitslounge.com";
const VENUE_NAME = "Outer Limits Lounge";
const VENUE_ADDRESS = "5507 Caniff Street";
const VENUE_CITY = "Hamtramck";
const SOURCE_NAME = "Outer Limits Lounge";
const DEFAULT_STATUS = "approved";

// Squarespace's own startDate/endDate on these items are already
// milliseconds (not seconds, unlike visitdetriot's Algolia index) — pass
// straight into `new Date()`, no *1000 needed.
function detroitParts(ms) {
  if (!ms && ms !== 0) return null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const hour24 = parts.hour === "24" ? 0 : parseInt(parts.hour, 10);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: hour24, minute: parseInt(parts.minute, 10) };
}

function formatTime(hour, minute) {
  const ap = hour >= 12 ? "PM" : "AM";
  let h12 = hour % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${ap}`;
}

// Confirmed live 2026-09-16: even Squarespace's JSON feed carries HTML-
// escaped entities in plain fields, not just markup — e.g. one real title
// came back as "Hélène Barbier • CAD &amp; the Peacetime Consumers..." with
// a literal "&amp;" in the JSON string itself. Same decoder every other
// scraped source in this project uses (see cron-redford-theatre.js).
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

// item.body is HTML when a listing does have real content — strip tags down
// to plain text the same way this project treats every other scraped HTML
// snippet, rather than storing markup in the description column.
function stripHtml(html) {
  if (!html) return null;
  const text = decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return text || null;
}

// Keyword-based category classifier, checked in priority order. See the
// header comment above for why this exists instead of a hardcoded value.
function mapCategory(title) {
  const t = (title || "").toLowerCase();
  if (/\b(film|cinema|movie|screening|cinerama|documentary)\b/.test(t)) return "film";
  if (/\bkaraoke\b/.test(t)) return "nightlife";
  if (/\bwatch party\b|\bpot ?luck\b|\bfootball\b|\blions\b/.test(t)) return "nightlife";
  if (/\bsanta\b/.test(t)) return "family";
  return "music";
}

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  // WP 0.5: the run begins here, once the request is confirmed to be a
  // real cron invocation -- see api/_lib/run-log.js.
  const runHandle = await startRun(SOURCE_SLUG);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // startRun() above already checked these same env vars and no-opped
    // (runHandle is null), so there is no source_runs row to finish here.
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  let data;
  try {
    const r = await fetch(FEED_URL, { headers: { "User-Agent": "Mozilla/5.0 (313.events event calendar)" } });
    if (!r.ok) {
      const blocked = r.status === 401 || r.status === 403;
      await finishRun(runHandle, {
        outcome: blocked ? "blocked" : "failed",
        http_status: r.status,
        error_sample: `Fetch failed: HTTP ${r.status}`,
      });
      res.status(200).json({ upserted: 0, error: `Fetch failed: HTTP ${r.status}` });
      return;
    }
    data = await r.json();
  } catch (err) {
    await finishRun(runHandle, { outcome: "failed", error_sample: "Fetch failed: " + err.message });
    res.status(200).json({ upserted: 0, error: "Fetch failed: " + err.message });
    return;
  }

  // records_fetched (WP 0.5): the raw upcoming-item array from Squarespace's
  // own JSON feed, before the date-parsing filter below -- see
  // api/_lib/source-slugs.js.
  const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
  if (!upcoming.length) {
    await finishRun(runHandle, {
      outcome: "success",
      records_fetched: 0,
      records_parsed: 0,
      records_written: 0,
    });
    res.status(200).json({ upserted: 0, note: "No upcoming events in the feed — the page layout may have changed.", fetchedAt: new Date().toISOString() });
    return;
  }

  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const venueId = resolveVenueId(venueMap, VENUE_NAME);

  let excludedByDate = 0;

  const rawRows = upcoming
    .map((item) => {
      const startParts = detroitParts(item.startDate);
      if (!startParts) { excludedByDate++; return null; }
      const endParts = item.endDate ? detroitParts(item.endDate) : null;
      const endDate = endParts && endParts.date !== startParts.date ? endParts.date : null;

      return {
        external_id: `oll-${item.id}`,
        title: decodeEntities(item.title),
        description: stripHtml(item.body) || stripHtml(item.excerpt),
        category: mapCategory(decodeEntities(item.title)),
        venue_name_raw: VENUE_NAME,
        venue_address_raw: VENUE_ADDRESS,
        venue_city_raw: VENUE_CITY,
        venue_id: venueId,
        start_date: startParts.date,
        end_date: endDate,
        time_display: formatTime(startParts.hour, startParts.minute),
        is_all_day: false,
        is_free: false, // no price signal in this feed — never guessed true, see header comment
        price_from: null,
        ticket_url: item.fullUrl ? `${SITE_ORIGIN}${item.fullUrl}` : null,
        image_url: null, // no reliable per-event flyer in this feed — see header comment
        source: SOURCE_NAME,
      };
    })
    .filter(Boolean);

  if (!rawRows.length) {
    await finishRun(runHandle, {
      outcome: "success",
      records_fetched: upcoming.length,
      records_parsed: 0,
      records_written: 0,
      error_sample: excludedByDate ? `All ${excludedByDate} fetched items were excluded by date parsing` : undefined,
    });
    res.status(200).json({ upserted: 0, excludedByDate, fetchedAt: new Date().toISOString() });
    return;
  }

  // De-dupe by external_id before sending — same reasoning as every other
  // cron here: ON CONFLICT DO UPDATE can't touch the same target row twice
  // in one statement.
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  try {
    // Status-preserving upsert — same pattern as cron-redford-theatre.js /
    // cron-lagerhouse.js: don't let a re-run's merge-duplicates upsert reset
    // an admin's approve/reject decision back to DEFAULT_STATUS.
    // WP 0.17 (2026-09-22): fail-closed status lookup -- a failed lookup
    // (non-OK response, thrown network error, or an unusable response body)
    // must never silently default every row to DEFAULT_STATUS (D7). See
    // api/_lib/status-lookup.js for the full rationale and the chunking
    // (<=100 ids/request) this also fixes. Any failure aborts this run
    // entirely -- zero event writes, HTTP 502 -- rather than falling back
    // to an empty map the way this connector used to.
    let existingStatusByExternalId;
    try {
      existingStatusByExternalId = await lookupExistingStatuses(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        rows.map((r) => r.external_id)
      );
    } catch (lookupErr) {
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: 502,
        error_sample: "Status lookup failed: " + lookupErr.message,
      });
      res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
      return;
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
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: resp.status,
        records_fetched: upcoming.length,
        records_parsed: rawRows.length,
        records_written: 0,
        error_sample: "Supabase upsert failed: " + errText,
      });
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    await finishRun(runHandle, {
      outcome: "success",
      http_status: resp.status,
      records_fetched: upcoming.length,
      records_parsed: rawRows.length,
      records_written: rowsWithStatus.length,
    });
    res.status(200).json({ upserted: rowsWithStatus.length, excludedByDate, fetchedAt: new Date().toISOString() });
  } catch (err) {
    await finishRun(runHandle, {
      outcome: "failed",
      records_fetched: upcoming.length,
      records_parsed: rawRows.length,
      error_sample: err.message,
    });
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
