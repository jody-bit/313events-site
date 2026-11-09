// api/_lib/editorial-verification.js
//
// DQ-004 (2026-10-16): an article is only shown as covering an event when the
// article<->event pair is VERIFIED. This module holds the one shared rule that
// decides, for an automatically found match, whether the evidence is enough
// ("auto_rule_v1") and builds the audit-trail entries written to
// editorial_article_events.verification_history.
//
// Statuses (editorial_article_events.verification_status):
//   verified        shown publicly
//   candidate       kept for review, hidden        (the column default: fail closed)
//   needs_follow_up kept for review, hidden        (evidence incomplete or conflicting)
//   rejected        kept, hidden, never re-created automatically
//
// A title match alone is never enough. A venue_date match (venue named + date
// proximity) is a venue-topic signal, not event identity, so it never verifies.

"use strict";

const STATUSES = ["verified", "candidate", "needs_follow_up", "rejected"];
const AUTO_RULE = "auto_rule_v1";
const MIN_TITLE_LENGTH = 6;
const MIN_VENUE_LENGTH = 6;
const MAX_DAY_GAP = 60;

// Municipalities whose mention in an article, without any mention of the
// event's own city or venue, is conflicting location evidence. Not a
// geocoder: a small list of the metro cities that actually appear in the
// feeds. Merged with the Phase 2 city table when it can be loaded.
const BASE_MUNICIPALITIES = [
  "Detroit", "Hamtramck", "Highland Park", "Dearborn", "Dearborn Heights", "Royal Oak", "Ferndale", "Pleasant Ridge",
  "Berkley", "Oak Park", "Southfield", "Troy", "Birmingham", "Bloomfield Hills", "Pontiac", "Auburn Hills", "Rochester",
  "Rochester Hills", "Clawson", "Madison Heights", "Hazel Park", "Warren", "Sterling Heights", "Roseville", "Eastpointe",
  "St. Clair Shores", "Grosse Pointe", "Grosse Pointe Park", "Grosse Pointe Farms", "Grosse Pointe Woods",
  "Grosse Pointe Shores", "Harper Woods", "Clinton Township", "Mount Clemens", "Utica", "Shelby Township", "Novi",
  "Farmington", "Farmington Hills", "Livonia", "Westland", "Wayne", "Canton", "Plymouth", "Northville", "Ann Arbor",
  "Ypsilanti", "Wyandotte", "Trenton", "Taylor", "Lincoln Park", "Southgate", "Allen Park", "Ecorse", "River Rouge",
  "Oxford", "Lake Orion", "Clarkston", "Waterford", "Commerce", "Walled Lake", "Milford", "Brighton", "Howell",
  "Flint", "Lansing", "Toledo", "Windsor",
];

let phase2Names = null;
function municipalities() {
  if (phase2Names === null) {
    phase2Names = [];
    try {
      const { PHASE2_CITIES } = require("../../city-table-phase2.js");
      phase2Names = (PHASE2_CITIES || []).map((c) => c.name);
    } catch (_) {
      phase2Names = [];
    }
  }
  return BASE_MUNICIPALITIES.concat(phase2Names);
}

function normalize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Whole-word / whole-phrase containment on already-normalized text.
function containsPhrase(normHaystack, normPhrase) {
  if (!normPhrase) return false;
  return (" " + normHaystack + " ").includes(" " + normPhrase + " ");
}

// Map of normalized title -> number of events carrying exactly that title.
function sameTitleCounts(events) {
  const counts = new Map();
  for (const ev of events || []) {
    const t = normalize(ev.title);
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return counts;
}

function daysApart(isoA, isoB) {
  const a = Date.parse((isoA || "").slice(0, 10) + "T12:00:00Z");
  const b = Date.parse((isoB || "").slice(0, 10) + "T12:00:00Z");
  if (isNaN(a) || isNaN(b)) return null;
  return Math.abs(Math.round((a - b) / 86400000));
}

// article: { title, excerpt, publishedAt|published_at }
// event:   { title, start_date, venueName, city }  (venueName/city already resolved by the caller)
// opts:    { matchType, sameTitleCount }
// returns  { status, by, basis }
function evaluateAutoLink(article, event, opts) {
  const o = opts || {};
  const matchType = o.matchType || "title";
  const text = normalize(`${article.title || ""} ${article.excerpt || ""}`);
  const title = normalize(event.title);
  const venue = normalize(event.venueName);
  const city = normalize(event.city);
  const basis = [];

  if (matchType !== "title") {
    return { status: "candidate", by: AUTO_RULE, basis: `${matchType} match only: venue/date proximity does not establish which event the article covers` };
  }
  if (title.length < MIN_TITLE_LENGTH || !containsPhrase(text, title)) {
    return { status: "candidate", by: AUTO_RULE, basis: "event title is not a whole-word match in the article title/excerpt" };
  }
  if ((o.sameTitleCount || 1) > 1) {
    return { status: "candidate", by: AUTO_RULE, basis: `generic title: ${o.sameTitleCount} current events share it` };
  }

  const venueHit = venue.length >= MIN_VENUE_LENGTH && containsPhrase(text, venue);
  // "Detroit" alone is in most local articles; it corroborates nothing.
  const cityHit = city && city !== "detroit" && containsPhrase(text, city);
  if (!venueHit && !cityHit) {
    // Same title, but is the article visibly about somewhere else?
    const other = municipalities().map(normalize).find((m) => m && m !== city && containsPhrase(text, m));
    if (other) {
      return { status: "needs_follow_up", by: AUTO_RULE, basis: `title matches but the article names a different place ("${other}") and neither the event's venue nor city` };
    }
    return { status: "candidate", by: AUTO_RULE, basis: "title matches but the article names neither the event's venue nor its city" };
  }
  basis.push(venueHit ? "venue named" : "city named");

  const gap = daysApart(article.publishedAt || article.published_at, event.start_date);
  if (gap === null || gap > MAX_DAY_GAP) {
    return { status: "candidate", by: AUTO_RULE, basis: `title and ${basis[0]}, but publication date is ${gap === null ? "unknown" : gap + " days"} from the event` };
  }
  return { status: "verified", by: AUTO_RULE, basis: `whole-word title match; ${basis[0]}; published ${gap} day(s) from event start` };
}

function historyEntry(from, to, by, basis, now) {
  return { at: (now || new Date()).toISOString(), from: from || null, to, by, basis: basis || null };
}

// The row an automatic matcher inserts. With Prefer: resolution=ignore-duplicates
// an existing pair (including a rejected one) is left exactly as it is.
function newLinkRow(articleId, eventId, verdict, now) {
  const when = (now || new Date()).toISOString();
  const verified = verdict.status === "verified";
  return {
    article_id: articleId,
    event_id: eventId,
    verification_status: verdict.status,
    verified_by: verified ? verdict.by : null,
    verified_at: verified ? when : null,
    verification_basis: verdict.basis || null,
    verification_history: [historyEntry(null, verdict.status, verdict.by, verdict.basis, now)],
  };
}

// An administrator's decision on a pair: the column patch to write, with the previous state appended
// to verification_history (the audit trail). `current` is the existing row or null.
function applyDecision(current, to, by, basis, now) {
  if (!STATUSES.includes(to)) throw new Error("invalid verification status: " + to);
  const when = (now || new Date()).toISOString();
  const history = Array.isArray(current && current.verification_history) ? current.verification_history.slice() : [];
  history.push(historyEntry(current ? current.verification_status : null, to, by, basis, now));
  return {
    verification_status: to,
    verified_by: by,
    verified_at: when,
    verification_basis: basis || null,
    verification_history: history,
  };
}

// Verdict for an event that was created from this very article (identity came from the article text).
const CREATED_FROM_ARTICLE = { status: "verified", by: "created_from_article", basis: "event identity extracted from this article's own text" };

// Resolve the venue/city strings the evaluator needs from an events row that may embed venues(name,city).
function eventForEvaluation(ev) {
  const venue = ev.venues && !Array.isArray(ev.venues) ? ev.venues : (Array.isArray(ev.venues) ? ev.venues[0] : null);
  return {
    title: ev.title,
    start_date: ev.start_date,
    venueName: ev.venue_name_raw || (venue && venue.name) || "",
    city: ev.venue_city_raw || (venue && venue.city) || "",
  };
}

module.exports = {
  STATUSES, AUTO_RULE, normalize, containsPhrase, sameTitleCounts, evaluateAutoLink,
  historyEntry, newLinkRow, applyDecision, CREATED_FROM_ARTICLE, eventForEvaluation,
};
