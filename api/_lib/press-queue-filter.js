// api/_lib/press-queue-filter.js
//
// Stage 3 of the admin queue modernization (owner decisions 2026-10-16). READ-SIDE ONLY: classifies the rows of the
// admin "Article-event links to verify" list as active or hidden-by-rule, with a reason. Nothing here writes to
// editorial_article_events, articles, events or history; a row moves between active and hidden purely because the
// date passes, an event is removed, or the venue is measured outside the Orbit.
//
// Rules:
//   - removed:       the linked event itself was rejected/removed.
//   - ended:         the event's last day is before today (America/Detroit); recurring or unreadable dates stay active.
//                    EXCEPTION: an unresolved row (candidate / needs_follow_up) that carries a documented VERIFIED
//                    recommendation in data/press-link-recommendations.json is never hidden for ending alone.
//   - outside_orbit: the venue's coordinates are more than 75 miles from Detroit's border. Unknown location is never hidden.
// Recommendations are editorial advice, kept apart from verification statuses until an authorized review action.
"use strict";

const { isExpiredPending, detroitToday } = require("./pending-queue");
const { milesFromDetroitBorder } = require("./detroit-boundary");

const ORBIT_MILES = 75;
const UNRESOLVED = new Set(["candidate", "needs_follow_up"]);

function recommendationKey(articleId, eventId) {
  return String(articleId) + "/" + String(eventId);
}

function indexRecommendations(doc) {
  const map = new Map();
  for (const r of (doc && doc.recommendations) || []) {
    if (r && r.article_id && r.event_id) map.set(recommendationKey(r.article_id, r.event_id), r);
  }
  return map;
}

function venueOf(event) {
  const v = event && event.venues;
  return Array.isArray(v) ? v[0] : v;
}

function isOutsideOrbit(event) {
  const v = venueOf(event);
  if (!v || typeof v.lat !== "number" || typeof v.lng !== "number") return false;
  return milesFromDetroitBorder(v.lat, v.lng) > ORBIT_MILES;
}

function endedLabel(event) {
  const day = (event && (event.end_date || event.start_date)) || "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day + "T12:00:00Z") : null;
  return d ? "Event ended " + d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "Event ended";
}

// Returns { hidden, reason, reasonText, recommendation }. `recommendation` is the editorial advice, if any.
function classifyLink(row, recommendations, today) {
  const event = (row && row.events) || {};
  const rec = recommendations.get(recommendationKey(row.article_id, row.event_id)) || null;
  const recommendation = rec ? { verdict: rec.recommended_verdict, basis: rec.basis, by: rec.recommended_by, on: rec.recommended_on } : null;
  const unresolved = UNRESOLVED.has(row.verification_status);
  const exempt = unresolved && rec && rec.recommended_verdict === "verified";
  if (event.status === "rejected") {
    return { hidden: true, reason: "removed", reasonText: "Event was removed from the site", recommendation };
  }
  if (isExpiredPending(event, today) && !exempt) {
    return { hidden: true, reason: "ended", reasonText: endedLabel(event), recommendation };
  }
  if (isOutsideOrbit(event)) {
    return { hidden: true, reason: "outside_orbit", reasonText: "Event venue is outside the 75-mile Orbit", recommendation };
  }
  return { hidden: false, reason: null, reasonText: null, recommendation };
}

// Annotates every row (none are dropped) and returns live counts for the hidden line.
function annotateLinks(rows, recommendationDoc, now) {
  const today = detroitToday(now);
  const recs = indexRecommendations(recommendationDoc);
  const counts = { active: 0, hidden: 0, ended: 0, removed: 0, outside_orbit: 0 };
  const links = (rows || []).map((row) => {
    const queue = classifyLink(row, recs, today);
    if (queue.hidden) { counts.hidden++; counts[queue.reason]++; } else counts.active++;
    return Object.assign({}, row, { queue });
  });
  return { links, counts };
}

module.exports = { annotateLinks, classifyLink, indexRecommendations, isOutsideOrbit, ORBIT_MILES };
