const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingStatuses } = require("./_lib/status-lookup");

// Vercel Cron job — the `eventbrite-org` adapter anticipated by
// INGESTION_BACKLOG.md's WP 6.12 ("Organizer-authorized keys only. Pilot:
// any regional organizer who grants access... Adapter fixture tests pass.
// Pilot active, or it waits on an organizer.") and flagged as the
// unblocking route for Florian East Lagers & Ales in
// INGESTION_PLATFORM_ARCHITECTURE.md §7.7's table ("the venue runs its own
// Eventbrite organizer page... an official_api/T2 route that never touches
// the blocked site. Seed it into the registry once the planned
// eventbrite-org adapter ships").
//
// NOTE ON SCOPE: WP 6.12 lives in §2.3's future `lib/ingest/adapters/`
// platform layer (ingest-dispatch.js/ingest-worker.js/a shared adapter
// contract), and INGESTION_BACKLOG.md's own header says that whole plan is
// "Plan only. Nothing here has been implemented" — none of Phases 1-5 it
// depends on (and that it lists as WP 6.12's own dependency, 5.6) exist in
// this codebase today. Rather than block this adapter on a separate,
// unstarted platform rewrite, this ships the same way every other
// connector shipped this quarter (cron-bagleycommunity.js, 2026-10-01,
// being the most recent): a single Vercel Cron handler, following this
// project's existing api/_lib helpers, born with source_runs
// instrumentation from day one. It delivers WP 6.12's actual deliverable
// (an organizer-authorized adapter; fixture tests passing; a pilot slot
// ready for the moment an organizer grants access) without waiting on a
// bigger, separately-scoped rewrite.
//
// WHY "ORGANIZER-AUTHORIZED KEYS ONLY", NEVER SCRAPING: Eventbrite's own
// Terms of Service (§13.1) prohibit automated scraping/crawling/extraction
// of Site Content, and Eventbrite's public search API (the only path that
// would have worked without an organizer's own credential) was deprecated
// in Feb 2020 — PRODUCT.md's own "Sources ruled out for automation" list
// already records this ("Eventbrite's public search API (deprecated
// 2020 — organizer-login-only access remains, not usable for Comedy Bar
// Detroit/Garden Theater/Planet Ant/New Dodge Lounge)"). The only
// compliant path left is Eventbrite's real, documented v3 API
// (GET /organizations/{organizer_id}/events/), authenticated with an
// OAuth token belonging to that specific organizer — i.e., access the
// organizer itself grants, not generic scraping of a public page. This
// connector implements exactly that and nothing else: no HTML fetch of
// any eventbrite.com page appears anywhere in this file.
//
// GENERALIZED, NOT FLORIAN-EAST-SPECIFIC: ORGANIZERS below is a plain
// config array — a new organizer is onboarded by adding one entry and
// setting its token's env var, never by touching the parsing logic. Every
// entry is skipped (not an error) when its own token env var isn't set,
// which is the expected, default state for every entry until a real
// organizer actually grants access — this file can ship, and its fixture
// tests can pass, with zero live credentials configured.
//
// CATEGORY: Eventbrite's own category/subcategory taxonomy (numeric
// category_id/subcategory_id) does not map onto this project's 15-value
// event_category enum, and this is a genuinely multi-organizer, multi-
// future-source adapter — guessing a mapping here would be exactly the
// kind of source-specific hack this project's conventions warn against
// (see cron-gottagacha.js's own header for the established "don't guess"
// precedent). Every row from this source is therefore treated as
// category-ambiguous: AMBIGUOUS_CATEGORY ("community", migration_009b's
// documented catch-all) + status forced to pending_review, same as
// cron-gottagacha.js/cron-metrotimes.js's own ambiguous-row handling, just
// applied to every row here instead of a subset.
//
// FIELDS DELIBERATELY LEFT NULL (verified unavailable at this endpoint, or
// not something this connector infers):
//   price_from — ticket pricing lives behind a separate, paginated
//                Ticket Classes endpoint this connector does not call (out
//                of scope for this adapter; never regexed out of
//                description text either).
//   is_all_day — Eventbrite's v3 Event object has no all-day flag; left at
//                the schema default (false) rather than invented.
//   venue fields for an online_event (e.conline_event: true) — no
//                physical venue exists to report; venue_name_raw/venue_id
//                stay null and internal_note records why, rather than
//                falling back to the organizer's own usual venue (that
//                would be guessing a physical location for a virtual
//                event).
//
// VENUE RESOLUTION: identical path as every other connector here
// (buildVenueNameToIdMap/resolveVenueId) — links to an existing canonical
// venues row by exact name match only, never creates one, never guesses.
// Florian East itself has no canonical venues row yet (same gap as
// cron-gottagacha.js's GottaGacha venue — see that file's header), so its
// events land with venue_id: null, venue_name_raw: "Florian East Lagers &
// Ales" (as returned by Eventbrite's own expanded venue object) until that
// row exists.
//
// STATUS: every row from this source is pending_review, never approved
// automatically — see CATEGORY above. This is a stricter posture than
// this project's usual "venue's own official API earns approved" rule
// (cron-gottagacha.js/cron-oldmiami.js/etc.), a deliberate exception
// because category confidence, not source trust, is what's missing here.
//
// EXTERNAL_ID: `eventbrite-${event.id}` — Eventbrite's own event ids are
// already stable, globally unique, and never reused across occurrences
// (unlike GottaGacha's series-id-per-occurrence case), so no composite key
// is needed.

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

const SOURCE_SLUG = SLUGS.eventbriteOrg;
const SOURCE_LABEL = "Eventbrite"; // events.source — the platform/aggregator, never the organizer (DEC-005: "source ≠ organizer")
const AMBIGUOUS_STATUS = "pending_review"; // every row from this source — see header CATEGORY note
const AMBIGUOUS_CATEGORY = "community"; // migration_009b's documented catch-all
const API_BASE = "https://www.eventbriteapi.com/v3";
const MAX_PAGES_PER_ORGANIZER = 10; // bounded pagination — see header; avoids a runaway loop against a misbehaving/huge organizer

// Config-driven, multi-organizer registry (WP 6.12's "generalized adapter"
// requirement) — onboarding a new organizer never touches the parsing
// logic below, only this array and that organizer's own token env var.
// Florian East is the first entry, demonstrating the shape; it is skipped
// at runtime today (EVENTBRITE_TOKEN_FLORIANEAST is unset — no credential
// exists yet), same as every entry would be before its organizer grants
// access. organizerId is the numeric id from the organizer's own Eventbrite
// URL (eventbrite.com/o/florian-east-105186308861 -> 105186308861,
// confirmed in INGESTION_PLATFORM_ARCHITECTURE.md §7.7).
const ORGANIZERS = Object.freeze([
  Object.freeze({
    organizerId: "105186308861",
    venueName: "Florian East Lagers & Ales",
    tokenEnvVar: "EVENTBRITE_TOKEN_FLORIANEAST",
  }),
]);

// Mirrors cron-gottagacha.js's formatTimeDisplay() exactly, except it reads
// HH:MM(:SS) directly out of Eventbrite's own `local` datetime strings
// (e.g. "2026-11-01T19:00:00") rather than constructing a Date — Eventbrite
// already hands back venue-local wall-clock time in that field, so no
// timezone conversion is needed or safe to attempt here.
function formatTimeDisplay(startLocal, endLocal) {
  if (!startLocal || startLocal.length < 16) return null;
  const startHM = startLocal.slice(11, 16);
  const fmt = (hm) => {
    const [hStr, mStr] = hm.split(":");
    let h = parseInt(hStr, 10);
    if (isNaN(h)) return null;
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${mStr} ${ap}`;
  };
  const startFmt = fmt(startHM);
  if (!startFmt) return null;
  if (endLocal && endLocal.length >= 16) {
    const endHM = endLocal.slice(11, 16);
    if (endHM !== startHM) {
      const endFmt = fmt(endHM);
      if (endFmt) return `${startFmt} – ${endFmt}`;
    }
  }
  return startFmt;
}

// Pure parse of one Eventbrite v3 Event object (as returned by
// GET /organizations/{id}/events/?expand=venue) into this project's row
// shape, minus venue_id/status (filled in by the handler, which needs the
// shared venue map and existing-row lookup). Exported for direct unit
// testing. Returns null for a structurally unusable event (no id, no
// name.text, or no start.local).
function parseEvent(e) {
  if (!e || typeof e !== "object") return null;
  const title = e.name && typeof e.name.text === "string" ? e.name.text.trim() : null;
  const startLocal = e.start && typeof e.start.local === "string" ? e.start.local : null;
  if (!e.id || !title || !startLocal) return null;

  const endLocal = e.end && typeof e.end.local === "string" ? e.end.local : null;
  const description =
    e.description && typeof e.description.text === "string" && e.description.text.trim()
      ? e.description.text.trim()
      : null;

  const isOnline = e.online_event === true;
  const venue = e.venue && typeof e.venue === "object" ? e.venue : null;
  const venueName = venue && typeof venue.name === "string" && venue.name.trim() ? venue.name.trim() : null;

  const notes = [
    `Category not mappable from Eventbrite's own taxonomy (event: "${title}") -- needs manual categorization.`,
  ];
  if (isOnline) notes.push("Online event -- no physical venue to report.");

  return {
    external_id: `eventbrite-${e.id}`,
    title,
    description,
    category: AMBIGUOUS_CATEGORY,
    start_date: startLocal.slice(0, 10),
    time_display: formatTimeDisplay(startLocal, endLocal),
    is_recurring: !!e.is_series,
    is_all_day: false, // see header -- no such field exists on this source
    is_free: e.is_free === true,
    price_from: null, // see header -- needs a separate Ticket Classes call, out of scope
    ticket_url: typeof e.url === "string" ? e.url : null,
    event_url: typeof e.url === "string" ? e.url : null,
    image_url: e.logo && typeof e.logo.url === "string" ? e.logo.url : null,
    source: SOURCE_LABEL,
    internal_note: notes.join(" "),
    _rawVenueName: venueName, // consumed by the handler, stripped before upsert
    _defaultStatusForRow: AMBIGUOUS_STATUS,
  };
}

function organizerEventsUrl(organizerId, continuation) {
  const params = new URLSearchParams({
    status: "live",
    order_by: "start_asc",
    expand: "venue",
  });
  if (continuation) params.set("continuation", continuation);
  return `${API_BASE}/organizations/${organizerId}/events/?${params.toString()}`;
}

// Fetches every page (bounded by MAX_PAGES_PER_ORGANIZER) of one
// organizer's live events. Returns { events, error } — error is a short
// string describing the first failure encountered (non-OK response,
// malformed body, or a thrown network error); events is whatever was
// successfully collected before that point (may be partial on error, which
// is why the caller must treat a non-null error as fatal for this
// organizer's contribution to the run, not silently use the partial list).
async function fetchOrganizerEvents(organizerId, token) {
  const events = [];
  let continuation = null;
  for (let page = 0; page < MAX_PAGES_PER_ORGANIZER; page++) {
    let r;
    try {
      r = await fetch(organizerEventsUrl(organizerId, continuation), {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "313.events event calendar" },
      });
    } catch (err) {
      return { events, error: "Fetch failed: " + err.message, httpStatus: null };
    }
    if (!r.ok) {
      return { events, error: `Fetch failed: HTTP ${r.status}`, httpStatus: r.status };
    }
    let data;
    try {
      data = await r.json();
    } catch (err) {
      return { events, error: "Unparseable JSON response: " + err.message, httpStatus: r.status };
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.events)) {
      return { events, error: "Unexpected API response shape (events was not an array)", httpStatus: r.status };
    }
    events.push(...data.events);
    const pagination = data.pagination;
    if (pagination && pagination.has_more_items && pagination.continuation) {
      continuation = pagination.continuation;
    } else {
      break;
    }
  }
  return { events, error: null, httpStatus: 200 };
}

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  const runHandle = await startRun(SOURCE_SLUG);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  const skipped = [];
  const failed = [];
  let totalFetched = 0;
  const allParsed = [];

  // Single aggregate run across every configured organizer -- same
  // "one source_runs row per invocation" convention cron-feeds.js
  // established for its own multi-source loop (see source-slugs.js's own
  // header note on why cron-feeds.js gets exactly one slug, not one per
  // feed). A per-organizer failure never aborts the other organizers in
  // this same run; it is recorded in `failed` and reflected in the
  // run's outcome below.
  for (const organizer of ORGANIZERS) {
    const token = process.env[organizer.tokenEnvVar];
    if (!token) {
      skipped.push(organizer.organizerId);
      continue;
    }
    const { events, error, httpStatus } = await fetchOrganizerEvents(organizer.organizerId, token);
    totalFetched += events.length;
    if (error) {
      failed.push({ organizerId: organizer.organizerId, error, httpStatus });
    }
    for (const e of events) {
      const parsed = parseEvent(e);
      if (!parsed) continue;
      // Organizer-level venue fallback is deliberately NOT applied here --
      // see header note: an event with no expanded venue and not
      // online_event simply stays venue-less (_rawVenueName null) rather
      // than guessing the organizer's usual venue.
      allParsed.push(parsed);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const parsed = allParsed.filter((e) => e.start_date >= today);

  // Every organizer skipped (no token configured) and nothing fetched --
  // the expected, default state today. A clean no-op success, not an
  // error: this connector is supposed to sit dormant until an organizer
  // grants access (WP 6.12's own acceptance test allows this: "Pilot
  // active, or it waits on an organizer").
  if (!parsed.length) {
    const allSkipped = skipped.length === ORGANIZERS.length && failed.length === 0;
    await finishRun(runHandle, {
      outcome: failed.length ? "partial" : "success",
      records_fetched: totalFetched,
      records_parsed: 0,
      records_written: 0,
      error_sample: failed.length ? failed.map((f) => `${f.organizerId}: ${f.error}`).join("; ") : undefined,
    });
    res.status(200).json({
      upserted: 0,
      checked: totalFetched,
      skipped,
      failed,
      allOrganizersSkipped: allSkipped,
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const rawRows = parsed.map((e) => {
    const { _rawVenueName, _defaultStatusForRow, ...row } = e;
    return {
      ...row,
      venue_name_raw: _rawVenueName,
      venue_id: resolveVenueId(venueMap, _rawVenueName),
      _defaultStatusForRow,
    };
  });

  // De-dupe by external_id before sending -- same reasoning as every other
  // cron here (Postgres's ON CONFLICT DO UPDATE can't touch the same
  // target row twice in one statement). Shouldn't fire in practice (each
  // organizer's events have globally unique ids), but costs nothing to
  // guard against defensively, same posture as cron-gottagacha.js.
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  try {
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
        records_fetched: totalFetched,
        records_parsed: parsed.length,
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
        records_fetched: totalFetched,
        records_parsed: parsed.length,
        records_written: 0,
        error_sample: "Supabase upsert failed: " + errText,
      });
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    await finishRun(runHandle, {
      outcome: failed.length ? "partial" : "success",
      http_status: resp.status,
      records_fetched: totalFetched,
      records_parsed: parsed.length,
      records_written: rowsWithStatus.length,
      error_sample: failed.length ? failed.map((f) => `${f.organizerId}: ${f.error}`).join("; ") : undefined,
    });
    res.status(200).json({
      upserted: rowsWithStatus.length,
      checked: totalFetched,
      skipped,
      failed,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    await finishRun(runHandle, {
      outcome: "failed",
      records_fetched: totalFetched,
      records_parsed: parsed.length,
      error_sample: err.message,
    });
    res.status(500).json({ upserted: 0, error: err.message });
  }
};

module.exports.parseEvent = parseEvent; // exposed for test/cron-eventbrite-runlog.test.js only
module.exports.formatTimeDisplay = formatTimeDisplay; // exposed for test/cron-eventbrite-runlog.test.js only
module.exports.ORGANIZERS = ORGANIZERS; // exposed for test/cron-eventbrite-runlog.test.js only
module.exports.fetchOrganizerEvents = fetchOrganizerEvents; // exposed for test/cron-eventbrite-runlog.test.js only
module.exports.MAX_PAGES_PER_ORGANIZER = MAX_PAGES_PER_ORGANIZER; // exposed for test/cron-eventbrite-runlog.test.js only
