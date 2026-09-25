const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingStatuses } = require("./_lib/status-lookup");
// Vercel Cron job — scrapes Trinosophes' own events page (trinosophes.com/Events)
// and upserts parsed shows into Supabase as status='approved'.
//
// ** BEST-EFFORT / UNVERIFIED **
// Trinosophes' site has no structured data at all (no JSON-LD, no repeating
// HTML containers) — it's a flat text page where a bold date heading like
// "August 16" is followed by one or more event name lines before the next
// date heading. This parser was written from a description of that page's
// structure, not tested against a live fetch (this environment's network is
// sandboxed and can't reach arbitrary external sites directly). Treat the
// first real cron run as a test: check the `events` table for rows with
// source='Trinosophes' and eyeball them against https://trinosophes.com/Events
// before trusting this long-term. If the site's layout doesn't match what's
// assumed here, this will silently upsert 0 rows (fails soft, same pattern
// as the other cron jobs) rather than corrupt existing data.
//
// Protect this endpoint the same way as cron-ticketmaster.js: set CRON_SECRET
// in Vercel and reference /api/cron-trinosophes in vercel.json's crons list.

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


const SOURCE_URL = "https://trinosophes.com/Events";
const SOURCE_SLUG = SLUGS.trinosophes; // WP 0.5 -- see api/_lib/source-slugs.js
const VENUE_NAME = "Trinosophes";
const VENUE_CITY = "Detroit";
const DEFAULT_STATUS = "approved";

const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

// Strip HTML tags down to plain text lines, collapsing whitespace, so the
// date-heading-then-title heuristic can run against something close to what
// a human sees rendered on the page.
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
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Matches a standalone date heading line like "August 16" or "August 16, 2026".
const DATE_LINE = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s*(\d{4}))?$/i;
// Matches a 4-digit year-only heading line, e.g. "2026" — used to track the
// current year context since individual date lines usually omit it.
const YEAR_LINE = /^(20\d{2})$/;

// PRODUCTION BUG FIX (2026-09-25): a single complex listing spanning several
// <br>-separated lines was being split into multiple bogus "events" sharing
// one date, instead of being recognized as one listing. Confirmed against
// Trinosophes' real live page that day (the still-upcoming "October 8" /
// "October 11" / "October 25" listings, each of which produced 1 real event
// worth of information split across 3, 1, and 3 raw lines respectively —
// exactly the 7 garbled rows a human first reported seeing live on the
// site). Four narrow, specific line shapes, each confirmed against that
// real text, are now folded into the event they belong with instead of
// becoming their own row:
const PARENTHETICAL_ONLY_RE = /^\(.+\)$/;
const LOCATION_CLARIFIER_RE = /^(?:at|in)\s+[A-Z]/;
const PRESENTER_PREFIX_RE = /\bpresents?$/i;
const CLOSURE_NOTICE_RE = /^closed\b/i;

function parseTrinosophesEvents(html) {
  const lines = htmlToLines(html);
  const events = [];
  let currentYear = new Date().getFullYear(); // fallback if no year heading seen yet
  let pendingDate = null; // {month, day}
  // A presenter-credit / series-heading line ("Trinosophes and Media City
  // Fil Festival present", "Tuesdays at Trinosophes presents") held until
  // the next real title line, then prefixed onto it — never pushed as an
  // event of its own.
  let pendingPrefix = null;

  for (const line of lines) {
    const yearMatch = line.match(YEAR_LINE);
    if (yearMatch) {
      currentYear = parseInt(yearMatch[1], 10);
      pendingDate = null;
      pendingPrefix = null;
      continue;
    }

    const dateMatch = line.match(DATE_LINE);
    if (dateMatch) {
      const month = MONTHS[dateMatch[1].toLowerCase()];
      const day = dateMatch[2].padStart(2, "0");
      const year = dateMatch[3] || String(currentYear);
      pendingDate = { date: `${year}-${month}-${day}` };
      pendingPrefix = null;
      continue;
    }

    // Skip obvious section headers / nav / footer noise. This is a defensive
    // guard, not a guarantee — untested against the real live page, so
    // spot-check the first cron run's output before trusting it. A venue
    // closure notice ("Closed for a private event in the evening") is noise
    // too -- it's operational information, never a public event.
    const isNoise =
      line.length <= 2 ||
      line.length > 120 || // real titles are short; long lines are usually paragraph copy
      /^coming soon$/i.test(line) ||
      /^(home|about|events|shop|contact|menu|tickets?|newsletter|subscribe|instagram|facebook|twitter|donate|directions|hours|faq)$/i.test(line) ||
      /^https?:\/\//i.test(line) ||
      /@/.test(line) || // likely an email/handle line, not an event title
      CLOSURE_NOTICE_RE.test(line);

    if (!pendingDate || isNoise) continue;

    // Trinosophes sometimes lists multiple acts on one date across several
    // lines — pendingDate stays open so they all attach to the same date,
    // rather than clearing it after the first line. Distinguishing "this
    // line is a NEW act" from "this line belongs to the PREVIOUS line" is
    // the part that isn't fully solvable on unstructured text (confirmed:
    // the real page has no consistent wrapper per listing), so only the
    // narrow, confirmed-real patterns below are folded in — anything else
    // still becomes its own row, same as before.
    const lastForThisDate =
      events.length && events[events.length - 1].date === pendingDate.date
        ? events[events.length - 1]
        : null;

    if (lastForThisDate && (PARENTHETICAL_ONLY_RE.test(line) || LOCATION_CLARIFIER_RE.test(line))) {
      // A personnel/credit parenthetical ("(Doug McCombs, Steve Shelley,
      // Bruce Lamont, Eric Block)") or a trailing location clarifier ("at
      // Detroit Public Lirbary") belongs to the event immediately before
      // it, never a standalone one.
      lastForThisDate.title = `${lastForThisDate.title} ${line}`;
      continue;
    }

    if (PRESENTER_PREFIX_RE.test(line)) {
      pendingPrefix = line;
      continue;
    }

    const title = pendingPrefix ? `${pendingPrefix} ${line}` : line;
    pendingPrefix = null;
    events.push({ date: pendingDate.date, title });
  }

  return events;
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
  // real cron invocation -- see api/_lib/run-log.js. (WP 0.14, the
  // pending-review routing for new Trinosophes rows, is a separate,
  // not-yet-approved WP and is not touched here -- see its own backlog
  // entry. This WP only adds run-lifecycle telemetry.)
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

  // Trinosophes' page turned out to be a full historical archive (real shows
  // going back to 2012), not just upcoming ones — discovered 2026-08-25 when
  // a live run upserted 552 rows. Keep only current/upcoming events, same
  // pattern as cron-cinema-detroit.js.
  const today = new Date().toISOString().slice(0, 10);
  // records_fetched (WP 0.5): all events the parser found on the page,
  // including the historical ones the filter below removes -- see the
  // 2026-08-25 comment above. records_parsed is the upcoming-only subset,
  // matching the same fetched-before-filtering / parsed-after-filtering
  // convention used across the other Batch 1/2 connectors.
  const allParsedEvents = parseTrinosophesEvents(html);
  const parsed = allParsedEvents.filter((e) => e.date >= today);
  if (!parsed.length) {
    await finishRun(runHandle, {
      outcome: "success",
      records_fetched: allParsedEvents.length,
      records_parsed: 0,
      records_written: 0,
    });
    res.status(200).json({ upserted: 0, note: "No upcoming events parsed — the site's layout may have changed, or none are currently listed.", fetchedAt: new Date().toISOString() });
    return;
  }

  // See api/_lib/venue-lookup.js — links to the existing venues row if one
  // exists, never creates or guesses a fuzzy match.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const venueId = resolveVenueId(venueMap, VENUE_NAME);

  const rawRows = parsed.map((e) => ({
    external_id: `trinosophes-${e.date}-${e.title}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 250),
    title: e.title,
    category: "music", // Trinosophes is predominantly a music/arts venue; not fine-grained per event
    venue_name_raw: VENUE_NAME,
    venue_id: venueId,
    start_date: e.date,
    // Trinosophes' events page never lists a showtime (confirmed 2026-08-26
    // — every listing is just a date heading + title, no times anywhere).
    // Per Jody: doors are reliably either 7:00 or 7:30, so default to the
    // earlier, safer time rather than showing blank/no time at all, and
    // flag it as approximate via `note` (the site's short-caveat field —
    // rendered under the venue line) so no one shows up expecting an exact
    // start.
    time_display: "7:00 PM",
    note: "Doors ~7:00 PM (sometimes 7:30) — confirm at trinosophes.com or by calling the venue.",
    is_free: false,
    source: "Trinosophes",
  }));

  // De-dupe by external_id before sending. The page lists recurring events
  // across multiple years with untested year-tracking (see BEST-EFFORT note
  // above), so two real, different-date events can occasionally land on the
  // same computed external_id. Postgres's ON CONFLICT DO UPDATE can't touch
  // the same target row twice in one statement — without this, one bad pair
  // fails the ENTIRE batch (every real event in the run), not just the dupe.
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
        records_fetched: allParsedEvents.length,
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
      records_fetched: allParsedEvents.length,
      records_parsed: parsed.length,
      records_written: rowsWithStatus.length,
    });
    res.status(200).json({ upserted: rowsWithStatus.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    await finishRun(runHandle, {
      outcome: "failed",
      records_fetched: allParsedEvents.length,
      records_parsed: parsed.length,
      error_sample: err.message,
    });
    res.status(500).json({ upserted: 0, error: err.message });
  }
};

module.exports.parseTrinosophesEvents = parseTrinosophesEvents; // exposed for test/cron-trinosophes-parse.test.js only
