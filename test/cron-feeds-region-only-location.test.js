// test/cron-feeds-region-only-location.test.js -- a LOCATION that is only a region ("ON", "MI") is stored as no venue (the
// existing "Venue TBA"), never as venue_name_raw "ON", and never receives the feed's default city (BUG-012 applies to a
// LOCATION that says nothing at all, not to one that states a region).
// Run: node test/cron-feeds-region-only-location.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2025-01-01T00:00:00Z");
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const feeds = require(`${REPO_DIR}/api/cron-feeds.js`);

const noMaps = { byName: new Map(), byAddress: new Map(), byNameCity: new Map() };
for (const loc of ["ON", "MI", "Ontario"]) {
  const v = feeds.resolveIcsEventVenue(loc, noMaps);
  assert.deepStrictEqual(v, { venue_name_raw: "Venue TBA", venue_id: null, venue_address_raw: null, venue_city_raw: null }, loc);
}
// Unchanged: blank stays Venue TBA; real unparseable text is still kept whole.
assert.strictEqual(feeds.resolveIcsEventVenue("-", noMaps).venue_name_raw, "Venue TBA");
assert.strictEqual(feeds.resolveIcsEventVenue("Online", noMaps).venue_name_raw, "Online");

// Feed-level: six events state "Madison Heights", one says nothing ("-"), one says "ON". Only the "-" row takes the feed city.
const ev = (n, location) => ({
  uid: "u" + n, summary: "Event " + n, location,
  dtstart: { value: "20250210T180000", params: {} }, dtend: { value: "20250210T190000", params: {} },
});
const events = [1, 2, 3, 4, 5, 6].map((n) => ev(n, "City Hall - 300 W 13 Mile Road  Madison Heights MI 48071")).concat([ev(7, "-"), ev(8, "ON")]);
const feedSource = { id: "f1", name: "Test", feed_url: "https://example.org/feed.ics", location_per_event: true, default_category: "community" };
const rows = feeds.icsEventsToRows(events, feedSource, new Map(), noMaps, new Map());
const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
assert.strictEqual(byTitle["Event 7"].venue_city_raw, "Madison Heights"); // says nothing -> feed default (existing BUG-012 behaviour)
assert.strictEqual(byTitle["Event 8"].venue_name_raw, "Venue TBA");
assert.strictEqual(byTitle["Event 8"].venue_city_raw, null); // stated region: no invented city
assert.ok(rows.every((r) => r.venue_name_raw !== "ON"));
console.log("cron-feeds-region-only-location.test.js: all assertions passed");
