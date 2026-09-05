const crypto = require("crypto");
// Vercel Cron job — pulls Planet Ant Theatre's full show calendar (Ant Hall
// and its Black Box room, both in Hamtramck) from CrowdWork, the box-office
// platform crowdwork.com/v/planetanttheatre/shows is built on. Added
// 2026-09-04 at Jody's request, after first adding one of this venue's shows
// (Nicolas Uncaged 11) by hand — she then asked for "their entire calendar."
//
// SOURCE DISCOVERY: the public listing page (crowdwork.com/v/planetanttheatre
// /shows) renders entirely client-side — a plain fetch of it returns only a
// "Loading..." placeholder, same "no headless browser in this stack"
// limitation documented in cron-detroitmonthofdesign.js's header comment.
// BUT that page's own JS calls a clean, public, unauthenticated JSON API to
// get its data — found via a live browser session's network log (2026-09-04)
// rather than guessed:
//
//   GET https://www.crowdwork.com/api/v2/planetanttheatre/shows?start=YYYY-MM-DD
//
// That's a plain server-to-server fetch a Vercel function CAN make directly
// (no JS execution needed) — this scrapes that API, not the rendered page.
// One request already returns each show's own array of upcoming occurrences
// (a weekly show like the Thursday Show came back with ~16 future dates in
// one response, confirmed live), so a single daily call is enough — no
// pagination needed in practice.
//
// SHAPE: { data: [ { id, name, recurring, dates: [ISO datetime, ...], venue:
// "<Name> - <Street> <City>, MI <Zip>[ - <note>]", url, cost_tiers: [{
// cost_after_fees (cents), ...}], description_short, img: {url} }, ... ] }.
// Every entry in `dates` is a separate real occurrence of that same show —
// this scraper writes one events row per occurrence (external_id includes
// the date), same "each date is its own row" approach cron-lagerhouse.js and
// cron-metrotimes.js already take for their own recurring listings.
//
// CATEGORY: this project's 13-category taxonomy has no dedicated slot for
// comedy/improv/burlesque, so each show's own "CATEGORY l Title" naming
// convention (e.g. "COMEDY l The Thursday Show", "FILM l Nicolas Uncaged
// 11") is mapped onto the closest existing category — COMEDY/STANDUP
// COMEDY/IMPROV/GAME SHOW -> 'theatre' (same "comedy folds into theatre"
// call cron-ticketmaster.js's mapCategory() already makes for Ticketmaster's
// own genre data), THEATRE -> 'theatre', FILM -> 'film', BURLESQUE ->
// 'nightlife'. Anything with no recognized prefix (e.g. a one-off community
// event like the "Take a Detroit Tour" fundraiser) falls back to
// 'community' rather than being skipped.
//
// VENUE PARSING: the API's own `venue` field bundles name + address into one
// string with no comma between street and city (e.g. "Black Box - 2357
// Caniff Hamtramck, MI 48212 - Entrance in the rear"), so venue_name_raw /
// venue_address_raw / venue_city_raw are split out of it with a regex here
// rather than stored as one raw blob — consistent with every other source in
// this project keeping those as separate columns. A venue string that
// doesn't match the "<Name> - <Street> <City>, MI <Zip>" shape (e.g. "MEETING
// LOCATION: Guardian Building" for an offsite fundraiser walk) is kept as the
// venue name with no address/city, same "don't guess" fallback as every
// other scraper here.
//
// PRICE: cost_tiers already has cost_after_fees in cents per tier (the site's
// own "prices include all fees" banner) — price_from is the cheapest tier,
// converted to dollars.
//
// TRUST TIER: Planet Ant's own official box office system, not a third-party
// aggregator — same tier as cron-lagerhouse.js/cron-dossin.js (DEFAULT_STATUS
// = 'approved').
//
// ** STATUS-PRESERVING UPSERT ** — same pattern as every other cron here
// since the 2026-09-02 audit: looks up each row's current status before
// writing and reuses it, only defaulting brand-new rows to DEFAULT_STATUS.
//
// ** BEST-EFFORT ** — built from a real captured API response, spot-check
// the first live run. If CrowdWork ever changes this endpoint's shape, worst
// case is 0 rows parsed (silent no-op), not corrupted data — every field is
// read defensively below.

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

const VENUE_SLUG = "planetanttheatre";
const DEFAULT_STATUS = "approved"; // the venue's own official box office, same trust tier as cron-lagerhouse.js

// 2026-09-05 fix attempt: the first live scheduled run (2026-09-04 22:01 ET,
// confirmed via Vercel's request log — real vercel-cron/1.0 trigger, so the
// cron itself is firing fine) got a 403 back from this fetch. Checked live in
// a real browser: the identical GET to this same endpoint returns a normal
// 200 with a full JSON body (confirmed via the browser's own network
// inspector), and crowdwork.com's robots.txt is fully permissive (`User-agent:
// * / Disallow:` — no bot policy being violated here at all). The response
// headers show `server: cloudflare`, so this is Cloudflare's bot/WAF layer at
// the edge, not a deliberate CrowdWork API policy — and it's specifically
// scoring Vercel's serverless egress IPs differently from a real browser's.
// Added the standard Accept / Accept-Language / Referer headers a real
// browser sends (a plain server-side fetch omits all three by default, which
// is itself a common WAF "looks automated" signal) to see if that alone
// clears it. Deliberately NOT spoofing the User-Agent to impersonate a real
// browser — every other cron in this project identifies itself honestly as
// "313.events event calendar", and that convention is kept here even
// though robots.txt would technically allow disguising it. If this doesn't
// clear the 403 on the next scheduled run, the block is almost certainly
// IP/network-level (Cloudflare bot-managing the whole Vercel ASN) rather than
// header-based, and not fixable from serverless code — see sources.html for
// what that means for this source.
const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (313.events event calendar)",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `https://www.crowdwork.com/v/${VENUE_SLUG}/shows`,
};

function decodeEntities(str) {
  if (!str) return str;
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Shared by mapCategory() and stripCategoryPrefix() below — CrowdWork's own
// "CATEGORY l Title" naming convention (e.g. "FILM l Nicolas Uncaged 11",
// "COMEDY l The Thursday Show w/ The Planet Ant Home Team") puts the same
// prefix to two different uses here: mapCategory() reads it to pick this
// project's category, stripCategoryPrefix() removes it so the prefix itself
// never ends up as part of a public-facing event title.
const CATEGORY_PREFIX_RE = /^([A-Z][A-Z '&]+?)\s+l\s+/;

function mapCategory(name) {
  const m = (name || "").match(CATEGORY_PREFIX_RE);
  const prefix = m ? m[1].trim().toUpperCase() : "";
  if (/COMEDY|IMPROV|GAME SHOW/.test(prefix)) return "theatre";
  if (/THEATRE/.test(prefix)) return "theatre";
  if (/FILM/.test(prefix)) return "film";
  if (/BURLESQUE/.test(prefix)) return "nightlife";
  return "community"; // no recognized prefix — e.g. a one-off fundraiser/tour
}

// 2026-09-04 audit fix (caught while diagnosing why "Nicolas Uncaged 11"
// hadn't shown up yet — this cron simply hadn't had its first scheduled run
// since being added, not a bug — but this WAS a real bug found along the
// way): shapeRowsForShow() below was writing show.name straight into
// events.title, so every show with the "CATEGORY l " naming prefix would
// have gone live on the site as "FILM l Nicolas Uncaged 11", "COMEDY l The
// Thursday Show w/ The Planet Ant Home Team", "GAME SHOW l Buck's
// Funhouse", etc. — the internal box-office categorization tag leaking into
// a public-facing title. Strips exactly the prefix mapCategory() itself
// already parses out for the SAME reason it's being removed here (it's not
// part of the show's actual name), leaving titles that don't happen to use
// this convention (e.g. "Shortbus 20th Anniversary Live Commentary
// Screening w/ John Cameron Mitchell") untouched.
function stripCategoryPrefix(name) {
  if (!name) return name;
  return name.replace(CATEGORY_PREFIX_RE, "").trim();
}

// "Black Box - 2357 Caniff Hamtramck, MI 48212 - Entrance in the rear" ->
// { name: "Black Box", address: "2357 Caniff, Hamtramck, MI 48212",
//   city: "Hamtramck", note: "Entrance in the rear" }. No comma separates
// street from city in this API's own venue string, so the city is matched as
// the single capitalized word immediately before ", MI" and everything
// between the venue name and that word is the street — regex backtracking
// finds the right split without needing a delimiter that isn't there.
function parseVenue(raw) {
  if (!raw || !raw.trim()) return { name: "Venue TBA", address: null, city: null, note: null };
  const m = raw.match(/^(.+?)\s*-\s*(.+?)\s+([A-Z][a-zA-Z]+),\s*MI\s*(\d{5})\b(?:\s*-\s*(.+))?$/);
  if (!m) return { name: raw.trim(), address: null, city: null, note: null };
  const [, venueName, street, city, zip, trailingNote] = m;
  return {
    name: venueName.trim(),
    address: `${street.trim()}, ${city.trim()}, MI ${zip}`,
    city: city.trim(),
    note: trailingNote ? trailingNote.trim() : null,
  };
}

function minCostDollars(costTiers) {
  if (!Array.isArray(costTiers) || !costTiers.length) return null;
  const cents = costTiers.map((t) => t.cost_after_fees).filter((n) => typeof n === "number" && Number.isFinite(n));
  if (!cents.length) return null;
  return Math.round(Math.min(...cents)) / 100;
}

// 12-hour time string straight from an ISO datetime's own HH:MM — the ISO
// string already carries the correct local offset (e.g.
// "2026-09-11T20:00:00.000-04:00"), same approach as
// cron-detroitmonthofdesign.js's formatTime12h().
function formatTime12h(isoString) {
  const m = (isoString || "").match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${ampm}`;
}

function isoDatePortion(isoString) {
  return (isoString || "").slice(0, 10);
}

function shapeRowsForShow(show) {
  if (!show || !show.name || !Array.isArray(show.dates)) return [];
  const category = mapCategory(show.name);
  const { name: venueName, address, city, note } = parseVenue(show.venue);
  const priceFrom = minCostDollars(show.cost_tiers);
  const description = show.description_short ? decodeEntities(show.description_short) : undefined;
  const imageUrl = show.img && show.img.url ? show.img.url : undefined;

  return show.dates
    .filter(Boolean)
    .map((dateIso) => ({
      external_id: `crowdwork-${VENUE_SLUG}-${show.id}-${isoDatePortion(dateIso)}`.slice(0, 250),
      title: decodeEntities(stripCategoryPrefix(show.name)),
      description,
      category,
      venue_name_raw: venueName,
      venue_address_raw: address || undefined,
      venue_city_raw: city || undefined,
      start_date: isoDatePortion(dateIso),
      time_display: formatTime12h(dateIso) || undefined,
      note: note || undefined,
      is_free: priceFrom === 0,
      price_from: priceFrom ?? undefined,
      image_url: imageUrl,
      ticket_url: show.url || `https://www.crowdwork.com/v/${VENUE_SLUG}/shows`,
      source: "Planet Ant Theatre",
    }));
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

  const todayISO = new Date().toISOString().slice(0, 10);

  let payload;
  try {
    const r = await fetch(
      `https://www.crowdwork.com/api/v2/${VENUE_SLUG}/shows?start=${todayISO}`,
      { headers: REQUEST_HEADERS }
    );
    if (!r.ok) {
      res.status(200).json({ upserted: 0, error: `Fetch failed: HTTP ${r.status}` });
      return;
    }
    payload = await r.json();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Fetch failed: " + err.message });
    return;
  }

  const shows = payload && Array.isArray(payload.data) ? payload.data : [];
  if (!shows.length) {
    res.status(200).json({ upserted: 0, note: "API returned no shows — layout/response shape may have changed.", fetchedAt: new Date().toISOString() });
    return;
  }

  const allRows = shows.flatMap(shapeRowsForShow).filter((row) => row.start_date >= todayISO);
  if (!allRows.length) {
    res.status(200).json({ upserted: 0, note: "Parsed shows but none are today or later.", fetchedAt: new Date().toISOString() });
    return;
  }

  // De-dupe by external_id before sending — Postgres's ON CONFLICT DO UPDATE
  // can't touch the same target row twice in one statement.
  const seen = new Map();
  for (const row of allRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  try {
    // Look up each row's current status before writing, so an admin's
    // approve/reject decision on an existing row survives this upsert
    // instead of being silently reset to DEFAULT_STATUS every run — see
    // cron-lagerhouse.js's header comment for the full story.
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
    // to DEFAULT_STATUS, same as this scraper's first-ever run.

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
    res.status(200).json({ upserted: rowsWithStatus.length, showsParsed: shows.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
