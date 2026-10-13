// test/link-usability.test.js — issue #99: classify stored links by what they
// point at, and measure usability (not just reachability). Pure functions.
// Run: node test/link-usability.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const L = require(`${REPO_DIR}/api/_lib/link-health.js`);
const k = L.classifyLinkKind;

// Missing / invalid
assert.strictEqual(k(null), "missing");
assert.strictEqual(k("   "), "missing");
assert.strictEqual(k("not a url"), "invalid");
assert.strictEqual(k("javascript:alert(1)"), "invalid");
assert.strictEqual(k("ftp://example.com/x"), "invalid");

// Generic homepage / index: resolves fine, identifies nothing
assert.strictEqual(k("https://www.example-venue.com"), "generic_homepage");
assert.strictEqual(k("https://example-venue.com/"), "generic_homepage");
assert.strictEqual(k("https://example-venue.com/events/"), "generic_homepage");
assert.strictEqual(k("https://example-venue.com/?utm_source=x"), "generic_homepage", "tracking params do not identify a page");
assert.strictEqual(k("https://example-venue.com/", { field: "ticket" }), "generic_homepage", "a ticket_url that is only a homepage is not a ticket link");

// Direct event
assert.strictEqual(k("https://example-venue.com/events/glenn-barr-opening"), "direct_event");
assert.strictEqual(k("https://example-venue.com/?p=123"), "direct_event", "id-like query identifies a page");
assert.strictEqual(k("https://ra.co/events/2012345"), "ticket", "known ticketing host with deep path");

// Ticket
assert.strictEqual(k("https://www.eventbrite.com/e/some-show-tickets-123"), "ticket");
assert.strictEqual(k("https://tickets.example.org/buy/456", { field: "ticket" }), "ticket");
assert.strictEqual(k("https://www.ticketmaster.com/"), "generic_homepage", "ticketing host root is still generic");

// Venue page: matches the linked venue's site
assert.strictEqual(k("https://example-venue.com/about", { venueWebsite: "https://example-venue.com/about" }), "venue");
assert.strictEqual(k("https://example-venue.com", { venueWebsite: "https://www.example-venue.com/" }), "generic_homepage");
assert.strictEqual(k("https://example-venue.com/events/show-1", { venueWebsite: "https://example-venue.com/" }), "direct_event");

assert.strictEqual(L.isUsableLinkKind("direct_event"), true);
assert.strictEqual(L.isUsableLinkKind("ticket"), true);
for (const x of ["venue", "generic_homepage", "invalid", "missing"]) assert.strictEqual(L.isUsableLinkKind(x), false, x);

// A missing ticket URL must not hide a valid event link (and vice versa)
const onlyEvent = L.assessEventLinks({ event_url: "https://example-venue.com/events/show-1", ticket_url: null });
assert.strictEqual(onlyEvent.hasUsableLink, true);
assert.strictEqual(onlyEvent.ticket.kind, "missing");
const onlyTicket = L.assessEventLinks({ event_url: null, ticket_url: "https://www.eventbrite.com/e/x-1" });
assert.strictEqual(onlyTicket.hasUsableLink, true);
// A generic homepage alone is a link on the page but not a usable one
const homepageOnly = L.assessEventLinks({ event_url: "https://example-venue.com/", ticket_url: "https://example-venue.com/" });
assert.strictEqual(homepageOnly.hasUsableLink, false);
assert.strictEqual(L.assessEventLinks({ link_check_status: "dead" }).deadFlagged, true);

// Summary: counts by class and source; every row counted exactly once, none dropped
const rows = [
  { source: "RA", event_url: "https://ra.co/events/1", ticket_url: null },
  { source: "RA", event_url: "https://ra.co/", ticket_url: null },
  { source: "Manual", event_url: "https://example-venue.com/", ticket_url: "https://www.eventbrite.com/e/y-2", link_check_status: "dead" },
  { event_url: null, ticket_url: null },
];
const before = JSON.stringify(rows);
const s = L.summarizeLinkUsability(rows);
assert.strictEqual(JSON.stringify(rows), before, "inputs not mutated");
assert.strictEqual(s.total.events, 4);
assert.strictEqual(s.total.withUsableLink + s.total.noUsableLink, 4);
assert.strictEqual(s.total.withUsableLink, 2);
assert.strictEqual(s.total.deadFlagged, 1);
assert.deepStrictEqual(s.bySource.RA.event_url, { ticket: 1, generic_homepage: 1 });
assert.strictEqual(s.bySource.RA.events, 2);
assert.strictEqual(s.bySource.unknown.noUsableLink, 1);
assert.strictEqual(L.summarizeLinkUsability(null).total.events, 0);


// ---------------------------------------------------------------------------
// Event Intelligence review of the defaults (PR #101), using production shapes
// ---------------------------------------------------------------------------
const d = L.classifyLinkDetail;
// 1. A ticket field no longer makes any non-generic URL a ticket
assert.strictEqual(k("https://ra.co/clubs/detroit/thevault313", { field: "ticket" }), "listing", "a club page is not a ticket");
assert.strictEqual(k("https://ra.co/events/2012345", { field: "ticket" }), "ticket");
assert.strictEqual(k("https://www.eventbrite.com/o/some-organizer-123", { field: "ticket" }), "listing");
assert.strictEqual(k("https://example-venue.com/about", { field: "ticket" }), "listing", "short non-specific path in a ticket field");
assert.strictEqual(k("https://example-venue.com/shows/2026-10-20-karaoke", { field: "ticket" }), "ticket", "event-specific path in a ticket field");
// 2. Social
assert.strictEqual(k("https://www.instagram.com/p/AbC123/", { field: "ticket" }), "social");
assert.strictEqual(k("https://www.instagram.com/reel/AbC123/"), "social");
assert.strictEqual(k("https://www.instagram.com/somevenue/"), "social", "profile in event_url is not a direct event");
assert.strictEqual(k("https://linktr.ee/somevenue"), "social");
assert.strictEqual(k("https://www.tiktok.com/@somevenue/video/1"), "social");
assert.strictEqual(k("https://www.facebook.com/somevenue"), "social");
assert.strictEqual(k("https://www.facebook.com/events/1234567890/"), "direct_event", "a Facebook event stays a direct event");
assert.strictEqual(L.isUsableLinkKind("social"), false);
// 3. Affiliate wrappers: the target is classified
const wrap = (t) => "https://ticketmaster.evyy.net/c/123/456/789?u=" + encodeURIComponent(t);
assert.deepStrictEqual(d(wrap("https://www.ticketmaster.com/some-artist-tickets/event/0600ABC"), { field: "ticket" }), { kind: "ticket", unwrapped: true });
assert.strictEqual(d(wrap("https://am.ticketmaster.com/"), { field: "ticket" }).kind, "generic_homepage", "a wrapped bare root is generic");
assert.strictEqual(d(wrap("https://am.ticketmaster.com/"), { field: "ticket" }).unwrapped, true);
assert.strictEqual(d("https://ticketmaster.evyy.net/c/1/2/3", { field: "ticket" }).unwrapped, undefined, "no target parameter: not unwrapped");
// 4. Relative URLs and calendar feeds are invalid, with distinct reasons
assert.deepStrictEqual(d("/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=14", { field: "ticket" }), { kind: "invalid", reason: "calendar_feed" });
assert.deepStrictEqual(d("https://example.org/events/feed.ics"), { kind: "invalid", reason: "calendar_feed" });
assert.deepStrictEqual(d("/events/some-slug"), { kind: "invalid", reason: "relative_url" });
assert.deepStrictEqual(d("not a url"), { kind: "invalid", reason: "malformed_url" });
assert.deepStrictEqual(d("javascript:alert(1)"), { kind: "invalid", reason: "unsupported_scheme" });
// 5. Generic detection: extensions, depth-2 trailing generic, extra words
assert.strictEqual(k("https://www.bgsu.edu/the-arts/tickets.html", { field: "ticket" }), "generic_homepage");
assert.strictEqual(k("https://example.org/events/upcoming"), "generic_homepage");
assert.strictEqual(k("https://example.org/events/list"), "generic_homepage");
for (const w of ["exhibitions", "lineup", "concerts", "performances", "box-office", "buy-tickets", "whats-happening"]) {
  assert.strictEqual(k(`https://example.org/${w}`), "generic_homepage", w);
}
assert.strictEqual(k("https://motorcitywine.com/calendar/"), "generic_homepage");
assert.strictEqual(k("https://example.org/events/glenn-barr-opening"), "direct_event", "a real event slug at depth 2 is not generic");
// 6. Listing: a venue's own events index
assert.strictEqual(k("https://galleryatio.com/events-exhibitions1"), "listing");
assert.strictEqual(L.isUsableLinkKind("listing"), false);
// 7. Root of a ticketing-platform subdomain is the sales page
assert.strictEqual(k("https://eloiseasylumhauntedhouse.fearticket.com/", { field: "ticket" }), "ticket");
assert.strictEqual(k("https://www.fearticket.com/", { field: "ticket" }), "generic_homepage");
// 8. More ticketing hosts are recognised
assert.strictEqual(k("https://posh.vip/e/some-party", { field: "ticket" }), "ticket");
assert.strictEqual(k("https://partiful.com/e/AbCdEf", { field: "ticket" }), "ticket");
assert.strictEqual(k("https://www.bandsintown.com/e/102030-artist-at-venue", { field: "ticket" }), "ticket");
assert.strictEqual(k("https://www.songkick.com/", { field: "ticket" }), "generic_homepage");
for (const h of ["crowdwork.com", "veezi.com", "spektrix.com", "signupgenius.com"]) {
  assert.strictEqual(k(`https://${h}/`, { field: "ticket" }), "generic_homepage", h);
}
// Summary reports why links were invalid, and every row still counts once
const s2 = L.summarizeLinkUsability([
  { source: "CivicPlus", ticket_url: "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=14", event_url: null },
  { source: "CivicPlus", ticket_url: "/x.ics", event_url: "https://example.org/events/real-one" },
  { source: "Detroit Historical Society", event_url: "/events/some-slug", ticket_url: null },
]);
assert.strictEqual(s2.total.events, 3);
assert.deepStrictEqual(s2.total.invalidReasons, { calendar_feed: 2, relative_url: 1 });
assert.strictEqual(s2.bySource.CivicPlus.withUsableLink, 1);
assert.strictEqual(s2.total.noUsableLink, 2, "invalid links are counted for review, no row is dropped");

console.log("PASS: link-usability — classes, usability, missing-ticket safety, summary by class/source, EI review defaults");
