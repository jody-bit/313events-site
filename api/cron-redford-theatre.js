const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
// Vercel Cron job — scrapes the Redford Theatre's own events archive page
// (redfordtheatre.com/events/). WordPress + Elementor, no calendar plugin
// REST API (confirmed: no /wp-json/tribe/* namespace, no `event` post type
// in the WP REST index) and no JSON-LD found — plain HTML scrape.
//
// 2026-09-16 rewrite (Jody, after noticing an event showing up with its
// title replaced by literal date text): the first version only handled one
// exact date-line shape and silently mishandled — or dropped — anything
// else. A full live-page audit (all ~35 current listings, checked row by
// row against the actual DB) turned up five real, confirmed patterns the
// old single regex missed:
//   1. A date line with NO leading weekday at all ("September 26, 2026,
//      Doors 7pm | Showtime 8pm") — the whole event was silently dropped,
//      not just mis-parsed.
//   2. An ABBREVIATED weekday ("Sat., Dec. 12 at 8:00PM & Sun., Dec. 13 at
//      2:00 PM") didn't match "[A-Za-z]+day" at all, which fell through to
//      being treated as a plain text line — overwriting the pendingTitle
//      with this date/price string and corrupting the next event's title.
//   3. "Doors open at 6:00 PM, movie begins at 8:00 PM" — the real time is
//      the SECOND one, but the old regex only captured a time immediately
//      adjacent to the date, so this always came back with no time at all.
//   4. Two dates joined by "and" rather than "-" ("Saturday, November 7 and
//      Sunday, November 8, 2026 at 3:00 PM") broke the old regex mid-match,
//      losing the year AND the time.
//   5. A genuine multi-day span with no single time at all ("Friday,
//      September 18 - Sunday, September 20, 2026", a 3-day festival) has
//      no is_all_day/end_date handling, so it sits in the admin follow-up
//      queue looking like a bug when nothing is actually missing.
// There was also a sixth, unrelated bug: the nav-noise filter matched any
// line that merely STARTED WITH a nav word, so a real title like "Home for
// the Holidays (1995)" was discarded as if it were the "Home" nav link,
// losing that event's title entirely.
//
// The parser below finds every date/time mention anywhere in a line (not
// just at its very start) and pairs them up, rather than requiring one
// fixed shape — see findDates()/findTimes()/parseDateLine() for the actual
// logic, each documented at its own definition. Verified against every
// listing on the live page as of this rewrite (redford_parse_test in this
// commit's PR description / commit message has the fixture output).
//
// ** STILL BEST-EFFORT ** — this is HTML scraping of a page Redford doesn't
// publish a feed for. If the site's own wording changes again, spot-check
// https://redfordtheatre.com/events/ against the admin follow-up queue.
//
// 2026-09-22 (Needs-Follow-up reduction): extended to also fetch each
// event's own detail page (linked from the archive page's own <a href>,
// previously discarded) for event_url, description, and ticket_url — see
// extractEventUrls()/fetchEventDetail()'s own header comments below for the
// full rationale. maxDuration is explicitly set to 60s in vercel.json for
// this reason (bounded-concurrency fetches across ~30 detail pages).

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


const SOURCE_URL = "https://redfordtheatre.com/events/";
const SOURCE_SLUG = SLUGS.redfordTheatre; // WP 0.5 -- see api/_lib/source-slugs.js
const VENUE_NAME = "Redford Theatre";
const DEFAULT_STATUS = "approved";

const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sept: 8, sep: 8, october: 9, oct: 9,
  november: 10, nov: 10, december: 11, dec: 11,
};

// Fixed 2026-09-16: was unanchored (`^(home|...)`), which matched any line
// merely STARTING WITH a nav word — including a real title like "Home for
// the Holidays (1995)", which got silently discarded (never becoming
// pendingTitle) instead of only matching a standalone nav link named "Home".
// Anchoring to the full line (`$` added) fixes that while still catching
// the actual one-word nav links this was meant for.
const NOISE_LINE = /^(home|about|events|calendar|tickets?|buy tickets|donate|history|organ|membership|volunteer|contact|newsletter|subscribe|instagram|facebook|copyright|all rights reserved)\.?$/i;

// Finds every "<weekday-word>, <month-word> <day>[st/nd/rd/th][, <year>]"
// occurrence ANYWHERE in the line (not just at the start) — the comma right
// after the weekday word is what identifies it as a date, so this catches
// both "Saturday, August 22nd" and an abbreviated "Sat., Dec. 12" the same
// way, and finds BOTH dates in a two-date line like "Fri... and Sat...."
// without needing a separate multi-day sub-pattern.
const WEEKDAY_DATE = /([A-Za-z]{3,9})\.?,\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/g;

// Fallback for a date line with NO weekday at all (e.g. "September 26, 2026,
// Doors 7pm..."). Only tried when WEEKDAY_DATE finds nothing on the line,
// and only accepted once the first word is confirmed to be a real month
// name (see findDates) — so this can't misfire on an ordinary sentence.
const MONTH_FIRST_DATE = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/;

// Every time-of-day mention anywhere in a line, with or without a colon
// ("8:00 PM", "8:00PM", "8pm").
const TIME_TOKEN = /(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?/g;

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
    .replace(/<\/(p|div|li|h[1-6]|tr|article|section)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
  return text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function normalizeTime(h, m, mer) {
  return `${parseInt(h, 10)}:${m || "00"} ${mer.toUpperCase()}M`;
}

// Scores a found time by how likely it is to be the REAL start time rather
// than a "doors open" time — Redford's own listings routinely give both
// ("Doors open at 6:00 PM, movie begins at 8:00 PM"), and the doors time
// isn't what belongs in time_display.
function scoreTimeContext(line, idx) {
  const context = line.slice(Math.max(0, idx - 28), idx).toLowerCase();
  if (/\b(showtime|movie begins|movie starts|show at|movie at)\b/.test(context)) return 2;
  if (/\bdoors?\b/.test(context)) return -1;
  return 1;
}

function findTimes(line) {
  const out = [];
  let m;
  TIME_TOKEN.lastIndex = 0;
  while ((m = TIME_TOKEN.exec(line))) {
    out.push({ text: normalizeTime(m[1], m[2], m[3]), index: m.index, score: scoreTimeContext(line, m.index) });
  }
  return out;
}

function bestSingleTime(times) {
  if (!times.length) return null;
  return times.slice().sort((a, b) => (b.score - a.score) || (b.index - a.index))[0].text;
}

function findDates(line) {
  const out = [];
  let m;
  WEEKDAY_DATE.lastIndex = 0;
  while ((m = WEEKDAY_DATE.exec(line))) {
    const monthIdx = MONTHS[m[2].toLowerCase()];
    if (monthIdx === undefined) continue; // group2 wasn't actually a month name — not a real date
    out.push({ monthIdx, day: parseInt(m[3], 10), year: m[4] ? parseInt(m[4], 10) : null, index: m.index, end: m.index + m[0].length });
  }
  if (!out.length) {
    const mf = line.match(MONTH_FIRST_DATE);
    if (mf) {
      const monthIdx = MONTHS[mf[1].toLowerCase()];
      if (monthIdx !== undefined) {
        out.push({ monthIdx, day: parseInt(mf[2], 10), year: mf[3] ? parseInt(mf[3], 10) : null, index: mf.index, end: mf.index + mf[0].length });
      }
    }
  }
  return out;
}

function nextOccurrenceOf(monthIdx, day, explicitYear, now) {
  now = now || new Date();
  if (explicitYear) return new Date(explicitYear, monthIdx, day);
  const year = now.getFullYear();
  let candidate = new Date(year, monthIdx, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3)) {
    candidate = new Date(year + 1, monthIdx, day);
  }
  return candidate;
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Parses one line that contains at least one date. Handles three shapes:
//  - a single date ("Friday, August 28 at 8:00 PM") -> one event.
//  - a dash-joined RANGE ("Fri Sept 18 - Sun Sept 20, 2026") -> one event
//    spanning start_date..end_date, is_all_day when no time is found at all
//    (a real festival/run genuinely has no single start time).
//  - an "and"/"&"-joined LIST ("Sat 8PM & Sun 2PM", "Fri and Sat at 8PM")
//    -> one event PER date, since these are distinct individual showings,
//    not one continuous span.
function parseDateLine(line, pendingTitle, now) {
  const dates = findDates(line);
  if (!dates.length) return null;
  const times = findTimes(line);

  // A date token without its own year borrows the year from whichever
  // token on the same line DOES have one — normally the last date in a
  // range carries the single shared year ("Fri Sept 18 - Sun Sept 20, 2026").
  const sharedYear = dates.map((d) => d.year).find((y) => y != null) || null;

  if (dates.length === 1) {
    const d = nextOccurrenceOf(dates[0].monthIdx, dates[0].day, dates[0].year || sharedYear, now);
    return [{ date: toISO(d), title: pendingTitle, time: bestSingleTime(times), endDate: null, isAllDay: false }];
  }

  const between = line.slice(dates[0].end, dates[1].index);
  const isRange = /[-–]/.test(between) && !/\b(and|&)\b/i.test(between);

  if (isRange) {
    const startD = nextOccurrenceOf(dates[0].monthIdx, dates[0].day, dates[0].year || sharedYear, now);
    const last = dates[dates.length - 1];
    const endD = nextOccurrenceOf(last.monthIdx, last.day, last.year || sharedYear, now);
    return [{
      date: toISO(startD), title: pendingTitle, time: times.length ? bestSingleTime(times) : null,
      endDate: toISO(endD), isAllDay: times.length === 0,
    }];
  }

  // LIST: one event per date. Exactly one time for the whole line means a
  // repeated showing (every date gets it); one time per date pairs them up
  // in order; any other mismatch leaves time null rather than guess.
  return dates.map((d, i) => {
    const dd = nextOccurrenceOf(d.monthIdx, d.day, d.year || sharedYear, now);
    let time = null;
    if (times.length === dates.length) time = times[i].text;
    else if (times.length === 1) time = times[0].text;
    else if (times.length > 0) time = bestSingleTime(times);
    return { date: toISO(dd), title: pendingTitle, time, endDate: null, isAllDay: false };
  });
}

function parseRedfordEvents(html) {
  const lines = htmlToLines(html);
  const events = [];
  let pendingTitle = null;

  for (const line of lines) {
    const parsed = parseDateLine(line, pendingTitle);
    if (parsed) {
      events.push(...parsed);
      pendingTitle = null;
      continue;
    }
    if (NOISE_LINE.test(line) || line.length < 3 || line.length > 100) continue;
    if (/^\$\d/.test(line) || /^tickets?:/i.test(line)) continue; // price lines, not titles
    pendingTitle = line;
  }

  return events;
}

// SH.8-class recovery (2026-09-22, Needs-Follow-up reduction): the archive
// page's own markup wraps every listing as
//   <li><a href="https://redfordtheatre.com/events/<slug>/">
//     <div class="featureBottom"><h3>TITLE</h3><p>DATE/TIME/PRICE TEXT</p></div>
//   </a></li>
// -- confirmed live 2026-09-22 via direct DOM inspection: 32/32 current
// listings share this exact structure, one <a href> per <li>, its single
// <div class="featureBottom"> child containing exactly one <h3> and one <p>.
// parseRedfordEvents() above already turns the <h3>/<p> text into the
// correct title+date/time pair (via htmlToLines()'s block-tag-to-newline
// conversion) but discards the <a href> entirely, since generic tag-
// stripping removes it with everything else. That href is a real,
// event-specific detail-page link -- exactly the "authoritative source
// metadata already available but discarded" pattern SH.8 already fixed once
// for Cinema Detroit's page.link. This recovers it here the same way: purely
// additive, does not touch parseRedfordEvents()/parseDateLine()/findDates()/
// findTimes() at all.
//
// Keyed by title (the one value both this and parseRedfordEvents() derive
// from the same <h3>, so they always agree) rather than by array position,
// because one <li>/href can produce ZERO events (a cancelled listing with no
// parseable date, e.g. "Rocky (1976)" confirmed live: "Cancelled - Not
// Available - Please Watch for a New Event on this Date") or TWO events (the
// LIST case in parseDateLine -- two showtimes of the same production, e.g.
// "Sat., Dec. 12 at 8:00PM & Sun., Dec. 13 at 2:00 PM" -- both showtimes
// correctly get the same href, since they're the same detail page). If the
// same title were ever to appear under two DIFFERENT hrefs (not observed in
// the live 32/32 check, all titles unique), that title is treated as
// ambiguous and left unmapped (null) rather than guessing which href is
// right -- NO EVIDENCE -> NO ENRICHMENT.
const EVENT_DETAIL_BLOCK = /<a\s+href="(https:\/\/redfordtheatre\.com\/events\/[^"]+)"[^>]*>\s*<div[^>]*class="[^"]*featureBottom[^"]*"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/gi;

function extractEventUrls(html) {
  const byTitle = new Map(); // title -> url, or null once ambiguous
  let m;
  EVENT_DETAIL_BLOCK.lastIndex = 0;
  while ((m = EVENT_DETAIL_BLOCK.exec(html))) {
    const url = m[1];
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (!title) continue;
    if (byTitle.has(title)) {
      if (byTitle.get(title) !== url) byTitle.set(title, null); // conflicting hrefs for the same title -- don't guess
    } else {
      byTitle.set(title, url);
    }
  }
  return byTitle;
}

// Bounded-concurrency map -- same pattern as cron-detroitmonthofdesign.js's
// own mapWithConcurrency(), reused verbatim rather than re-invented, so this
// gets the exact same "don't hammer the source, don't blow maxDuration"
// behavior already proven safe there (that connector fetches 367 detail
// pages at concurrency 6; Redford has ~30, so a similar concurrency here is
// comfortably safe -- see DETAIL_FETCH_CONCURRENCY below).
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

const DETAIL_FETCH_CONCURRENCY = 5;

// 2026-09-22, Needs-Follow-up reduction (continued): the archive page's own
// href (extractEventUrls() above) points at a real per-event detail page --
// and that detail page itself carries MORE authoritative source metadata
// that's currently discarded entirely. Confirmed live against all 32
// current listings' detail pages:
//   - description: every one has a non-empty <div class="eventDesc">
//     containing one or more <p> paragraphs -- 100% coverage (32/32), no
//     nested <div> inside it on any page checked (safe for a non-greedy
//     regex bounded by the next </div>).
//   - ticket_url: 31/32 have at least one "Buy Tickets" link (all to
//     ticketing.useast.veezi.com or ci.ovationtix.com, real third-party
//     ticketing platforms -- not a same-site link). The one exception,
//     "Rocky (1976)", is the cancelled listing with no parseable date --
//     it never produces an event and so is never fetched here at all.
//
// description is plain text: every <p> inside .eventDesc, tags stripped,
// entities decoded, whitespace collapsed -- same convention every other
// connector in this project uses for a scraped description (see e.g.
// cron-outerlimitslounge.js's stripHtml()).
//
// ticket_url is populated ONLY when the detail page has EXACTLY ONE "Buy
// Tickets" link. 4 of the 32 current listings (the LIST-case events -- two
// or three showtimes of the same production sharing one detail page, e.g.
// "Sat., Dec. 12 at 8:00PM & Sun., Dec. 13 at 2:00 PM") have 2-3 separate
// "Buy Tickets" buttons on that one shared page, each a DIFFERENT Veezi
// purchase link for a DIFFERENT showtime -- confirmed live. There is no
// reliable way from the page alone to tell which button belongs to which
// showtime/date, so guessing would risk pointing someone at the wrong
// showtime's tickets. Per NO EVIDENCE -> NO ENRICHMENT, ticket_url stays
// null for those ambiguous cases; extractEventUrls()'s own event_url (the
// shared detail-page link, same for every showtime of that production)
// already satisfies the "ticket/event link" Needs-Follow-up condition
// either way, so nothing is lost for those rows.
//
// Fails soft at every level, same as the rest of this connector: a single
// detail-page fetch failure (network error, non-200, unexpected markup)
// only affects that ONE event's description/ticket_url (both stay null,
// exactly as before this change) and never blocks or fails the run; if the
// whole detail-fetch pass throws unexpectedly, the caller falls back to an
// empty map and proceeds with base rows only -- title/date/time/event_url
// still write normally, matching this connector's existing fail-safe
// philosophy (see e.g. buildVenueNameToIdMap's own "fails soft, empty map"
// precedent in api/_lib/venue-lookup.js).
function stripEventDescHtml(inner) {
  const text = decodeEntities(inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return text || null;
}

async function fetchEventDetail(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (313.events event calendar)" } });
    if (!r.ok) return { description: null, ticket_url: null };
    const html = await r.text();

    let description = null;
    const descMatch = html.match(/<div[^>]*class="[^"]*eventDesc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) description = stripEventDescHtml(descMatch[1]);

    // Every anchor on the page, tested by its own rendered text (not just
    // the text immediately after the opening tag) -- mirrors a real
    // browser's a.textContent match, so a "Buy Tickets" button wrapped in
    // an inner <span>/icon still matches correctly.
    const buyLinks = [];
    const anchorRe = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let am;
    while ((am = anchorRe.exec(html))) {
      const linkText = am[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (/buy tickets?/i.test(linkText)) buyLinks.push(decodeEntities(am[1]));
    }
    const ticket_url = buyLinks.length === 1 ? buyLinks[0] : null;

    return { description, ticket_url };
  } catch {
    return { description: null, ticket_url: null };
  }
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

  let html;
  try {
    const r = await fetch(SOURCE_URL, { headers: { "User-Agent": "Mozilla/5.0 (313.events event calendar)" } });
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
    html = await r.text();
  } catch (err) {
    await finishRun(runHandle, { outcome: "failed", error_sample: "Fetch failed: " + err.message });
    res.status(200).json({ upserted: 0, error: "Fetch failed: " + err.message });
    return;
  }

  // records_fetched (WP 0.5): same as cron-dossin.js/cron-halo.js -- this
  // connector's parser (treated as immutable for this WP -- see the
  // rewrite header comment above) doesn't expose a separate "raw
  // candidate" count from the events it successfully recognizes. Left
  // null (genuinely unavailable) rather than duplicating records_parsed
  // under a different name.
  const parsed = parseRedfordEvents(html);
  if (!parsed.length) {
    await finishRun(runHandle, {
      outcome: "success",
      records_fetched: null,
      records_parsed: 0,
      records_written: 0,
    });
    res.status(200).json({ upserted: 0, note: "No events parsed — the site's layout may have changed.", fetchedAt: new Date().toISOString() });
    return;
  }

  // See api/_lib/venue-lookup.js — links to the existing venues row if one
  // exists, never creates or guesses a fuzzy match.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const venueId = resolveVenueId(venueMap, VENUE_NAME);

  // 2026-09-22: per-title event_url recovery -- see extractEventUrls()'s own
  // header comment above for the full rationale. Never invented: a title
  // with no matching (or an ambiguous) href simply gets event_url: null,
  // same as before this change.
  const eventUrls = extractEventUrls(html);

  // 2026-09-22: description + ticket_url recovery from each event's own
  // detail page -- see fetchEventDetail()'s own header comment above for
  // the full rationale. Only fetches hrefs an actual produced event uses
  // (never "Rocky (1976)"'s page, or any other listing that produced zero
  // events -- no event will ever look up its detail data).
  const detailUrls = [...new Set(parsed.map((e) => eventUrls.get(e.title)).filter(Boolean))];
  const detailByHref = new Map();
  if (detailUrls.length) {
    try {
      const details = await mapWithConcurrency(detailUrls, DETAIL_FETCH_CONCURRENCY, async (url) => ({
        url,
        detail: await fetchEventDetail(url),
      }));
      details.forEach(({ url, detail }) => detailByHref.set(url, detail));
    } catch {
      // Whole detail-fetch pass failed unexpectedly -- fall through with an
      // empty map, same fail-soft philosophy as venue-lookup.js. Base rows
      // (title/date/time/event_url) still write normally below.
    }
  }

  const rawRows = parsed.map((e) => {
    const href = eventUrls.get(e.title) || null;
    const detail = href ? detailByHref.get(href) : null;
    return {
      // Same idempotent id scheme as before -- date+title -- which is
      // exactly why the LIST case (two distinct showings, e.g. Fri/Sat)
      // producing two rows out of one source line is safe: each gets its
      // own date, so its own external_id, so no collision with its
      // sibling showing.
      external_id: `redford-${e.date}-${e.title}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 250),
      title: e.title,
      category: "film",
      description: (detail && detail.description) || null,
      venue_name_raw: VENUE_NAME,
      venue_id: venueId,
      start_date: e.date,
      end_date: e.endDate,
      time_display: e.time,
      is_all_day: e.isAllDay,
      is_free: false,
      event_url: href,
      ticket_url: (detail && detail.ticket_url) || null,
      source: "Redford Theatre",
    };
  });

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
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: resp.status,
        records_fetched: null,
        records_parsed: parsed.length,
        records_written: 0,
        error_sample: "Supabase upsert failed: " + errText,
      });
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    await finishRun(runHandle, {
      outcome: "success",
      http_status: resp.status,
      records_fetched: null,
      records_parsed: parsed.length,
      records_written: rowsWithStatus.length,
    });
    res.status(200).json({ upserted: rowsWithStatus.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    await finishRun(runHandle, {
      outcome: "failed",
      records_fetched: null,
      records_parsed: parsed.length,
      error_sample: err.message,
    });
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
