"use strict";

// api/_lib/ra-links.js
//
// One definition of the Resident Advisor link rules, shared by both RA
// ingestion paths (scripts/ra-sync.js, scripts/ra-candidate-promotion.js),
// the one-time backfill, and generic-metadata-enrichment.js.
//
// The rules (Product Owner, 2026-10-12):
//   - event_url  = RA's own, event-specific page: https://ra.co/events/<id>.
//                  Always derivable from the id alone; never fetched, never
//                  guessed from anything else.
//   - ticket_url = the actual ticketing destination, only when a source
//                  states one. NULL otherwise. A ra.co page is the event
//                  page, not a verified ticketing destination, so it never
//                  goes in ticket_url.
//   - A stored, valid link is never replaced by a homepage or an unrelated
//     link (callers fill blanks only).

const RA_EVENT_URL_RE = /^https:\/\/(?:www\.)?ra\.co\/events\/(\d+)(?:[/?#].*)?$/i;

function raNumericId(value) {
  const m = /^(?:ra-)?(\d+)$/.exec(String(value === null || value === undefined ? "" : value).trim());
  return m ? m[1] : null;
}

// "ra-2542617" or "2542617" -> "https://ra.co/events/2542617"; anything
// else -> null (never a made-up URL).
function deriveRaEventUrl(idOrExternalId) {
  const n = raNumericId(idOrExternalId);
  return n ? `https://ra.co/events/${n}` : null;
}

// True only for an event-specific ra.co/events/<digits> URL (and, when an
// id is given, only for THAT event's page).
function isAuthoritativeRaEventUrl(url, idOrExternalId) {
  if (typeof url !== "string") return false;
  const m = RA_EVENT_URL_RE.exec(url.trim());
  if (!m) return false;
  if (idOrExternalId === undefined || idOrExternalId === null) return true;
  return m[1] === raNumericId(idOrExternalId);
}

// A homepage / bare-host link says nothing about one event.
function isGenericLink(url) {
  if (typeof url !== "string" || !url.trim()) return true;
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return true;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;
  return u.pathname.replace(/\/+$/, "") === "";
}

// Returns a usable ticketing destination or null. Not RA's own site (that is
// the event page), not a bare homepage, http(s) only.
function deriveRaTicketUrl(candidate) {
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  if (isGenericLink(trimmed)) return null;
  let u;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (/(^|\.)ra\.co$/i.test(u.hostname)) return null;
  return u.href;
}

module.exports = {
  raNumericId,
  deriveRaEventUrl,
  isAuthoritativeRaEventUrl,
  isGenericLink,
  deriveRaTicketUrl,
};
