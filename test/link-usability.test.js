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

console.log("PASS: link-usability — classes, usability, missing-ticket safety, summary by class/source");
