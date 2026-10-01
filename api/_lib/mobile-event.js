"use strict";

// api/_lib/mobile-event.js
//
// Shared, source-agnostic "does this event legitimately have no fixed
// venue" detector -- 2026-09-28, Needs Follow-up self-healing pass 2.
//
// WHY THIS EXISTS: VisitDetroit's Christmas Cookie Coach Tour and The
// Original Detroit Christmas Bakery Bus Tour are bus tours with a
// departure point, not a fixed address -- they were permanently stuck in
// Needs Follow-up under "venue address/city" because no prior mechanism
// could distinguish "this event genuinely has no conventional venue" from
// "venue lookup failed." See migration_040_no_fixed_venue.sql for the
// column this feeds and the full rationale.
//
// DELIBERATELY GENERIC, NOT VISITDETROIT-SPECIFIC: any connector can call
// isLikelyNoFixedVenue() with whatever category/title signal it has.
// Two independent signals, either one sufficient on its own:
//   1. sourceCategories -- a source's own STRUCTURED category label list
//      (e.g. VisitDetroit's eventCategories), checked case-insensitively
//      against KNOWN_MOBILE_CATEGORY_LABELS. Preferred when available: a
//      source's own taxonomy is stronger evidence than guessing from a
//      title string.
//   2. title -- checked against TITLE_KEYWORD_RE as a generic fallback for
//      sources with no structured category signal at all. Deliberately
//      narrow (whole-word match on tour/excursion/crawl/parade/ride/
//      cruise/walk, walking tour phrasing) to avoid false positives (e.g.
//      "Tour de Detroit" the bike RACE has a real start/finish venue, so
//      "tour" alone would be too broad without more context -- kept narrow
//      here rather than trying to special-case that; a source's own
//      category data is the more reliable signal and should be preferred).
//
// NEVER a guess: returns false (the safe default) for anything that
// doesn't positively match one of these two signals. Does not attempt to
// extract/derive a departure or meeting-point address from unstructured
// text (e.g. an event description's prose) -- that's a separate, much
// higher-risk problem (multiple candidate locations, ambiguous formatting)
// deliberately left alone here; a connector that already has a real
// structured departure address should just put it in venue_address_raw/
// venue_city_raw as normal, same as any other event.

const KNOWN_MOBILE_CATEGORY_LABELS = new Set(
  ["tours", "tour", "excursions", "excursion", "walking tours", "bus tours"].map((s) => s.toLowerCase())
);

// 2026-10-01 addition (Needs Follow-up remaining-gap product pass, first
// real use of this generic helper outside VisitDetroit — see
// api/cron-feeds.js): "social district" added from a real, confirmed case
// — St. Clair Shores' own "Downtown Social District" events, whose venue
// text is an officially-designated open-container district spanning
// Greater Mack Ave. from 9 Mile to 9 Mack/Cavalier Drive, not a single
// bookable address. A municipality's "social district" is a defined,
// multi-establishment zone by definition (the same concept behind
// Michigan's Social District Act), narrow enough not to false-positive on
// an ordinary single-venue event the way a bare word like "district" or
// "downtown" alone would.
const TITLE_KEYWORD_RE = /\b(bus tour|walking tour|food tour|coach tour|city tour|pub crawl|bar crawl|excursion|parade|group ride|bike ride|social district)\b/i;

function isLikelyNoFixedVenue({ title, sourceCategories } = {}) {
  if (Array.isArray(sourceCategories)) {
    for (const cat of sourceCategories) {
      if (typeof cat === "string" && KNOWN_MOBILE_CATEGORY_LABELS.has(cat.trim().toLowerCase())) {
        return true;
      }
    }
  }
  if (typeof title === "string" && TITLE_KEYWORD_RE.test(title)) {
    return true;
  }
  return false;
}

module.exports = { isLikelyNoFixedVenue, KNOWN_MOBILE_CATEGORY_LABELS, TITLE_KEYWORD_RE };
