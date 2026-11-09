// test/halo-event-links.test.js — HALO Detroit link labels on top of event-links.js (owner 2026-10-19, label approved 2026-11-08).
// HALO's generic events page is the venue's site -> "Venue website"; a page specific to one HALO event -> "Event information".
// The door note stays visible beside a venue-website-only link and hides when an event-specific link exists.
// Run: node test/halo-event-links.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { EventLinks: EL } = require(`${REPO_DIR}/event-links.js`);

const GEN = "https://www.thehalodetroit.com/currentevents";
const EV = "https://www.thehalodetroit.com/events/hot-ash-cigar-pipe-social-7";

let r = EL.resolve({ eventPageUrl: GEN });
assert.strictEqual(r.primary, null, "the generic events page is never the main button");
assert.deepStrictEqual(r.venue, { url: GEN, label: "Venue website" });
assert.strictEqual(EL.hasEventLink({ eventPageUrl: GEN }), false);

r = EL.resolve({ eventPageUrl: EV });
assert.deepStrictEqual(r.primary, { url: EV, label: "Event information" });
assert.strictEqual(r.venue, null);
assert.strictEqual(EL.hasEventLink({ eventPageUrl: EV }), true);

r = EL.resolve({ eventPageUrl: GEN + "/" });
assert.strictEqual(r.primary, null, "trailing slash is still the generic page");
r = EL.resolve({ eventPageUrl: "https://thehalodetroit.com" });
assert.strictEqual(r.venue.label, "Venue website");

// other hosts unchanged
r = EL.resolve({ eventPageUrl: "https://example.com/currentevents" });
assert.strictEqual(r.primary.label, "Event details", "only thehalodetroit.com is special-cased");
r = EL.resolve({ eventPageUrl: "https://nothalodetroit.com/events/x" });
assert.strictEqual(r.primary.label, "Event details");

// ticket vendor + HALO event page: the HALO page rides beside as Event information
r = EL.resolve({ ticketUrl: "https://dice.fm/e/1", eventPageUrl: EV });
assert.strictEqual(r.primary.label, "Get tickets");
assert.strictEqual(r.event.label, "Event information");

// the four pages route the door note through EventLinks.hasEventLink
for (const p of ["index.html", "calendar.html", "map.html", "event-template.html"]) {
  const s = fs.readFileSync(`${REPO_DIR}/${p}`, "utf8");
  assert.ok(/EventLinks\.hasEventLink\(e\)/.test(s), p + ": door note must use EventLinks.hasEventLink");
}
console.log("ok   halo event links: labels, venue-only note, 4 pages wired");
