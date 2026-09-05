const crypto = require("crypto");
// Vercel Cron job — pulls PLAYGROUND DETROIT's own event calendar. Added
// 2026-09-05 after Jody asked "did we crawl this events page yet?" pointing
// at playgrounddetroit.com/category/events/.
//
// SOURCE DISCOVERY — that /category/events/ URL is NOT this source: it's a
// plain WordPress blog-post category page (tagged posts, no structured
// date/venue data at all — confirmed live, its "cards" are just article
// links). The real events calendar lives at playgrounddetroit.com/events/
// ("Events Archive"), a completely separate URL powered by the Modern
// Events Calendar (MEC) WordPress plugin — 24 events at the time this was
// written. Before this cron, Playground Detroit was only wired in as a
// general /feed/ RSS source for cron-editorial.js's press-coverage matcher
// (see that file's own header comment) — that scans blog posts for text
// that *sounds like* event coverage and tries to link it to an event
// that's already on the site; it has never created an event from this
// venue directly. This is the first real events-calendar crawl of this
// source.
//
// STRUCTURED DATA — MEC's own REST API is a dead end: /wp-json/mec/v1
// exists and documents exactly one route (/mec/v1/events), but it always
// returns an empty array regardless of params (confirmed live, several
// param shapes tried) — this looks like a Pro-only feature stubbed out in
// whatever MEC tier this site runs. The generic WordPress post-type route,
// /wp-json/wp/v2/mec-events, DOES work and is genuinely useful — title,
// excerpt, permalink, its own mec_category taxonomy ids, and (with
// ?_embed=1) the featured image — but its date fields are just the WP
// post's own created/modified timestamps, not the actual event date. MEC's
// real event date/time/venue data isn't exposed in either REST response at
// all (confirmed: meta is unregistered for this post type).
//
// THE WORKAROUND — every single-event detail page renders MEC's own
// "+ Add to Google Calendar" export link, and that link's query string
// carries exactly what's missing: a `dates` param with the real UTC
// start/end datetime (Google Calendar's own format, e.g.
// "20260911T180000Z/20260913T220000Z" — the same DTSTART/DTEND shape ICS
// uses, just two values joined by "/" instead of separate properties) and
// a `location` param with the real street address. Parsed straight out of
// the raw HTML via regex (this project has no DOM/HTML-parsing library —
// same convention as every other scraper here), the same "borrow the
// calendar-export link instead of the missing structured API" trick this
// project already leans on elsewhere for sources whose REST/JSON layer
// doesn't actually carry what a plain user-facing feature does.
//
// VENUE NAME CAVEAT — worth being honest about: not every event on this
// calendar physically happens at PLAYGROUND DETROIT's own gallery. Season
// Art Fair 2026, for instance, is presented BY Playground Detroit but held
// at a different venue ("the Shepherd") — confirmed via a small "upcoming
// events" sidebar widget that happens to show a venue name alongside a
// couple of nearby dates. But that widget only ever surfaces a few
// upcoming items, not all events, and no other part of the page (checked
// both the single-event template and the post's own REST fields) exposes
// a separate venue-name field at scale — only the address, via the
// Google-Calendar-link workaround above. Rather than guess a venue name
// from an unreliable partial source, venue_name_raw is always
// "PLAYGROUND DETROIT" (accurate — they are presenting/hosting every one
// of these events regardless of physical location) while
// venue_address_raw carries whatever real street address that specific
// event's export link gives, which is still accurate even when it's not
// the gallery's own address. If this ever matters enough to fix properly,
// the sidebar widget is the only lead found so far.
//
// CATEGORY — no generic category field exists in either REST response, but
// MEC's own mec_category taxonomy tags (ART FAIR, LIVE MUSIC, FILM,
// WORKSHOP, OPENING/CLOSING/ARTIST RECEPTION, ARTIST TALK, PANEL
// DISCUSSION, FUNDRAISER, WELLNESS, INVITE ONLY, UPCOMING, at last count)
// give a real per-event signal most other single-venue crons here don't
// have — mapCategory() below reads them instead of defaulting the whole
// source to one bucket the way cron-trinosophes.js/cron-halo.js do.
// "visual" (this venue's own core identity, an art gallery) is still the
// fallback for tags with no clear site-category match (ART FAIR, the
// various RECEPTION/TALK tags, INVITE ONLY, UPCOMING).
//
// CRAWL-DELAY — this site's robots.txt is otherwise permissive but sets
// `Crawl-delay: 3`. Unlike this project's single-request-per-run feeds
// (where firing far less often than the stated delay already satisfies
// it, see cron-editorial.js's header comment), this cron makes one request
// per event in a single run — a real within-run request-rate situation the
// delay is actually about. Honored literally: the detail-page pass below
// is strictly sequential (no concurrency) with an awaited pause between
// every fetch, not just a fire-and-forget best effort. At 24 events that's
// roughly 24 × 3s ≈ 72s of deliberate delay alone, before request latency —
// maxDuration is set to 120 in vercel.json accordingly (see that file).
// If this source's event count grows a lot, the strictly-sequential
// approach will need revisiting (concurrency + a longer per-worker delay
// to keep the same effective rate) rather than just raising maxDuration
// indefinitely.
//
// ** STATUS-PRESERVING UPSERT + chunked Supabase calls ** — same pattern as
// every other cron here since the 2026-09-02/09-05 audits (see
// cron-detroitmonthofdesign.js's header for the fuller story on why the
// chunking exists) — total overkill at today's 24-row scale, but free and
// consistent, and means this file doesn't need revisiting if this source
// ever grows.
//
// ** BEST-EFFORT ** — built from real fetched JSON/HTML, not a directly
// inspected DOM diff over time. Spot-check the first live run.

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

const EVENTS_LIST_URL = "https://playgrounddetroit.com/wp-json/wp/v2/mec-events";
const CATEGORY_TAXONOMY_URL = "https://playgrounddetroit.com/wp-json/wp/v2/mec_category?per_page=100";
const VENUE_NAME = "PLAYGROUND DETROIT";
const DEFAULT_CATEGORY = "visual"; // this venue's own core identity — an art gallery
const DEFAULT_STATUS = "approved"; // the gallery's own official listings, same trust tier as cron-dossin.js/cron-halo.js
const CRAWL_DELAY_MS = 3000; // this site's robots.txt Crawl-delay — see header comment
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_FETCH_ATTEMPTS = 4;
const SUPABASE_BATCH_SIZE = 75;
const REQUEST_HEADERS = { "User-Agent": "Mozilla/5.0 (313.events event calendar)" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same retry-with-backoff helper as cron-detroitmonthofdesign.js — no
// evidence yet that this site rate-limits the way Wix did (a handful of
// manual checks all came back clean), but this is cheap insurance and
// keeps the two scrapers' request-handling identical.
async function fetchWithRetry(url, options, attempts = MAX_FETCH_ATTEMPTS) {
  let lastResponse;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const r = await fetch(url, options);
    if (r.ok || !RETRY_STATUSES.has(r.status) || attempt === attempts) return r;
    lastResponse = r;
    await sleep(400 * attempt);
  }
  return lastResponse;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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

function stripTags(html) {
  if (!html) return "";
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// MEC's own category-tag names -> this project's event_category enum.
// Checked in order; the first tag name (case-insensitive) matching any
// entry wins. Anything left over (ART FAIR, ARTIST TALK, OPENING/CLOSING/
// ARTIST RECEPTION, INVITE ONLY, UPCOMING, or no tag at all) falls through
// to DEFAULT_CATEGORY ("visual") rather than being guessed at.
const CATEGORY_TAG_RULES = [
  [/LIVE MUSIC/i, "music"],
  [/\bFILM\b/i, "film"],
  [/WORKSHOP|PANEL DISCUSSION|FUNDRAISER|WELLNESS/i, "community"],
];

function mapCategory(tagNames) {
  for (const [re, cat] of CATEGORY_TAG_RULES) {
    if (tagNames.some((name) => re.test(name))) return cat;
  }
  return DEFAULT_CATEGORY;
}

// Fetches every mec-events post, paging past WordPress's own 100-per-page
// REST cap should this source ever grow that large (24 today — this is
// headroom, not a current need). _embed=1 pulls the featured image inline
// so a separate per-event media fetch isn't needed.
async function fetchEventList() {
  const events = [];
  let page = 1;
  for (;;) {
    const url = `${EVENTS_LIST_URL}?per_page=100&_embed=1&page=${page}`;
    const r = await fetchWithRetry(url, { headers: REQUEST_HEADERS });
    if (!r.ok) {
      if (page === 1) throw new Error(`Event list fetch failed: HTTP ${r.status}`);
      break; // later page failed (e.g. past the real last page) — keep what we already have
    }
    const body = await r.json();
    if (!Array.isArray(body) || !body.length) break;
    events.push(...body);
    const totalPages = parseInt(r.headers.get("x-wp-totalpages") || "1", 10);
    if (page >= totalPages) break;
    page++;
  }
  return events;
}

// Non-fatal by design: if this fails, mapCategory() just gets an empty
// tag-name list for every event and everything falls back to
// DEFAULT_CATEGORY, same as if the source had no category signal at all.
async function fetchCategoryNames() {
  try {
    const r = await fetchWithRetry(CATEGORY_TAXONOMY_URL, { headers: REQUEST_HEADERS });
    if (!r.ok) return new Map();
    const terms = await r.json();
    if (!Array.isArray(terms)) return new Map();
    return new Map(terms.map((t) => [t.id, t.name]));
  } catch {
    return new Map();
  }
}

// Parses one half of a Google-Calendar-style "dates" range value
// ("20260911T180000Z", or a bare "20260911" for an all-day value) into
// { date: 'YYYY-MM-DD', hour, minute } — hour/minute null for all-day.
// Identical UTC -> America/Detroit conversion to cron-feeds.js's own
// parseIcsDate() for ICS DTSTART/DTEND values — this plugin's calendar
// export link encodes the same underlying shape, just both values joined
// by "/" instead of separate ICS properties.
function parseGCalDateTime(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { date: `${y}-${mo}-${d}`, hour: null, minute: null };
  if (z) {
    const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
    const hour24 = parts.hour === "24" ? 0 : parseInt(parts.hour, 10);
    return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: hour24, minute: parseInt(parts.minute, 10) };
  }
  return { date: `${y}-${mo}-${d}`, hour: parseInt(h, 10), minute: parseInt(mi, 10) };
}

function formatTime12h(hour, minute) {
  if (hour === null || hour === undefined) return null;
  const ampm = hour >= 12 ? "PM" : "AM";
  let h12 = hour % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

// Pulls { dates, location } out of a detail page's own "+ Add to Google
// Calendar" export link — see the header comment for why this, and not
// MEC's own REST API, is this source's real structured-date/venue data.
// Regex, not a DOM parser (this project has none) — matches the href
// attribute's full quoted value however it's quoted, then decodes the
// WordPress-escaped "&#038;"/"&amp;" ampersands the query string uses
// between params before parsing it with URLSearchParams.
function extractGCalParams(html) {
  // Not anchored to a specific Google domain on purpose — a live check
  // found this link actually uses calendar.google.com/render, not the
  // www.google.com/calendar/render path this project's other calendar-link
  // helpers (event.html's buildGoogleCalUrl()) generate; matching generically
  // on "calendar" + "render" avoids being wrong again if MEC changes its
  // own link format.
  const m = html.match(/href=(["'])([^"']*calendar[^"']*render\?[^"']*)\1/i);
  if (!m) return null;
  const qsIndex = m[2].indexOf("?");
  if (qsIndex === -1) return null;
  const qs = m[2].slice(qsIndex + 1).replace(/&#0?38;/g, "&").replace(/&amp;/g, "&");
  const params = new URLSearchParams(qs);
  return { dates: params.get("dates"), location: params.get("location") };
}

async function fetchEventDetail(ev, categoryNames) {
  const r = await fetchWithRetry(ev.link, { headers: REQUEST_HEADERS });
  if (!r.ok) return null;
  const html = await r.text();

  const gcal = extractGCalParams(html);
  if (!gcal || !gcal.dates) return null; // no export link found — skip, don't guess

  const [startRaw, endRaw] = gcal.dates.split("/");
  const start = parseGCalDateTime(startRaw);
  if (!start) return null;
  const end = endRaw ? parseGCalDateTime(endRaw) : null;

  const sameDay = end && end.date === start.date;
  const startTime = formatTime12h(start.hour, start.minute);
  const endTime = sameDay ? formatTime12h(end.hour, end.minute) : null;
  const timeDisplay = startTime && endTime && endTime !== startTime ? `${startTime}–${endTime}` : startTime;

  const title = decodeEntities((ev.title && ev.title.rendered) || "").trim();
  if (!title) return null;

  const description = ev.excerpt && ev.excerpt.rendered
    ? stripTags(ev.excerpt.rendered).replace(/\[…\]\s*$/, "").trim() || undefined
    : undefined;

  const tagNames = (ev.mec_category || []).map((id) => categoryNames.get(id)).filter(Boolean);

  const imageUrl = ev._embedded && ev._embedded["wp:featuredmedia"] && ev._embedded["wp:featuredmedia"][0]
    ? ev._embedded["wp:featuredmedia"][0].source_url
    : undefined;

  const address = gcal.location || undefined;
  const cityMatch = address ? address.match(/,\s*([A-Za-z .]+?),\s*MI\s*\d{5}/) : null;

  return {
    external_id: `playgrounddetroit-${ev.id}`,
    title,
    description,
    category: mapCategory(tagNames),
    venue_name_raw: VENUE_NAME, // see header comment's "VENUE NAME CAVEAT" — not every event is physically on-site
    venue_address_raw: address,
    venue_city_raw: cityMatch ? cityMatch[1].trim() : undefined,
    start_date: start.date,
    end_date: end && end.date !== start.date ? end.date : undefined,
    time_display: timeDisplay || undefined,
    is_free: !!(description && /\bfree\b/i.test(description)),
    source: "PLAYGROUND DETROIT",
    image_url: imageUrl,
    ticket_url: ev.link,
  };
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

  let events;
  try {
    events = await fetchEventList();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Event list fetch failed: " + err.message });
    return;
  }
  if (!events.length) {
    res.status(200).json({ upserted: 0, note: "Event list fetched but contained no events.", fetchedAt: new Date().toISOString() });
    return;
  }

  const categoryNames = await fetchCategoryNames();

  // Strictly sequential with an awaited pause between every request — see
  // the header comment's CRAWL-DELAY section for why this isn't the usual
  // mapWithConcurrency() pattern other multi-page crons here use.
  const parsedResults = [];
  for (let i = 0; i < events.length; i++) {
    try {
      parsedResults.push(await fetchEventDetail(events[i], categoryNames));
    } catch {
      parsedResults.push(null); // one bad page never aborts the whole run
    }
    if (i < events.length - 1) await sleep(CRAWL_DELAY_MS);
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const parsed = parsedResults.filter(Boolean).filter((e) => e.start_date >= todayISO || (e.end_date && e.end_date >= todayISO));

  if (!parsed.length) {
    res.status(200).json({ upserted: 0, note: "No current/upcoming PLAYGROUND DETROIT events parsed.", checkedCount: events.length, fetchedAt: new Date().toISOString() });
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
    const existingStatusByExternalId = new Map();
    for (const idsChunk of chunk(rows.map((r) => r.external_id), SUPABASE_BATCH_SIZE)) {
      const lookupResp = await fetch(
        `${SUPABASE_URL}/rest/v1/events?external_id=in.(${idsChunk.join(",")})&select=external_id,status`,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      if (lookupResp.ok) {
        const existingRows = await lookupResp.json();
        if (Array.isArray(existingRows)) {
          existingRows.forEach((row) => existingStatusByExternalId.set(row.external_id, row.status));
        }
      }
    }

    const rowsWithStatus = rows.map((row) => ({
      ...row,
      status: existingStatusByExternalId.get(row.external_id) || DEFAULT_STATUS,
    }));

    let upserted = 0;
    const chunkErrors = [];
    for (const rowsChunk of chunk(rowsWithStatus, SUPABASE_BATCH_SIZE)) {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rowsChunk),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        chunkErrors.push({ externalIds: rowsChunk.map((r) => r.external_id), error: errText });
        continue;
      }
      upserted += rowsChunk.length;
    }

    if (chunkErrors.length) {
      res.status(502).json({ upserted, upsertErrors: chunkErrors, checkedCount: events.length, fetchedAt: new Date().toISOString() });
      return;
    }
    res.status(200).json({ upserted, checkedCount: events.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
