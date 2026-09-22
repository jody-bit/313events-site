const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { lookupExistingStatuses } = require("./_lib/status-lookup");

// Vercel Cron job — pulls Detroit-area events straight from visitdetroit.com's
// own Algolia search index, discovered 2026-09-14 while answering Jody's
// question "what ideas do you have to get the events details from them?"
// (she'd correctly clocked that the site's "UPCOMING EVENTS" widget only
// reveals its content on a real scroll gesture — an antiquated lazy-load, not
// a broken page).
//
// ** HOW THIS WAS FOUND ** — network-request capture during a real (not
// simulated) scroll surfaced a POST to
// https://eyqhj2iy2m-dsn.algolia.net/1/indexes/*/queries, using Algolia
// Application Id EYQHJ2IY2M and a search-only API key. That's the exact same
// request their own front-end JS fires — the key is a public, search-only
// Algolia credential, meant to be shipped to every visitor's browser (Algolia
// search keys can only read, never write, and this one is visible in the
// clear in every page load of visitdetroit.com/events/). Calling it directly
// isn't a bypass of anything; it's the same data their own widget already
// hands to any visitor, just without needing a real scroll event to trigger
// it. Confirmed live: querying with hitsPerPage=1000 returns nbHits: 180,
// exactly matching the total visitdetroit.com's own page reports.
//
// ** WHY THIS IS A CRON, NOT A ONE-OFF ** — the manual pull done the same day
// (see supabase/update_2026-09-13_visitdetroit-manual-pull.sql) only ever
// read their "Live Music This Weekend" widget by hand — a narrow 12-event
// slice, 10 of which were already-duplicated Ticketmaster shows. This index
// is the real, complete dataset behind the whole /events/ page, so it belongs
// on the same automated schedule as every other source rather than repeating
// a manual pull indefinitely.
//
// ** THE REAL RISK: CROSS-SOURCE DUPLICATES ** — this index covers every
// visitdetroit.com "Default Calendar" event, which includes the same major
// touring shows Ticketmaster (cron-ticketmaster.js) already covers with
// better data (real venue, real ticket link). Blindly upserting all ~180
// rows here every day would flood the events table with duplicate listings
// for every major concert. This cron guards against that with a conservative
// heuristic — before inserting, it normalizes (title, start_date) and skips
// any row that already exists under that same key from a DIFFERENT source.
// This is an exact-normalized-title match, not fuzzy/semantic matching: it
// will under-match (miss a real duplicate if the two sources word the title
// noticeably differently) but will never silently overwrite or duplicate a
// row it's unsure about — same "don't guess, leave an honest gap" posture as
// every other cron in this project. A real cross-source entity-resolution
// system (see ASSESSMENT_regional_acquisition.md) is the eventual fix; this
// is the safe interim version.
//
// ** CATEGORIES ** — visitdetroit's own category vocabulary is tourism-
// oriented (e.g. "Music & Concerts", "Fairs & Festivals", "Annual Events",
// "Nature & Outdoors", "Sports & Recreation") and doesn't map cleanly onto
// this calendar's 10-value enum. CATEGORY_PRIORITY below only maps the labels
// with a confident 1:1 correspondence; any event whose eventCategories don't
// include one of those is excluded entirely (never guessed at) — same
// "unmapped -> excluded" convention as cron-ticketmaster.js/cron-wdet.js.
// Verified live 2026-09-14: this excludes 20 of the 180 events (things like
// "MARVAC Fall Detroit RV & Camping Show" or a walking "Small Business Tour"
// that don't fit any of this calendar's categories anyway).
//
// ** PRICE ** — the index carries no price/free field. is_free is left at
// its schema default (false) rather than guessed true — many of these are
// genuinely free tourism/city events, but nothing here signals which, so no
// row claims "free" without real evidence.
//
// ** FRAGILITY ** — this depends on visitdetroit.com's Algolia app id, index
// name, and filter shape staying the same; if they rotate the key or rename
// the index, this cron starts silently returning 0 upserts (fails soft, same
// as every other cron here) rather than erroring loudly. See
// cron-healthcheck.js's checkSourceFreshness("VisitDetroit") for the check
// that actually catches that going quiet.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

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

const ALGOLIA_APP_ID = "EYQHJ2IY2M";
// Public, search-only Algolia key — see header comment. Not a secret; this
// exact string is already shipped in visitdetroit.com's own page source to
// every visitor.
const ALGOLIA_API_KEY = "c6d5977cb5cd80c09abfd2a7e5d9e88b";
const ALGOLIA_INDEX = "prod-visit-detroit-listings";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
// Same filter their own widget sends with no category/keyword/date-range
// narrowed — "give me everything on the Default Calendar that isn't
// secondary-listing noise."
const ALGOLIA_FILTERS = 'calendarName:"Default Calendar" AND (NOT isPrimaryEvent:false)';

const SOURCE_NAME = "VisitDetroit";
const DEFAULT_STATUS = "approved";

// First matching label wins — order matters where an event could plausibly
// carry more than one (e.g. a concert tagged both "Music & Concerts" and
// "Entertainment").
const CATEGORY_PRIORITY = [
  ["Music & Concerts", "music"],
  ["Arts & Theater", "theatre"],
  ["Fairs & Festivals", "fest"],
  ["Food & Drink", "food"],
  ["Kids & Family", "family"],
  ["Family Friendly", "family"],
  ["History & Heritage", "museum"],
  ["Art & Culture", "visual"],
];

function mapCategory(cats) {
  if (!Array.isArray(cats)) return null;
  for (const [label, key] of CATEGORY_PRIORITY) {
    if (cats.includes(label)) return key;
  }
  return null;
}

// Identical Unix-seconds -> America/Detroit conversion approach as
// cron-feeds.js/cron-playgrounddetroit.js's own UTC -> America/Detroit
// helpers, just starting from an epoch-seconds number instead of an ICS
// "Z" timestamp.
function detroitParts(unixSeconds) {
  if (!unixSeconds && unixSeconds !== 0) return null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(unixSeconds * 1000)).map((p) => [p.type, p.value]));
  const hour24 = parts.hour === "24" ? 0 : parseInt(parts.hour, 10);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: hour24, minute: parseInt(parts.minute, 10) };
}

function formatTime(hour, minute) {
  const ap = hour >= 12 ? "PM" : "AM";
  let h12 = hour % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${ap}`;
}

// address is Algolia's own [venueName, street, "City, State (zip)"] shape —
// seen as short as [venueName] alone for a "TBA"-style listing.
function parseAddress(address) {
  if (!Array.isArray(address) || !address.length) return { name: null, street: null, city: null };
  const name = address[0] || null;
  const street = address.length > 2 ? address[1] : null;
  const cityState = address.length > 2 ? address[2] : (address.length === 2 ? address[1] : null);
  let city = null;
  if (cityState) {
    const commaIdx = cityState.indexOf(",");
    city = (commaIdx === -1 ? cityState : cityState.slice(0, commaIdx)).trim() || null;
  }
  return { name, street, city };
}

// Conservative cross-source dedupe key — see header comment. Punctuation-
// insensitive, case-insensitive, whitespace-collapsed exact match on
// (title, start_date) only.
function dedupeKey(title, startDate) {
  const norm = (title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return `${norm}|${startDate}`;
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
    const params = `filters=${encodeURIComponent(ALGOLIA_FILTERS)}&hitsPerPage=1000&page=0`;
    const r = await fetch(ALGOLIA_URL, {
      method: "POST",
      headers: {
        "X-Algolia-API-Key": ALGOLIA_API_KEY,
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ params }),
    });
    if (!r.ok) {
      res.status(200).json({ upserted: 0, error: `Algolia query failed: HTTP ${r.status}` });
      return;
    }
    data = await r.json();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Algolia query failed: " + err.message });
    return;
  }

  const hits = Array.isArray(data.hits) ? data.hits : [];

  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let excludedByCategory = 0;
  let excludedByDate = 0;

  const mappedRows = hits
    .map((h) => {
      const cat = mapCategory(h.eventCategories);
      if (!cat) { excludedByCategory++; return null; }

      const startParts = detroitParts(h.startDate);
      if (!startParts) { excludedByDate++; return null; }
      const endParts = h.endDate ? detroitParts(h.endDate) : null;
      const endDate = endParts && endParts.date !== startParts.date ? endParts.date : null;

      // 2026-09-16: was `!h.isAllDay && !h.isMultiDay` — that suppressed
      // time_display for EVERY multi-day listing, not just genuinely
      // all-day ones. isMultiDay just means the listing spans more than one
      // calendar date (a festival run, a multi-performance theatre
      // engagement); it says nothing about whether that listing also has a
      // real start time-of-day, and startParts.hour/minute come straight
      // from h.startDate regardless of isMultiDay. isAllDay is the actual
      // "no meaningful time" signal. Traced this after several
      // admin-follow-up items that are genuinely multi-day (Detroit Black
      // Film Festival, Metro Detroit Women's Expo, Banana Ball, Detroit
      // Legacy Weekend) kept showing "Missing: START TIME" in the admin
      // panel even after Jody manually researched and confirmed each one
      // DOES have a real, specific, published start time each day on the
      // organizer's own site — evidence the source data has a real time,
      // this cron was just throwing it away. Still suppressed for true
      // isAllDay listings, same as before.
      let timeDisplay = null;
      if (!h.isAllDay) {
        timeDisplay = formatTime(startParts.hour, startParts.minute);
        if (
          endParts &&
          endParts.date === startParts.date &&
          (endParts.hour !== startParts.hour || endParts.minute !== startParts.minute)
        ) {
          timeDisplay += ` – ${formatTime(endParts.hour, endParts.minute)}`;
        }
      }

      const { name: venueName, street, city } = parseAddress(h.address);

      return {
        external_id: `vd-${h.id}`,
        title: h.title,
        description: h.content || null,
        category: cat,
        venue_name_raw: venueName,
        venue_address_raw: street,
        venue_city_raw: city && city.toLowerCase() !== "detroit" ? city : null,
        venue_id: resolveVenueId(venueMap, venueName),
        start_date: startParts.date,
        end_date: endDate,
        time_display: timeDisplay,
        is_recurring: !!h.readableRepeatRule,
        // Persisted so the admin follow-up queue can stop asking for a
        // start time on genuinely all-day listings instead of treating
        // every null time_display as a parsing gap — see migration_028.
        is_all_day: !!h.isAllDay,
        is_free: false, // no price signal in this index — see header comment, never guessed true
        price_from: null,
        ticket_url: h.uri ? `https://visitdetroit.com${h.uri}` : null,
        image_url: h.primaryImageUrl || null,
        source: SOURCE_NAME,
        note: h.readableRepeatRule
          ? `VisitDetroit lists this as recurring ("${h.readableRepeatRule}") — only this dated occurrence is captured here.`
          : null,
        _dedupeKey: dedupeKey(h.title, startParts.date),
      };
    })
    .filter(Boolean);

  if (!mappedRows.length) {
    res.status(200).json({
      upserted: 0,
      excludedByCategory,
      excludedByDate,
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  // Cross-source duplicate guard — see header comment. Only compares against
  // OTHER sources' rows in the same date window this batch actually spans,
  // so this cron's own previously-upserted rows never block a re-run.
  let existingKeys = new Set();
  try {
    const dates = mappedRows.map((r) => r.start_date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    const lookupResp = await fetch(
      `${SUPABASE_URL}/rest/v1/events?select=title,start_date&source=neq.${encodeURIComponent(SOURCE_NAME)}` +
        `&start_date=gte.${minDate}&start_date=lte.${maxDate}`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (lookupResp.ok) {
      const existingRows = await lookupResp.json();
      if (Array.isArray(existingRows)) {
        existingKeys = new Set(existingRows.map((r) => dedupeKey(r.title, r.start_date)));
      }
    }
  } catch {
    // Lookup failed — proceed with an empty exclusion set rather than fail
    // the whole run; worst case this pass over-inserts a few rows that a
    // later admin pass or this cron's own honest "still fragile" caveat
    // already flags as a known risk, never worse than that.
  }

  const newRows = mappedRows.filter((r) => !existingKeys.has(r._dedupeKey));
  const skippedAsDuplicate = mappedRows.length - newRows.length;
  const rows = newRows.map(({ _dedupeKey, ...rest }) => rest);

  if (!rows.length) {
    res.status(200).json({
      upserted: 0,
      skippedAsDuplicate,
      excludedByCategory,
      excludedByDate,
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    // Status-preserving upsert — same fix/pattern as cron-wdet.js /
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
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    res.status(200).json({
      upserted: rowsWithStatus.length,
      skippedAsDuplicate,
      excludedByCategory,
      excludedByDate,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
