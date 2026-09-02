// Vercel Cron job — pulls Lager House (Corktown, Detroit) shows straight from
// thelagerhouse.com/events. Added 2026-09-02 at Jody's request ("We must add
// in Lager house events to the database").
//
// Confirmed server-rendered (a plain fetch with no JS execution returns the
// full event list — verified against the live page before writing this, same
// due-diligence step cron-dossin.js's own header comment describes doing).
// No robots.txt exists on the domain at all, matching the "open, no crawl
// restrictions" precedent already documented for other venues in
// sources.html.
//
// The site (an Angular SSR app) renders each show as an
// <app-event-card><a href="/events/YYYY-MM-DD/slug-here">...</a></app-event-card>
// block with a clean, consistent structure — the date and a stable slug are
// both right there in the URL itself, which is far more reliable than
// parsing "2 SEP" header text, so this scraper splits on that tag and
// regex-matches within each card rather than using the line-heuristic
// approach cron-dossin.js needed for a messier source.
//
// Lager House is unusual among the sources this project scrapes in that it
// actually publishes a doors time alongside the set time on every listing —
// exactly the "why don't promoters put set times" gap Jody wants closed
// elsewhere. Both are captured here: start time -> time_display (kept to a
// single clean time so it still matches parseTimeRange()'s expectations on
// every reading page), doors time -> note (free-text, rendered distinctly,
// never fed through time-parsing regexes).
//
// A handful of listings are for the venue's sister room ("After Hours @
// Brooklyn Detroit", a different address ~1.5 blocks away per its own
// listing text) rather than the main room — detected from the title text
// itself (that's literally how the venue's own site labels them) so those
// rows get their own honest venue_name_raw instead of being mislabeled as
// the main room.
//
// ** STATUS-PRESERVING UPSERT ** — unlike this project's other cron
// importers (cron-dossin.js, cron-trinosophes.js, cron-halo.js, etc., all of
// which hardcode `status` into every upsert row), this one looks up each
// row's *current* status before writing and reuses it for anything that
// already exists, only defaulting fresh rows to DEFAULT_STATUS. Those other
// crons had a real, confirmed bug: because they always send a hardcoded
// status with `Prefer: resolution=merge-duplicates`, the very next scheduled
// run of the same cron silently re-approves an event an admin had just
// rejected (or, for cron-metrotimes.js, pulls an admin-approved event back
// into pending_review) — moderation decisions were being clobbered on a
// schedule. This file is the template for retrofitting that fix into the
// others (2026-09-02 site audit).
//
// ** BEST-EFFORT ** — built from real fetched HTML, spot-check the first
// live run.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const SOURCE_URL = "https://thelagerhouse.com/events";
const VENUE_NAME = "Lager House";
const SISTER_ROOM_NAME = "After Hours @ Brooklyn Detroit";
const SISTER_ROOM_MATCH = /after hours @ brooklyn detroit/i;
const DEFAULT_STATUS = "approved"; // same trust tier as cron-dossin.js/cron-trinosophes.js — a venue's own official site, not a third-party aggregator.

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

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseLagerHouseEvents(html) {
  const cards = html.split("<app-event-card").slice(1); // first chunk (before any card) is page chrome, not an event
  const events = [];

  for (const chunk of cards) {
    const hrefMatch = chunk.match(/href="\/events\/(\d{4}-\d{2}-\d{2})\/([a-z0-9-]+)"/);
    if (!hrefMatch) continue; // layout changed or this card didn't parse — skip it, don't guess
    const date = hrefMatch[1];
    const slug = hrefMatch[2];

    const titleMatch = chunk.match(/<h3[^>]*>([^<]+)<\/h3>/);
    const title = titleMatch ? stripTags(titleMatch[1]) : null;
    if (!title) continue;

    const spans = [...chunk.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => stripTags(m[1])).filter(Boolean);
    const startTime = spans.find((s) => /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(s)) || null;
    const doorsSpan = spans.find((s) => /^Doors:\s*\d{1,2}:\d{2}\s*(AM|PM)$/i.test(s)) || null;

    const priceMatch = chunk.match(/text-lg font-bold text-blue-600">\s*([^<]+?)\s*</);
    const priceText = priceMatch ? stripTags(priceMatch[1]) : null;

    const descMatch = chunk.match(/line-clamp-2">\s*([^<]+?)\s*</);
    const description = descMatch ? stripTags(descMatch[1]) : null;

    events.push({ date, slug, title, startTime, doorsSpan, priceText, description });
  }

  return events;
}

function parsePrice(priceText) {
  if (!priceText) return { isFree: false, priceFrom: null };
  if (/free/i.test(priceText)) return { isFree: true, priceFrom: null };
  const m = priceText.match(/\$(\d+(?:\.\d{1,2})?)/);
  return { isFree: false, priceFrom: m ? parseFloat(m[1]) : null };
}

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  let html;
  try {
    const r = await fetch(SOURCE_URL, { headers: { "User-Agent": "Mozilla/5.0 (313events.com event calendar)" } });
    if (!r.ok) {
      res.status(200).json({ upserted: 0, error: `Fetch failed: HTTP ${r.status}` });
      return;
    }
    html = await r.text();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Fetch failed: " + err.message });
    return;
  }

  const parsed = parseLagerHouseEvents(html);
  if (!parsed.length) {
    res.status(200).json({ upserted: 0, note: "No Lager House events parsed — the site's layout may have changed, or none are currently listed.", fetchedAt: new Date().toISOString() });
    return;
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  const rawRows = parsed
    .filter((e) => e.date >= todayISO) // the page also lists recently-past shows; nothing downstream needs those written every run
    .map((e) => {
      const { isFree, priceFrom } = parsePrice(e.priceText);
      const isSisterRoom = SISTER_ROOM_MATCH.test(e.title) || (e.description && SISTER_ROOM_MATCH.test(e.description));
      return {
        external_id: `lagerhouse-${e.date}-${e.slug}`.slice(0, 250),
        title: e.title,
        description: e.description || undefined,
        category: "music",
        venue_name_raw: isSisterRoom ? SISTER_ROOM_NAME : VENUE_NAME,
        venue_city_raw: "Detroit",
        start_date: e.date,
        time_display: e.startTime || undefined,
        note: e.doorsSpan || undefined, // e.g. "Doors: 7:00 PM" — kept out of time_display so parseTimeRange() on every reading page isn't fed a second time it doesn't expect
        is_free: isFree,
        price_from: priceFrom ?? undefined,
        source: "Lager House",
        ticket_url: `https://thelagerhouse.com/events/${e.date}/${e.slug}`,
      };
    });

  // De-dupe by external_id before sending — Postgres's ON CONFLICT DO UPDATE
  // can't touch the same target row twice in one statement.
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  if (!rows.length) {
    res.status(200).json({ upserted: 0, note: "Parsed events but none are today or later.", fetchedAt: new Date().toISOString() });
    return;
  }

  try {
    // Look up whatever status each of these rows currently has in the
    // database (if they exist at all) BEFORE writing, so an admin's
    // approve/reject decision on an existing row survives this upsert
    // instead of being silently reset to DEFAULT_STATUS every run — see the
    // file-header comment for the bug this avoids.
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
    // If the lookup itself fails, fall through with an empty map — every row
    // just defaults to DEFAULT_STATUS, same as this scraper's first-ever
    // run. Not silently worse than the old behavior in that failure case.

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
    res.status(200).json({ upserted: rowsWithStatus.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
