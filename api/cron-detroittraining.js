const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { lookupExistingStatuses } = require("./_lib/status-lookup");
// Vercel Cron job — pulls upcoming course sessions from Detroit Training
// Center (detroittraining.com). Added 2026-09-18, Jody: "can we mine this
// for events? this would go into classes & training" — see
// migration_031/032 for the new 'training' category this needed.
//
// SOURCE SHAPE: unlike this project's other sources, there is no single
// calendar or list page here — detroittraining.com is Squarespace, and
// each course TYPE (Forklift, OSHA, Welding, Michigan Builders License,
// etc.) has its own standalone marketing page with its own freeform
// "upcoming dates" text block somewhere in it, written by hand by DTC's
// own staff (confirmed real, server-rendered Squarespace HTML — not a
// client-rendered SPA — via a plain fetch that came back with the actual
// schedule text in it, same due-diligence check every other cron here
// does). PAGES below is that fixed, hand-curated list of course pages —
// same "one specific, deliberately chosen source" shape as cron-
// oldmiami.js's single venue page, just fanned out across many pages
// instead of one.
//
// WHY THIS IS DIFFERENT FROM EVERY OTHER CRON HERE: every other source's
// date field has a single, consistent shape site-wide (an HTML `<time>`
// attribute, a JSON-LD field, an ICS DTSTART). Checked three of these
// pages by hand before writing this (mibuilders, osha, and the contact
// page for the org's physical address) and found genuinely inconsistent
// freeform wording page-to-page: mibuilders has ONE date range with NO
// year ("OCTOBER 19TH - NOVEMBER 10TH"), osha has THREE separate date
// ranges each WITH an explicit year ("OCTOBER 5 - 8, 2026"). There's no
// guarantee every other page (drywall, welding, excavator, etc.) follows
// either of those exact shapes. parseScheduleDates() below is a
// deliberately generic month-name + day(s) [+ year] regex meant to catch
// both observed shapes and reasonable variations on them, NOT a
// guarantee it catches everything or never mis-splits a range — see
// DEFAULT_STATUS below for how that risk is handled.
//
// DEFAULT_STATUS = "pending_review" — a real departure from this
// project's usual "single vetted source -> approved" convention (cron-
// oldmiami.js, cron-lagerhouse.js, etc.). Every other single-source cron
// earns that trust from a consistent, structured date field. This source
// doesn't have one, so every row this produces gets a human glance in
// admin.html before it goes live — still real automation (nobody has to
// go visit 18 separate pages and transcribe dates by hand anymore), just
// not unattended. Worth reconsidering once a few real runs show the
// parser is reliable in practice.
//
// TIME: course "times" text (e.g. "Monday - Thursday: 5:45 PM to 9:45 PM"
// + "Saturday: 8:30 AM to 12:30 PM") is often a real per-day schedule,
// not one clean start-end range this project's single time_display
// string field can hold without losing information — left null rather
// than mangled into something misleading, with the raw nearby text kept
// in `note` instead so a moderator has it on hand. (This is exactly the
// real-world case behind FEATURE_BACKLOG.md item #3, "multi-day events
// with different times per day" — once that ships, this is a good source
// to revisit.)
//
// LOCATION: most of these are hands-on courses at DTC's own facility
// (23323 Schoolcraft, Detroit, MI 48223 — from detroittraining.com/
// contact); a page whose own text says "ONLINE" (seen on mibuilders,
// e.g. Google Meet) gets no street address instead, flagged in `note`.
//
// PRICE: only set from a real "$<amount>" figure found near the word
// "total"/"cost" on the page; left null otherwise. Never guessed.
//
// ** BEST-EFFORT / pending_review ** — spot-check the first several
// real runs in admin.html before trusting this to run unattended.

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

const VENUE_NAME = "Detroit Training Center";
const DEFAULT_ADDRESS = "23323 Schoolcraft";
const DEFAULT_CITY = "Detroit";
const DEFAULT_STATUS = "pending_review"; // see header comment
const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (313.events event calendar)" };
const MAX_EVENTS_PER_RUN = 80;
const PAST_GRACE_DAYS = 10; // a dateless-year match this far in the "past" is assumed to mean next year instead (evergreen page text)

// Fixed, hand-curated list of course pages — see header comment. Title is
// this project's own event title, not necessarily DTC's exact page title.
const PAGES = [
  { slug: "forklift", url: "https://detroittraining.com/forklift", title: "Forklift Certification Training" },
  { slug: "mibuilders", url: "https://detroittraining.com/mibuilders", title: "Michigan Residential Builders License Class" },
  { slug: "drywall", url: "https://detroittraining.com/drywall", title: "Drywall Finishing Training Program" },
  { slug: "heavy-equipment", url: "https://detroittraining.com/heavy-equipment", title: "Heavy Equipment Operator Training Program" },
  { slug: "welding", url: "https://detroittraining.com/welding", title: "Welding MIG Production Worker Training Program" },
  { slug: "aerial-lift", url: "https://detroittraining.com/aerial-lift", title: "Aerial Lift Operator Training" },
  { slug: "asbestos", url: "https://detroittraining.com/asbestos", title: "Asbestos Abatement Training" },
  { slug: "asbestos-inspector", url: "https://detroittraining.com/asbestos-inspector", title: "Asbestos Inspector Training" },
  { slug: "backhoe", url: "https://detroittraining.com/backhoe", title: "Backhoe Operator Training" },
  { slug: "skidsteer", url: "https://detroittraining.com/skidsteer", title: "Skidsteer Operator Training" },
  { slug: "excavator", url: "https://detroittraining.com/excavator", title: "Excavator Operator Training" },
  { slug: "telehandler", url: "https://detroittraining.com/telehandler", title: "Telehandler Operator Training" },
  { slug: "rrp", url: "https://detroittraining.com/rrp", title: "EPA Lead RRP Training" },
  { slug: "first-aid", url: "https://detroittraining.com/first-aid", title: "First Aid / CPR Training" },
  { slug: "osha", url: "https://detroittraining.com/osha", title: "OSHA 10/30 Construction" },
  { slug: "osha-10-30-general-industry", url: "https://detroittraining.com/osha-10-30-general-industry", title: "OSHA 10/30 General Industry" },
  { slug: "hazwoper", url: "https://detroittraining.com/hazwoper", title: "HAZWOPER Training" },
];

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ");
}

function htmlToText(html) {
  return decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " "));
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = MONTHS.join("|");

// Matches "OCTOBER 19TH - NOVEMBER 10TH" (no year) as well as
// "OCTOBER 5 - 8, 2026" (same month, day range, explicit year) and a
// bare single date "OCTOBER 5, 2026" / "OCTOBER 5TH". Global, case-
// insensitive over the page's flattened text.
const DATE_RANGE_RE = new RegExp(
  `\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?` +
  `(?:\\s*[-–—]\\s*(?:(${MONTH_RE})\\s+)?(\\d{1,2})(?:st|nd|rd|th)?)?` +
  `(?:,?\\s*(20\\d{2}))?`,
  "gi"
);

function resolveYear(month0, day, explicitYear, today) {
  if (explicitYear) return parseInt(explicitYear, 10);
  const thisYear = today.getUTCFullYear();
  const candidate = new Date(Date.UTC(thisYear, month0, day));
  const graceMs = PAST_GRACE_DAYS * 24 * 3600 * 1000;
  if (candidate.getTime() < today.getTime() - graceMs) return thisYear + 1;
  return thisYear;
}

function isoDate(y, month0, d) {
  return `${y}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Returns [{startISO, endISO, matchText}] for every plausible date-range
// match found near "date"/"schedule"/"upcoming" context words — matching
// bare month/day text ANYWHERE on the page (e.g. inside course outlines)
// would produce garbage, so this only scans within a window around each
// occurrence of those context words rather than the whole page.
function parseScheduleDates(text, today) {
  const contextRe = /(upcoming|schedule)/gi;
  const windows = [];
  let cm;
  while ((cm = contextRe.exec(text))) {
    windows.push([cm.index, cm.index + 400]); // look ahead ~400 chars from each context word
  }
  const found = [];
  const seenKeys = new Set();
  for (const [start, end] of windows) {
    const segment = text.slice(start, Math.min(end, text.length));
    DATE_RANGE_RE.lastIndex = 0;
    let m;
    while ((m = DATE_RANGE_RE.exec(segment))) {
      const [matchText, mon1, day1, mon2, day2, year] = m;
      const month0a = MONTHS.indexOf(mon1.toLowerCase());
      if (month0a < 0) continue;
      const y = resolveYear(month0a, parseInt(day1, 10), year, today);
      const startISO = isoDate(y, month0a, parseInt(day1, 10));
      let endISO = startISO;
      if (day2) {
        const month0b = mon2 ? MONTHS.indexOf(mon2.toLowerCase()) : month0a;
        if (month0b >= 0) endISO = isoDate(y, month0b, parseInt(day2, 10));
      }
      const key = `${startISO}|${endISO}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      found.push({ startISO, endISO, matchText: matchText.trim() });
    }
  }
  return found;
}

function extractLocation(text) {
  const m = text.match(/LOCATION\s*[-:]?\s*([^\n]{0,80})/i);
  if (!m) return null;
  return m[1].trim();
}

function extractPrice(text) {
  const m = text.match(/\$\s?([\d,]+(?:\.\d{2})?)\s*(?:total|for the course)?/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(val) ? val : null;
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

  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const todayISO = todayUTC.toISOString().slice(0, 10);

  const rawRows = [];
  const skipped = [];

  for (const page of PAGES) {
    try {
      const r = await fetch(page.url, { headers: FETCH_HEADERS });
      if (!r.ok) { skipped.push({ slug: page.slug, reason: `HTTP ${r.status}` }); continue; }
      const html = await r.text();
      const text = htmlToText(html).replace(/\s+/g, " ");

      const dates = parseScheduleDates(text, todayUTC).filter((d) => d.startISO >= todayISO);
      if (!dates.length) { skipped.push({ slug: page.slug, reason: "No upcoming date range found near 'schedule'/'upcoming' text" }); continue; }

      const locationRaw = extractLocation(text);
      const isOnline = !!(locationRaw && /online/i.test(locationRaw));
      const priceFrom = extractPrice(text);

      for (const d of dates) {
        rawRows.push({
          external_id: `dtc-${page.slug}-${d.startISO}`.slice(0, 250),
          title: page.title,
          description: undefined, // page's own body copy is long marketing text, not a clean 1-3 sentence description -- left for a moderator to write, same "don't force-fit" convention as time_display below
          category: "training",
          venue_name_raw: VENUE_NAME,
          venue_address_raw: isOnline ? undefined : DEFAULT_ADDRESS,
          venue_city_raw: DEFAULT_CITY,
          start_date: d.startISO,
          end_date: d.endISO !== d.startISO ? d.endISO : undefined,
          is_free: false,
          price_from: priceFrom || undefined,
          ticket_url: page.url,
          source: "Detroit Training Center (detroittraining.com)",
          note: [
            isOnline ? `Online session (${locationRaw}).` : null,
            `Parsed date text: "${d.matchText}". Course times weren't captured (often a multi-day schedule, e.g. "Mon–Thu evenings + Sat mornings") -- check ${page.url} and fill in manually.`,
          ].filter(Boolean).join(" "),
        });
      }
    } catch (err) {
      skipped.push({ slug: page.slug, reason: err.message });
    }
  }

  const capped = rawRows.slice(0, MAX_EVENTS_PER_RUN);
  const seen = new Map();
  for (const row of capped) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  if (!rows.length) {
    res.status(200).json({ upserted: 0, skipped, note: "No upcoming sessions parsed across any page.", fetchedAt: new Date().toISOString() });
    return;
  }

  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const venueId = resolveVenueId(venueMap, VENUE_NAME);
  const rowsWithVenue = rows.map((r) => ({ ...r, venue_id: venueId }));

  try {
    // WP 0.17 (2026-09-22): fail-closed status lookup -- previously this
    // had no inner try/catch at all (a thrown network error would
    // propagate uncontrolled) and a non-OK response fell through silently
    // to an empty map, defaulting every row to DEFAULT_STATUS (D7). See
    // api/_lib/status-lookup.js. Any failure now aborts this run entirely
    // -- zero event writes, HTTP 502 -- rather than either of those.
    let existingStatusByExternalId;
    try {
      existingStatusByExternalId = await lookupExistingStatuses(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        rowsWithVenue.map((r) => r.external_id)
      );
    } catch (lookupErr) {
      res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
      return;
    }

    const rowsWithStatus = rowsWithVenue.map((row) => ({
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
