const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingRows } = require("./_lib/status-lookup");

// Vercel Cron job — Bagley Community Council (bagleycommunity.org), added
// 2026-10-01 per explicit Product Owner request ("Add Bagley as a
// first-class neighborhood... Add Bagley Community Council as an event
// source"). See supabase/update_2026-10-01_bagley-venues-and-boundary.sql
// for the companion venue/neighborhood migration this connector depends on.
//
// ** WHY THIS SOURCE SHAPE ** — bagleycommunity.org is WordPress (theme
// "Association"), but NOT running a dedicated events-calendar plugin for
// its public-facing calendar page. It does, however, run the "WP Event
// Manager" plugin, which exposes a real, public, CORS-enabled REST
// endpoint for its own custom post type: /wp-json/wp/v2/event_listing.
// Per the Product Owner's explicit preference ("prefer the most stable and
// lowest-maintenance source... do not scrape rendered HTML if a reliable
// structured endpoint exists"), this connector uses that endpoint as its
// primary (Tier 1) source rather than parsing /upcoming-events/ as an HTML
// page.
//
// ** THE CATCH, AND WHY THIS IS STILL TWO TIERS, NOT ONE ** — confirmed
// live (2026-10-01) that /wp-json/wp/v2/event_listing currently exposes
// exactly 2 posts: the two most recent monthly "General Meeting"
// announcements. WP Event Manager registers NO meta fields in REST for
// this install (checked /wp-json/wp/v2/types/event_listing — no `meta`
// schema), so date/time/location are not structured data; they live only
// as prose inside content.rendered, same as every other post on the site.
// The Council's other genuinely public one-off events (Trunk or Treat,
// yard sales, cleanups) are NOT posted as event_listing items at all —
// they're ordinary blog posts on /wp-json/wp/v2/posts, which has no
// category/tag signal to separate real events from announcements/news
// (every sampled post comes back "Uncategorized", tags: []). The only
// reliable, confidence-anchored signal there is a recurring TITLE pattern:
// "<Event Name> – <[day]> <Month> <Day>[suffix][ at <time> am/pm]" —
// confirmed against real titles ("Bagley Community Council Annual Trunk or
// Treat – October 31st at 6 p.m.", "Bagley Blooms Tool Shed Reveal –
// Sunday September 6th 12-4 p.m.") and confirmed to correctly NOT match
// real non-event posts on the same site ("Successful Sidewalk Sale",
// "Detroit Home Repair Pre-Application Portal is open from September 9
// through September 22, 2026", etc. — none of these have a parseable date
// directly in the title). Tier 2 therefore only ever matches a narrow,
// specific shape; anything that doesn't match that shape is left alone
// rather than guessed at.
//
// ** TIER 1 (event_listing / General Meetings) ** — the recurring template
// text on both currently-live posts is identical: "Please join us on the
// third Saturday of every month... Third Saturday @ 10:00 a.m.
// Neighborhood Home Base located at 7426 W. McNichols Rd. (aka Live6
// Alliance)." The month is never stated in that recurring sentence itself
// (it just says "every month"), so this connector gets the month/year from
// the post's own title if present (e.g. a title naming the month), falling
// back to the post's own WordPress `date` (publish date) otherwise — these
// announcements are reliably posted in the same month as the meeting they
// announce. The actual calendar date is then computed as the third
// Saturday of that month. If the recurring "third Saturday"/time pattern
// is not found in a post's content, that post is skipped entirely rather
// than force-parsed — confidence-anchored, same principle as Tier 2.
//
// ** VENUE / NEIGHBORHOOD — THE IMPORTANT PART ** — every Tier 1 General
// Meeting happens at "Neighborhood Home Base" (7426 W. McNichols Rd.),
// which is NOT inside the Bagley neighborhood boundary — it's on the
// Fitzgerald side of McNichols (Bagley's own southern boundary), confirmed
// via Model D Media's own coverage of that venue's opening and consistent
// with this project's pre-existing Fitzgerald area_note. So even though
// events.source reads "Bagley Community Council" for these rows, their
// venue_id resolves to "Neighborhood Home Base", whose neighborhood_id is
// Fitzgerald, NOT Bagley — this connector NEVER sets or infers a
// neighborhood from the organizing council's own name or from the word
// "Bagley" appearing anywhere in the text. Neighborhood is always inherited
// downstream, structurally, via venue_id -> venues.neighborhood_id, the
// same as every other connector in this project — there is no
// Bagley-text-matching code anywhere in this file, by design (see the
// Product Owner's explicit "Bagley Street != Bagley neighborhood" warning,
// generalized here one step further).
//
// ** TIER 2 (posts / one-off public events) ** — venue is resolved per
// event from known, confirmed place names in the post's own text, never
// guessed: "Trunk or Treat" / "Greenlawn" -> "Bagley Elementary School"
// (8100 Curtis Street — confirmed genuinely inside the verified Bagley
// boundary). Anything that doesn't match a known venue is left with
// venue_id/venue_name_raw null rather than assigned a guessed venue — a
// null venue here means "real event, unconfirmed location," not "ignore
// this," and it still gets written (same "never invent, never silently
// drop" principle as every other connector's unmatched-venue case).
//
// ** ELIGIBILITY ** — Tier 2's title-pattern match is deliberately narrow
// specifically so that administrative/internal content never reaches this
// connector's output at all (no "private meeting," "board minutes," etc.
// has ever matched this pattern in the live sample). General Meetings are
// explicitly public (the recurring text itself says "Please join us").
//
// ** CATEGORY ** — this project has no shared per-source category mapping
// table; every connector owns a small local keyword function (see
// cron-outerlimitslounge.js's own header for this convention). Most Bagley
// Community Council events are genuinely community-organizing activity, so
// this defaults to "community", but still checks the title/content for a
// few unambiguous keyword overrides first rather than forcing every event
// into "community" regardless of content (Product Owner: "classify
// according to existing rules rather than forcing every Bagley event into
// community").

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Timing-safe secret comparison — same helper every other cron in this
// project carries its own copy of (see cron-ticketmaster.js's original).
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

const SITE_ORIGIN = "https://bagleycommunity.org";
const EVENT_LISTING_URL = `${SITE_ORIGIN}/wp-json/wp/v2/event_listing?per_page=20&orderby=date&order=desc`;
const POSTS_URL = `${SITE_ORIGIN}/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc`;
const SOURCE_SLUG = SLUGS.bagleycommunity; // registered in api/_lib/source-slugs.js, 2026-10-01
const SOURCE_NAME = "Bagley Community Council";
const DEFAULT_STATUS = "approved";

const GENERAL_MEETING_VENUE_NAME = "Neighborhood Home Base";
const GENERAL_MEETING_VENUE_ADDRESS = "7426 W. McNichols Rd.";
const GENERAL_MEETING_VENUE_CITY = "Detroit";

const BAGLEY_ELEMENTARY_VENUE_NAME = "Bagley Elementary School";
const BAGLEY_ELEMENTARY_VENUE_ADDRESS = "8100 Curtis Street";
const BAGLEY_ELEMENTARY_VENUE_CITY = "Detroit";

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html) {
  if (!html) return null;
  const text = decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return text || null;
}

function formatTime(hour, minute) {
  const ap = hour >= 12 ? "PM" : "AM";
  let h12 = hour % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${ap}`;
}

function pad2(n) { return String(n).padStart(2, "0"); }

// Today's date in America/Detroit, as YYYY-MM-DD. UNLIKE every other
// connector in this project, bagleycommunity.org's /wp-json/wp/v2/posts
// endpoint is the site's GENERAL BLOG STREAM, not a pre-filtered
// "upcoming" feed the way Squarespace's events?format=json or similar
// sources are (confirmed live: ordinary browsing of this endpoint returns
// posts going back over a year). Without an explicit floor here, re-running
// this connector would re-upsert every past announcement it has ever
// published as if it were still upcoming — exactly the "stale events"
// eligibility violation the Product Owner's Step 5 explicitly rules out.
// Applied to BOTH tiers for the same reason, even though Tier 1 (the two
// most recent General Meeting posts) is less likely to go stale in
// practice.
function detroitTodayIso() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function findMonthInText(text) {
  const t = (text || "").toLowerCase();
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (t.includes(MONTH_NAMES[i])) return i; // 0-indexed
  }
  return null;
}

// Third Saturday of (year, monthIndex0) as a YYYY-MM-DD string.
function thirdSaturdayOf(year, monthIndex0) {
  const first = new Date(Date.UTC(year, monthIndex0, 1));
  const firstDay = first.getUTCDay(); // 0=Sun..6=Sat
  const daysUntilFirstSat = (6 - firstDay + 7) % 7;
  const firstSaturday = 1 + daysUntilFirstSat;
  const thirdSaturday = firstSaturday + 14;
  return `${year}-${pad2(monthIndex0 + 1)}-${pad2(thirdSaturday)}`;
}

// Parses a 12-hour time like "10:00 a.m." / "6 p.m." / "12-4 p.m." (takes
// the FIRST time in a range) into {hour, minute}. Returns null if nothing
// matching is found — never defaults to a guessed time.
//
// A range like "12-4 p.m." only states the meridiem once, on the SECOND
// number — tried first, so the first number inherits the shared am/pm
// rather than being left unparsed. Falls back to a single plain
// "<number> [am/pm]" match (the common case) when there's no range.
function parseFirstTime(text) {
  if (!text) return null;
  const range = /(\d{1,2})(?::(\d{2}))?\s*-\s*\d{1,2}(?::\d{2})?\s*([ap])\.?\s*m\.?/i.exec(text);
  const m = range || /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/i.exec(text);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const isPm = m[3].toLowerCase() === "p";
  if (hour === 12) hour = isPm ? 12 : 0;
  else if (isPm) hour += 12;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

// Tier 1: General Meeting posts from /wp-json/wp/v2/event_listing. Only
// ever parses the one specific recurring template this source actually
// publishes ("third Saturday... @ TIME"); anything else is skipped, not
// force-parsed. Returns null (skip) rather than guessing at a missing
// piece.
function parseGeneralMeetingPost(post) {
  const titleRaw = decodeEntities(stripHtml(post.title && post.title.rendered) || "");
  const contentRaw = post.content && post.content.rendered;
  const plainContent = stripHtml(contentRaw) || "";

  if (!/third\s+saturday/i.test(plainContent)) return null; // not this recurring template — skip
  const time = parseFirstTime(plainContent);
  if (!time) return null; // confidence-anchored: no guessed time

  const publishedAt = post.date ? new Date(post.date) : null;
  // Prefer a month named explicitly in the title; otherwise this
  // announcement's own publish month (these are reliably posted the same
  // month as the meeting they announce).
  let monthIndex0 = findMonthInText(titleRaw);
  let year = null;
  const yearMatch = /\b(20\d{2})\b/.exec(titleRaw);
  if (yearMatch) year = parseInt(yearMatch[1], 10);
  if (monthIndex0 === null || year === null) {
    if (!publishedAt || isNaN(publishedAt.getTime())) return null; // nothing to anchor the date to — skip
    if (monthIndex0 === null) monthIndex0 = publishedAt.getUTCMonth();
    if (year === null) year = publishedAt.getUTCFullYear();
  }

  const startDate = thirdSaturdayOf(year, monthIndex0);

  return {
    external_id: `bagleycc-event-${post.id}`,
    title: titleRaw || "Bagley Community Council General Meeting",
    description: plainContent || null,
    category: "community",
    venue_name_raw: GENERAL_MEETING_VENUE_NAME,
    venue_address_raw: GENERAL_MEETING_VENUE_ADDRESS,
    venue_city_raw: GENERAL_MEETING_VENUE_CITY,
    start_date: startDate,
    end_date: null,
    time_display: formatTime(time.hour, time.minute),
    is_all_day: false,
    is_free: true, // every observed General Meeting is explicitly open/public with no price signal
    price_from: null,
    ticket_url: post.link || null,
    image_url: null,
    source: SOURCE_NAME,
  };
}

// Confidence-anchored title pattern for Tier 2's one-off public events:
// "<Event Name> – [day] <Month> <Day>[suffix][ at <time>[-<time>] am/pm]".
// Deliberately narrow — see header comment for real confirmed matches and
// confirmed non-matches from the live site.
const TIER2_TITLE_PATTERN = new RegExp(
  "^(.*?)\\s*[\\u2013\\u2014-]\\s*" + // en dash / em dash / hyphen separator
  "(?:(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\\s+)?" + // optional day-of-week
  "(January|February|March|April|May|June|July|August|September|October|November|December)\\s+" +
  "(\\d{1,2})(?:st|nd|rd|th)?" + // day, optional ordinal suffix
  "(?:\\s+(?:at\\s+)?([\\d:apm.\\s-]+))?", // optional trailing time/range, "at" itself optional
  "i"
);

function parseTier2Post(post) {
  const titleRaw = decodeEntities(stripHtml(post.title && post.title.rendered) || "");
  if (!titleRaw) return null;
  if (/general meeting/i.test(titleRaw)) return null; // already covered by Tier 1 — never duplicate

  const m = TIER2_TITLE_PATTERN.exec(titleRaw);
  if (!m) return null; // doesn't match the confidence-anchored shape — leave alone, don't guess

  const eventName = m[1].trim();
  const monthIndex0 = MONTH_NAMES.indexOf(m[2].toLowerCase());
  const day = parseInt(m[3], 10);
  if (monthIndex0 < 0 || !day || day < 1 || day > 31) return null;

  const publishedAt = post.date ? new Date(post.date) : null;
  if (!publishedAt || isNaN(publishedAt.getTime())) return null;
  let year = publishedAt.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, monthIndex0, day));
  // These announcements are posted shortly before the event. If the
  // computed date already looks more than ~60 days in the past relative to
  // the post's own publish date, the event is almost certainly in the
  // following year (e.g. a December post about a January event) — bump the
  // year forward once. Never bumped more than once; never guessed beyond
  // this single, documented rule.
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  if (candidate.getTime() < publishedAt.getTime() - sixtyDaysMs) {
    year += 1;
    candidate = new Date(Date.UTC(year, monthIndex0, day));
  }
  const startDate = `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`;

  const timeText = m[4] || "";
  const time = parseFirstTime(timeText);

  const plainContent = stripHtml(post.content && post.content.rendered) || "";
  const haystack = `${titleRaw} ${plainContent}`;

  let venue = null;
  if (/trunk or treat|greenlawn/i.test(haystack)) {
    venue = {
      venue_name_raw: BAGLEY_ELEMENTARY_VENUE_NAME,
      venue_address_raw: BAGLEY_ELEMENTARY_VENUE_ADDRESS,
      venue_city_raw: BAGLEY_ELEMENTARY_VENUE_CITY,
    };
  }
  // No other known-venue match in this run — left null rather than
  // guessed. Null here means "real event, unconfirmed location," not
  // "drop this row."

  return {
    external_id: `bagleycc-post-${post.id}`,
    title: eventName || titleRaw,
    description: plainContent || null,
    category: mapTier2Category(titleRaw, plainContent),
    venue_name_raw: venue ? venue.venue_name_raw : null,
    venue_address_raw: venue ? venue.venue_address_raw : null,
    venue_city_raw: venue ? venue.venue_city_raw : null,
    start_date: startDate,
    end_date: null,
    time_display: time ? formatTime(time.hour, time.minute) : null,
    is_all_day: !time,
    is_free: true, // no price signal observed on any Tier 2 event to date — never guessed otherwise
    price_from: null,
    ticket_url: post.link || null,
    image_url: null,
    source: SOURCE_NAME,
  };
}

// Small keyword override set before the "community" default — see header
// comment (Product Owner: "classify according to existing rules rather
// than forcing every Bagley event into community").
function mapTier2Category(title, content) {
  const t = `${title || ""} ${content || ""}`.toLowerCase();
  if (/\byard sale\b|\bvendor\b/.test(t)) return "vendor";
  if (/\btrunk or treat\b|\bblock party\b/.test(t)) return "family";
  return "community";
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (313.events event calendar)" } });
  if (!r.ok) {
    const err = new Error(`Fetch failed: HTTP ${r.status}`);
    err.httpStatus = r.status;
    throw err;
  }
  return r.json();
}

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  const runHandle = await startRun(SOURCE_SLUG);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  let eventListingPosts = [];
  let generalPosts = [];
  let fetchErrors = [];
  try {
    eventListingPosts = await fetchJson(EVENT_LISTING_URL);
    if (!Array.isArray(eventListingPosts)) eventListingPosts = [];
  } catch (err) {
    fetchErrors.push(`event_listing: ${err.message}`);
  }
  try {
    generalPosts = await fetchJson(POSTS_URL);
    if (!Array.isArray(generalPosts)) generalPosts = [];
  } catch (err) {
    fetchErrors.push(`posts: ${err.message}`);
  }

  if (!eventListingPosts.length && !generalPosts.length) {
    const blocked = fetchErrors.some((e) => / 401| 403/.test(e));
    await finishRun(runHandle, {
      outcome: fetchErrors.length ? (blocked ? "blocked" : "failed") : "success",
      records_fetched: 0,
      records_parsed: 0,
      records_written: 0,
      error_sample: fetchErrors.join("; ") || undefined,
    });
    res.status(200).json({
      upserted: 0,
      note: fetchErrors.length ? "Both source endpoints failed." : "No posts found on either endpoint — the site layout may have changed.",
      errors: fetchErrors,
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  const recordsFetched = eventListingPosts.length + generalPosts.length;

  const todayIso = detroitTodayIso();
  const tier1RowsAll = eventListingPosts.map(parseGeneralMeetingPost).filter(Boolean);
  const tier2RowsAll = generalPosts.map(parseTier2Post).filter(Boolean);
  // Eligibility floor (Step 5: "do not ingest ... stale events") — see
  // detroitTodayIso()'s own header for why this is needed at all for this
  // particular source. Excluded counts are reported but never silently
  // dropped from the response/telemetry.
  const tier1Rows = tier1RowsAll.filter((r) => r.start_date >= todayIso);
  const tier2Rows = tier2RowsAll.filter((r) => r.start_date >= todayIso);
  const excludedAsPast = (tier1RowsAll.length - tier1Rows.length) + (tier2RowsAll.length - tier2Rows.length);
  const rawRows = [...tier1Rows, ...tier2Rows];

  if (!rawRows.length) {
    await finishRun(runHandle, {
      outcome: "success",
      records_fetched: recordsFetched,
      records_parsed: 0,
      records_written: 0,
      error_sample: fetchErrors.join("; ") || undefined,
    });
    res.status(200).json({ upserted: 0, recordsFetched, excludedAsPast, errors: fetchErrors, fetchedAt: new Date().toISOString() });
    return;
  }

  // De-dupe by external_id (same reasoning as every other connector here —
  // ON CONFLICT DO UPDATE can't touch the same target row twice in one
  // statement).
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const dedupedRows = Array.from(seen.values());

  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const rows = dedupedRows.map((row) => ({
    ...row,
    venue_id: row.venue_name_raw ? resolveVenueId(venueMap, row.venue_name_raw) : null,
  }));

  try {
    // Fail-closed status-preserving lookup (WP 0.17) — same convention as
    // every other connector; a failed lookup aborts this run entirely
    // rather than risking a silent moderation-state reset. See
    // api/_lib/status-lookup.js.
    let existingRowsByExternalId;
    try {
      existingRowsByExternalId = await lookupExistingRows(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        rows.map((r) => r.external_id),
        { select: "external_id,status,description" }
      );
    } catch (lookupErr) {
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: 502,
        records_fetched: recordsFetched,
        records_parsed: rawRows.length,
        error_sample: "Status lookup failed: " + lookupErr.message,
      });
      res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
      return;
    }
    const rowsWithStatus = rows.map((row) => {
      const existing = existingRowsByExternalId.get(row.external_id);
      const hasExistingDescription = !!(existing && existing.description && existing.description.trim());
      return {
        ...row,
        status: (existing && existing.status) || DEFAULT_STATUS,
        description: hasExistingDescription ? existing.description : row.description,
      };
    });

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
        records_fetched: recordsFetched,
        records_parsed: rawRows.length,
        records_written: 0,
        error_sample: "Supabase upsert failed: " + errText,
      });
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    await finishRun(runHandle, {
      outcome: fetchErrors.length ? "partial" : "success",
      http_status: resp.status,
      records_fetched: recordsFetched,
      records_parsed: rawRows.length,
      records_written: rowsWithStatus.length,
      error_sample: fetchErrors.join("; ") || undefined,
    });
    res.status(200).json({
      upserted: rowsWithStatus.length,
      tier1: tier1Rows.length,
      tier2: tier2Rows.length,
      excludedAsPast,
      errors: fetchErrors,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    await finishRun(runHandle, {
      outcome: "failed",
      records_fetched: recordsFetched,
      records_parsed: rawRows.length,
      error_sample: err.message,
    });
    res.status(500).json({ upserted: 0, error: err.message });
  }
};

// ---- Exported for tests and for scripts/bagleycommunity-backfill-report.js ----
module.exports.EVENT_LISTING_URL = EVENT_LISTING_URL;
module.exports.POSTS_URL = POSTS_URL;
module.exports.SOURCE_NAME = SOURCE_NAME;
module.exports.parseGeneralMeetingPost = parseGeneralMeetingPost;
module.exports.parseTier2Post = parseTier2Post;
module.exports.mapTier2Category = mapTier2Category;
module.exports.thirdSaturdayOf = thirdSaturdayOf;
module.exports.parseFirstTime = parseFirstTime;
module.exports.detroitTodayIso = detroitTodayIso;
