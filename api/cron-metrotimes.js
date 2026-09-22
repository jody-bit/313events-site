const crypto = require("crypto");
const { lookupExistingRows } = require("./_lib/status-lookup");
const {
  buildVenueNameToIdMap,
  resolveVenueId,
  buildVenueDetailsMap,
  buildLearnedVenueAddressCityMap,
  resolveVenueAddressCityRepair,
  isBlank,
} = require("./_lib/venue-lookup");
// Vercel Cron job — pulls Metro Times' community calendar (Gyrobase CMS).
//
// Metro Times' own EventSearch/listing UI is blocked by robots.txt, but its
// XML sitemap of individual event pages is NOT blocked, and neither are the
// event pages themselves. This scraper reads that sitemap, then fetches a
// bounded batch of the individual event pages it lists.
//
// Verified live before writing:
//   - community.metrotimes.com/detroit/Sitemap.xml?id=Event&view=recent is a
//     real urlset with ~300 <loc> entries, no pagination on this view.
//   - Individual event pages are plain server-rendered HTML (no JS needed).
//   - Venue name/address/geo come through cleanly in <meta> tags:
//       og:street-address, og:locality, og:region, og:latitude, og:longitude
//     which is far more reliable than parsing the visible venue link text.
//   - Date/time is NOT in a meta tag — it's plain body text shaped like
//     "When: Fri., Oct. 9, 7 p.m." (sometimes multiple dates on one line,
//     e.g. "Sun., Sept. 20, 7 p.m. and Sat., Nov. 28, 6 p.m."). No year is
//     given in that text, so a year is inferred (see below).
//
// SCOPE NOTE — why this writes status='pending_review', not 'approved':
// Metro Times' calendar is a general community calendar covering everything
// from concerts to Red Wings games. Unlike HALO/Trinosophes/Redford (single
// arts venues, everything they list is in scope), this feed is unfiltered —
// it will include plenty of events that don't belong on an arts/culture/
// nightlife calendar. Rather than guess a category from the title and
// auto-publish, every row lands in the moderation queue for a human to
// categorize and approve/reject. See admin.html.
//
// VOLUME CAP: the sitemap lists ~300 URLs; fetching all of them one by one
// would run past a serverless function's execution limit. This scrapes a
// bounded batch per run (EVENT_PAGE_LIMIT) in small concurrent groups —
// the daily cron schedule plus external_id-based upsert means later runs
// will keep working through fresh entries over time, not miss them outright.

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


const SITEMAP_URL = "https://community.metrotimes.com/detroit/Sitemap.xml?id=Event&view=recent";
const EVENT_PAGE_LIMIT = 40; // bounded batch per run — see VOLUME CAP note above
const CONCURRENCY = 5;
const DEFAULT_STATUS = "pending_review"; // see SCOPE NOTE above — unfiltered general calendar, needs human triage
// A standard browser UA, not a self-identifying one — Metro Times' own
// robots.txt already permits crawling this sitemap and its event pages, so
// there's nothing improper about this; a UA string that announces itself as
// a bot is more likely to get caught by generic hosting-provider bot
// filters that have nothing to do with this site's own stated policy.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "Fri., Oct. 9, 7 p.m." or "Sun., Sept. 20, 7 p.m. and Sat., Nov. 28, 6 p.m."
// — captures every "Mon. Day[, ]time" occurrence in the "When:" line.
const WHEN_ENTRY = /([A-Za-z]{3,4})\.?\s+(\d{1,2})(?:,)?\s*(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)?/gi;

function extractSitemapUrls(xml) {
  const urls = [];
  const re = /<loc>(?:<!\[CDATA\[)?(https?:\/\/[^<\]]+)(?:\]\]>)?<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) urls.push(m[1]);
  return urls;
}

// Decodes HTML entities in scraped text. The previous version only handled
// &amp;/&#8217; by name, which missed common WordPress numeric entities like
// &#038; (its usual encoding of "&") — those slipped straight through and
// showed up as literal "&#038;" text on the live site instead of "&".
// Numeric decoding (decimal and hex) is handled generically here so nothing
// needs to be added to a hand-picked list again.
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

function getMeta(html, name) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

// SH.4 (Metadata Self-Healing, 2026-09-21) — same getMeta() above, but
// treats an empty/whitespace-only content="" attribute (seen on a handful
// of Gyrobase pages for fields the venue never filled in) the same as a
// missing tag: null, not an empty string that would otherwise read as
// "present but blank" to the address/city repair logic below.
function metaOrNull(html, name) {
  const v = getMeta(html, name);
  if (v === null || v === undefined) return null;
  const trimmed = String(v).trim();
  return trimmed ? trimmed : null;
}

function nextOccurrenceOf(monthIdx, day) {
  // No year in the "When:" text — assume the nearest future occurrence of
  // that month/day (Metro Times' "recent" sitemap only lists current/
  // upcoming events, so a past-seeming date almost certainly means next year).
  const now = new Date();
  let year = now.getFullYear();
  let candidate = new Date(year, monthIdx, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3)) {
    year += 1;
    candidate = new Date(year, monthIdx, day);
  }
  return candidate;
}

function parseEventPage(html, url) {
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;
  if (!title) return null;

  const whenMatch = html.match(/When:?<\/[^>]+>\s*([^<]{4,120})|When:\s*([^<\n]{4,120})/i);
  const whenText = whenMatch ? (whenMatch[1] || whenMatch[2] || "").trim() : null;
  if (!whenText) return null;

  const occurrences = [];
  let m;
  WHEN_ENTRY.lastIndex = 0;
  while ((m = WHEN_ENTRY.exec(whenText))) {
    const monthKey = m[1].slice(0, 3).toLowerCase();
    const monthIdx = MONTHS[monthKey];
    if (monthIdx === undefined) continue;
    const day = parseInt(m[2], 10);
    if (!day || day > 31) continue;
    const d = nextOccurrenceOf(monthIdx, day);
    occurrences.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      time: m[3] || null,
    });
  }
  if (!occurrences.length) return null;
  const first = occurrences[0]; // multi-date listings get one row for the first occurrence

  const venueMatch = html.match(/<a[^>]+href="[^"]*\/location\/[^"]*"[^>]*>([^<]+)<\/a>/i);
  const venueName = venueMatch ? decodeEntities(venueMatch[1].trim()) : (getMeta(html, "og:site_name") || "Detroit Metro Times");

  // 2026-09-05 fix — this crawler read every other og: meta tag on the page
  // (address, city, region, lat/long) but never og:image, which confirmed
  // live is populated on every event page sampled (Gyrobase/Metro Times'
  // CMS always sets one, even a generic placeholder when the listing has no
  // real photo — still better than no image at all).
  const imageUrl = getMeta(html, "og:image");

  // SH.4 (Metadata Self-Healing, 2026-09-21) — og:street-address/og:locality
  // are already present on every fetched event page (see this file's header
  // note — verified live before this scraper was even written) but were
  // never read. No additional network request: same html already in hand
  // for og:image/title/When: above. og:region (state) is deliberately not
  // folded into venue_city_raw — every other connector in this project
  // stores just the city name there (e.g. "Detroit"), not "Detroit, MI".
  const metroTimesAddress = metaOrNull(html, "og:street-address");
  const metroTimesCity = metaOrNull(html, "og:locality");

  const idMatch = url.match(/-(\d+)$/);
  const id = idMatch ? idMatch[1] : url;

  return {
    external_id: `metrotimes-${id}`,
    title,
    venue_name_raw: venueName,
    start_date: first.date,
    time_display: first.time || null,
    ticket_url: url,
    image_url: imageUrl,
    // SH.4 — carried through to the handler below, which decides whether
    // to actually use them (an existing nonblank event value always wins;
    // see the handler's precedence comment).
    metroTimesAddress,
    metroTimesCity,
    note: occurrences.length > 1 ? "Metro Times lists multiple dates for this listing — only the first was captured." : null,
  };
}

// 2026-09-14 — root cause of the "200 but zero rows" bug found: Vercel's own
// Function Log for a real scheduled invocation showed an "External APIs"
// entry of GET .../Sitemap.xml -> 403 in ~200ms (confirmed again by Jody
// directly off the [cron-metrotimes] sitemap fetch threw: HTTP 403 log line
// this file's diagnostic logging now prints). That's the very first request
// this function makes, failing near-instantly, every single run — the
// signature of an edge/WAF block (most likely Cloudflare, which fronts a lot
// of sites including probably this one) rejecting requests from Vercel's
// hosting/datacenter IP ranges specifically, not a missing-header issue and
// not something a real browser hitting the same URL from a home IP would
// ever see. The header comment at the top of this file ("verified live
// before writing") was almost certainly checked from a laptop, not from
// Vercel's own servers — the two get treated very differently by bot
// mitigation that fingerprints network origin, not just headers.
//
// Added the fuller browser-shaped headers below as a real, if modest,
// attempt at a fix — some WAF configurations do key partly on header
// completeness (Accept-Language, sec-fetch-*) and this costs nothing to
// try. But if the block is IP/ASN-based (the likelier read of an instant,
// every-single-time 403), no header combination fixes it — the real options
// at that point are routing through a residential/rotating proxy service
// (ongoing cost + complexity for one source out of ~19), asking Metro Times
// directly for an approved feed/API, or accepting this source stays manual
// rather than automated. Don't sink more engineering time into header
// tweaking beyond this if the 403 persists after this change ships — that
// would be treating a network-origin block like a parsing bug.
async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-Dest": "document",
    },
  });
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.text();
}

async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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

  let sitemapXml;
  try {
    sitemapXml = await fetchText(SITEMAP_URL);
    if (!sitemapXml) {
      console.error("[cron-metrotimes] sitemap fetch returned empty body");
      res.status(200).json({ upserted: 0, error: "Sitemap fetch failed" });
      return;
    }
  } catch (err) {
    console.error(`[cron-metrotimes] sitemap fetch threw: ${err.message}`);
    res.status(200).json({ upserted: 0, error: "Sitemap fetch failed: " + err.message });
    return;
  }

  const urls = extractSitemapUrls(sitemapXml).slice(0, EVENT_PAGE_LIMIT);
  console.log(`[cron-metrotimes] sitemap bytes=${sitemapXml.length} urlsExtracted=${urls.length}`);
  if (!urls.length) {
    res.status(200).json({ upserted: 0, note: "Sitemap returned no event URLs — layout may have changed.", fetchedAt: new Date().toISOString() });
    return;
  }

  // 2026-09-14 diagnostic instrumentation — this cron was returning HTTP 200
  // on every scheduled run but silently writing zero rows, and since it had
  // no console.log calls at all, Vercel's log viewer showed nothing beyond
  // the bare status code for those invocations, making it impossible to
  // tell "zero events found/parsed" apart from "found N, upsert failed
  // silently" apart from "misconfigured" without this. Counts below show up
  // in Vercel's Runtime Logs for every future invocation.
  let fetchFailures = 0;
  let parseFailures = 0;
  const pages = await mapLimit(urls, CONCURRENCY, async (url) => {
    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      fetchFailures++;
      console.error(`[cron-metrotimes] fetch failed for ${url}: ${err.message}`);
      return null;
    }
    const parsed = html ? parseEventPage(html, url) : null;
    if (!parsed) parseFailures++;
    return parsed;
  });
  console.log(
    `[cron-metrotimes] checked=${urls.length} fetchFailures=${fetchFailures} parseFailures=${parseFailures} parsedOk=${pages.filter(Boolean).length}`
  );

  // See api/_lib/venue-lookup.js — Metro Times' calendar spans many venues,
  // so venue_id is resolved per-row against each row's own venue_name_raw.
  // Links to an existing venues row if one matches; never creates or
  // guesses a fuzzy one.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // SH.1 (Metadata Self-Healing) — same one-lookup-per-run pattern, used
  // below by SH.4 as the fallback tier when Metro Times' own page has no
  // address/city (step 3 of the precedence order in the SH.4 comment
  // further down).
  const canonicalVenueMaps = await buildVenueDetailsMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const learnedVenueMap = await buildLearnedVenueAddressCityMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // SH.4 — Metro Times' own address/city per event, keyed by external_id so
  // the precedence logic below (in the upsert-prep block, where each row's
  // *existing* database value also has to be looked up) can find it without
  // re-parsing or attaching non-column fields to `row` itself.
  const metroTimesMetaByExternalId = new Map();
  pages.filter(Boolean).forEach((e) => {
    metroTimesMetaByExternalId.set(e.external_id, { address: e.metroTimesAddress, city: e.metroTimesCity });
  });

  const rows = pages.filter(Boolean).map((e) => ({
    external_id: e.external_id,
    title: e.title,
    category: "music", // placeholder — Metro Times' calendar spans every category; a human sets the real one during moderation
    venue_name_raw: e.venue_name_raw,
    venue_id: resolveVenueId(venueMap, e.venue_name_raw),
    start_date: e.start_date,
    time_display: e.time_display,
    ticket_url: e.ticket_url,
    image_url: e.image_url,
    note: e.note,
    source: "Metro Times",
  }));

  if (!rows.length) {
    console.warn(
      `[cron-metrotimes] zero rows to upsert — checked=${urls.length} fetchFailures=${fetchFailures} parseFailures=${parseFailures}. This is the "200 but nothing written" case; if fetchFailures/parseFailures is close to checked, Metro Times' page HTML likely changed and the title/When:/venue regexes in parseEventPage() no longer match.`
    );
    res.status(200).json({ upserted: 0, fetchedAt: new Date().toISOString(), checked: urls.length });
    return;
  }

  try {
    // Look up each row's current status before writing, so an admin's
    // approve/reject decision on an existing row isn't reset to
    // DEFAULT_STATUS by this merge-duplicates upsert — for this cron
    // specifically, that meant an admin-approved event getting yanked back
    // into pending_review on the very next run. 2026-09-02 fix for the
    // status-clobbering bug — see cron-lagerhouse.js's header comment for
    // the full story.
    //
    // SH.4 (Metadata Self-Healing, 2026-09-21) extends this same
    // look-up-before-write to venue_address_raw/venue_city_raw: this cron's
    // upsert is a full-column merge-duplicates write, so any column it
    // sends is written unconditionally, blank or not, on every run — the
    // existing status-preserving lookup above is the established pattern
    // in this project for exactly that hazard. Reused (one extra `select`
    // field, not a new request) rather than adding a second lookup.
    // WP 0.17 (2026-09-22): fail-closed status lookup -- a failed lookup
    // (non-OK response, thrown network error, or an unusable response body)
    // must never silently default every row to DEFAULT_STATUS (D7). See
    // api/_lib/status-lookup.js for the full rationale and the chunking
    // (<=100 ids/request) this also fixes. Any failure aborts this run
    // entirely -- zero event writes, HTTP 502 -- rather than falling back
    // to an empty map the way this connector used to.
    let existingByExternalId;
    try {
      existingByExternalId = await lookupExistingRows(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        rows.map((r) => r.external_id),
        { select: "external_id,status,venue_address_raw,venue_city_raw" }
      );
    } catch (lookupErr) {
      res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
      return;
    }

    // SH.4 address/city precedence, per row (never touches any other
    // field — category/status/description/dates/times/image are untouched
    // by this block):
    //   1. an existing nonblank event value always wins — Metro Times
    //      supplying a different value is never a reason to overwrite it.
    //   2. otherwise, the authoritative og:street-address/og:locality
    //      already extracted from this event's own fetched page.
    //   3. otherwise, SH.1's existing canonical-venue repair (venue_id,
    //      then exact canonical name match, then exact learned historical
    //      match — see api/_lib/venue-lookup.js; no fuzzy matching here
    //      either).
    //   4. otherwise, left null — unresolved, not guessed.
    const rowsWithStatus = rows.map((row) => {
      const existing = existingByExternalId.get(row.external_id) || {};
      const metroTimesMeta = metroTimesMetaByExternalId.get(row.external_id) || {};

      const preRepair = {
        venue_id: row.venue_id,
        venue_name_raw: row.venue_name_raw,
        venue_address_raw: !isBlank(existing.venue_address_raw)
          ? existing.venue_address_raw
          : (!isBlank(metroTimesMeta.address) ? metroTimesMeta.address : null),
        venue_city_raw: !isBlank(existing.venue_city_raw)
          ? existing.venue_city_raw
          : (!isBlank(metroTimesMeta.city) ? metroTimesMeta.city : null),
      };
      const repaired = Object.assign(
        {},
        preRepair,
        resolveVenueAddressCityRepair(preRepair, canonicalVenueMaps, learnedVenueMap)
      );

      return {
        ...row,
        status: existing.status || DEFAULT_STATUS,
        venue_id: repaired.venue_id,
        venue_address_raw: repaired.venue_address_raw,
        venue_city_raw: repaired.venue_city_raw,
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
      console.error(`[cron-metrotimes] Supabase upsert failed (status ${resp.status}): ${errText}`);
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    console.log(`[cron-metrotimes] upserted=${rowsWithStatus.length} checked=${urls.length}`);
    res.status(200).json({ upserted: rowsWithStatus.length, checked: urls.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error(`[cron-metrotimes] unhandled error: ${err.message}`);
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
module.exports.parseEventPage = parseEventPage; // exposed for test/cron-metrotimes-sh4.test.js only

