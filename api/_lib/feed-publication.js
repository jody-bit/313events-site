"use strict";

// api/_lib/feed-publication.js -- per-feed publication safeguard for the generic
// ICS pipeline (api/cron-feeds.js).
//
// WHY: cron-feeds.js gives every NEW row from an approved ICS feed the status
// "approved". That is right for a vetted single-venue feed, but a municipal feed
// can list events with no stated place (a city's calendar of meetings, whose LOCATION
// is blank). For a feed with a policy here, a NEW row is classified, and only a
// verified one is published; the rest are created as "pending_review", the project's
// existing hold state (reviewed in admin.html). No second approval system.
//
// NARROW ON PURPOSE (decision 2026-10-11): the only policy is City of Lathrup Village.
// A feed with no policy here behaves exactly as before. Nothing is held merely because
// an optional field (street address, description, image) is missing -- see classify().
//
// Existing rows are never touched: cron-feeds.js looks up each row's current status and
// only a row with NO stored status gets the status chosen here, so a reviewer's approve
// or reject survives every later run.

// ---- policies ----------------------------------------------------------------

const POLICIES = [
  {
    id: "lathrup-village",
    // Apptegy/Thrillshare organisation 19909 is the City of Lathrup Village.
    matches: (feed) => /thrillshare\.com\/api\/v4\/o\/19909\//.test(String(feed.feed_url || "")) || /(^|\/\/|\.)lathrupvillage\.org/i.test(String(feed.feed_url || "")),
    // Administrative notices, not public events (decision 2026-10-11): "City Hall - CLOSED".
    // (api/_lib/non-event-filter.js does not match a dash between the building and "closed".)
    skipEvent: (ev) => /^\s*city hall\s*[-–—:]\s*closed\b/i.test(String(ev.summary || "")),
  },
];

function policyFor(feedSource) {
  return POLICIES.find((p) => p.matches(feedSource || {})) || null;
}

// ---- classification ----------------------------------------------------------

// States:
//   "verified"       a real event with what it needs to be placed: a title, a start, and
//                    a place the site can show (a venue it knows, or a street address).
//                    Missing OPTIONAL data (description, image, end time, street address
//                    when a known venue is linked) does not hold it.
//   "needs_location" no place is stated, or only a generic one ("Community Room") that
//                    names no building and no address. Held for a person to confirm.
//   "conflicting"    the feed contradicts itself or is unusable: no title, or an end
//                    before the start. Held.
// Nothing is invented: this only reads the row the pipeline already built.
// `span` is the parsed {start, end} of the VEVENT ({date, hour, minute}), because a timed
// event's end is folded into time_display on the row and is no longer visible there.
function classify(row, span) {
  const reasons = [];
  const title = String(row.title || "").trim();
  if (!title || title === "Untitled event") reasons.push("no title");
  const { start, end } = span || {};
  if (start && end && (end.date < start.date || (end.date === start.date && start.hour !== null && end.hour !== null
    && end.hour * 60 + end.minute < start.hour * 60 + start.minute))) reasons.push("end before start");
  if (reasons.length) return { state: "conflicting", reasons };

  const placed = !!row.venue_id || !!String(row.venue_address_raw || "").trim();
  if (!placed) {
    const named = String(row.venue_name_raw || "").trim();
    reasons.push(!named || /^venue tba$/i.test(named) ? "no location stated" : `location "${named}" has no address and matches no known venue`);
    return { state: "needs_location", reasons };
  }
  return { state: "verified", reasons: [] };
}

function holdNote(publication) {
  return `Held for review: ${publication.reasons.join("; ")}. Source gave no more; nothing was inferred.`;
}

module.exports = { POLICIES, policyFor, classify, holdNote };
