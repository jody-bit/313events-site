const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
// Vercel Cron job — pulls Popps Packing's "Events" blog category (a home,
// studio, and experimental arts space in Hamtramck). Added 2026-09-13 at
// Jody's request, after a friend (Mark) mentioned performing at Popps
// Packing's "Soundhenge" stage during the Hamtramck Neighborhood Arts
// Festival.
//
// SOURCE DISCOVERY: poppspacking.org is a plain server-rendered WordPress
// site (twentysixteen theme) — unlike cron-detroitmonthofdesign.js/
// cron-planetanttheatre.js, there's no client-side-only rendering problem
// here at all. It exposes WordPress's standard public REST API, confirmed
// live 2026-09-13 via a real browser session (same-origin fetch from the
// page itself, since a direct server-to-server request from this
// environment's own sandbox is separately network-restricted — that
// restriction is local to this dev sandbox, not a real block Vercel's
// production functions will hit):
//
//   GET https://www.poppspacking.org/wp-json/wp/v2/categories?slug=events
//   -> category id 16, 83 posts total as of 2026-09-13
//
//   GET https://www.poppspacking.org/wp-json/wp/v2/posts?categories=16
//       &per_page=20&orderby=date&order=desc&_embed=1
//   -> standard WP post objects: id, date (PUBLISH date, not the event's own
//      date), slug, link, title.rendered, excerpt.rendered (HTML), and (via
//      _embed) the featured image under _embedded['wp:featuredmedia'][0].
//
// WHY THIS IS DIFFERENT FROM EVERY OTHER VENUE CRON HERE, AND WHY EVERY ROW
// LANDS IN pending_review (Jody's own call, asked directly 2026-09-13 after
// this tradeoff was laid out):
//   - There is no structured date/time/price field anywhere in this API —
//     the actual event date is written as plain English inside the post's
//     own title and/or excerpt, in a different phrasing almost every time
//     ("Thurs. March 26. 5-8PM" vs. "Sunday, March 16, 2025 2PM- 5PM" vs.
//     "Friday, February 21, 5pm-6:30PM Saturday, February 22, 1pm-4PM
//     Sunday, February 23, 1pM-4PM" for one 3-day announcement).
//   - This category is also posted to rarely (roughly 4-6x/year based on the
//     live post dates checked 2026-09-13: most recently March 2026, before
//     that Jan 2026, before that Mar/Feb 2025) — nothing like the daily-ish
//     cadence of this project's other venue sources.
//   - guessDateFromText() below is a genuine best-effort parse (see its own
//     comment), not a guarantee. Rather than risk a wrong date/time going
//     live on the public calendar unreviewed — or silently dropping a real
//     event because parsing failed — DEFAULT_STATUS is 'pending_review' for
//     every row unconditionally (same tier/reasoning as cron-metrotimes.js's
//     unfiltered feed), and the post's own excerpt text is always kept in
//     `description` so whoever reviews it in admin.html can read the real
//     date straight from the source and correct start_date/time_display
//     before approving — never auto-published on a guess.
//   - A post covering more than one distinct date (like the 3-day puppet
//     workshop above) still becomes exactly ONE event row here, not split
//     into several — this project doesn't yet have a reliable way to do
//     that automatically (see FEATURE_BACKLOG.md's "Editorial review: allow
//     splitting one article into multiple events" item, which is the same
//     unsolved problem in the human-reviewed editorial flow) — the reviewer
//     can manually create the additional day(s) as separate entries if
//     needed, same as they would from any other single-date source today.
//
// VENUE: always Popps Packing itself (single-venue cron, same shape as
// cron-oldmiami.js/cron-dossin.js) — 12138 St Aubin, Hamtramck, MI (address
// confirmed via Yelp 2026-09-13, see supabase/update_2026-09-13_popps-
// packing-venue.sql). venue_id resolved through the shared venue-lookup
// helper as usual, so it links up once that venue row exists.
//
// ** STATUS-PRESERVING UPSERT ** — same pattern as every other cron here:
// looks up each row's current status before writing and reuses it (an
// admin's approve/reject survives; DEFAULT_STATUS only applies to a
// brand-new row).

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

const CATEGORY_ID = 16; // "events" category — confirmed live 2026-09-13, see header
const POSTS_URL = `https://www.poppspacking.org/wp-json/wp/v2/posts?categories=${CATEGORY_ID}&per_page=20&orderby=date&order=desc&_embed=1`;
const VENUE_NAME = "Popps Packing";
const VENUE_ADDRESS = "12138 St Aubin";
const VENUE_CITY = "Hamtramck";
const DEFAULT_STATUS = "pending_review"; // see header — unstructured free-text dates, needs human triage every time

function decodeEntities(str) {
  if (!str) return str;
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripHtml(html) {
  if (!html) return "";
  return decodeEntities(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

// Light keyword guess only — every row is pending_review regardless, so a
// wrong guess here never reaches the public site unreviewed; it just saves
// the reviewer a click when it happens to be right. 'visual' default
// matches this space's core identity as a residency/studio/gallery.
function guessCategory(text) {
  const t = (text || "").toLowerCase();
  if (/sound|music|concert|band|dj\b|soundhenge/.test(t)) return "music";
  if (/puppet|workshop|kids|family/.test(t)) return "family";
  if (/film|screening/.test(t)) return "film";
  return "visual";
}

const MONTH_RE =
  "(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept|Sep|October|Oct|November|Nov|December|Dec)";
const MONTH_INDEX = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

// Best-effort "Month Day[, Year]" extraction from free-text English prose —
// this is NOT a general date parser, just enough to catch the phrasing this
// one site's posts actually use (see header comment for real examples).
// Returns null (never a guessed/wrong date) if nothing matches at all; the
// caller falls back to the post's own publish date in that case, with a
// note flagging it for manual correction — see shapeRowForPost().
function guessDateFromText(text, publishedAtISO) {
  const re = new RegExp(`${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`, "i");
  const m = (text || "").match(re);
  if (!m) return null;
  const monthIdx = MONTH_INDEX[m[1].toLowerCase()];
  const day = parseInt(m[2], 10);
  if (monthIdx == null || !day || day < 1 || day > 31) return null;

  let year = m[3] ? parseInt(m[3], 10) : null;
  if (!year) {
    // No year in the text — same "nearest future occurrence" assumption
    // cron-metrotimes.js uses for the same gap: these posts are always
    // announcing something upcoming, so if the month/day has already
    // passed relative to when the post went up, it almost certainly means
    // the following year rather than one already gone by.
    const published = publishedAtISO ? new Date(publishedAtISO) : new Date();
    year = published.getFullYear();
    const candidate = new Date(year, monthIdx, day);
    if (candidate < published) year += 1;
  }

  const candidate = new Date(year, monthIdx, day);
  if (Number.isNaN(candidate.getTime())) return null;
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Best-effort time-range extraction, e.g. "5-8PM" / "5PM-8PM" / "2PM- 5PM" /
// "5pm-6:30PM". A range missing AM/PM on its first number ("5-8PM") is
// assumed to share the second number's period, the common shorthand this
// site's own posts use. Returns null if nothing matches — time_display
// just stays unset rather than guessed, same "don't fabricate" rule as
// every other field here.
function guessTimeFromText(text) {
  const re = /(\d{1,2}(?::\d{2})?)\s*([AaPp]\.?[Mm]\.?)?\s*[-–—]\s*(\d{1,2}(?::\d{2})?)\s*([AaPp]\.?[Mm]\.?)/;
  const m = (text || "").match(re);
  if (!m) {
    const single = (text || "").match(/(\d{1,2}(?::\d{2})?)\s*([AaPp]\.?[Mm]\.?)/);
    if (!single) return null;
    return normalizeTimePart(single[1], single[2]);
  }
  const endPeriod = normalizePeriod(m[4]);
  const startPeriod = m[2] ? normalizePeriod(m[2]) : endPeriod; // shorthand fallback, see comment above
  const start = normalizeTimePart(m[1], startPeriod);
  const end = normalizeTimePart(m[3], endPeriod);
  return start && end ? `${start}–${end}` : start || end || null;
}

function normalizePeriod(raw) {
  return /p/i.test(raw) ? "PM" : "AM";
}

function normalizeTimePart(numPart, period) {
  if (!numPart || !period) return null;
  const [hRaw, mRaw] = numPart.split(":");
  const h = parseInt(hRaw, 10);
  if (!h || h < 1 || h > 12) return null;
  const mm = mRaw ? mRaw.padStart(2, "0") : "00";
  return `${h}:${mm} ${period}`;
}

function shapeRowForPost(post) {
  if (!post || !post.id || !post.title) return null;
  const title = decodeEntities(post.title.rendered || "");
  if (!title) return null;
  const excerptText = stripHtml(post.excerpt && post.excerpt.rendered);
  const combinedText = `${title} ${excerptText}`;
  const publishedAtISO = post.date ? `${post.date}` : null;

  const parsedDate = guessDateFromText(combinedText, publishedAtISO);
  const parsedTime = guessTimeFromText(combinedText);
  const fallbackDate = publishedAtISO ? publishedAtISO.slice(0, 10) : new Date().toISOString().slice(0, 10);

  let imageUrl;
  try {
    const media = post._embedded && post._embedded["wp:featuredmedia"] && post._embedded["wp:featuredmedia"][0];
    imageUrl = media && media.source_url ? media.source_url : undefined;
  } catch {
    imageUrl = undefined;
  }

  const note = parsedDate
    ? undefined
    : "Date could not be parsed from Popps Packing's post text — read the description below and set the real date before approving.";

  return {
    external_id: `poppspacking-${post.id}`,
    title,
    description: excerptText || undefined,
    category: guessCategory(combinedText),
    venue_name_raw: VENUE_NAME,
    venue_address_raw: VENUE_ADDRESS,
    venue_city_raw: VENUE_CITY,
    start_date: parsedDate || fallbackDate,
    time_display: parsedTime || undefined,
    note,
    image_url: imageUrl,
    ticket_url: post.link || undefined,
    event_url: post.link || undefined,
    source: "Popps Packing",
  };
}

module.exports = async (req, res) => {
  // BUG-004 (2026-09-21) diagnostic instrumentation — this connector had no
  // logging at all, so a 7-day production freshness incident couldn't be
  // diagnosed from Vercel's logs (unlike cron-metrotimes.js, which got this
  // same kind of instrumentation on 2026-09-14 for the identical "200 but
  // nothing written, no visibility" problem). No secrets/tokens/full
  // payloads are logged — counts and statuses only.
  console.log(`[cron-poppspacking] cron started ${new Date().toISOString()}`);
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

  let posts;
  try {
    const r = await fetch(POSTS_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (313.events event calendar)", Accept: "application/json" },
    });
    console.log(`[cron-poppspacking] upstream response status=${r.status}`);
    if (!r.ok) {
      console.log(`[cron-poppspacking] cron completion: aborted, upstream fetch failed status=${r.status}`);
      res.status(200).json({ upserted: 0, error: `Fetch failed: HTTP ${r.status}` });
      return;
    }
    posts = await r.json();
  } catch (err) {
    console.log(`[cron-poppspacking] cron completion: aborted, upstream fetch threw: ${err.message}`);
    res.status(200).json({ upserted: 0, error: "Fetch failed: " + err.message });
    return;
  }

  const upstreamCount = Array.isArray(posts) ? posts.length : 0;
  console.log(`[cron-poppspacking] upstream records fetched=${upstreamCount}`);

  if (!Array.isArray(posts) || !posts.length) {
    console.log("[cron-poppspacking] cron completion: 0 rows, API returned no posts");
    res.status(200).json({ upserted: 0, note: "API returned no posts — layout/response shape may have changed.", fetchedAt: new Date().toISOString() });
    return;
  }

  const rows = posts.map(shapeRowForPost).filter(Boolean);
  console.log(`[cron-poppspacking] records parsed=${rows.length} (of ${upstreamCount} fetched)`);
  if (!rows.length) {
    console.log("[cron-poppspacking] cron completion: 0 rows, none produced a usable row");
    res.status(200).json({ upserted: 0, note: "Parsed posts but none produced a usable row.", fetchedAt: new Date().toISOString() });
    return;
  }

  // See api/_lib/venue-lookup.js — links to the existing Popps Packing
  // venues row once it exists; never creates or guesses a fuzzy one.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const rowsWithVenue = rows.map((row) => ({
    ...row,
    venue_id: resolveVenueId(venueMap, row.venue_name_raw),
  }));
  console.log(`[cron-poppspacking] records eligible for write=${rowsWithVenue.length} (this connector applies no additional date/eligibility filter beyond shapeRowForPost)`);

  try {
    // Look up each row's current status AND start_date/time_display before
    // writing. WP 0.8 (2026-09-21): this cron was re-sending its own
    // guessed/fallback start_date and time_display on every run, even for
    // posts already in the database — silently reverting any date/time
    // correction a reviewer made in admin.html back to this scraper's best
    // guess the very next day. Status was already preserved this way; date/
    // time now are too.
    const idList = rowsWithVenue.map((r) => r.external_id).join(",");
    const lookupResp = await fetch(
      `${SUPABASE_URL}/rest/v1/events?external_id=in.(${idList})&select=external_id,status,start_date,time_display`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const existingByExternalId = new Map();
    if (lookupResp.ok) {
      const existingRows = await lookupResp.json();
      if (Array.isArray(existingRows)) {
        existingRows.forEach((row) => existingByExternalId.set(row.external_id, row));
      }
    }
    // Lookup failure falls through with an empty map — every row is treated
    // as brand-new (status defaults to DEFAULT_STATUS, start_date/
    // time_display are sent as usual), same as this scraper's first-ever
    // run, same fail-soft posture as every other field here.

    // PostgREST's mixed-key bulk-upsert behavior for one batch containing
    // objects with different key sets is still unverified project-wide
    // (see WP 0.7/0.11 — sending a batch with some rows missing
    // start_date/time_display and others having it risks PostgREST
    // NULL-filling the column for every row instead of leaving existing
    // values untouched). Rather than risk that, rows are grouped by
    // identical key set — same interim approach WP 0.7 prescribes — and
    // sent as two separate upsert calls: brand-new rows (full shape,
    // including this run's best-guess start_date/time_display) and
    // existing rows (start_date/time_display genuinely omitted from the
    // JSON object, not sent as null, so the existing DB value is left
    // alone).
    const newRows = [];
    const existingRows = [];
    for (const row of rowsWithVenue) {
      const existing = existingByExternalId.get(row.external_id);
      const withStatus = { ...row, status: (existing && existing.status) || DEFAULT_STATUS };
      if (existing) {
        delete withStatus.start_date;
        delete withStatus.time_display;
        existingRows.push(withStatus);
      } else {
        newRows.push(withStatus);
      }
    }

    async function upsertGroup(label, groupRows) {
      if (!groupRows.length) return { ok: true, count: 0 };
      console.log(`[cron-poppspacking] Supabase write attempted: group=${label} rows=${groupRows.length}`);
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(groupRows),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        // Truncated — this is a PostgREST/Postgres error message, not a
        // secret, but kept short regardless of what it happens to contain.
        console.log(`[cron-poppspacking] Supabase response: group=${label} status=${resp.status} error=${errText.slice(0, 300)}`);
        return { ok: false, count: 0, error: errText };
      }
      console.log(`[cron-poppspacking] Supabase response: group=${label} status=${resp.status} ok, wrote ${groupRows.length} row(s)`);
      return { ok: true, count: groupRows.length };
    }

    const [newResult, existingResult] = await Promise.all([
      upsertGroup("new", newRows),
      upsertGroup("existing", existingRows),
    ]);
    const upserted = newResult.count + existingResult.count;
    const groupErrors = [newResult, existingResult].filter((r) => !r.ok);

    if (groupErrors.length) {
      console.log(`[cron-poppspacking] cron completion: partial/failed, upserted=${upserted}, ${groupErrors.length} group error(s)`);
      res.status(502).json({
        upserted,
        error: "Supabase upsert failed for one or more groups: " + groupErrors.map((r) => r.error).join(" | "),
      });
      return;
    }
    console.log(`[cron-poppspacking] cron completion: ok, upserted=${upserted} (new=${newRows.length}, existingPreserved=${existingRows.length})`);
    res.status(200).json({
      upserted,
      newRows: newRows.length,
      existingRowsPreserved: existingRows.length,
      postsParsed: posts.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.log(`[cron-poppspacking] cron completion: unhandled error: ${err.message}`);
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
