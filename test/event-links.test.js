// test/event-links.test.js — which link an event's main button points at (event-links.js).
//
// Owner P1 2026-10-23: two Samhain rows stored the venue homepage in ticket_url and the RA event page in event_url, and every
// page showed the homepage as "Tickets & info" (now "Get tickets"). A bare venue homepage is never the main button; no link is ever invented. Labels (owner, 2026-10-23): Get tickets / Event details / Venue website.
//
// Run: node test/event-links.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { EventLinks: EL } = require(`${REPO_DIR}/event-links.js`);

const RA = "https://ra.co/events/2474836";
const HOME = "https://tangentgallery.com";
const TM = "https://ticketmaster.evyy.net/c/7676879/264167/4272?u=https%3A%2F%2Fwww.ticketmaster.com%2Fevent%2FZ7r9";

// the two Samhain rows
let r = EL.resolve({ ticketUrl: HOME, eventPageUrl: RA });
assert.deepStrictEqual(r.primary, { url: RA, label: "Event details" }, "the RA event page is the main button, labelled for what it is, not the homepage");
assert.strictEqual(r.event, null, "no 'Event page' duplicate when the event page is already primary");
assert.deepStrictEqual(r.venue, { url: HOME, label: "Venue website" }, "the homepage is kept, honestly labelled");

// a specific ticket link wins, the event page rides beside it, the homepage never leads
r = EL.resolve({ ticketUrl: TM, eventPageUrl: RA });
assert.strictEqual(r.primary.url, TM);
assert.deepStrictEqual(r.event, { url: RA, label: "Event details" });
assert.strictEqual(r.venue, null);

// RA row with no ticket link: the event page is the main button (the Oct 12 contract)
r = EL.resolve({ ticketUrl: null, eventPageUrl: RA });
assert.deepStrictEqual(r.primary, { url: RA, label: "Event details" }); assert.strictEqual(r.venue, null);

// same link in both fields is shown once
r = EL.resolve({ ticketUrl: RA, eventPageUrl: RA });
assert.strictEqual(r.primary.url, RA); assert.strictEqual(r.event, null);
// ticket_url holding the event page itself is still a ticket-field value: it keeps the ticket label
assert.strictEqual(r.primary.label, "Get tickets");

// homepage only: no ticket CTA at all, only a labelled venue link
r = EL.resolve({ ticketUrl: HOME + "/", eventPageUrl: null });
assert.strictEqual(r.primary, null, "a lone homepage is not a ticket link");
assert.strictEqual(r.venue.label, "Venue website");

// a homepage stored in event_url (venue digital-home fill) is treated the same way
r = EL.resolve({ ticketUrl: null, eventPageUrl: HOME });
assert.strictEqual(r.primary, null); assert.strictEqual(r.venue.url, HOME);

// query-bearing or pathful URLs are specific
assert.ok(!EL.isBareHomepage("https://x.org/?event=12"));
assert.ok(!EL.isBareHomepage("https://x.org/events/12"));
assert.ok(EL.isBareHomepage("https://www.x.org/"));
assert.ok(!EL.isBareHomepage("not a url") && !EL.isBareHomepage(null));

// nothing, junk, or non-http(s): no link, nothing invented
for (const e of [{}, { ticketUrl: "", eventPageUrl: "" }, { ticketUrl: "javascript:alert(1)", eventPageUrl: "ftp://x.org/a" }, null]) {
  r = EL.resolve(e);
  assert.ok(!r.primary && !r.event && !r.venue, "no usable link -> no button");
}

// free is never inferred from the link, and the label does not depend on it
assert.strictEqual(EL.resolve({ ticketUrl: TM, free: true }).primary.label, "Get tickets");
assert.strictEqual(EL.resolve({ ticketUrl: TM }).primary.label, "Get tickets");
assert.strictEqual(EL.resolve({ eventPageUrl: RA, free: false }).primary.label, "Event details");

// every page that shows an event link goes through the one rule
for (const f of ["index.html", "calendar.html", "map.html", "event-template.html"]) {
  const s = fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
  assert.ok(s.includes('<script src="/event-links.js"></script>'), `${f} loads event-links.js`);
  assert.ok(!/e\.ticketUrl\s*\|\|\s*e\.eventPageUrl/.test(s) && !/\(e\.ticketUrl && safeUrl\(e\.ticketUrl\)\) \? e\.ticketUrl : e\.eventPageUrl/.test(s), `${f} no longer picks ticket_url || event_url itself`);
}
console.log("PASS: event link precedence — homepage never the main button, nothing invented, pages share one rule");
