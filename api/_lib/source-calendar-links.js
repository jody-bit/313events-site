// api/_lib/source-calendar-links.js
//
// Fallback link for an event whose source supplies no per-event link at all.
//
// DQ sweep 2026-10-19: 141 approved upcoming events had neither ticket_url nor event_url. Almost all come from municipal
// and venue feeds that carry no per-event link (Livonia, Dearborn, HALO, Royal Oak, Canton, Madison Heights, ...). Those
// rows are not defective; the source simply has nothing to link to except its own calendar page.
//
// Rules (same shape as api/_lib/organizer-links.js):
//   - event_url only. ticket_url is never touched or derived.
//   - blank-only, enforced in the database: the PATCH filter requires BOTH ticket_url and event_url to be NULL or empty, so
//     an existing link of either kind (a source's, a person's, another connector's) is structurally impossible to overwrite.
//   - the page is the source's own calendar page and nothing else, in this order of authority: (1) an explicit, verified
//     entry in FEED_CALENDAR_PAGE_OVERRIDES (per events.source), (2) an entry in SOURCE_CALENDAR_PAGES for a single-venue
//     connector, (3) the feed_sources.website a person approved in admin.html (carried on the row as the internal marker
//     `_calendarUrl`) ONLY if it is itself a calendar or event-listing page by path (looksLikeCalendarPage). A bare homepage
//     is never filled: "the town's website" is not a link to the event. A value that is not an absolute http(s) page (or is
//     a calendar-feed endpoint) is ignored. Never guessed.
//   - approved, non-past rows only (the PATCH filter): a pending or rejected row is not touched, and neither is an event
//     that is over. Both are checked in the database filter, not in application logic.
//   - failure is swallowed: the link is an enhancement and must never fail an ingestion run.
"use strict";

const { normalizeLinkField } = require("./link-field");

// Single-venue connectors: events.source -> the connector's own SOURCE_URL / events page.
const SOURCE_CALENDAR_PAGES = Object.freeze({
  "HALO Detroit": "https://www.thehalodetroit.com/currentevents",
  "Trinosophes": "https://trinosophes.com/Events",
  "GottaGacha": "https://www.gottagacha.com/events",
  "Redford Theatre": "https://redfordtheatre.com/events/",
});

// Feed sources whose approved website is not itself a calendar page: events.source -> the verified calendar or
// event-listing page (Event Intelligence quotes each URL from the source's own site). Empty until EI supplies them; a
// source with no entry here and no calendar-looking website gets no fallback.
const FEED_CALENDAR_PAGE_OVERRIDES = Object.freeze({});

// Path words that make a URL a calendar or event-listing page rather than a homepage or a section index.
const CALENDAR_SEGMENT = /^(?:calendar|calendars|event-calendar|events-calendar|community-calendar|events?|upcoming-events|whats-on|whats-happening|happenings)$/i;

// True only for an absolute http(s) URL whose path has at least one calendar/event word as a whole segment
// (extension ignored: /calendar.aspx, /events/). A bare host, "/", "/home", "/index.html", "/about" and "/departments/parks"
// are not calendar pages. Pure.
function looksLikeCalendarPage(value) {
  const url = normalizeLinkField(value);
  if (!url) return false;
  const segments = new URL(url).pathname.split("/").filter(Boolean).map((seg) => seg.replace(/\.(?:aspx?|html?|php)$/i, ""));
  return segments.some((seg) => CALENDAR_SEGMENT.test(seg));
}

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// -> { by: "feed_source_id" | "source", key, url, label } or null. Pure.
function calendarFallbackFor(row, overrides = FEED_CALENDAR_PAGE_OVERRIDES) {
  if (!row || typeof row !== "object") return null;
  const source = typeof row.source === "string" ? row.source : null;
  if (source && has(overrides, source)) {
    const page = normalizeLinkField(overrides[source]);
    if (page) return { by: "source", key: source, url: page, label: source };
  }
  if (source && has(SOURCE_CALENDAR_PAGES, source)) {
    const page = normalizeLinkField(SOURCE_CALENDAR_PAGES[source]);
    if (page) return { by: "source", key: source, url: page, label: source };
  }
  const marked = normalizeLinkField(row._calendarUrl);
  if (marked && row.feed_source_id && looksLikeCalendarPage(marked)) {
    return { by: "feed_source_id", key: String(row.feed_source_id), url: marked, label: source || String(row.feed_source_id) };
  }
  return null;
}

// Today in the site's own zone (America/Detroit), YYYY-MM-DD: an event on today's date is not past.
function todayDetroit(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" }).format(now || new Date());
}

// Blank-only back-fill for the sources the written `rows` belong to. One PATCH per source. Returns { patched, bySource }
// where patched is the number of rows the database actually changed and bySource maps the source label to that number.
async function fillBlankSourceCalendarLinks(supabaseUrl, serviceRoleKey, rows, fetchImpl, now) {
  const doFetch = fetchImpl || fetch;
  const today = todayDetroit(now);
  const targets = new Map();
  for (const row of rows || []) {
    const t = calendarFallbackFor(row);
    if (t) targets.set(`${t.by}\u0000${t.key}`, t);
  }
  const bySource = {};
  let patched = 0;
  for (const t of targets.values()) {
    // Approved rows only; non-past = starts today or later, or has an end date of today or later (a multi-day run in progress).
    const filter = `status=eq.approved&and=(or(ticket_url.is.null,ticket_url.eq.),or(event_url.is.null,event_url.eq.),or(start_date.gte.${today},end_date.gte.${today}))`;
    try {
      const resp = await doFetch(
        `${supabaseUrl}/rest/v1/events?${t.by}=eq.${encodeURIComponent(t.key)}&${filter}&select=id`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Prefer: "return=representation" },
          body: JSON.stringify({ event_url: t.url }),
        }
      );
      if (resp && resp.ok) {
        const changed = await resp.json();
        const n = Array.isArray(changed) ? changed.length : 0;
        patched += n;
        bySource[t.label] = (bySource[t.label] || 0) + n;
      }
    } catch {
      /* never fail an ingestion run for a link back-fill */
    }
  }
  return { patched, bySource };
}

module.exports = { SOURCE_CALENDAR_PAGES, FEED_CALENDAR_PAGE_OVERRIDES, looksLikeCalendarPage, calendarFallbackFor, fillBlankSourceCalendarLinks };
