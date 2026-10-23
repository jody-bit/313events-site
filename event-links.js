// event-links.js — the ONE rule for which link an event's call to action points at. Plain static include, same pattern as
// calendar-location.js (a <script src>, no build step). Exposes exactly one global: `EventLinks`.
//
// WHY THIS EXISTS (2026-10-23, owner P1). Two Samhain rows (Resident Advisor) stored the venue homepage in ticket_url and
// the real RA event page in event_url. Every page chose `ticket_url || event_url`, so the homepage became the main
// "Tickets & info" button and the event page was demoted or hidden. A venue homepage says nothing about one event.
//
// Preference order (owner, 2026-10-23):
//   1. a verified event-specific ticket_url                    -> primary, "Get tickets"
//   2. an event-specific event_url (organizer/source/venue listing) -> primary, labelled "Event details" (no ticket claim)
//   3. a bare venue homepage (in either field)                 -> never primary; a secondary "Venue website" link
//   4. nothing                                                 -> no link (callers keep their own fallback)
// "Event details" is shown beside a ticket link only when it is a distinct, event-specific URL. Nothing here rewrites stored
// data or invents a link: it only chooses among the fields the row already has.
(function (root) {
  "use strict";

  function cleanUrl(value) {
    if (typeof value !== "string") return null;
    const s = value.trim();
    if (!s) return null;
    let u;
    try { u = new URL(s); } catch (_) { return null; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  }

  // A bare host (optionally a trailing slash) with no query or fragment names a site, not an event.
  function isBareHomepage(value) {
    const u = cleanUrl(value);
    if (!u) return false;
    return u.pathname.replace(/\/+$/, "") === "" && !u.search && !u.hash;
  }

  // e: { ticketUrl, eventPageUrl, free }. Returns { primary, event, venue }, each null or { url, label }.
  function resolve(e) {
    const ticket = e && cleanUrl(e.ticketUrl) ? String(e.ticketUrl).trim() : null;
    const page = e && cleanUrl(e.eventPageUrl) ? String(e.eventPageUrl).trim() : null;
    const ticketSpecific = ticket && !isBareHomepage(ticket) ? ticket : null;
    const pageSpecific = page && !isBareHomepage(page) ? page : null;
    const homepage = (ticket && !ticketSpecific ? ticket : null) || (page && !pageSpecific ? page : null);
    
    // Labels (owner, 2026-10-23): "Get tickets" claims a ticket link; an event page with no ticket link is "Event details".
    // Free or not is never inferred from which link exists, so the label does not depend on e.free.
    const primary = ticketSpecific ? { url: ticketSpecific, label: "Get tickets" } : pageSpecific ? { url: pageSpecific, label: "Event details" } : null;
    return {
      primary: primary,
      event: ticketSpecific && pageSpecific && pageSpecific !== ticketSpecific ? { url: pageSpecific, label: "Event details" } : null,
      venue: homepage ? { url: homepage, label: "Venue website" } : null
    };
  }

  const api = { resolve: resolve, isBareHomepage: isBareHomepage };
  if (typeof module !== "undefined" && module.exports) module.exports = { EventLinks: api };
  else (typeof window !== "undefined" ? window : globalThis).EventLinks = api;
})(this);
