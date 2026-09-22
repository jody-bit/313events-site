const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { lookupExistingStatuses } = require("./_lib/status-lookup");
// Vercel Cron job — pulls The Old Miami (Cass Corridor, Detroit) shows from
// rockindetroit.com/venue/old-miami/. Added 2026-09-12 at Jody's request,
// after asking me to "crawl" that venue page.
//
// rockindetroit.com is a plain server-rendered WordPress/Divi site (NOT a
// client-rendered SPA — confirmed via a real fetch returning the full
// calendar and event detail markup with no JS execution needed, same
// due-diligence check cron-dossin.js's header describes). robots.txt has no
// Disallow on /events/ or /venue/ (only /wp-admin/ is blocked). The site's
// own REST API (/wp-json/wp/v2/events) exists but is a dead end for this —
// its `acf` field is always `[]` and there's no `content`/`excerpt` in the
// response at all, so the only place the actual event details (bands,
// price, date, times) live is the rendered HTML of each event's own page.
//
// rockindetroit.com covers many Michigan DIY/rock venues, not just this one
// (Ann Arbor Funhouse, etc. also have pages there) — same shape as
// cron-dossin.js's source (a shared multi-venue events page filtered down
// to one specific vetted venue). Two-step crawl per run: (1) fetch the
// venue's own calendar page and collect every /events/<slug>/ link found on
// it — that page is the trusted list of "what's currently booked at The Old
// Miami" — then (2) fetch each of those event pages individually for the
// real fields, since the venue page itself doesn't show admission/times.
//
// Every event page uses the same plain label/value layout: "Bands" / list
// of band names, "Admission", "Date" (MM/DD/YYYY), "Location" (street +
// city, matching this project's other venue-name_raw/city_raw split),
// "Start Time", "End Time", and an optional freeform "Additional Event
// Information" block (seen once with a longer lineup than the "Bands" list
// above it — kept separately in `note` rather than silently merged/deduped,
// since it isn't clear which list is authoritative). Parsed the same
// line-based way cron-dossin.js parses its messier source: strip tags to
// plain lines, then read values off known label lines rather than trying to
// match a fixed HTML structure that could shift under Divi's generic
// wrapper divs (there's no semantic markup here to hook into at all).
//
// A blank "End Time" sometimes rendered as the literal text "Z" on one
// checked event (Dally Day) — looks like a template artifact for "no end
// time set" rather than a real time. Anything that isn't a real H:MM am/pm
// value is dropped rather than kept, same honest-gap convention as every
// other scraper here.
//
// Every event page names its own venue in a byline at the top ("<Venue>
// Presents:") — used as a defensive guard so a future rockindetroit.com
// layout change (or an unexpected cross-listing) can't silently attribute
// some other venue's show to The Old Miami; a mismatch is skipped, not
// guessed at.
//
// venue_name_raw is deliberately "The Old Miami" (WITH "The"), even though
// rockindetroit.com itself just says "Old Miami" everywhere — this project
// already has one manually-entered row using "The Old Miami" (a comedy
// show, 2026-08-27), so this matches that existing spelling rather than
// splitting the same real-world venue into two different venue_name_raw
// groups on the calendar/map.
//
// DEFAULT_STATUS = "approved" — filtered down to one specific, deliberately
// chosen venue rather than ingesting the whole multi-venue site
// indiscriminately, same trust tier/reasoning as cron-dossin.js (contrast
// cron-metrotimes.js, which pulls an unfiltered general calendar and lands
// pending_review instead).
//
// ** STATUS-PRESERVING UPSERT ** — looks up each row's current status
// before writing and reuses it, so an admin's approve/reject decision on an
// existing row survives a later run instead of being silently reset (see
// cron-lagerhouse.js's header for the bug this avoids).
//
// ** BEST-EFFORT ** — built from real fetched pages, spot-check the first
// live run.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Timing-safe secret comparison — see cron-lagerhouse.js's identical
// function for the full reasoning (2026-09-02 site audit).
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

const VENUE_PAGE_URL = "https://rockindetroit.com/venue/old-miami/";
const VENUE_NAME = "The Old Miami"; // see header comment — matches this project's existing spelling, not the source site's own "Old Miami"
const VENUE_MATCH = /old miami/i; // byline guard, source site's own spelling either way
const VENUE_ADDRESS = "3930 Cass Ave.";
const VENUE_CITY = "Detroit";
const DEFAULT_STATUS = "approved";
const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (313.events event calendar)" };
const MAX_EVENTS_PER_RUN = 40; // soft cap — this venue currently lists ~5 at a time; guards worst-case run time if that ever changes a lot

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
    .replace(/<\/(p|div|li|h[1-6]|tr|article)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
  return text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// Every /events/<slug>/ link found anywhere on the venue's own calendar page
// — order matches the page's own listing order, dedupe by slug.
function extractEventSlugs(html) {
  const matches = [...html.matchAll(/href="https:\/\/rockindetroit\.com\/events\/([a-z0-9-]+)\/?"/gi)];
  const seen = new Set();
  const slugs = [];
  for (const m of matches) {
    const slug = m[1];
    if (!seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  }
  return slugs;
}

const LABELS = ["Bands", "Admission", "Date", "Location", "Start Time", "End Time", "Additional Event Information", "Home"];

function sectionsFromLines(lines) {
  const idxs = [];
  lines.forEach((line, i) => {
    if (LABELS.includes(line)) idxs.push({ label: line, i });
  });
  const sections = {};
  for (let k = 0; k < idxs.length; k++) {
    const start = idxs[k].i + 1;
    const end = k + 1 < idxs.length ? idxs[k + 1].i : lines.length;
    // Only keep the FIRST occurrence of a label (defensive — the layout has
    // never repeated one on any page checked, but a repeat shouldn't
    // silently overwrite an already-captured section).
    if (!(idxs[k].label in sections)) sections[idxs[k].label] = lines.slice(start, end);
  }
  return sections;
}

const TIME_RE = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i;

function formatTime(raw) {
  const m = raw && raw.match(TIME_RE);
  if (!m) return null; // covers the blank/"Z"-artifact case — see header comment
  return `${m[1]}:${m[2]} ${m[3].toUpperCase()}`;
}

function parsePrice(admissionLines) {
  const text = (admissionLines || []).join(" ").trim();
  if (!text) return { isFree: false, priceFrom: undefined, priceText: null };
  if (/free/i.test(text)) return { isFree: true, priceFrom: null, priceText: text };
  const m = text.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  return { isFree: false, priceFrom: m ? parseFloat(m[1]) : undefined, priceText: text };
}

function parseDateSlash(dateLine) {
  const m = dateLine && dateLine.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function parseEventPage(html, slug) {
  const lines = htmlToLines(html);
  const presentsIdx = lines.indexOf("Presents:");
  let title = presentsIdx >= 0 ? lines[presentsIdx + 1] : null;
  if (!title) {
    const titleTagMatch = html.match(/<title>([^<]*)<\/title>/i);
    title = titleTagMatch ? decodeEntities(titleTagMatch[1]).split("|")[0].trim() : null;
  }
  if (!title) return null; // couldn't even find a title — don't guess, skip this one

  const byline = presentsIdx >= 0 ? lines[presentsIdx - 1] : lines[0];
  if (!byline || !VENUE_MATCH.test(byline)) return null; // see header comment's venue-mismatch guard

  const sections = sectionsFromLines(lines);

  const bands = sections["Bands"] || [];
  const dateISO = parseDateSlash((sections["Date"] || [])[0]);
  if (!dateISO) return null; // no usable date — nothing to file this under, skip

  const locationLines = sections["Location"] || [];
  const address = locationLines[0] || VENUE_ADDRESS;
  const city = locationLines[1] || VENUE_CITY;

  const startTime = formatTime((sections["Start Time"] || [])[0]);
  const endTime = formatTime((sections["End Time"] || [])[0]);
  const timeDisplay = startTime && endTime ? `${startTime}–${endTime}` : startTime || undefined;

  const { isFree, priceFrom } = parsePrice(sections["Admission"]);

  const extraLineup = (sections["Additional Event Information"] || []).join(" ").trim();

  const noteParts = [];
  if (extraLineup) {
    noteParts.push(`Page also lists a fuller "Additional Event Information" lineup: ${extraLineup}`);
  }

  return {
    slug,
    title,
    bands,
    dateISO,
    address,
    city,
    timeDisplay,
    isFree,
    priceFrom,
    note: noteParts.join(" ") || undefined,
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

  let venueHtml;
  try {
    const r = await fetch(VENUE_PAGE_URL, { headers: FETCH_HEADERS });
    if (!r.ok) {
      res.status(200).json({ upserted: 0, error: `Venue page fetch failed: HTTP ${r.status}` });
      return;
    }
    venueHtml = await r.text();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Venue page fetch failed: " + err.message });
    return;
  }

  const slugs = extractEventSlugs(venueHtml).slice(0, MAX_EVENTS_PER_RUN);
  if (!slugs.length) {
    res.status(200).json({ upserted: 0, note: "No event links found on the venue page — layout may have changed, or nothing is currently booked.", fetchedAt: new Date().toISOString() });
    return;
  }

  const parsedEvents = [];
  const skipped = [];
  for (const slug of slugs) {
    const eventUrl = `https://rockindetroit.com/events/${slug}/`;
    try {
      const r = await fetch(eventUrl, { headers: FETCH_HEADERS });
      if (!r.ok) {
        skipped.push({ slug, reason: `HTTP ${r.status}` });
        continue;
      }
      const html = await r.text();
      const parsed = parseEventPage(html, slug);
      if (!parsed) {
        skipped.push({ slug, reason: "Could not parse expected fields (title/venue/date)" });
        continue;
      }
      parsedEvents.push({ ...parsed, eventUrl });
    } catch (err) {
      skipped.push({ slug, reason: err.message });
    }
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  // See api/_lib/venue-lookup.js — links to the existing `venues` row for
  // "The Old Miami" (already assigned a real neighborhood) if one exists;
  // never creates a new venue or guesses a fuzzy match.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const venueId = resolveVenueId(venueMap, VENUE_NAME);

  const rawRows = parsedEvents
    .filter((e) => e.dateISO >= todayISO) // the venue page shouldn't list past shows, but don't trust that blindly
    .map((e) => ({
      external_id: `oldmiami-${e.slug}`.slice(0, 250),
      title: e.title,
      description: e.bands.length ? `Live music: ${e.bands.join(", ")}` : undefined,
      category: "music",
      venue_name_raw: VENUE_NAME,
      venue_id: venueId,
      venue_address_raw: e.address,
      venue_city_raw: e.city,
      start_date: e.dateISO,
      time_display: e.timeDisplay,
      note: e.note,
      is_free: e.isFree,
      price_from: e.priceFrom,
      source: "Rock In Detroit (rockindetroit.com/venue/old-miami)",
      ticket_url: e.eventUrl, // no separate ticket vendor — door admission, same convention as cron-lagerhouse.js pointing ticket_url at the source's own event page
    }));

  // De-dupe by external_id before sending — Postgres's ON CONFLICT DO UPDATE
  // can't touch the same target row twice in one statement.
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  if (!rows.length) {
    res.status(200).json({ upserted: 0, skipped, note: "Parsed event pages but none are today or later (or none parsed cleanly).", fetchedAt: new Date().toISOString() });
    return;
  }

  try {
    // Preserve each existing row's current status (approve/reject survives a
    // later re-run) — see cron-lagerhouse.js's header for the bug this avoids.
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
      res.status(502).json({ upserted: 0, skipped, error: "Supabase upsert failed: " + errText });
      return;
    }
    res.status(200).json({ upserted: rowsWithStatus.length, skipped, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, skipped, error: err.message });
  }
};
