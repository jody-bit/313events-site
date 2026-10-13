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
  {
    id: "dearborn",
    // City of Dearborn "Website Calendar 2026" (Google Calendar public ICS, owner websitecalendar@dearborn.gov;
    // the calendar behind dearborn.gov/calendar). Matches the feed row's organization name or website only --
    // never a bare "Dearborn", which would also catch Dearborn Heights and Dearborn Public Schools.
    matches: (feed) => /^\s*city of dearborn\s*$/i.test(String(feed.venue_name || ""))
      || /^https?:\/\/(www\.)?dearborn\.gov(\/|$)/i.test(String(feed.website || "")),
    // Verified against the real export (1,061 VEVENTs, 2026-10-12): the feed has NO category field, so the page's
    // "City Event" label cannot be reproduced. It mixes public events with governing-body meetings, building
    // closures, trash and leaf-collection notices, election dates and observances. So: (1) title-only, narrow
    // skips for entries that are plainly notices (closures, trash, voting, deadlines); (2) every other NEW row is created pending_review
    // (reviewAll) rather than published, because nothing in the feed separates an event from an announcement.
    reviewAll: "City of Dearborn's calendar mixes public events with notices and the feed carries no event-type label",
    // Governing-body titles are NOT discarded (Jody 2026-10-13: legitimate community events must not vanish merely
    // because they are meetings). They are held for review with an extra reason so a reviewer sees why.
    meetingLike: /\b(commission|committee|board of (?:zoning )?(?:appeals?|review)|business district improvement authority|downtown development authority|pension board|briefing session|hearing officer|city council)\b/i,
    skipEvent: (ev) => {
      const t = String(ev.summary || "").trim();
      return /\b(?:closed|closes)\b/i.test(t)
        || /\((?:disc|the center|center)\s+open\)|^\s*(?:disc|the center)\s+open\b|\bpost thanksgiving day\b/i.test(t)
        || /\b(?:trash|yard waste|loose leaf|leaf collection|pick ?up delayed|service (?:thursday|friday))\b/i.test(t)
        || /\b(?:early voting|general election|register to vote|mail-in ballot|receive a ballot)\b/i.test(t)
        || /\b(?:tax(?:es)? (?:due|payment|bills?)|payment due|bills? due|deadline|tax day for)\b/i.test(t);
    },
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
//   "needs_review"   the feed's policy has `reviewAll`: nothing in that feed separates an event from
//                    a notice, so every new row waits for a person. Checked after "conflicting".
//   "conflicting"    the feed contradicts itself or is unusable: no title, or an end
//                    before the start. Held.
// Nothing is invented: this only reads the row the pipeline already built.
// `span` is the parsed {start, end} of the VEVENT ({date, hour, minute}), because a timed
// event's end is folded into time_display on the row and is no longer visible there.
function classify(row, span, policy) {
  const reasons = [];
  const title = String(row.title || "").trim();
  if (!title || title === "Untitled event") reasons.push("no title");
  const { start, end } = span || {};
  if (start && end && (end.date < start.date || (end.date === start.date && start.hour !== null && end.hour !== null
    && end.hour * 60 + end.minute < start.hour * 60 + start.minute))) reasons.push("end before start");
  if (reasons.length) return { state: "conflicting", reasons };

  if (policy && policy.reviewAll) {
    const reasons = [policy.reviewAll];
    if (policy.meetingLike && policy.meetingLike.test(title)) reasons.push("title looks like a government meeting; kept for review, not discarded");
    return { state: "needs_review", reasons };
  }

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
