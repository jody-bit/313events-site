const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingStatuses } = require("./_lib/status-lookup");
// Vercel Cron job — pulls Dossin Great Lakes Museum events from the Detroit
// Historical Society's combined events page (detroithistorical.org/events,
// which covers both the Detroit Historical Museum — already in this
// database as a manually-curated source — and the Dossin, on Belle Isle).
// This scraper keeps only rows whose location text says "Dossin Great
// Lakes Museum", so it doesn't duplicate the Historical Museum's existing
// manually-curated listings.
//
// NOTE: the URL that looks like the "right" one for just the Dossin
// (detroithistorical.org/dossin-great-lakes-museum/events-calendar/
// events-listing) is a Drupal BigPipe-lazy-loaded block that returns no
// event data to a plain fetch — confirmed empty on a real fetch. This
// scraper deliberately uses the general /events page instead and filters
// by location text, which DOES return full data to a plain fetch.
// Drupal's JSON:API is also exposed at /jsonapi/node/event but is
// misconfigured to deny anonymous reads of individual event resources —
// not usable, confirmed via a real 200-with-empty-data response.
//
// ** BEST-EFFORT ** — built from real fetched text, not a directly
// inspected DOM. Spot-check the first live run.

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


const SOURCE_URL = "https://www.detroithistorical.org/events";
const SOURCE_SLUG = SLUGS.dossin; // WP 0.5 -- see api/_lib/source-slugs.js
const VENUE_NAME = "Dossin Great Lakes Museum";
const VENUE_MATCH = /dossin/i;
const DEFAULT_STATUS = "approved";
// Needs Follow-up burn-down (2026-09-22): this connector never sent
// venue_address_raw/venue_city_raw at all, so every row it writes was
// unconditionally flagged "venue address/city" in admin.html's
// getMissingFields() unless the linked venues row happened to already
// carry a street address -- unverifiable from this environment (DEBT-002
// blocks production database reads). A fixed single-venue source doesn't
// need a lookup for this: the museum's own address is a constant, same
// established pattern as cron-outerlimitslounge.js/cron-motorcitywine.js/
// cron-oldmiami.js/cron-poppspacking.js's VENUE_ADDRESS/VENUE_CITY
// constants. Verified 2026-09-22 against the Detroit Historical Society's
// own Dossin page ("Located on Strand Drive on Belle Isle") and confirmed
// by exact street number across independent listings (Yelp, Apple Maps
// data, TripHobo) -- no single source invented, no schema-assumption
// guess (NO EVIDENCE -> NO ENRICHMENT).
const VENUE_ADDRESS = "100 Strand Dr";
const VENUE_CITY = "Detroit";
const SOURCE_NAME = "Detroit Historical Society";

// Extracted 2026-09-23 (Dossin metadata repair) so scripts/dossin-
// metadata-repair.js can compute the identical id a freshly-parsed event
// would get, to match it against an already-upserted database row --
// same formula this file always used, just named and exported instead of
// inlined, so there is exactly one place it's defined.
function dossinExternalId(date, title) {
  return `dossin-${date}-${title}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 250);
}

const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

// Live layout, confirmed 2026-09-20 by fetching detroithistorical.org/events
// and diffing its real line-by-line text against this file's regexes: each
// event renders as four consecutive lines — TITLE, then VENUE NAME, then a
// date/time block, then a "LEARN MORE" link.
//
// BUG-002, 2026-09-21 (production incident): the 2026-09-20 fix above
// assumed the date and time always sit on ONE combined line
// ("Month D, YYYY, H:MMam - H:MMpm"). Re-verified live during the 2026-09-21
// incident triage by re-running this exact parsing code against the current
// page: 0 events parsed despite Dossin rows clearly present in the raw HTML.
// The real cause: the site now (still, per a second live check) splits the
// start date/time and the end time across TWO separate lines —
// "September 19, 2026, 10:00am" then "- 2:00pm" immediately after — not one
// combined line. DATE_LINE below now accepts a start time with no end time
// on the same line, and — when that happens — checks whether the very next
// line is just an end-time continuation ("- H:MMpm") and uses it if so. The
// old single-line combined shape is still accepted too (harmless either way,
// and cheap insurance if the site's template varies or reverts).
const DATE_LINE = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:,\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)(?:\s*[-–—]\s*(\d{1,2}:\d{2}\s*(?:am|pm)))?)?\s*$/i;
const END_TIME_CONTINUATION_LINE = /^[-–—]\s*(\d{1,2}:\d{2}\s*(?:am|pm))\s*$/i;
const NOISE_LINE = /^(home|about|events|calendar|tickets?|buy tickets|membership|donate|contact|newsletter|subscribe|instagram|facebook|shop|visit|hours|admission)$/i;

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
    // 2026-09-23 (Dossin metadata repair): parseDossinEvents()'s own header
    // comment above documents -- from a real, previously-verified live
    // fetch, diffed line-by-line during the 2026-09-21 BUG-002 incident --
    // that each event on this page ends with a "LEARN MORE" link. Its href
    // was always discarded by the generic tag-strip below; this converts
    // ONLY that specific anchor (visible text exactly "learn more",
    // case/whitespace insensitive) into a sentinel line preserving the
    // href, before the generic strip runs. Deliberately narrow: any other
    // link, or a "learn more" anchor with nested markup inside it, simply
    // doesn't match and falls through to the exact same behavior as
    // before this line existed (a plain stripped text line, href lost) --
    // this can only ever ADD a line's worth of information, never remove
    // or reorder any existing line, so it cannot change the title/venue
    // date/time extraction below, which reads lines purely by position.
    .replace(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>\s*learn\s*more\s*<\/a>/gi, "\n__DOSSIN_LEARN_MORE_URL__$1__\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|article)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
  return text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function parseDossinEvents(html) {
  const lines = htmlToLines(html);
  const events = [];

  // Walk the lines looking for the date line, then look backward two lines
  // for VENUE and TITLE — the real, confirmed order on this page (see
  // DATE_LINE's comment above).
  for (let i = 0; i < lines.length; i++) {
    const dtMatch = lines[i].match(DATE_LINE);
    if (!dtMatch) continue;

    const month = MONTHS[dtMatch[1].toLowerCase()];
    const day = parseInt(dtMatch[2], 10);
    // Guards against malformed date text silently becoming a bad event —
    // an unrecognized month name or an out-of-range day skips the line
    // instead of producing a row with a garbage/wrapped date.
    if (!month || !day || day > 31) continue;

    const venueLine = lines[i - 1];
    const titleLine = lines[i - 2];
    if (!venueLine || !VENUE_MATCH.test(venueLine)) continue; // not a Dossin event — skip
    if (!titleLine || NOISE_LINE.test(titleLine) || titleLine.length < 3 || titleLine.length > 140) continue;

    const date = `${dtMatch[3]}-${month}-${dtMatch[2].padStart(2, "0")}`;

    let time = null;
    let consumedContinuationLine = false;
    if (dtMatch[4]) {
      let start = dtMatch[4].trim();
      let end = dtMatch[5] ? dtMatch[5].trim() : null;

      // No end time on the same line as the start time — check whether the
      // very next line is just the end-time continuation ("- 2:00pm"),
      // which is the real shape on the live site as of 2026-09-21 (see
      // BUG-002 comment above).
      if (!end) {
        const cont = lines[i + 1] && lines[i + 1].match(END_TIME_CONTINUATION_LINE);
        if (cont) { end = cont[1].trim(); consumedContinuationLine = true; }
      }

      if (end) {
        // Some entries omit am/pm on the start time when it shares the end
        // time's period (e.g. "1:00 - 2:30pm" means 1:00pm-2:30pm) — infer it
        // from the end time rather than leaving it ambiguous.
        if (!/am|pm/i.test(start)) {
          const suffix = end.match(/am|pm/i);
          if (suffix) start += suffix[0];
        }
        time = `${start} – ${end}`;
      } else {
        time = start;
      }
    }

    // 2026-09-23 (Dossin metadata repair): the "LEARN MORE" line is the
    // very next line after the date/time block -- one line further still
    // when an end-time continuation line was consumed just above. Only
    // ever set when htmlToLines()'s sentinel actually matched a real
    // per-event anchor; never guessed, never a fallback to any other line.
    let event_url = null;
    const learnMoreLine = lines[i + 1 + (consumedContinuationLine ? 1 : 0)];
    if (learnMoreLine) {
      const linkMatch = learnMoreLine.match(/^__DOSSIN_LEARN_MORE_URL__(.+)__$/);
      if (linkMatch) event_url = linkMatch[1];
    }

    events.push({ title: titleLine, date, time, event_url });
  }

  return events;
}

const handler = async (req, res) => {
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

  // records_fetched (WP 0.5): this connector's text-scan parser (the
  // BUG-002-fixed parseDossinEvents, preserved exactly -- see its own
  // header comment) does not expose a separate "raw candidate" count
  // distinct from the events it successfully recognizes; adding one would
  // mean touching that parser's internals, which this WP does not do.
  // records_fetched is therefore left null (genuinely unavailable, not
  // invented) rather than duplicating records_parsed under a different name.
  const parsed = parseDossinEvents(html);
  if (!parsed.length) {
    await finishRun(runHandle, {
      outcome: "success",
      records_fetched: null,
      records_parsed: 0,
      records_written: 0,
    });
    res.status(200).json({ upserted: 0, note: "No Dossin events parsed — the site's layout may have changed, or none are currently listed.", fetchedAt: new Date().toISOString() });
    return;
  }

  // See api/_lib/venue-lookup.js — links to the existing venues row if one
  // exists, never creates or guesses a fuzzy match.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const venueId = resolveVenueId(venueMap, VENUE_NAME);

  const rawRows = parsed.map((e) => ({
    external_id: dossinExternalId(e.date, e.title),
    title: e.title,
    category: "museum",
    venue_name_raw: VENUE_NAME,
    venue_id: venueId,
    venue_address_raw: VENUE_ADDRESS,
    venue_city_raw: VENUE_CITY,
    start_date: e.date,
    time_display: e.time,
    is_free: false,
    source: SOURCE_NAME,
    // Deliberately NOT setting event_url here -- this WP only adds the
    // ABILITY to parse it (for scripts/dossin-metadata-repair.js's reuse,
    // see that file), it does not change what this cron itself writes on
    // a normal scheduled run. Scope stays exactly what the Product Owner
    // asked for: repair EXISTING rows via Auto-Repair, not a change to
    // this connector's own ongoing upsert behavior.
  }));

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
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: 502,
        error_sample: "Status lookup failed: " + lookupErr.message,
      });
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

module.exports = handler;
module.exports.parseDossinEvents = parseDossinEvents; // exposed for test/cron-dossin-parse.test.js only
// Exposed for scripts/dossin-metadata-repair.js reuse (2026-09-23) -- same
// reasoning as api/cron-outerlimitslounge.js's own exports: one parser for
// this source, reused by the repair script rather than duplicated.
module.exports.dossinExternalId = dossinExternalId;
module.exports.SOURCE_URL = SOURCE_URL;
module.exports.SOURCE_NAME = SOURCE_NAME;
