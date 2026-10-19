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
//   - the page is the source's own calendar page and nothing else: the feed_sources.website a person approved in admin.html
//     (carried on the row as the internal marker `_calendarUrl`), or an entry in SOURCE_CALENDAR_PAGES for a single-venue
//     connector. A value that is not an absolute http(s) page (or is a calendar-feed endpoint) is ignored. Never guessed.
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

// -> { by: "feed_source_id" | "source", key, url } or null. Pure.
function calendarFallbackFor(row) {
  if (!row || typeof row !== "object") return null;
  const marked = normalizeLinkField(row._calendarUrl);
  if (marked && row.feed_source_id) return { by: "feed_source_id", key: String(row.feed_source_id), url: marked, label: typeof row.source === "string" ? row.source : String(row.feed_source_id) };
  const page = typeof row.source === "string" && Object.prototype.hasOwnProperty.call(SOURCE_CALENDAR_PAGES, row.source) ? normalizeLinkField(SOURCE_CALENDAR_PAGES[row.source]) : null;
  if (page) return { by: "source", key: row.source, url: page, label: row.source };
  return null;
}

// Blank-only back-fill for the sources the written `rows` belong to. One PATCH per source. Returns { patched, bySource }
// where patched is the number of rows the database actually changed and bySource maps the source label to that number.
async function fillBlankSourceCalendarLinks(supabaseUrl, serviceRoleKey, rows, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const targets = new Map();
  for (const row of rows || []) {
    const t = calendarFallbackFor(row);
    if (t) targets.set(`${t.by}\u0000${t.key}`, t);
  }
  const bySource = {};
  let patched = 0;
  for (const t of targets.values()) {
    const blank = "and=(or(ticket_url.is.null,ticket_url.eq.),or(event_url.is.null,event_url.eq.))";
    try {
      const resp = await doFetch(
        `${supabaseUrl}/rest/v1/events?${t.by}=eq.${encodeURIComponent(t.key)}&${blank}&select=id`,
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

module.exports = { SOURCE_CALENDAR_PAGES, calendarFallbackFor, fillBlankSourceCalendarLinks };
