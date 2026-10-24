// event-links.js — the ONE rule for which link an event's call to action points at. Plain static include, same pattern as
// calendar-location.js (a <script src>, no build step). Exposes exactly one global: `EventLinks`.
//
// WHY THIS EXISTS (2026-10-23, owner P1). Two Samhain rows (Resident Advisor) stored the venue homepage in ticket_url and
// the real RA event page in event_url. Every page chose `ticket_url || event_url`, so the homepage became the main
// "Tickets & info" button and the event page was demoted or hidden. A venue homepage says nothing about one event.
//
// Preference order (owner, 2026-10-23):
//   1. an event-specific ticket_url on a ticketing host         -> primary, "Get tickets"
//   2. any other event-specific link (event_url, or a listing page in ticket_url) -> primary, "Event details" (no ticket claim)
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

  // Hosts that sell tickets (owner, 2026-10-24: "GET TICKETS: verified ticketing destinations"). A specific link on any other host
  // that sits in ticket_url (a VisitDetroit or other listing page, a venue's own page) is an event-information page, so it is
  // labelled "Event details", never "Get tickets". Mirrors the ticketing hosts in api/_lib/link-health.js, minus listing
  // sites (bandsintown, songkick, signupgenius). Affiliate wrappers are the Ticketmaster/Impact redirects.
  const TICKET_VENDORS = [
    "ra.co", "eventbrite.com", "dice.fm", "ticketmaster.com", "livenation.com", "axs.com", "seetickets.us", "ticketweb.com",
    "eventim.us", "showclix.com", "universe.com", "ticketleap.com", "posh.vip", "fearticket.com", "etix.com", "tixr.com",
    "crowdwork.com", "veezi.com", "spektrix.com", "evyy.net", "pxf.io", "sjv.io"
  ];
  function isTicketVendor(value) {
    const u = cleanUrl(value);
    if (!u) return false;
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    return TICKET_VENDORS.some(function (h) { return host === h || host.endsWith("." + h); });
  }

  // e: { ticketUrl, eventPageUrl, free }. Returns { primary, event, venue }, each null or { url, label }.
  function resolve(e) {
    const ticket = e && cleanUrl(e.ticketUrl) ? String(e.ticketUrl).trim() : null;
    const page = e && cleanUrl(e.eventPageUrl) ? String(e.eventPageUrl).trim() : null;
    const ticketSpecific = ticket && !isBareHomepage(ticket) ? ticket : null;
    const pageSpecific = page && !isBareHomepage(page) ? page : null;
    const homepage = (ticket && !ticketSpecific ? ticket : null) || (page && !pageSpecific ? page : null);
    
    // Labels (owner, 2026-10-23 and 2026-10-24): "Get tickets" only for a ticketing destination; any other event-specific page,
    // including a listing site's page stored in ticket_url, is "Event details". Free or not is never inferred from which link
    // exists, so the label does not depend on e.free.
    const vendorUrl = ticketSpecific && isTicketVendor(ticketSpecific) ? ticketSpecific : null;
    const infoUrl = (ticketSpecific && !vendorUrl ? ticketSpecific : null) || pageSpecific;
    const primary = vendorUrl ? { url: vendorUrl, label: "Get tickets" } : infoUrl ? { url: infoUrl, label: "Event details" } : null;
    return {
      primary: primary,
      event: vendorUrl && infoUrl && infoUrl !== vendorUrl ? { url: infoUrl, label: "Event details" } : null,
      venue: homepage ? { url: homepage, label: "Venue website" } : null
    };
  }

  const api = { resolve: resolve, isBareHomepage: isBareHomepage, isTicketVendor: isTicketVendor };
  if (typeof module !== "undefined" && module.exports) module.exports = { EventLinks: api };
  else (typeof window !== "undefined" ? window : globalThis).EventLinks = api;
})(this);
