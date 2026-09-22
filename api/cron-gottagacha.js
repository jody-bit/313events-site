const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingStatuses } = require("./_lib/status-lookup");

// Vercel Cron job — pulls upcoming events from GottaGacha (gottagacha.com),
// a gaming arcade/TCG venue in Warren, MI. Added 2026-09-22 after a
// Product-Owner-approved source discovery pass.
//
// SOURCE: the public /events page is client-side-rendered (Next.js) and
// has no data in its static HTML. Watching real network traffic in a
// browser surfaced the actual source: a first-party, unauthenticated JSON
// API on GottaGacha's own domain — GET /api/events?startDate=YYYY-MM-DD&
// endDate=YYYY-MM-DD — returning { events: [...] }. Confirmed live with
// `credentials: 'omit'` (no cookies sent, still 200 with real data). A
// second option, a public ICS feed at /api/events/calendar.ics (found via
// the page's own "Subscribe to Calendar" -> "Copy Calendar URL" action),
// was investigated as CORROBORATING EVIDENCE ONLY, per explicit Product
// Owner instruction — it is not used as an ingestion path. It did confirm
// two things used below: (1) recurring events are true RRULE series with
// one UID per series, matching the JSON API's own per-series `id` reuse
// across occurrences (see EXTERNAL_ID below); (2) its VEVENT `URL`
// property is NOT event-specific — every VEVENT checked (34/34) resolved
// to the bare site root, so no source in this integration exposes a real
// per-event URL. See project discovery notes for the full evidence trail.
//
// NO ROBOTS.TXT (404 — no crawl restriction declared). Generic site-wide
// IP terms exist (Terms of Service, "may not copy/reproduce/distribute...
// without written permission") but do not address automated access, an
// API, or rate limits. The API needs no authentication, and the site
// actively surfaces a calendar-subscribe feature built for exactly this
// kind of external consumption. Recorded as fact for the Product Owner;
// not a legal conclusion.
//
// EXTERNAL_ID / RECURRENCE: the API pre-expands recurring events into one
// object per occurrence, but reuses the identical `id` (a UUID) across
// every occurrence of the same series — confirmed live (e.g. "TCG Tuesday"
// appears on 2026-09-01, -08, -15... all sharing one `id`). That id is a
// SERIES id, not a stable per-occurrence id. external_id is therefore a
// composite of series id + eventDate — see buildExternalId() — same
// pattern already used by cron-lagerhouse.js (`lagerhouse-${date}-${slug}`)
// and cron-poppspacking.js, not a new mechanism invented for this source.
//
// CATEGORY: GottaGacha's source data carries no category/type field at
// all (only `icon`/`color` UI hints, not used here — the Product Owner's
// mapping rules are keyword/content-based, not icon-based). mapCategory()
// below implements the Product Owner's exact deterministic rules
// (2026-09-22 decision) against title+description text only. An event
// matching none of the rules is NOT guessed into one — see AMBIGUOUS
// handling in the handler, which mirrors cron-metrotimes.js's own
// established "placeholder category + pending_review status, human
// decides" convention for calendar entries this project can't confidently
// classify on its own (see that file's `category: "music" // placeholder`
// comment). "community" is used here as that placeholder specifically
// because migration_009b already documents it as the deliberate catch-all
// for events that don't cleanly fit elsewhere — never used as a fallback
// for anything mapCategory() DID confidently classify as gaming.
//
// VENUE / OFF-SITE HANDLING: the source's own `location` field does NOT
// reliably distinguish on-site vs. off-site programming — confirmed live:
// "GG @ Youmacon" (GottaGacha's booth at Youmacon, an anime convention
// held elsewhere entirely) still carries location: "GottaGacha", exactly
// like every on-site event in the current catalog. Every event sampled
// (113+ across Sept-Dec) carries only "Gotta Gacha" or "GottaGacha" as
// `location` — no off-site address has ever actually been observed coming
// through this field, even for an event known (from its free-text
// description only) to be off-site. Per Product Owner instruction, this
// connector still implements the general, correct rule for when the
// field DOES differ in the future: normalize `location`; if it doesn't
// identify GottaGacha, preserve it as venue_name_raw and resolve it
// through the same buildVenueNameToIdMap()/resolveVenueId() path as any
// other connector (never auto-assigning the canonical GottaGacha venue,
// never creating a new venue). Today, because the field never actually
// varies, this branch does not fire for any real GottaGacha event in the
// catalog — flagged explicitly in the PM report, not silently assumed
// solved. No description-text inference (e.g. detecting "attending X
// convention") was added to guess at true off-site location — that would
// be exactly the kind of unauthorized inference this project's
// conventions prohibit.
//
// CANONICAL VENUE: does not exist yet in the venues table. See
// supabase/update_2026-09-22_gottagacha-venue.sql (prepared, not run —
// blocked the same way every production write is in this environment,
// DEBT-002). Until that runs, on-site rows simply get venue_id: null,
// venue_name_raw: "GottaGacha" — the same honest-gap fallback every
// connector uses before its venue exists (see venue-lookup.js's header).
// This connector never creates venues itself.
//
// FIELDS DELIBERATELY LEFT NULL (verified unavailable or unauthorized to
// infer — see discovery notes):
//   event_url    — no event-specific URL exists in either source format
//                  (confirmed: JSON has none; ICS's URL property is
//                  always the bare site root). NOT set to the site root
//                  merely because the ICS feed contains it.
//   ticket_url   — no structured, authoritative per-event ticket field
//                  exists. Some descriptions incidentally contain a
//                  third-party link (start.gg, Eventbrite, TicketTailor)
//                  as free text -- never extracted; that would be the same
//                  unauthorized description-scraping this project already
//                  declined to do for Cinema Detroit's description (SH.8).
//   image_url    — VERIFIED UNAVAILABLE: no image/artwork field of any
//                  kind in the JSON response's field set or the ICS
//                  feed's property list.
//   price_from   — no structured price field in either source. Never
//                  regexed out of description text (explicit Product
//                  Owner instruction).
//   is_free      — left at the schema default (false). NOT inferred from
//                  the absence of a price field -- absence of evidence is
//                  not evidence of "free."
// is_all_day is always false: every event sampled carries a real
// startTime/endTime (ICS DTSTART/DTEND both carry TZID + a time
// component, never a bare all-day DATE value).
//
// RECURRENCE COLUMN: the events schema has exactly one recurrence-related
// column, `is_recurring boolean`. `recurrenceEndDate` has no matching
// destination anywhere in the schema and is NOT written -- no new column
// was added for it, per explicit Product Owner instruction not to expand
// schema just for this connector. is_recurring is set from
// `!!e.recurrenceType`, the same boolean-coercion-of-a-truthy-source-field
// shape cron-visitdetroit.js already uses for its own is_recurring.
//
// STATUS: DEFAULT_STATUS is "approved" -- this project's own established
// policy (see cron-detroittraining.js's header, and DEFAULT_STATUS
// comments across cron-lagerhouse.js/cron-dossin.js/cron-motorcitywine.js/
// etc.) is that a venue's own official, structured, first-party source
// earns "approved" trust; an unfiltered aggregator or free-text/
// inconsistent parsing needs human triage ("pending_review", e.g.
// cron-metrotimes.js/cron-poppspacking.js/cron-detroittraining.js). This
// source is GottaGacha's own official backend API (not a third-party
// aggregator) with a fully structured, consistent JSON shape (real
// eventDate/startTime/endTime fields, not freeform text parsing) -- the
// same trust tier as cron-oldmiami.js/cron-lagerhouse.js. Per-row
// exception: an event whose category could not be deterministically
// mapped gets status forced to "pending_review" for THAT row only (see
// AMBIGUOUS_STATUS), regardless of the connector-level default -- the
// same "still automated, just not unattended for the parts it can't be
// confident about" posture as cron-detroittraining.js.

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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const SOURCE_SLUG = SLUGS.gottagacha;
const VENUE_NAME = "GottaGacha";
const DEFAULT_STATUS = "approved"; // see header comment: official first-party API, structured fields
const AMBIGUOUS_STATUS = "pending_review"; // per-row override when mapCategory() can't confidently classify
const AMBIGUOUS_CATEGORY = "community"; // migration_009b's documented catch-all -- never used for anything mapCategory() DID classify as gaming
const WINDOW_DAYS = 90; // same rolling-window shape as cron-ticketmaster.js

function apiUrl() {
  const today = new Date();
  const end = new Date(today.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return `https://www.gottagacha.com/api/events?startDate=${fmt(today)}&endDate=${fmt(end)}`;
}

// Composite external_id -- see EXTERNAL_ID header note. Deterministic,
// stable across reruns for the same (series, date) pair, distinct across
// different dates of the same series, distinct across different series.
function buildExternalId(seriesId, eventDate) {
  return `gottagacha-${seriesId}-${eventDate}`;
}

// `location` normalizes to "gottagacha" for every currently-observed
// on-site (and mislabeled off-site, see header note) event. Absent ->
// treated as canonical per explicit Product Owner instruction ("If the
// source location is absent or identifies GottaGacha: use the canonical
// GottaGacha venue").
function isCanonicalGottaGachaLocation(location) {
  if (location === null || location === undefined) return true;
  if (typeof location !== "string") return true;
  const normalized = location.toLowerCase().replace(/\s+/g, "");
  return normalized === "" || normalized === "gottagacha";
}

// Mirrors cron-wdet.js's formatTimeRange() exactly (12-hour, en-dash-
// joined range, single time when start===end or end missing).
function formatTimeDisplay(eventDate, startTime, endTime) {
  if (!eventDate || !startTime) return null;
  try {
    const start = new Date(`${eventDate}T${startTime}`);
    if (isNaN(start.getTime())) return null;
    const fmt = (d) => {
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, "0");
      const ap = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      return `${h}:${m} ${ap}`;
    };
    if (endTime) {
      const end = new Date(`${eventDate}T${endTime}`);
      if (!isNaN(end.getTime()) && end.getTime() !== start.getTime()) {
        return `${fmt(start)} – ${fmt(end)}`;
      }
    }
    return fmt(start);
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------
// Deterministic category mapping -- Product Owner decision 2026-09-22.
// Matches against `${title} ${description}`, case-insensitive,
// first-match-wins in the priority order below (gaming checked first as
// the most specific/highest-confidence bucket for this venue). An event
// matching none of these returns null -- the caller (module.exports
// handler) is responsible for the ambiguous-event fallback; this function
// never guesses.
// --------------------------------------------------------------------
const GAMING_ESPORTS_PATTERNS = [
  /\btcg\b/i,
  /trading[\s-]?card/i,
  /\bmtg\b/i,
  /\bmagic\b/i, // Magic: The Gathering
  /\blorcana\b/i,
  /pok[eé]mon/i,
  /yu-?gi-?oh/i,
  /one\s*piece/i,
  /fighting[\s-]?game/i,
  /e-?sports?\b/i,
  /video[\s-]?game/i,
  /\btourn(?:ament|ey)\b/i, // deliberately bounded to this single gaming-arcade venue -- see header note
  /d\s*&\s*d\b/i,
  /\bdnd\b/i,
  /dungeons\s*&?\s*dragons?/i,
  /tabletop/i,
  /start\.gg/i, // real evidence: Road2Riptide, Zam's Club Melee, Hi-Fight Circuit, CounterHit Fall Brawl all link here
  /melee\.gg/i, // real evidence: Cyberpunk Beta Release links here
];
const FILM_PATTERNS = [/movie\s*(night|screening)/i];
// Deliberately narrow -- the one music-adjacent event actually observed in
// this catalog ("Citywave: Magical Funk", a DJ/rave night ticketed via
// Eventbrite) does NOT meet this bar and correctly falls through to the
// ambiguous bucket instead: whether a DJ set is "Music" or "Nightlife &
// Club" isn't disambiguated by the Product Owner's given rules, so it is
// not guessed either way.
const MUSIC_PATTERNS = [/\blive\s*music\b/i, /\bconcert\b/i, /\bband\b/i];
const TRAINING_PATTERNS = [/\bworkshop\b/i, /\bclass(es)?\b/i];

function mapCategory(title, description) {
  const text = `${title || ""} ${description || ""}`;
  if (GAMING_ESPORTS_PATTERNS.some((re) => re.test(text))) return "gaming";
  if (FILM_PATTERNS.some((re) => re.test(text))) return "film";
  if (MUSIC_PATTERNS.some((re) => re.test(text))) return "music";
  if (TRAINING_PATTERNS.some((re) => re.test(text))) return "training";
  return null;
}

// Pure parse of one API event object into this project's row shape (minus
// venue/status fields, which need the venue map and existing-row lookup
// the handler builds separately). Exported for direct unit testing.
function parseEvent(e) {
  if (!e || typeof e !== "object") return null;
  if (!e.id || !e.title || !e.eventDate) return null;

  const category = mapCategory(e.title, e.description);
  const isAmbiguous = category === null;

  return {
    external_id: buildExternalId(e.id, e.eventDate),
    title: e.title,
    description: e.description && String(e.description).trim() ? String(e.description).trim() : null,
    category: category || AMBIGUOUS_CATEGORY,
    start_date: e.eventDate,
    time_display: formatTimeDisplay(e.eventDate, e.startTime, e.endTime),
    is_recurring: !!e.recurrenceType,
    is_all_day: false, // see header note -- every demonstrated event is timed
    is_free: false, // schema default; never inferred from absence of price (explicit instruction)
    price_from: null, // no structured price field demonstrated
    ticket_url: null, // no authoritative event-specific URL demonstrated
    event_url: null, // VERIFIED UNAVAILABLE -- see header note
    image_url: null, // VERIFIED UNAVAILABLE -- see header note
    source: "GottaGacha",
    internal_note: isAmbiguous
      ? `Category not deterministically mapped by GottaGacha's known rules (title: "${e.title}") -- needs manual categorization.`
      : null,
    _rawLocation: typeof e.location === "string" ? e.location : null,
    _defaultStatusForRow: isAmbiguous ? AMBIGUOUS_STATUS : DEFAULT_STATUS,
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
  // WP 0.5: the run begins here, once the request is confirmed to be a
  // real cron invocation -- see api/_lib/run-log.js. Fully fail-safe by
  // that module's own design: if migration_035/source_runs isn't live in
  // production yet, startRun() no-ops (returns null) and nothing below
  // behaves any differently or is blocked by it.
  const runHandle = await startRun(SOURCE_SLUG);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  let data;
  try {
    const r = await fetch(apiUrl(), { headers: { "User-Agent": "313.events event calendar" } });
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
    data = await r.json();
  } catch (err) {
    await finishRun(runHandle, { outcome: "failed", error_sample: "Fetch failed: " + err.message });
    res.status(200).json({ upserted: 0, error: "Fetch failed: " + err.message });
    return;
  }

  if (!data || typeof data !== "object" || !Array.isArray(data.events)) {
    // Malformed/unexpected shape -- records_fetched can't be trusted, and
    // no events are written. Same posture as cron-cinema-detroit.js's own
    // "pages was not an array" branch.
    await finishRun(runHandle, {
      outcome: "failed",
      error_sample: "Unexpected API response shape (events was not an array)",
    });
    res.status(200).json({ upserted: 0, error: "Unexpected API response shape" });
    return;
  }
  const events = data.events;

  const today = new Date().toISOString().slice(0, 10);
  const parsed = events.map(parseEvent).filter((e) => e && e.start_date >= today);

  if (!parsed.length) {
    await finishRun(runHandle, {
      outcome: "success",
      records_fetched: events.length,
      records_parsed: 0,
      records_written: 0,
    });
    res.status(200).json({ upserted: 0, checked: events.length, fetchedAt: new Date().toISOString() });
    return;
  }

  // See api/_lib/venue-lookup.js -- links to the existing canonical venue
  // row if one exists yet, never creates or guesses a fuzzy match.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const canonicalVenueId = resolveVenueId(venueMap, VENUE_NAME);

  const rawRows = parsed.map((e) => {
    const onSite = isCanonicalGottaGachaLocation(e._rawLocation);
    const { _rawLocation, _defaultStatusForRow, ...row } = e;
    return {
      ...row,
      venue_name_raw: onSite ? VENUE_NAME : _rawLocation,
      // Off-site: resolved through the exact same lookup as any other
      // connector's unrecognized venue -- never the canonical GottaGacha
      // id, never a newly-created venue. See header note: this branch
      // does not currently fire for any real event (location never
      // actually varies in the observed catalog), but is implemented for
      // correctness per explicit Product Owner instruction.
      venue_id: onSite ? canonicalVenueId : resolveVenueId(venueMap, _rawLocation),
      _defaultStatusForRow,
    };
  });

  // De-dupe by external_id before sending -- same reasoning as every other
  // cron here (Postgres's ON CONFLICT DO UPDATE can't touch the same
  // target row twice in one statement).
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  try {
    // Look up each row's current status before writing, so an admin's
    // approve/reject decision on an existing row is never reset by this
    // merge-duplicates upsert -- same fix shape as every other connector
    // here (cron-lagerhouse.js's header comment has the full story).
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
    const rowsWithStatus = rows.map((row) => {
      const { _defaultStatusForRow, ...rest } = row;
      return {
        ...rest,
        status: existingStatusByExternalId.get(row.external_id) || _defaultStatusForRow,
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
        records_fetched: events.length,
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
      records_fetched: events.length,
      records_parsed: parsed.length,
      records_written: rowsWithStatus.length,
    });
    res.status(200).json({ upserted: rowsWithStatus.length, checked: events.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    await finishRun(runHandle, {
      outcome: "failed",
      records_fetched: events.length,
      records_parsed: parsed.length,
      error_sample: err.message,
    });
    res.status(500).json({ upserted: 0, error: err.message });
  }
};

module.exports.parseEvent = parseEvent; // exposed for test/cron-gottagacha-runlog.test.js only
module.exports.mapCategory = mapCategory; // exposed for test/cron-gottagacha-runlog.test.js only
module.exports.buildExternalId = buildExternalId; // exposed for test/cron-gottagacha-runlog.test.js only
module.exports.isCanonicalGottaGachaLocation = isCanonicalGottaGachaLocation; // exposed for test/cron-gottagacha-runlog.test.js only
