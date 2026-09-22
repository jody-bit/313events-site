const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingStatuses } = require("./_lib/status-lookup");
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
const SOURCE_SLUG = SLUGS.belleIsleNatureCenter; // WP 0.5 -- see api/_lib/source-slugs.js
const VENUE_NAME = "Belle Isle Nature Center";
const DEFAULT_STATUS = "approved";

// 2026-09-05 fix — this crawler never read the Tribe Events API's own
// `image` field at all (same confirmed bug as cron-wdet.js — the two sites
// run the same WordPress plugin, same field). `image` is `false` when an
// event has no featured image set (this venue's own listings turned out to
// mostly be image-less at the time this was checked — small venue, not every
// event gets a poster), or an object with a top-level full-size `url` plus a
// `sizes` map. Prefers a mid-size real image; falls back to the full-size
// url if the expected size keys aren't present.
function pickTribeImage(image) {
  if (!image || typeof image !== "object") return null;
  const sizes = image.sizes || {};
  const preferred = sizes.medium_large || sizes.medium || sizes.large || sizes.thumbnail;
  if (preferred && preferred.url) return preferred.url;
  return image.url || null;
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
    const r = await fetch(API_URL, { headers: { "User-Agent": "313.events event calendar" } });
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

  // records_fetched (WP 0.5): the raw event array from the Tribe Events
  // API, before the start_date filter below -- see api/_lib/source-slugs.js.
  const events = Array.isArray(data.events) ? data.events : [];

  // See api/_lib/venue-lookup.js — links to the existing venues row if one
  // exists, never creates or guesses a fuzzy match. Single-venue cron, so
  // one lookup for the whole run — same pattern as cron-cinema-detroit.js/
  // cron-dossin.js. 2026-09-21 fix (WP 0.1): this call was missing
  // entirely — `venue_id: venueId` below referenced an undefined variable,
  // throwing a ReferenceError on every row built, on every single run,
  // before the upsert was ever reached. That's why Belle Isle's freshness
  // check was red: this cron has been crashing on every invocation, not
  // just finding nothing to write.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const venueId = resolveVenueId(venueMap, VENUE_NAME);

  const rows = events
    .filter((e) => e.start_date)
    .map((e) => ({
      external_id: `bink-${e.id}`,
      title: decodeEntities(e.title),
      description: decodeEntities(stripHtml(e.description)).slice(0, 500) || null,
      category: "family",
      venue_name_raw: VENUE_NAME,
      venue_id: venueId,
      start_date: e.start_date.slice(0, 10),
      time_display: formatTimeRange(e.start_date, e.end_date),
      is_free: !e.cost || /free/i.test(e.cost),
      ticket_url: e.url || null,
      image_url: pickTribeImage(e.image),
      source: "Belle Isle Nature Center",
    }));

  if (!rows.length) {
    await finishRun(runHandle, {
      outcome: "success",
      records_fetched: events.length,
      records_parsed: rows.length,
      records_written: 0,
    });
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
        records_fetched: events.length,
        records_parsed: rows.length,
        records_written: 0,
        error_sample: "Supabase upsert failed: " + errText,
      });
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    await finishRun(runHandle, {
      outcome: "success",
      http_status: resp.status,
      records_fetched: events.length,
      records_parsed: rows.length,
      records_written: rowsWithStatus.length,
    });
    res.status(200).json({ upserted: rowsWithStatus.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    await finishRun(runHandle, {
      outcome: "failed",
      records_fetched: events.length,
      records_parsed: rows.length,
      error_sample: err.message,
    });
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
