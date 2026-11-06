// test/cron-walkervillebrewery-parse.test.js -- api/_lib/walkerville-rows.js
// SYNTHETIC fixture in Squarespace's ?format=json shape. NOT a live capture (the build sandbox cannot reach
// walkervillebrewery.com); replace with a real capture before activation.
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2026-11-06T15:00:00Z");
const assert = require("assert");
const { parseWalkervilleEvents, buildRow, findDuplicate } = require("../api/_lib/walkerville-rows.js");
const vercel = require("../vercel.json");

// Nov 20 2026 5pm EST = 22:00Z; Nov 21 11am EST = 16:00Z
const payload = { upcoming: [
  { id: "a1", title: "Holiday Market &amp; Pottery", startDate: Date.UTC(2026, 10, 20, 22, 0), endDate: Date.UTC(2026, 10, 21, 3, 0),
    fullUrl: "/events/holidaymarket-2026", assetUrl: "https://images.squarespace-cdn.com/content/x/market.jpg",
    excerpt: "<p>Local makers inside the brewery.</p>", location: { addressLine1: "525 Argyle Rd" } },
  { id: "a2", title: "Past Thing", startDate: Date.UTC(2026, 9, 1, 22, 0), fullUrl: "/events/past" },
  { id: "a3", title: "Pop-up at the Market", startDate: Date.UTC(2026, 10, 28, 16, 0), fullUrl: "https://www.walkervillebrewery.com/events/popup",
    location: { addressLine1: "100 Other St", addressTitle: "Some Hall" } },
  { title: "No id", startDate: Date.UTC(2026, 10, 30, 16, 0) },
] };
const { events, itemsFound, skipped } = parseWalkervilleEvents(payload);
assert.strictEqual(itemsFound, 4); assert.strictEqual(skipped, 1); assert.strictEqual(events.length, 3);
const m = events[0];
assert.strictEqual(m.title, "Holiday Market & Pottery");
assert.strictEqual(m.date, "2026-11-20"); assert.strictEqual(m.timeDisplay, "5:00 PM");
assert.strictEqual(m.endDate, null); // ends 10pm local the same night
assert.strictEqual(m.imageUrl, "https://images.squarespace-cdn.com/content/x/market.jpg");
assert.strictEqual(m.url, "https://www.walkervillebrewery.com/events/holidaymarket-2026");
const today = "2026-11-06";
assert.strictEqual(buildRow(events[1], today), null); // past
const row = buildRow(m, today);
assert.strictEqual(row.venue_name_raw, "Walkerville Brewery"); assert.strictEqual(row.venue_city_raw, "Windsor");
assert.strictEqual(row.venue_address_raw, "525 Argyle Rd"); assert.strictEqual(row.image_url, m.imageUrl);
assert.ok(!("image_credit" in row)); // no visible credit by policy
const pop = buildRow(events[2], today);
assert.strictEqual(pop.venue_name_raw, "Some Hall"); assert.strictEqual(pop.venue_address_raw, "100 Other St");
assert.strictEqual(parseWalkervilleEvents(null).events.length, 0);
const ex = [{ id: "d1", title: "Bob Dylan - The Never Ending Tribute Show at Walkerville Brewery", start_date: "2026-11-07", external_id: "tourism-1" }];
assert.ok(findDuplicate({ title: "Bob Dylan - The Never Ending Tribute Show", start_date: "2026-11-07", external_id: "w-1" }, ex), "same show, same day, other source");
assert.ok(!findDuplicate({ title: "Bob Dylan - The Never Ending Tribute Show", start_date: "2026-11-08", external_id: "w-1" }, ex), "other day is not a duplicate");
assert.ok(!findDuplicate({ title: "Jazz Night", start_date: "2026-11-07", external_id: "w-2" }, ex));
// DRAFT: must not be scheduled until Jody activates the source
assert.ok(!JSON.stringify(vercel).includes("cron-walkervillebrewery"), "connector must not be scheduled in the draft");
console.log("cron-walkervillebrewery-parse: ok");
