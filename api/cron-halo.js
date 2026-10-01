const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingStatuses } = require("./_lib/status-lookup");
// Vercel Cron job — scrapes HALO Detroit's own events page
// (thehalodetroit.com/currentevents). robots.txt for this site places no
// restrictions on crawling it. The site is built on Wix, has no JSON-LD or
// API, but content is server-rendered (confirmed — a plain fetch sees the
// same event text a browser does, no JS execution required).
//
// This parser was built from a confirmed literal line-by-line dump of one
// real event block (fetched directly from the live page), not guessed —
// higher confidence than the Trinosophes scraper, but still worth spot
// checking after the first real cron run since Wix markup can change.
// Confirmed structure per event, in order:
//   "Sun, Aug 23"                                  <- short date, marks a new event
//   "CURTAIN CALL CABARET: ... /"                  <- title (trailing " /" stripped)
//   "HALO DETROIT - Bar and Lounge"                <- venue name (constant, skipped)
//   "[Buy Tickets]"                                <- button (skipped)
//   "Aug 23, 2026, 7:00 PM – 11:00 PM"              <- full date+time, the real parse anchor
//   "HALO DETROIT - Bar and Lounge, 8070 ... USA"   <- address (skipped)
//   "Share" + social links                          <- skipped
//
// Note: HALO also lists some of its DJ/electronic nights on Resident
// Advisor (ra.co) — those are NOT pulled from here (RA scraping remains off
// limits per its Terms of Use) and won't duplicate with what this scraper
// finds on the venue's own site, since this only reads thehalodetroit.com.

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


const SOURCE_URL = "https://www.thehalodetroit.com/currentevents";
const SOURCE_SLUG = SLUGS.halo; // WP 0.5 -- see api/_lib/source-slugs.js
const VENUE_NAME = "HALO Detroit";
const VENUE_CITY = "Detroit";
const DEFAULT_STATUS = "approved";

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

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

// ACTION_LINK_RE matches an anchor whose visible text is one of HALO's own
// known event-action buttons (Buy Tickets / Get Tickets / RSVP / Details /
// Learn More). Captured BEFORE the generic tag-strip below, as a synthetic
// "__ACTION_LINK__label|href" line, so the href survives into the line-scan
// instead of being discarded along with every other tag the same way it
// always was before 2026-09-28. Everything else strips exactly as before;
// this only intercepts anchors whose own visible text already matched
// NOISE_LINE's action-button vocabulary, so no unrelated link (social
// icons, nav, footer) is ever captured.
const ACTION_LINK_RE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*(buy tickets|get tickets|rsvp|details|learn more)\s*<\/a>/gi;

function htmlToLines(html) {
  const withActionLinkTokens = html.replace(ACTION_LINK_RE, (_, href, label) => `\n__ACTION_LINK__${label.trim()}|${href}\n`);
  const text = decodeEntities(withActionLinkTokens
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|span)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// "__ACTION_LINK__RSVP|https://www.thehalodetroit.com/events/hot-ash-..."
const ACTION_LINK_LINE = /^__ACTION_LINK__(buy tickets|get tickets|rsvp|details|learn more)\|(.+)$/i;

function resolveHaloUrl(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `https://www.thehalodetroit.com${href}`;
  return null; // relative-without-leading-slash or unrecognized shape -- don't guess a base
}

// "Sun, Aug 23" — short date marking the start of a new event block.
const SHORT_DATE_LINE = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+([A-Za-z]{3})\s+(\d{1,2})$/;
// "Aug 23, 2026, 7:00 PM – 11:00 PM" — the reliable full date+time anchor.
const FULL_DATETIME_LINE = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}:\d{2}\s*[AP]M)(?:\s*[–—-]\s*(\d{1,2}:\d{2}\s*[AP]M))?/i;
const NOISE_LINE = /^(buy tickets|details|rsvp|share|learn more)$/i;

function parseHaloEvents(html) {
  const lines = htmlToLines(html);
  const events = [];
  let candidateTitle = null;
  // See ACTION_LINK_RE/ACTION_LINK_LINE above -- WP 2026-09-28: this used to
  // be discarded entirely (NOISE_LINE just skipped the bare button-text
  // line). It's real, non-invented, authoritative source evidence: HALO's
  // own Wix event system shows "Buy Tickets"/"Get Tickets" only when a real
  // advance-ticket-purchase flow is configured for that event, and "RSVP"/
  // "Details" only when it isn't -- that distinction is exactly what
  // migration_041's ticket_status='rsvp_no_advance_sale' value exists for.
  // Confirmed live 2026-09-28: HOT ASH CIGAR & PIPE SOCIAL shows "RSVP"
  // (no paid ticketing configured), while a different HALO listing on the
  // same page shows "Details" for the same reason (no ticketing widget at
  // all, just an info page) -- both are equally good evidence of "no
  // advance ticket exists," so both are treated the same way here.
  let candidateActionLabel = null;
  let candidateActionHref = null;
  let inEventBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (SHORT_DATE_LINE.test(line)) {
      inEventBlock = true;
      candidateTitle = null;
      candidateActionLabel = null;
      candidateActionHref = null;
      continue;
    }

    if (!inEventBlock) continue;

    const fullMatch = line.match(FULL_DATETIME_LINE);
    if (fullMatch) {
      const monthKey = fullMatch[1].slice(0, 3).toLowerCase();
      const month = MONTHS[monthKey];
      const day = fullMatch[2].padStart(2, "0");
      const year = fullMatch[3];
      if (month && candidateTitle) {
        const time = fullMatch[5] ? `${fullMatch[4]} – ${fullMatch[5]}` : fullMatch[4];
        events.push({
          date: `${year}-${month}-${day}`,
          title: candidateTitle,
          time,
          actionLabel: candidateActionLabel,
          actionHref: candidateActionHref,
        });
      }
      inEventBlock = false; // event block finished; wait for the next short-date line
      candidateTitle = null;
      candidateActionLabel = null;
      candidateActionHref = null;
      continue;
    }

    const actionMatch = line.match(ACTION_LINK_LINE);
    if (actionMatch) {
      // First action link wins per block -- confirmed structure has at most
      // one per event; if a future layout ever had more, keeping the first
      // is the same "don't overwrite an already-decided value" posture used
      // everywhere else in this project.
      if (!candidateActionLabel) {
        candidateActionLabel = actionMatch[1].toLowerCase();
        candidateActionHref = actionMatch[2];
      }
      continue;
    }

    if (line === VENUE_NAME || NOISE_LINE.test(line) || line.startsWith(VENUE_NAME)) continue;

    // First non-noise, non-venue line after the short date is the title.
    if (!candidateTitle) {
      candidateTitle = line.replace(/\s*\/\s*$/, "").trim(); // strip trailing " /" separator
    }
  }

  return events;
}

const haloHandler = async (req, res) => {
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

  // records_fetched (WP 0.5): same as cron-dossin.js -- this line-by-line
  // text-scan parser doesn't expose a separate "raw candidate" count from
  // the events it successfully recognizes, and this WP does not touch
  // parser internals to invent one. Left null (genuinely unavailable)
  // rather than duplicating records_parsed under a different name.
  const parsed = parseHaloEvents(html);
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

  // WP 2026-09-28: ticket_url/event_url/ticket_status from the action
  // button captured in parseHaloEvents. "buy tickets"/"get tickets" means a
  // real advance-ticket flow is configured -- that link IS the ticket_url,
  // no ticket_status needed (a populated ticket_url already says
  // "advance tickets exist"). "rsvp"/"details" means no advance-purchase
  // mechanism exists on HALO's own booking system -- that link is instead
  // the event's own info/RSVP page (event_url, not ticket_url, since it
  // isn't a ticket purchase flow), and ticket_status is set to the new
  // migration_041 value so Needs Follow-up understands a missing
  // ticket_url here is expected, not a gap. Never invents a URL: if
  // actionHref didn't resolve to a real absolute URL (resolveHaloUrl
  // returns null), the corresponding field is simply left null, same as
  // before this change.
  //
  // 2026-10-01 (Jody, site owner, confirming a Needs Follow-up
  // investigation): "HALO we already know they do not have tickets, you
  // pay at the door." That's an authoritative, source-level fact about
  // this whole venue, not a per-event unknown -- so when a HALO event's
  // own page has no action button/link AT ALL (no "Buy Tickets", no
  // "RSVP", nothing), ticket_status now defaults to migration_041's
  // 'door' value instead of staying null. This is the one place in this
  // function that's about the VENUE, not about what a specific event's
  // page showed -- every other branch above is still driven purely by
  // that event's own scraped action button, unchanged.
  function ticketFieldsFor(e) {
    const url = resolveHaloUrl(e.actionHref);
    if (!url) return { ticket_url: null, event_url: null, ticket_status: "door" };
    if (e.actionLabel === "buy tickets" || e.actionLabel === "get tickets") {
      return { ticket_url: url, event_url: null, ticket_status: null };
    }
    if (e.actionLabel === "rsvp" || e.actionLabel === "details") {
      return { ticket_url: null, event_url: url, ticket_status: "rsvp_no_advance_sale" };
    }
    return { ticket_url: null, event_url: null, ticket_status: "door" };
  }

  const rawRows = parsed.map((e) => ({
    external_id: `halo-${e.date}-${e.title}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 250),
    title: e.title,
    category: "nightlife", // best-effort default — HALO's own page doesn't distinguish cabaret/DJ/social events
    venue_name_raw: VENUE_NAME,
    venue_id: venueId,
    start_date: e.date,
    time_display: e.time,
    is_free: false,
    source: "HALO Detroit",
    ...ticketFieldsFor(e),
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

module.exports = haloHandler;
module.exports.parseHaloEvents = parseHaloEvents; // exposed for test/cron-halo-ticket-status.test.js only
module.exports.resolveHaloUrl = resolveHaloUrl;
